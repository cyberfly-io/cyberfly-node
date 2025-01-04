import { createHelia } from 'helia'
import { createLibp2p } from 'libp2p'
import { createOrbitDB } from '@orbitdb/core'
import { LevelBlockstore } from 'blockstore-level'
import { getLibp2pOptions } from './config/libp2pconfig.js'
import { getIp, loadOrCreatePeerIdAndKeyPair } from './config/utils.js'
import { LevelDatastore } from "datastore-level"



const startOrbitDB = async ({sk}) => {

  const ip = await getIp()
  const directory = './data'
  const config = await loadOrCreatePeerIdAndKeyPair('./data/config.json', sk)
  let datastore = new LevelDatastore(`${directory}/ipfs/data`)
  const options =  getLibp2pOptions(ip, config.peerId.toString())
  const libp2p:any = await createLibp2p({datastore ,privateKey:config.privateKey, ...options })
  console.log(libp2p.peerId.toString())

  const blockstore = new LevelBlockstore(`${directory}/ipfs/blocks`)

  const ipfs = await createHelia({ libp2p, blockstore, datastore  })
  const orbitdb = await createOrbitDB({ ipfs, directory })
  return {orbitdb, ...config}
}


const stopOrbitDB = async (orbitdb:any) => {
  await orbitdb.stop()
  await orbitdb.ipfs.stop()
  await orbitdb.ipfs.blockstore.unwrap().unwrap().close()
}

export {
  startOrbitDB,
  stopOrbitDB,
}