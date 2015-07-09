import { EventEmitter } from 'events'

import async from 'async'
import { keys, values } from 'lodash'
import PacketSocket from './PacketSocket'
import Connection from './Connection'

export default class Server extends EventEmitter {
  constructor (port) {
    super()
    this._connections = {}
    this._maxConnections = 16
    this._ps = new PacketSocket(port)
    ;['listening', 'close', 'error'].forEach((event) => {
      this._ps.on(event, this.emit.bind(this, event))
    })
    this._ps.on('packet', (pkt, rinfo) => {
      const type = pkt.getType()
      const stream = pkt.getStreamString()
      const hash = rinfo.address + rinfo.port + stream
      const con = this._connections[hash]

      // drop invalid packets
      if (pkt.error || stream === '00') return

      if (type === 1) {
        if (keys(this._connections).length >= this._maxConnections) return
        this._connections[hash] = new Connection(
          this._ps,
          rinfo.address,
          rinfo.port
        )
        this._connections[hash].startTo(pkt)
        this._connections[hash].on('ready', this.emit.bind(this, 'connection'))
        this._connections[hash].on('close', () => {
          this._connections[hash].stream.end()
          delete this._connections[hash]
        })
      }
      if (con && type === 2) {
        con.syncTo(pkt)
      }
      if (con && type > 2 && type < 5) {
        con.handlePacket(pkt)
      }
      if (con && type === 5) {
        con.emit('close')
      }
    })
  }
  close () {
    async.each(values(this._connections), (con, cb) => {
      con.close(cb)
    }, () => {
      this._connections = {}
      this._ps.close()
    })
  }
}
