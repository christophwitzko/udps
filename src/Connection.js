import { EventEmitter } from 'events'
import crypto from 'crypto'

import Packet from './Packet'
import ConnectionStream from './ConnectionStream'

export default class Connection extends EventEmitter {
  constructor (ps, address, port) {
    super()
    this._streamid = null
    this._sequence = 0
    this._ps = ps
    this.address = address
    this.port = port
    this.ready = false
    this._auth = {}
    this._auth.curve = 'secp521r1'
    this._auth.cipher = 'aes-256-gcm'
    this._auth.ecdh = null
    this._auth.secret = null
    this._auth.retryTimer = null
    this.stream = new ConnectionStream(this)
  }
  getStreamId () {
    return this._streamid && this._streamid.toString('hex')
  }
  initECDH () {
    this._auth.ecdh = crypto.createECDH(this._auth.curve)
    this._auth.ecdh.generateKeys()
    return Packet.createAuthentication(
      this._auth.ecdh.getPublicKey(),
      this._auth.curve,
      this._auth.cipher
    )
  }
  initiate () {
    this._streamid = crypto.randomBytes(8)
    this._send(this.initECDH())
    this._auth.retryTimer = setTimeout(this.initiate.bind(this), 1000)
  }
  _setSecret (data) {
    this._secret = crypto.createHash('sha256').update(
      this._auth.ecdh.computeSecret(data)
    ).digest()
  }
  _hmac (str) {
    return crypto.createHmac('sha256', this._secret).update(str).digest()
  }
  startTo (pkt) {
    this._streamid = pkt.getStream()
    const authentication = pkt.getAuthentication()
    this._auth.curve = authentication.curve
    this._auth.cipher = authentication.cipher
    this._send(this.initECDH())
    this._setSecret(pkt.getData())
  }
  startFrom (pkt) {
    this._setSecret(pkt.getData())
    const sync = Packet.creatSynchronization()
    sync.setData(this._hmac('UDPS'))
    this._encryptPkt(sync)
    this._send(sync)
  }
  _encryptPkt (pkt) {
    const odata = pkt.getData()
    if (!odata || pkt.getProtocol() !== 1) return pkt
    pkt.setEncrypted()
    const iv = crypto.randomBytes(12)
    const ciph = crypto.createCipheriv(
      this._auth.cipher,
      this._secret,
      iv
    )
    const data = [ciph.update(odata)]
    const fin = ciph.final()
    if (fin) data.push(fin)
    pkt.setData(Buffer.concat(data))
    pkt.setIv(iv)
    pkt.setAuthtag(ciph.getAuthTag())
    return pkt
  }
  _decryptPkt (pkt) {
    const odata = pkt.getData()
    if (!odata || pkt.getProtocol() !== 2) return pkt
    pkt.setRaw()
    const dciph = crypto.createDecipheriv(
      this._auth.cipher,
      this._secret,
      pkt.getIv()
    )
    dciph.setAuthTag(pkt.getAuthtag())
    const data = [dciph.update(odata)]
    const fin = dciph.final()
    if (fin) data.push(fin)
    pkt.setData(Buffer.concat(data))
    return pkt
  }
  _send (pkt, cb) {
    if (this.ready) this._encryptPkt(pkt)
    pkt.setStream(this._streamid)
    this._ps.send(this.address, this.port, pkt, cb)
  }
  syncTo (pkt) {
    this._decryptPkt(pkt)
    const hmac = this._hmac('UDPS')
    if (hmac.toString('hex') !== pkt.getData().toString('hex')) return
    this.ready = true
    const sync = Packet.creatSynchronization()
    sync.setData(hmac)
    this._send(sync, () => this.emit('ready', this))
  }
  syncFrom (pkt) {
    this._decryptPkt(pkt)
    if (this._hmac('UDPS').toString('hex') !== pkt.getData().toString('hex')) return
    this.ready = true
    clearTimeout(this._auth.retryTimer)
    this.emit('ready', this)
  }
  handlePacket (pkt, rinfo) {
    if (!this.ready) return
    this._decryptPkt(pkt)
    // const type = pkt.getType()
    // this.emit('_packet')
  }
  close (cb) {
    if (!this.ready) return
    this._send(Packet.createFinalize(), () => {
      this.emit('close')
      if (typeof cb === 'function') cb()
    })
  }
}
