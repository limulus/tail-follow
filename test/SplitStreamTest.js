import assert from "assert"
import path from "path"
import tmp from "tmp"

import LogFileGenerator from "../mock/LogFileGenerator.js"
import TailFollow from "../lib/TailFollow.js"

tmp.setGracefulCleanup()

describe("SplitStream", () => {
  let split, logGenerator, logPath, logNum = 0

  beforeEach(done => {
    const dir = tmp.dirSync({ unsafeCleanup: true }).name
    logGenerator = new LogFileGenerator()
    logGenerator.createLog(path.join(dir, `split-${logNum++}.txt`))
    logGenerator.writeLog()
    logGenerator.on("created", (path) => {
      split = new TailFollow.createSplitStream(path)
      return done()}
    )
  })

  describe("data event", () => {
    it("should fire with object containing buffer and pos", done => {
      let dataAccumulator = new Buffer(0)
      split.on("data", data => {
        assert.strictEqual(data.position, dataAccumulator.length)
        dataAccumulator = Buffer.concat([dataAccumulator, new Buffer("\n"), data.buffer])
      })
      logGenerator.on("flushed", () => {
        assert.strictEqual(dataAccumulator.length, logGenerator.data.length)
        return done()
      })
    })
  })
})
