import { tcp } from '@libp2p/tcp'
import { identify } from '@libp2p/identify'
import { gossipsub } from '@chainsafe/libp2p-gossipsub'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { bootstrap } from '@libp2p/bootstrap'
import { pubsubPeerDiscovery } from "@libp2p/pubsub-peer-discovery";
import { webSockets } from '@libp2p/websockets'
import * as filters from '@libp2p/websockets/filters'
import { circuitRelayServer } from '@libp2p/circuit-relay-v2'
import { kadDHT } from "@libp2p/kad-dht";
import { preSharedKey } from '@libp2p/pnet'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let bsNodes = ["/dns4/node2.cyberfly.io/tcp/31001/p2p/12D3KooWSfGgUaeogSZuRPa4mhsAU41qJH5EpmwKg9wGVzUwFGth", 
  "/dns4/node.cyberfly.io/tcp/31001/p2p/12D3KooWA8mwP9wGUc65abVDMuYccaAMAkXhKUqpwKUZSN5McDrw"]

export const getLibp2pOptions:any = (ip:string, peerId:string)=> {

let filteredBS = bsNodes.filter(element=> !element.includes(peerId));
const filePath = path.join(__dirname, "swarm.key")

const swarmKey = fs.readFileSync(filePath, 'utf8')

let scoreThresholds = {
	gossipThreshold: -Infinity,
	publishThreshold: -Infinity,
	graylistThreshold: -Infinity,
}

  return {
    peerDiscovery: [
      pubsubPeerDiscovery({
        interval: 10000,
        topics: ["cyberfly._peer-discovery._p2p._pubsub"],
        listenOnly: false,
      }),
      bootstrap({list:filteredBS, tagName:"keep-alive", })
      ],
      connectionProtector: preSharedKey({
        psk: Buffer.from(swarmKey)
      }),
    addresses: {
      listen: ['/ip4/0.0.0.0/tcp/31001',
      '/ip4/0.0.0.0/tcp/31002/ws',
    ],
    appendAnnounce: [`/ip4/${ip}/tcp/31001/p2p/${peerId}`,`/ip4/${ip}/tcp/31002/wss/p2p/${peerId}`, `/ip4/${ip}/tcp/31002/ws/p2p/${peerId}`]
    },
    connectionManager: {
            maxConnections: 1500,
            reconnectRetries: 10,
            maxPeerAddrsToDial: 1500,
            maxParallelReconnects: 10,
            maxIncomingPendingConnections: 500,
            inboundConnectionThreshold: 500
    },
    transports: [
    tcp(),
    webSockets({
      filter: filters.all,
    }),
    ],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    connectionGater: {
      denyDialMultiaddr: () => false,
    },
    services: {
      identify: identify(),
      pubsub: gossipsub({
        allowPublishToZeroTopicPeers: true, emitSelf: true,
        canRelayMessage:true, doPX:true, scoreThresholds }),
      dht: kadDHT({
        clientMode: false,
      }),
      circuitRelay: circuitRelayServer({
        reservations:{
          maxReservations: 500
        }
      })
    }
  }
  
}
