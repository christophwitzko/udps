import { Duplex } from 'stream'

import async from 'async'
import BufferList from 'bl'
import bsplit from 'split-buffer'
import { find } from 'lodash'

import Packet from './Packet'

export default class ConnectionStream extends Duplex {
  constructor (con) {
    super()
    this._con = con
    this._wc = {
      index: 0,
      buffers: [],
      callback: null,
      timers: {}
    }
    this._rc = {
      seq: 0,
      buffers: []
    }
    this.maxSize = con._windowSize * con._packetSize
    this._wbl = new BufferList()
  }
  _read (size) {
  }
  _write (chunk, encoding, callback) {
    this._wbl.append(chunk)
    async.whilst(
      () => this._wbl.length >= this.maxSize,
      (cb) => {
        const win = this._wbl.slice(0, this.maxSize)
        this._sendWindow(win, () => {
          this._wbl.consume(win.length)
          cb()
        })
      },
      () => {
        if (this._wbl.length) {
          this._sendWindow(this._wbl.slice(0, this._wbl.length), () => {
            this._wbl.consume(this._wbl.length)
            callback()
          })
          return
        }
        callback()
      }
    )
  }
  _sendWindow (buf, cb) {
    const buffers = bsplit(buf, this._con._packetSize).map((v) => {
      return {
        seq: this._con._sequence++,
        ack: false,
        data: v
      }
    })
    this._wc.buffers = buffers
    this._wc.callback = cb
    this._wc.timers = {}
    async.eachSeries(buffers, (b, callback) => {
      const pkt = Packet.createData(b.seq, b.data)
      const sender = this._con._send.bind(this._con, pkt)
      sender(callback)
      this._wc.timers[b.seq] = setInterval(sender, 1000)
    })
  }
  _ack (seq) {
    this._con._send(Packet.createAcknowledgment(seq))
  }
  _packet (pkt) {
    const type = pkt.getType()
    const seq = pkt.getSequence()
    if (type === 3) {
      if (this._readableState.length >= this.maxSize) return
      if (seq < this._rc.seq) return
      if (seq === this._rc.seq) {
        this.push(pkt.getData())
        this._rc.seq++
        this._ack(seq)
        if (!this._rc.buffers.length) return
        let next = this._rc.buffers[0]
        while (next && next.seq === this._rc.seq) {
          this.push(next.data)
          this._rc.seq++
          this._ack(next.seq)
          this._rc.buffers.shift()
          next = this._rc.buffers[0]
        }
        return
      }
      this._rc.buffers.push({
        seq: seq,
        data: pkt.getData()
      })
      this._rc.buffers.sort((a, b) => a.seq - b.seq)
      return
    }
    if (type === 4) {
      const be = find(this._wc.buffers, 'seq', seq)
      if (!be) return
      clearInterval(this._wc.timers[be.seq])
      be.ack = true
      if (!find(this._wc.buffers, 'ack', false)) {
        this._wc.index++
        this._wc.callback()
      }
    }
  }
}
