import {Readable} from "stream"
import fs from "fs"
import {inspect} from "util"

export default class TailFollow extends Readable {
  constructor (filePath) {
    super()

    this._inReadingState = false
    this._tailPosition = 0
    this._fd = fs.open(filePath, "r", (err, fd) => {
      if (err) {
        return this.emit("error", err)
      }

      this._fd = fd
      this._watcher = fs.watch(filePath, this.handleWatchEvent.bind(this))

      this.emit("open", fd)
    })
  }

  _read (size) { /* nothing needed yet */ }

  handleWatchEvent (event, info) {
    if (event === "change") {
      this._readToEnd()
    }
  }

  _readToEnd () {
    if (this._inReadingState) {
      return
    }
    this._inReadingState = true

    const buf = new Buffer(16384)
    fs.read(this._fd, buf, this._tailPosition, buf.size, this._tailPosition, (err, bytesRead) => {
      this.push(buf)
      this._tailPosition += bytesRead
      fs.fstat(this._fd, (stat) => {
        this._inReadingState = false
        if (inspect(stat).size !== this._tailPosition) {
          return this._readToEnd()
        }
      })
    })
  }
}
