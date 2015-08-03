import {Transform} from "stream"
// import split from "buffer-split"
import indexOf from "buffer-indexof"

export default class SplitStream extends Transform {
  constructor (tail, opts) {
    super(opts)

    this._tail = tail
    this._splitDelimiter = new Buffer(opts.delimiter || "\n")
    this._splitPositionAccumulator = 0
    this._splitAccumulator = new Buffer(0)
  }

  _transform (chunk, encoding, cb) {
    const posInFile = this._tail.positionForChunk(chunk)
    let offset = 0, index

    const accumulate = () => {
        this._splitAccumulator = Buffer.concat([
        this._splitAccumulator,
        chunk.slice(offset, index)
      ])
      this._splitPositionAccumulator += index
      offset = index
    }

    const push = () => {
      this.push({
        buffer: this._splitAccumulator,
        position: this._splitPositionAccumulator
      })
      this._splitAccumulator = new Buffer(0)
    }

    if (this._splitPositionAccumulator === 0) {
      this._splitAccumulator = posInFile
    }

    if (chunk === null) {
      return push()
    }

    while ((index = indexOf(chunk, this._splitDelimiter, offset)) !== -1) {
      accumulate()
      push()
    }

    accumulate()
  }
}
