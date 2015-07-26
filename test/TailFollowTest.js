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
    it("should be emitted whenever a new log entry is written", done => {
      logGenerator.on("created", (filePath) => {
        const entries = []
        tail = new TailFollow(filePath)
        tail.on("data", (data) => {
          entries.push(data)
          if (entries.length === 5) {
            return done()
          }
        })
      })

      logGenerator.createLog(path.join(dir, "simple.txt"))
      logGenerator.writeLog()
    })
  })
})
