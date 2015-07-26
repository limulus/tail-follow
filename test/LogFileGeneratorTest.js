import assert from "assert"
import tmp from "tmp"
import path from "path"
import fs from "fs"

import LogFileGenerator from "../mock/LogFileGenerator.js"

tmp.setGracefulCleanup()

describe("LogFileGenerator", () => {
  let generator, dir, logPath

  beforeEach(() => {
    generator = new LogFileGenerator()
    dir = tmp.dirSync({ unsafeCleanup: true }).name
    logPath = path.join(dir, "foo.log")
  })

  describe("createLog", () => {
    it("should create a file at the given path", done => {
      generator.on("created", () => {
        assert(fs.existsSync(logPath))
        return done()
      })

      generator.createLog(logPath)
    })
  })

  describe("writeLog()", () => {
    it("should write some entries to file", done => {
      generator.on("flushed", () => {
        const fileData = fs.readFileSync(logPath).toString()
        assert(fileData.match(/:/))
        return done()
      })

      generator.createLog(logPath)
      generator.writeLog()
    })
  })

  describe("ids", () => {
    it("should be an array of all ids written", done => {
      assert.deepEqual(generator.ids, [])

      generator.on("flushed", () => {
        assert.strictEqual(generator.ids.length, 5)
        return done()
      })

      generator.createLog(logPath)
      generator.writeLog()
    })
  })
})
