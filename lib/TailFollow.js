import {Readable} from "stream"
import fs from "fs"
import path from "path"

export default class TailFollow extends Readable {
  constructor (filePath, opts={}) {
    super(opts)

    this._inReadingState = false
    this._tailFilePath = path.resolve(filePath)
    this._tailPosition = 0
    this.setTailChunkSize(opts.tailChunkSize || 16384)
    this._fd = fs.open(filePath, "r", (err, fd) => {
      if (err) {
        return this.emit("error", err)
      }

      this._fd = fd
      this._watcher = fs.watch(filePath, this._handleWatchEvent.bind(this))

      this.emit("open", fd)
    })
  }

  _read (size) { /* nothing needed yet */ }

  _handleWatchEvent (event, info) {
    if (event === "change") {
      this._readToEnd()
    }
    else if (event === "rename") {
      this._renamed(info)
    }
  }

  _readToEnd () {
    if (this._inReadingState) {
      return
    }
    this._inReadingState = true

    const buf = new Buffer(this._tailChunkSize)
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

  _renamed (newName) {
    const oldPath = this._tailFilePath
    this._tailFilePath = path.resolve(path.dirname(this._tailFilePath), newName)
    this.emit("rename", oldPath, this._tailFilePath)
  }

  setTailChunkSize (size) {
    this._tailChunkSize = size
    return this
  }
}
