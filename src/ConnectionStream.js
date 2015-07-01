import { Duplex } from 'stream'

export default class ConnectionStream extends Duplex {
  constructor (con) {
    super()
    this._con = con
  }
  _read (size) {

  }
  _write (chunk, encoding, callback) {

  }
}
