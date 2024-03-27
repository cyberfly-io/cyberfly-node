import { tcp } from '@libp2p/tcp'
import { identify } from '@libp2p/identify'
import { gossipsub } from '@chainsafe/libp2p-gossipsub'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import {mplex} from "@libp2p/mplex";
import { bootstrap } from '@libp2p/bootstrap'
import { pubsubPeerDiscovery } from "@libp2p/pubsub-peer-discovery";
import { webSockets } from '@libp2p/websockets'
import * as filters from '@libp2p/websockets/filters'
import { circuitRelayServer } from '@libp2p/circuit-relay-v2'


export const getLibp2pOptions = (ip, peerId)=> {
  return {
    peerDiscovery: [
      bootstrap({list:["/ip4/170.187.249.181/tcp/31001/p2p/QmXwf2mBsniQ25zK5ezCH2WQtjn3NbtFLyc6D1S5uhtSFV",
    ]}),
    pubsubPeerDiscovery({
      interval: 1000,
      topics: ["cyberfly._peer-discovery._p2p._pubsub"],
      listenOnly: false,
    }),
    ],
    addresses: {
      listen: ['/ip4/0.0.0.0/tcp/31001',
      '/ip4/0.0.0.0/tcp/31001/ws'
    ],
      announce: [`/ip4/${ip}/tcp/31001/p2p/${peerId}`, `/ip4/${ip}/tcp/31001/p2p/${peerId}/ws`]
    },
    transports: [
    tcp(),
    webSockets({
      filter: filters.all
    })
    ],
    connectionEncryption: [noise()],
    streamMuxers: [yamux(),mplex()],
    connectionGater: {
      denyDialMultiaddr: () => false,
    },
    services: {
      identify: identify(),
      pubsub: gossipsub({ allowPublishToZeroPeers: true, emitSelf: true }),
      relay: circuitRelayServer({
        reservations: {
          maxReservations: Infinity
        }
      })
    },
    connectionManager: {
      minConnections: 0
    }
  }
  
}