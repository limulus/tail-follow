import assert from "assert"
import tmp from "tmp"
import path from "path"

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
    it("should be emitted when the underlying file is renamed", done => {
      logGenerator.on("created", (filePath) => {
        tail = new TailFollow(filePath)
        tail.on("data", () => {})
        tail.on("rename", (oldPath, newPath) => {
          assert.strictEqual(oldPath, filePath)
          assert.strictEqual(newPath, path.join(dir, "renamed-test-bar.txt"))
          return done()
        })
      })

      logGenerator.on("flushed", () => {
        logGenerator.renameFile(path.join(dir, "renamed-test-bar.txt"))
      })

      logGenerator.createLog(path.join(dir, "renamed-test-foo.txt"))
      logGenerator.writeLog()
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
})
