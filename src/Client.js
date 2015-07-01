import dns from 'dns'
import { EventEmitter } from 'events'

import PacketSocket from './PacketSocket'
import Connection from './Connection'

export default class Client extends EventEmitter {
  constructor (address, port) {
    super()
    this._address = null
    this._port = parseInt(port, 10)
    this._ps = new PacketSocket()
    ;['listening', 'close', 'error'].forEach((event) => {
      this._ps.on(event, this.emit.bind(this, event))
    })
    this._connection = new Connection(this._ps, this._address, this._port)
    this._connection.on('ready', this.emit.bind(this, 'ready'))
    this._connection.on('close', () => {
      this._ps.close()
    })
    this._ps.on('packet', (pkt, rinfo) => {
      const type = pkt.getType()
      const h1 = this._address + this._port + this._connection.stream.toString('hex')
      const h2 = rinfo.address + rinfo.port + pkt.getStreamString()
      if (h1 !== h2) return
      if (type === 1) {
        this._connection.startFrom(pkt)
      }
      if (type === 2) {
        this._connection.syncFrom(pkt)
      }
      if (type > 2 && type < 5) {
        this._connection.handlePacket(pkt, rinfo)
      }
      if (type === 5) {
        this._connection.emit('close')
      }
    })
    dns.lookup(address, {
      family: 4
    }, (err, addr) => {
      if (err) throw err
      this._address = addr
      this._connection.initiate()
    })
  }
  close () {
    this._connection.close()
  }
}
