import {EventEmitter} from "events"
import fs from "fs"
import crypto from "crypto"

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
      this.emit("flushed")
    }
  }

  get ids () {
    return this._ids.slice()
  }

  generateLogLine () {
    const {id, line} = LogFileGenerator.generateLogLine()
    this._ids.push(id)
    return line
  }

  static generateLogLine () {
    const id = LogFileGenerator.generateId()
    return {id, line: `${id}:foo:bar\n`}
  }

  static generateId () {
    return crypto.randomBytes(8).toString("base64").replace(/=/, "")
  }
}
