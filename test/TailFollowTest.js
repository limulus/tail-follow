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
      let dataAccumulator = ""

      logGenerator.on("created", (filePath) => {
        tail = new TailFollow(filePath)
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
})
