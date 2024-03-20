import { createHelia } from 'helia'
import { createLibp2p } from 'libp2p'
import { createOrbitDB } from '@orbitdb/core'
import { LevelBlockstore } from 'blockstore-level'
import { bitswap } from '@helia/block-brokers'
import { getLibp2pOptions } from './config/libp2pconfig.js'
import { getIp, loadOrCreatePeerIdAndKeyPair } from './config/utils.js'




const startOrbitDB = async ({ id, identity, identities, directory } = {}) => {
  const ip = await getIp()
  const config = await loadOrCreatePeerIdAndKeyPair('./config.json')
  const options =  getLibp2pOptions(ip, config.peerId.toString())
  const peerId = config.peerId
  const libp2p = await createLibp2p({peerId, ...options })
  console.log(libp2p.peerId.toString())
  directory = directory || '.'
  const blockstore = new LevelBlockstore(`${directory}/ipfs/blocks`)
  const ipfs = await createHelia({ libp2p, blockstore, blockBrokers: [bitswap()] })
  const orbitdb = await createOrbitDB({ ipfs, id, identity, identities, directory })
  return {orbitdb, ...config}
}


const stopOrbitDB = async (orbitdb) => {
  await orbitdb.stop()
  await orbitdb.ipfs.stop()
  await orbitdb.ipfs.blockstore.unwrap().unwrap().close()
}

export {
  startOrbitDB,
  stopOrbitDB,
}