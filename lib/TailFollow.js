import {Readable} from "stream"
import fs from "fs"
import path from "path"
import find from "fs-find"

export default class TailFollow extends Readable {
  constructor (filePath, opts={}) {
    super(opts)

    this._tailOpts = opts
    this._tailFilePath = path.resolve(filePath)
    this.setTailChunkSize(opts.tailChunkSize || 16384)
    this.setSurviveRotation(opts.surviveRotation || false)

    this._tailPositionMap = null
    if (this._tailOpts.objectMode) {
      this._tailPositionMap = new WeakMap()
    }

    this._tailOpen()
  }

  _read (size) { /* nothing needed yet */ }

  _tailOpen () {
    this._inReadingState = false
    this._tailFollowing = true
    this._tailPosition = 0

    this._fd = fs.open(this._tailFilePath, "r", (err, fd) => {
      if (err) {
        return this.emit("error", err)
      }

      this._fd = fd
      fs.fstat(this._fd, (err, stat) => {
        if (err) {
          return this.emit("error", err)
        }

        this._tailInode = stat.ino
        if (!this._tailOpts._dontWatch) {
          this._watcher = fs.watch(this._tailFilePath, this._handleWatchEvent.bind(this))
        }

        this._readToEnd()
      })

      this.emit("open", fd)
    })
  }

  _tailOpenFileOnCreation () {
    const openIfExists = () => {
      fs.exists(this._tailFilePath, exists => {
        if (exists) {
          this._dirWatcher.close()
          this._dirWatcher = null
          return this._tailOpen()
        }
      })
    }

    const baseDir = path.dirname(this._tailFilePath)
    this._dirWatcher = fs.watch(baseDir, openIfExists)
    openIfExists()
  }

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

      let chunk = buf.slice(0, bytesRead)
      if (this._tailOpts.objectMode) {
        if (this._tailOpts.encoding && typeof chunk === "string") {
          chunk = new String(chunk)
        }
        this._tailPositionMap.set(chunk, this._tailPosition)
      }

      this.push(chunk)
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
        const newPath = matches[0].file
        const oldPath = this._tailFilePath
        if (!this._tailSurviveRotation) {
          this._tailFilePath = newPath
        }
        this.emit("rename", oldPath, newPath)
      }

      if (this._tailSurviveRotation) {
        this._unfollow(true)
        this._tailOpenFileOnCreation()
      }
    })
  }

  setTailChunkSize (size) {
    this._tailChunkSize = size
    return this
  }

  setSurviveRotation (survive) {
    this._tailSurviveRotation = survive
  }

  setEncoding (encoding) {
    this._tailOpts.encoding = encoding
    return super.setEncoding(encoding)
  }

  unfollow () {
    return this._unfollow()
  }

  positionForChunk (chunk) {
    if (this._tailPositionMap === null) {
      throw Error("Must be in objectMode for positional data.")
    }

    return this._tailPositionMap.get(chunk)
  }

  _unfollow (dontEndStream=false) {
    if (this._tailFollowing === false) {
      return
    }
    this._tailFollowing = false

    fs.close(this._fd, err => {
      if (err) {
        return this.emit("error", err)
      }

      this._fd = null
      this._watcher.close()
      if (this._dirWatcher) {
        this._dirWatcher.close()
      }

      if (!dontEndStream) {
        this.push(null)
      }
    })
  }
}
