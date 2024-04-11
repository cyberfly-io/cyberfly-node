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
import { kadDHT } from '@libp2p/kad-dht'
import { webTransport } from '@libp2p/webtransport'
import { webRTC, webRTCDirect } from '@libp2p/webrtc'

export const getLibp2pOptions = (ip, peerId)=> {
  return {
    peerDiscovery: [
      bootstrap({list:["/ip4/170.187.249.181/tcp/31001/p2p/QmVydtrKsPcLdscLP9YMSynmc7GCNA7ZeUE9ViALuWijqV",
    ]}),
    pubsubPeerDiscovery({
      interval: 1000,
      topics: ["cyberfly._peer-discovery._p2p._pubsub"],
      listenOnly: false,
    }),
    ],
    addresses: {
      listen: ['/ip4/0.0.0.0/tcp/31001',
      '/ip4/0.0.0.0/tcp/31002/wss',
      '/webrtc'
    ],
      announce: [`/ip4/${ip}/tcp/31001/p2p/${peerId}`,`/dns4/node.cyberfly.io/tcp/443/wss/p2p/${peerId}`]
    },
    connectionGater: {
      denyDialMultiaddr: async () => false,
    },
    transports: [
    tcp(),
    webTransport(),
    webSockets({
      filter: filters.all
    }),
    webRTC({
      rtcConfiguration: {
        iceServers: [{
          urls: [
            'stun:stun.l.google.com:19302',
            'stun:global.stun.twilio.com:3478'
          ]
        }]
      }
    }),
    webRTCDirect(),
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
      pubsub: gossipsub({ allowPublishToZeroTopicPeers: true, emitSelf: true }),
      dht: kadDHT({
        protocol: "/cyberfly-connectivity/kad/1.0.0",
        maxInboundStreams: 5000,
        maxOutboundStreams: 5000,
        clientMode: false,
      }),
      relay: circuitRelayServer({
        reservations: {
          maxReservations: Infinity
        }
      })
    }
  }
  
}