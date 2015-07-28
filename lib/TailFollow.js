import {Readable} from "stream"
import fs from "fs"
import path from "path"
import find from "fs-find"

export default class TailFollow extends Readable {
  constructor (filePath, opts={}) {
    super(opts)

    this._inReadingState = false
    this._tailFollowing = true
    this._tailFilePath = path.resolve(filePath)
    this._tailPosition = 0
    this.setTailChunkSize(opts.tailChunkSize || 16384)
    this._fd = fs.open(filePath, "r", (err, fd) => {
      if (err) {
        return this.emit("error", err)
      }

      this._fd = fd
      fs.fstat(this._fd, (err, stat) => {
        if (err) {
          return this.emit("error", err)
        }

        this._tailInode = stat.ino
        if (!opts._dontWatch) {
          this._watcher = fs.watch(filePath, this._handleWatchEvent.bind(this))
        }
      })

      this.emit("open", fd)
    })
  }

  _read (size) { /* nothing needed yet */ }

  _handleWatchEvent (event, info) {
    if (event === "change") {
      this._readToEnd()
    }
    else if (event === "rename") {
      this._renamed()
    }
  }

  _readToEnd () {
    if (this._inReadingState || !this._tailFollowing) {
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

  _renamed () {
    const baseFindDir = path.dirname(this._tailFilePath)
    find(baseFindDir, (err, files) => {
      if (err) {
        return this.emit("error", err)
      }

      const matches = files.filter(file => file.stat.ino === this._tailInode)
      if (matches.length === 0) {
        // Couldn't find the file, so lets treat it like a deletion instead.
        this._deleted()
      }
      else {
        // Found the file, so lets emit the rename event and update our path.
        const newFileInfo = matches[0]
        const oldPath = this._tailFilePath
        this._tailFilePath = newFileInfo.file
        this.emit("rename", oldPath, this._tailFilePath)
      }
    })
  }

  setTailChunkSize (size) {
    this._tailChunkSize = size
    return this
  }

  unfollow () {
    if (this._tailFollowing === false) {
      return
    }
    this._tailFollowing = false

    fs.close(this._fd, err => {
      if (err) {
        return this.emit("error", err)
      }

      this._fd = null
      this.push(null)
      this._watcher.close()
    })
  }
}
