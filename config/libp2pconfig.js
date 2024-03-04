import { tcp } from '@libp2p/tcp'
import { identify } from '@libp2p/identify'
import { gossipsub } from '@chainsafe/libp2p-gossipsub'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { kadDHT } from '@libp2p/kad-dht'
import { bootstrap } from '@libp2p/bootstrap'
import { autoNAT } from "@libp2p/autonat";
import { pubsubPeerDiscovery } from "@libp2p/pubsub-peer-discovery";



export const libp2pOptions = {
    peerDiscovery: [
      bootstrap({list:["/ip4/170.187.249.181/tcp/31001/p2p/12D3KooWAwctiANsPDMSfGkFav5QGQ97ffGUc1U5FjZwaESF4Tad",
    ]}),
    pubsubPeerDiscovery({
      interval: 1000,
      topics: ["cyberfly._peer-discovery._p2p._pubsub"],
      listenOnly: false,
    }),
    ],
    addresses: {
      listen: ['/ip4/0.0.0.0/tcp/31001']
    },
    transports: [
      tcp()
    ],
    connectionEncryption: [noise()],
    streamMuxers: [yamux()],
    connectionGater: {
      denyDialMultiaddr: () => false,
    },
    services: {
      dht: kadDHT({
        kBucketSize: 20,
        clientMode: false,
        enabled: true,      
      }),
      autoNAT: autoNAT(),
      identify: identify(),
      pubsub: gossipsub({ allowPublishToZeroPeers: true, emitSelf: true })
    }
  }