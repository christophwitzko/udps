import dgram from 'dgram'
import { EventEmitter } from 'events'

import Packet from './Packet'

export default class PacketSocket extends EventEmitter {
  constructor (port) {
    super()
    this._socket = dgram.createSocket('udp4')
    this._socket.on('message', this.receive.bind(this))
    ;['listening', 'close', 'error'].forEach((event) => {
      this._socket.on(event, this.emit.bind(this, event))
    })
    this._socket.bind(port)
  }
  send (address, port, pkt, cb) {
    const buf = pkt.toBuffer()
    this._socket.send(buf, 0, buf.length, port, address, cb)
  }
  receive (data, rinfo) {
    this.emit('packet', Packet.createFromBuffer(data), rinfo)
  }
  close (cb) {
    this._socket.close(cb)
  }
}
