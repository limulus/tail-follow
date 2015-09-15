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

    // Dependency injection point for tests
    this._fsOpen = opts._fsOpen || fs.open

    this._tailOpts = Object.create(opts)
    this._tailOpts.follow = opts.follow === undefined ? true : opts.follow
    this._tailFilePath = path.resolve(filePath)
    this.setTailChunkSize(opts.tailChunkSize || 16384)
    this.setSurviveRotation(opts.surviveRotation || false)
    this.setFileRenamePollingInterval(opts.fileRenamePollingInterval)

    this._tailPositionMap = null
    if (this._tailOpts.objectMode) {
      this._tailPositionMap = new WeakMap()
    }

    this._tailFollowing = false
    this._tailOpen()
  }

  get filePath () {
    return this._tailFilePath
  }

  _read (size) { /* nothing needed yet */ }

  _tailOpen () {
    debug("_tailOpen %s", this.filePath)
    this._tailPosition = 0

    this._fsOpen(this.filePath, "r", (err, fd) => {
      if (err) {
        return this.emit("error", err)
      }

      debug("opened fd: %s", fd)
      this._fd = fd
      fs.fstat(this._fd, (err, stat) => {
        if (err) {
          return this.emit("error", err)
        }

        this._tailInode = stat.ino
        if (!this._tailOpts._dontWatch) {
          try {
            this._watcher = fs.watch(this.filePath, this._handleWatchEvent.bind(this))
              .on("error", err => this.emit("error", err))
          }
          catch (err) {
            this.emit("error", err)
          }
        }

        this._tailFollowing = true
        this._isWaitingForData = false
        this._readToEnd()
      })

      this.emit("open", fd)
    })
  }

  _tailOpenFileOnCreation () {
    const openIfExists = () => {
      debug("openIfExists called")
      fs.exists(this.filePath, exists => {
        debug("openIfExists result: %s", exists)
        if (exists) {
          this._dirWatcher.close()
          this._dirWatcher.removeAllListeners()
          this._dirWatcher = null
          return this._tailOpen()
        }
      })
    }

    const baseDir = path.dirname(this.filePath)
    this._dirWatcher = fs.watch(baseDir, openIfExists)
      .on("error", err => this.emit("error", err))
    openIfExists()
  }

  _handleWatchEvent (event, info) {
    debug("fs.watch event: %s, %s", event, inspect(info))

    if (event === "change") {
      this._readToEnd()
    }
    else if (event === "rename" && this._renameInterval === null) {
      this._renamed()
    }
    else {
      debug("unhandled fs.watch event %s", event)
    }
  }

  _readToEnd () {
    debug("_readToEnd called")
    if (this._isWaitingForData || this._tailFollowing === false) {
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
    const baseFindDir = path.dirname(this.filePath)
    find(baseFindDir, (err, files) => {
      if (err) {
        return this.emit("error", err)
      }

      const matches = files.filter(file => file.stat.ino === this._tailInode)
      if (matches.length === 0) {
        // Couldn't find the file, so lets treat it like a deletion instead.
        debug("_deleted (expected inode %s)", this._tailInode)
        // this.emit("error", new Error("deletion case not yet handled"))
        // this._deleted()
      }
      else if (matches.length === 1 && matches[0].file === this.filePath) {
        // Not actually renamed yet. Let's return & wait for a real rename event
        debug("file not actually renamed? %s", this.filePath)
        return
      }
      else {
        // Found the file, so lets emit the rename event and update our path.
        const newPath = matches[0].file
        const oldPath = this.filePath
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

  // Called by the polling file rename interval, when in effect via
  // setFileRenamePollingInterval() or the fileRenamePollingInterval option.
  _renameCheck () {
    fs.stat(this.filePath, (err, stats) => {
      if (err) {
        // Don't emit an error event here because it is reasonable for the
        // file to not exist anymore if it has been renamed.
        debug("Error from fs.stat. %j", err)
        return this._renamed()
      }

      if (stats && stats.ino !== this._tailInode) {
        return this._renamed()
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

  setFileRenamePollingInterval (interval) {
    if (this._renameInterval !== null) {
      clearInterval(this._renameInterval)
    }

    if (interval === undefined || interval === null) {
      this._renameInterval = null
    }
    else {
      this._renameInterval = setInterval(() => this._renameCheck(), interval)
    }
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

    debug("about to close fd: %s", inspect(this._fd))
    fs.close(this._fd, err => {
      if (err) {
        return this.emit("error", err)
      }

      this._fd = null

      if (this._watcher) {
        this._watcher.close()
        this._watcher.removeAllListeners()
      }

      if (this._dirWatcher) {
        this._dirWatcher.close()
        this._dirWatcher.removeAllListeners()
      }

      // If the user has requested that we stop listening, we need to clean up
      // the rename polling interval if any, and also end our stream.
      if (!dontEndStream) {
        if (this._renameInterval !== null) {
          clearInterval(this._renameInterval)
          this._renameInterval = null
        }
        this.push(null)
      }

      return cb()
    })
  }
}
