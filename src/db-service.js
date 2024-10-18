import { createHelia } from 'helia'
import { createLibp2p } from 'libp2p'
import { createOrbitDB } from '@orbitdb/core'
import { LevelBlockstore } from 'blockstore-level'
import { getLibp2pOptions } from './config/libp2pconfig.js'
import { getIp, loadOrCreatePeerIdAndKeyPair } from './config/utils.js'




const startOrbitDB = async ({ id, identity, identities, directory, sk } = {}) => {

  const ip = await getIp()
  const config = await loadOrCreatePeerIdAndKeyPair('./data/config.json', sk)

  const options =  getLibp2pOptions(ip, config.peerId.toString())
  const libp2p = await createLibp2p({privateKey:config.privateKey, ...options })
  console.log(libp2p.peerId.toString())
  directory = directory || './data'
  const blockstore = new LevelBlockstore(`${directory}/ipfs/blocks`)

  const ipfs = await createHelia({ libp2p, blockstore  })
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