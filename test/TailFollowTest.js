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
})
