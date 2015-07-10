import minimist from 'minimist'
import UDPS from './'

const help = `  udps - a secure application protocol build on udp

  Usage:
      udps <options> [server]
  Options:
      -s, --server <port> Starts a server on the given port
      -h, --help          Output this help info
  Examples:
      udps -s 1337
      udps 127.0.0.1 1337
`

export default function (argv) {
  const args = minimist(argv, {
    alias: {
      help: 'h',
      server: 's'
    }
  })
  if (args.help) {
    console.log(help)
    return
  }
  if (args.server) {
    if (typeof args.server !== 'number') return console.error('invalid port')
    const server = new UDPS.Server(args.server)
    server.on('listening', () => {
      process.on('SIGINT', () => {
        server.close(() => process.exit())
      })
      console.error('server started on port', args.server)
    })
    server.on('connection', (con) => {
      console.error('new connection from', con.address)
      con.on('close', () => {
        console.error('connection closed from', con.address)
      })
      process.stdin
      .pipe(con.stream)
      .pipe(process.stdout)
    })
    server.on('close', () => {
      console.error('server closed')
      process.exit()
    })
    return
  }
  if (args._.length === 0) {
    return console.error('server and port missing')
  }
  let address = args._.shift()
  let port = null
  if (/:\d+$/.test(address)) {
    let con = address.split(':')
    address = con[0]
    port = con[1]
  }
  if (!port && args._.length > 0) port = parseInt(args._.shift(), 10)
  if (!address || !port || isNaN(port)) return console.error('invalid address or port')
  console.error('connecting to', address, port)
  const client = new UDPS.Client(address, port)
  client.on('ready', (con) => {
    console.error('connection ready')
    process.on('SIGINT', () => client.close())
    process.stdin
    .pipe(con.stream)
    .pipe(process.stdout)
  })
  client.on('close', () => {
    console.error('connection closed')
    process.exit()
  })
}
