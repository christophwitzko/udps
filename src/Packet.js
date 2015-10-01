import { join } from 'path'

import ProtoBuf from 'protobufjs'
import crc from 'crc'
import { invert, padLeft } from 'lodash'

const builder = ProtoBuf.loadProtoFile(join(__dirname, '../proto/Packet.proto'))
const ProtoPacket = builder.build('Packet')

function calcCrc32 (data) {
  return padLeft(crc.crc32(data.toBuffer()).toString('16'), 8, '0')
}

const Types = invert(ProtoPacket.Type)

export default class Packet {
  constructor (data) {
    this._p = new ProtoPacket()
    if (data) {
      this.setData(Buffer.isBuffer(data) ? data : new Buffer(data))
    }
    this._p.setStream(new Buffer([0]))
    this.error = null
  }
  setRaw () {
    this._p.setProtocol(ProtoPacket.Protocol.RAW)
  }
  setEncrypted () {
    this._p.setProtocol(ProtoPacket.Protocol.ENCRYPTED)
  }
  setStream (s) {
    this._p.setStream(s)
  }
  setSequence (s) {
    this._p.setSequence(s)
  }
  setData (d) {
    this._p.setData(d)
  }
  setAuthtag (t) {
    this._p.setAuthtag(t)
  }
  setIv (i) {
    this._p.setIv(i)
  }
  load (data) {
    const pp = ProtoPacket.decode(data)
    if (pp.crc && pp.data && pp.crc.toString('hex') !== calcCrc32(pp.data)) {
      this.error = new Error('invalid crc')
    }
    this._p = pp
  }
  pack () {
    if (this._p.data) {
      this._p.setCrc(new Buffer(calcCrc32(this._p.data), 'hex'))
    }
    return this._p
  }
  getRawPkt () {
    return this._p
  }
  getProtocol () {
    return this._p.protocol
  }
  getType () {
    return this._p.type
  }
  getTypeString () {
    return Types[this._p.type]
  }
  getStream () {
    return this._p.stream.toBuffer()
  }
  getStreamString () {
    return this._p.stream.toString('hex')
  }
  getAuthentication () {
    return this._p.authentication
  }
  getSequence () {
    return this._p.sequence.toNumber()
  }
  getData () {
    return this._p.data && this._p.data.toBuffer()
  }
  getAuthtag () {
    return this._p.authtag && this._p.authtag.toBuffer()
  }
  getIv () {
    return this._p.iv && this._p.iv.toBuffer()
  }
  toBuffer () {
    return this.pack().toBuffer()
  }
  static createFromBuffer (data) {
    const pkt = new Packet()
    pkt.load(data)
    return pkt
  }
  static createAuthentication (data, curve, cipher) {
    const pkt = new Packet(data)
    const authentication = new ProtoPacket.Authentication(curve, cipher)
    pkt._p.setType(ProtoPacket.Type.AUTHENTICATION)
    pkt._p.setAuthentication(authentication)
    return pkt
  }
  static creatSynchronization () {
    const pkt = new Packet()
    pkt._p.setType(ProtoPacket.Type.SYNCHRONIZATION)
    return pkt
  }
  static createData (seq, data) {
    const pkt = new Packet(data)
    pkt._p.setType(ProtoPacket.Type.DATA)
    pkt.setSequence(seq)
    return pkt
  }
  static createAcknowledgment (seq) {
    const pkt = new Packet()
    pkt._p.setType(ProtoPacket.Type.ACKNOWLEDGMENT)
    pkt.setSequence(seq)
    return pkt
  }
  static createFinalize () {
    const pkt = new Packet()
    pkt._p.setType(ProtoPacket.Type.FINALIZE)
    return pkt
  }
}
