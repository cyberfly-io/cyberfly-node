import { tcp } from '@libp2p/tcp'
import { identify } from '@libp2p/identify'
import { gossipsub } from '@chainsafe/libp2p-gossipsub'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import {mplex} from "@libp2p/mplex";
import { bootstrap } from '@libp2p/bootstrap'
import { pubsubPeerDiscovery } from "@libp2p/pubsub-peer-discovery";


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
    ],
      announce: [`/ip4/${ip}/tcp/31001/p2p/${peerId}`,]
    },
    transports: [
    tcp(),
    ],
    connectionEncryption: [noise()],
    streamMuxers: [yamux(),mplex()],
    connectionGater: {
      denyDialMultiaddr: () => false,
    },
    services: {
      identify: identify(),
      pubsub: gossipsub({ allowPublishToZeroPeers: true, emitSelf: true }),
    },
    connectionManager: {
      minConnections: 0
    }
  }
  
}