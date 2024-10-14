import { tcp } from '@libp2p/tcp'
import { identify } from '@libp2p/identify'
import { gossipsub } from '@chainsafe/libp2p-gossipsub'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { bootstrap } from '@libp2p/bootstrap'
import { pubsubPeerDiscovery } from "@libp2p/pubsub-peer-discovery";
import { webSockets } from '@libp2p/websockets'
import * as filters from '@libp2p/websockets/filters'
import { circuitRelayServer, circuitRelayTransport } from '@libp2p/circuit-relay-v2'
import { autoNAT } from "@libp2p/autonat";
import { dcutr } from "@libp2p/dcutr";

let scoreThresholds = {
	gossipThreshold: -Infinity,
	publishThreshold: -Infinity,
	graylistThreshold: -Infinity,
	// acceptPXThreshold: 10,
	// opportunisticGraftThreshold: 20
}



let bsNodes = ["/dns4/vps-5b1e75a3.vps.ovh.ca/tcp/31001/p2p/12D3KooWCaTco8TYafHWko3bNryy2bmULfPvYMNVkYBvJZDXvqRj", 
  "/dns4/node.cyberfly.io/tcp/31001/p2p/12D3KooWA8mwP9wGUc65abVDMuYccaAMAkXhKUqpwKUZSN5McDrw"]

export const getLibp2pOptions = (ip, peerId)=> {

let filteredBS = bsNodes.filter(element=> !element.includes(peerId));

  return {
    peerDiscovery: [
      pubsubPeerDiscovery({
        interval: 10000,
        topics: ["cyberfly._peer-discovery._p2p._pubsub"],
        listenOnly: false,
      }),
      bootstrap({list:filteredBS})
      ],
    addresses: {
      listen: ['/ip4/0.0.0.0/tcp/31001',
      '/ip4/0.0.0.0/tcp/31002/wss',
    ],
      announce: [`/ip4/${ip}/tcp/31001/p2p/${peerId}`,`/ip4/${ip}/tcp/31002/wss/p2p/${peerId}`]
    },
    connectionManager: {
      minConnections: 1,
      maxConnections: Infinity,
      autoDialConcurrency: 5,
    },
    transports: [
    tcp(),
    webSockets({
      filter: filters.all
    }),
    circuitRelayTransport({
      discoverRelays: 2,
    })
    ],
    connectionEncryption: [noise()],
    streamMuxers: [yamux()],
    connectionGater: {
      denyDialMultiaddr: () => false,
    },
    services: {
      identify: identify(),
      autoNAT: autoNAT(),
      dcutr: dcutr(),
      pubsub: gossipsub({ ignoreDuplicatePublishError:true,allowPublishToZeroPeers:true , allowPublishToZeroTopicPeers: true, emitSelf: true, 
        canRelayMessage: true, scoreThresholds }),
      relay: circuitRelayServer({
        reservations: {
          maxReservations: Infinity
        }
      })
    }
  }
  
}
