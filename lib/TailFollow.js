import {Readable} from "stream"
import fs from "fs"

export default class TailFollow extends Readable {
  constructor (filePath) {
    super()

    this._inReadingState = false
    this._tailPosition = 0
    this._wantedSize = 16384
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

    const buf = new Buffer(this._wantedSize)
    fs.read(this._fd, buf, 0, buf.length, this._tailPosition, (err, bytesRead) => {
      if (err) {
        this.emit("error", err)
        return
      }

      if (bytesRead === 0) {
        this._inReadingState = false
        return
      }

      this.push(buf.slice(0, bytesRead))
      this._tailPosition += bytesRead
      fs.fstat(this._fd, (err, stat) => {
        if (err) {
          return this.emit("error", err)
        }

        this._inReadingState = false
        if (stat.size !== this._tailPosition) {
          return this._readToEnd()
        }
      })
    })
  }
}
