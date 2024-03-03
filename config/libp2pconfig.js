import { tcp } from '@libp2p/tcp'
import { identify } from '@libp2p/identify'
import { gossipsub } from '@chainsafe/libp2p-gossipsub'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { kadDHT, removePrivateAddressesMapper } from '@libp2p/kad-dht'
import { bootstrap } from '@libp2p/bootstrap'



export const libp2pOptions = {
    peerDiscovery: [
      bootstrap({list:["/ip4/170.187.249.181/tcp/31001/p2p/12D3KooWN6UaUYr5QUmQo17KeaPvNBLtdw4irYDt9JYFGRgwGHUn"]})
    ],
    addresses: {
      listen: ['/ip4/0.0.0.0/tcp/31001'] //change this port for flux node like 31001
    },
    transports: [
      tcp()
    ],
    connectionEncryption: [noise()],
    streamMuxers: [yamux()],
    services: {
      aminoDHT: kadDHT({
        protocol: '/ipfs/kad/1.0.0',
        peerInfoMapper: removePrivateAddressesMapper
      }),
      identify: identify(),
      pubsub: gossipsub({ allowPublishToZeroPeers: true, emitSelf: true })
    }
  }