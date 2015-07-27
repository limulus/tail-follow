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

  describe("data event", () => {
    it("should get emitted with the data the log generated wrote", done => {
      logGenerator.on("created", (filePath) => {
        let dataAccumulator = ""
        tail = new TailFollow(filePath)
        tail.once("data", (data) => {
          assert(Buffer.isBuffer(data))
          dataAccumulator += data.toString()
          assert(dataAccumulator.match(/foo:bar\n/))
          assert.strictEqual(dataAccumulator, logGenerator.data)
          return done()
        })
      })

      logGenerator.createLog(path.join(dir, "simple.txt"))
      logGenerator.writeLog()
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

  describe("positionForBuffer", () => {
    it("should return the position in the file for the given buffer", done => {
      let expectedPos = 0

      logGenerator.on("created", filePath => {
        tail = new TailFollow(filePath)
        tail.on("data", data => {
          assert.strictEqual(tail.positionForBuffer(data), expectedPos)
          expectedPos += data.length
        })
      })

      logGenerator.createLog(path.join(dir, "pos-test.txt"))
      logGenerator.writeLog()
      logGenerator.on("flushed", () => {
        tail.removeAllListeners()
        assert(expectedPos > 40)
        return done()
      })
    })
  })
})
