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
import { circuitRelayServer, circuitRelayTransport } from '@libp2p/circuit-relay-v2'
import { autoNAT } from "@libp2p/autonat";
import { dcutr } from "@libp2p/dcutr";


export const getLibp2pOptions = (ip, peerId, bootstrap_nodes)=> {
  return {
    peerDiscovery: [
      bootstrap({list:bootstrap_nodes, timeout:0}),
    pubsubPeerDiscovery({
      interval: 1000,
      topics: ["cyberfly._peer-discovery._p2p._pubsub"],
      listenOnly: false,
    }),
    ],
    addresses: {
      listen: ['/ip4/0.0.0.0/tcp/31001',
      '/ip4/0.0.0.0/tcp/31002/wss',
    ],
      announce: [`/ip4/${ip}/tcp/31001/p2p/${peerId}`,`/ip4/${ip}/tcp/31002/wss/p2p/${peerId}`]
    },
    transports: [
    tcp(),
    webSockets({
      filter: filters.all
    }),
    circuitRelayTransport({
      discoverRelays: 1,
    })
    ],
    connectionEncryption: [noise()],
    streamMuxers: [yamux(),mplex()],
    connectionGater: {
      denyDialMultiaddr: () => false,
    },
    services: {
      identify: identify(),
      autoNAT: autoNAT(),
      dcutr: dcutr(),
      pubsub: gossipsub({ allowPublishToZeroTopicPeers: true, emitSelf: true }),
      relay: circuitRelayServer({
        reservations: {
          maxReservations: Infinity
        }
      })
    }
  }
  
}