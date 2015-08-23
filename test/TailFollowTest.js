import assert from "assert"
import tmp from "tmp"
import path from "path"
import fs from "fs"

import LogFileGenerator from "../mock/LogFileGenerator.js"
import TailFollow from "../lib/TailFollow.js"

tmp.setGracefulCleanup()

describe("TailFollow", () => {
  let tail, logGenerator, dir

  before(() => {
    dir = tmp.dirSync({ unsafeCleanup: true }).name
  })

  beforeEach(() => {
    logGenerator = new LogFileGenerator()
  })

  function dataAccumulationTest (done, customizeTail) {
    let dataAccumulator = ""

    logGenerator.on("created", (filePath) => {
      tail = new TailFollow(filePath)
      if (customizeTail) { customizeTail(tail) }
      tail.on("data", (data) => {
        assert(Buffer.isBuffer(data))
        dataAccumulator += data.toString()
      })
    })

    logGenerator.createLog(path.join(dir, "simple.txt"))
    logGenerator.writeLog()
    logGenerator.on("flushed", () => {
      assert(dataAccumulator.match(/foo:bar\n/))
      assert.strictEqual(dataAccumulator, logGenerator.data)
      return done()
    })
  }

  describe("data event", () => {
    it("should get emitted with the data the log generated wrote", done => {
      dataAccumulationTest(done)
    })
  })

  describe("error event", () => {
    it("should get emitted when the file does not exist", done => {
      tail = new TailFollow(path.join(dir, "does-not-exist.txt"))
      tail.on("data", () => {})
      tail.on("error", err => {
        assert(err)
        return done()
      })
    })
  })

  describe("rename event", () => {
    let i = 0
    function assertThatRenameEventIsFired (done, options) {
      logGenerator.on("created", (filePath) => {
        tail = new TailFollow(filePath, options)
        tail.on("data", () => {})
        tail.on("rename", (oldPath, newPath) => {
          assert.strictEqual(oldPath, filePath)
          assert.strictEqual(newPath, path.join(dir, `renamed-test-${i}-bar.txt`))
          return done()
        })
      })

      logGenerator.on("flushed", () => {
        logGenerator.renameFile(path.join(dir, `renamed-test-${i}-bar.txt`))
      })

      ++i
      logGenerator.createLog(path.join(dir, `renamed-test-${i}-foo.txt`))
      logGenerator.writeLog()
    }

    it("should be emitted when the underlying file is renamed", done => {
      assertThatRenameEventIsFired(done)
    })

    it("should still work when polling is used to determine when a file is renamed", done => {
      assertThatRenameEventIsFired(done, { fileRenamePollingInterval: 20 })
    })

    it("should still provide paths on systems (FreeBSD) where fs.watch() do not tell us the new name", done => {
      logGenerator.on("created", filePath => {
        tail = new TailFollow(filePath, { _dontWatch: true })
        tail.on("rename", (oldPath, newPath) => {
          assert.strictEqual(oldPath, filePath)
          assert.strictEqual(newPath, path.join(dir, "freebsd-bar.txt"))
          return done()
        })

        logGenerator.renameFile(path.join(dir, "freebsd-bar.txt"), () => {
          tail._handleWatchEvent("rename", null)
        })
      })

      logGenerator.createLog(path.join(dir, "freebsd-foo.txt"))
    })
  })

  describe("setEncoding()", () => {
    it("should cause data to be emitted as strings", done => {
      logGenerator.on("created", filePath => {
        tail = new TailFollow(filePath, {encoding: "utf8"})
        assert(tail.setEncoding)
        tail.once("data", data => {
          assert(typeof data === "string" || data instanceof String)
          assert(data.match(/.+:.+/))
          return done()
        })
      })

      logGenerator.createLog(path.join(dir, "setencoding-test.txt"))
      logGenerator.writeLog()
    })
  })

  describe("setTailChunkSize()", () => {
    it("should continue to work with a small chunk size", done => {
      dataAccumulationTest(done, tail => {
        tail.setTailChunkSize(7)
      })
    })
  })

  describe("setSurviveRotation()", () => {
    it("should cause the stream to read from a new rotated file", done => {
      const logGenerator2 = new LogFileGenerator()
      let dataAccumulator = ""

      logGenerator.on("created", filePath => {
        tail = new TailFollow(filePath, {surviveRotation: true})
        tail.on("data", data => {
          dataAccumulator += data.toString()
        })
        tail.on("end", () => {
          const expectedData = logGenerator.data + logGenerator2.data
          assert.strictEqual(dataAccumulator, expectedData)
          return done()
        })
      })

      logGenerator.createLog(path.join(dir, "rotating.log"))
      logGenerator.writeLog()
      logGenerator.on("flushed", () => {
        logGenerator.renameFile(path.join(dir, "rotating-0.log"), () => {
          logGenerator2.createLog(path.join(dir, "rotating.log"))
          logGenerator2.writeLog()
          logGenerator2.on("flushed", () => {
            tail.unfollow()
          })
        })
      })
    })
  })

  describe("unfollow()", () => {
    it("should end the stream", done => {
      logGenerator.on("created", filePath => {
        tail = new TailFollow(filePath)
        tail.on("data", () => {})
        tail.on("end", () => {
          return done()
        })
      })

      logGenerator.on("flushed", () => {
        tail.unfollow()
      })

      logGenerator.createLog(path.join(dir, "unfollow.txt"))
      logGenerator.writeLog()
    })
  })

  describe("positionForChunk()", () => {
    it("should return the position for the given data chunk in objectMode", done => {
      let dataAccumulator = new Buffer(0)
      logGenerator.on("created", filePath => {
        tail = new TailFollow(filePath, { objectMode: true })
        tail.on("data", data => {
          assert(Buffer.isBuffer(data))
          assert.strictEqual(tail.positionForChunk(data), dataAccumulator.length)
          dataAccumulator = Buffer.concat([dataAccumulator, data])
        })
        tail.on("end", () => {
          assert.strictEqual(dataAccumulator.toString(), logGenerator.data)
          return done()
        })
      })

      logGenerator.createLog(path.join(dir, "object-mode-test.txt"))
      logGenerator.writeLog()
      logGenerator.on("flushed", () => tail.unfollow())
    })
  })

  describe("follow:false option", () => {
    it("should cause the 'end' event to be emitted when end of file is reached", done => {
      const file = path.join(dir, "follow-false-opt.txt")
      logGenerator.createLog(file)
      logGenerator.writeLog()
      logGenerator.on("flushed", () => {
        tail = new TailFollow(file, { follow: false })
        tail.on("data", () => {})
        tail.once("end", () => {
          return done()
        })
      })
    })

    it("should stop watching the file when end is reached", done => {
      logGenerator.on("created", (file) => {
        tail = new TailFollow(file, { follow: false })
        tail.on("data", () => {})
      })
      logGenerator.createLog(path.join(dir, "follow-false-opt.txt"))
      logGenerator.writeLog()
      logGenerator.on("flushed", () => done())
    })
  })

  describe("#2 Crash during file rotation", () => {
    const fsOpenOrig = fs.open

    beforeEach(function setupStubForOpen () {
      fs.open = function open (path, mode, cb) {
        const args = Array.from(arguments)
        setTimeout(function () {fsOpenOrig.apply(fs, args)}, 20)
      }
    })

    afterEach(function cleanUpStubForOpen () {
      fs.open = fsOpenOrig
    })

    it("should be fixed", done => {
      logGenerator.createLog(path.join(dir, "rotate-crash.log"))
      logGenerator.writeLog()
      logGenerator.on("created", filePath => {
        tail = new TailFollow(filePath, {
          surviveRotation: true,
          fileRenamePollingInterval: 2
        })
        tail.on("data", chunk => {})
        tail.once("rename", () => {
          setTimeout(() => done(), 50)
        })
        tail.on("error", () => {})
      })
      logGenerator.on("flushed", () => {
        logGenerator.renameFile(path.join(dir, "rotate-crash-1.log"))
      })
    })
  })
})
