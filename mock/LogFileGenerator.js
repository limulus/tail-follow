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
      let id = crypto.randomBytes(8).toString("base64").replace(/=/, "")
      this._ids.push(id)
      this._writer.write(`${id}:foo:bar\n`, () => {
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
}
