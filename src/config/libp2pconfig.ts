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
import { ping } from '@libp2p/ping'
import { webRTC, webRTCDirect } from '@libp2p/webrtc'
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2'
import { quic } from '@chainsafe/libp2p-quic'
import { webTransport } from "@libp2p/webtransport";

let bsNodes = ["/dns4/node.cyberfly.io/tcp/31001/p2p/12D3KooWA8mwP9wGUc65abVDMuYccaAMAkXhKUqpwKUZSN5McDrw"]

export const getLibp2pOptions:any = (ip:string, peerId:string)=> {

let filteredBS = bsNodes.filter(element=> !element.includes(peerId));



let scoreThresholds = {
	gossipThreshold: -Infinity,
	publishThreshold: -Infinity,
	graylistThreshold: -Infinity,
}
// Build peerDiscovery array conditionally
  const peerDiscovery: any[] = [
    pubsubPeerDiscovery({
      interval: 10000,
      topics: ["cyberfly._peer-discovery._p2p._pubsub"],
      listenOnly: false,
    })
  ];
  if (filteredBS.length > 0) {
    peerDiscovery.push(
      bootstrap({ list: filteredBS, tagName: "keep-alive" })
    );
  }

  return {
    peerDiscovery,
    addresses: {
      listen: ['/ip4/0.0.0.0/tcp/31001',
      '/ip4/0.0.0.0/tcp/31002/ws',
      '/webrtc-direct',
      "/webrtc",
      "/webtransport",
      "/p2p-circuit",
      '/ip4/0.0.0.0/udp/0/quic-v1'
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
    webRTC(),
    webRTCDirect(),
    webTransport(),
    circuitRelayTransport(),
    quic(),
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
      ping: ping(),
      relay: circuitRelayServer({
        reservations:{
          maxReservations: 500
        }
      })
    }
  }
  
}
