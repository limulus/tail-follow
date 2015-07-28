import {EventEmitter} from "events"
import fs from "fs"
import crypto from "crypto"
import assert from "assert"

export default class LogFileGenerator extends EventEmitter {
  constructor () {
    super()

    this._writer = null
    this._fd = null
    this._numberOfLinesToWrite = 5
    this._ids = []
  }

  createLog (path) {
    this._writer = fs.createWriteStream(path)
    this._currentPath = path

    this._writer.on("open", fd => {
      this._fd = fd
      this.emit("created", path)
    })
  }

  writeLog () {
    setTimeout(() => this._writeUntilFlushed(), 1)
  }

  _writeUntilFlushed () {
    if (this._numberOfLinesToWrite != 0) {
      this._writer.write(this.generateLogLine(), () => {
        fs.fsync(this._fd, () => {
          this._numberOfLinesToWrite -= 1
          setTimeout(() => this._writeUntilFlushed(), 1)
        })
      })
    }
    else {
      setTimeout(() => this.emit("flushed"), 10)
    }
  }

  get ids () {
    return this._ids.slice()
  }

  get lines () {
    return this.ids.map(id => LogFileGenerator.generateLogLineWithId(id))
  }

  get data () {
    return this.lines.join("")
  }

  generateLogLine () {
    const id = LogFileGenerator.generateId()
    const line = LogFileGenerator.generateLogLineWithId(id)
    this._ids.push(id)
    return line
  }

  static generateLogLineWithId (id) {
    return `${id}:foo:bar\n`
  }

  static generateId () {
    return crypto.randomBytes(8).toString("base64").replace(/=/, "")
  }

  renameFile (newPath, cb) {
    fs.rename(this._currentPath, newPath, err => {
      assert.ifError(err)
      this._currentPath = newPath
      if (cb) return cb()
    })
  }
}
