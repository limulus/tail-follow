import {Readable} from "stream"
import fs from "fs"
import path from "path"
import find from "fs-find"
import debugFunctionForName from "debug"
import {inspect} from "util"

const debug = debugFunctionForName("tail-follow")

export default class TailFollow extends Readable {
  constructor (filePath, opts={}) {
    super(opts)

    this._tailOpts = Object.create(opts)
    this._tailOpts.follow = opts.follow === undefined ? true : opts.follow
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
    debug("_tailOpen %s", this._tailFilePath)
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
            .on("error", err => this.emit("error", err))
        }

        this._isWaitingForData = false
        this._readToEnd()
      })

      this.emit("open", fd)
    })
  }

  _tailOpenFileOnCreation () {
    const openIfExists = () => {
      debug("openIfExists called")
      fs.exists(this._tailFilePath, exists => {
        debug("openIfExists result: %s", exists)
        if (exists) {
          this._dirWatcher.close()
          this._dirWatcher.removeAllListeners()
          this._dirWatcher = null
          return this._tailOpen()
        }
      })
    }

    const baseDir = path.dirname(this._tailFilePath)
    this._dirWatcher = fs.watch(baseDir, openIfExists)
      .on("error", err => this.emit("error", err))
    openIfExists()
  }

  _handleWatchEvent (event, info) {
    debug("fs.watch event: %s, %s", event, inspect(info))

    if (event === "change") {
      this._readToEnd()
    }
    else if (event === "rename") {
      this._renamed()
    }
  }

  _readToEnd () {
    debug("_readToEnd called")
    if (this._isWaitingForData || !this._tailFollowing) {
      debug("_readToEnd short circuted")
      return
    }
    this._isWaitingForData = true

    const buf = new Buffer(this._tailChunkSize)
    fs.read(this._fd, buf, 0, buf.length, this._tailPosition, (err, bytesRead) => {
      if (err) {
        this.emit("error", err)
        return
      }

      if (bytesRead === 0) {
        this._isWaitingForData = false
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

        this._isWaitingForData = false
        if (stat.size !== this._tailPosition) {
          return this._readToEnd()
        }

        this.emit("_fileHasBeenReadToEnd")

        if (this._tailOpts.follow === false) {
          return this.unfollow()
        }
      })
    })
  }

  _renamed () {
    debug("_renamed called")
    const baseFindDir = path.dirname(this._tailFilePath)
    find(baseFindDir, (err, files) => {
      if (err) {
        return this.emit("error", err)
      }

      const matches = files.filter(file => file.stat.ino === this._tailInode)
      if (matches.length === 0) {
        // Couldn't find the file, so lets treat it like a deletion instead.
        debug("_deleted")
        this._deleted()
      }
      else if (matches.length === 1 && matches[0].file === this._tailFilePath) {
        // Not actually renamed yet. Let's return & wait for a real rename event
        debug("file not actually renamed? %s", this._tailsFilePath)
        return
      }
      else {
        // Found the file, so lets emit the rename event and update our path.
        const newPath = matches[0].file
        const oldPath = this._tailFilePath
        debug("matching file found for rename: %s %s", oldPath, newPath)
        if (!this._tailSurviveRotation) {
          this._tailFilePath = newPath
        }
        this.emit("rename", oldPath, newPath)
      }

      if (this._tailSurviveRotation) {
        const unfollowOldFileAndTailFromNewFile = () => {
          this._unfollow(true, () => this._tailOpenFileOnCreation())
        }

        if (this._isWaitingForData) {
          debug("waiting for _fileHasBeenReadToEnd event")
          this.once("_fileHasBeenReadToEnd", unfollowOldFileAndTailFromNewFile)
        }
        else {
          unfollowOldFileAndTailFromNewFile()
        }
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

  _unfollow (dontEndStream = false, cb = function () {}) {
    debug("_unfollow called with dontEndStream: %s", dontEndStream)
    if (this._tailFollowing === false) {
      debug("_unfollow short circuted")
      return
    }
    this._tailFollowing = false

    fs.close(this._fd, err => {
      if (err) {
        return this.emit("error", err)
      }

      this._fd = null
      this._watcher.close()
      this._watcher.removeAllListeners()
      if (this._dirWatcher) {
        this._dirWatcher.close()
        this._dirWatcher.removeAllListeners()
      }

      if (!dontEndStream) {
        this.push(null)
      }

      return cb()
    })
  }
}
