import { createLibp2p } from 'libp2p'
import { webSockets } from '@libp2p/websockets'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { bootstrap } from '@libp2p/bootstrap' 

// Known peers addresses
const bootstrapMultiaddrs = [
  '/dnsaddr/bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6tpvbUcqanj75Nb',
  '/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN'
]

const node = await createLibp2p({
  transports: [webSockets()],
  connectionEncryption: [noise()],
  streamMuxers: [yamux()],
  peerDiscovery: [
    bootstrap({
      list: bootstrapMultiaddrs, // provide array of multiaddrs
    })
  ]
})

node.addEventListener('peer:discovery', (evt) => {
  console.log('Discovered %s', evt.detail.id.toString()) // Log discovered peer
})

node.addEventListener('peer:connect', (evt) => {
  console.log('Connected to %s', evt.detail.toString()) // Log connected peer
})