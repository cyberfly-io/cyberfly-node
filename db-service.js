import { createHelia } from 'helia'
import { createLibp2p } from 'libp2p'
import { createOrbitDB } from '@orbitdb/core'
import { LevelBlockstore } from 'blockstore-level'
import { bitswap } from '@helia/block-brokers'
import { libp2pOptions } from './config/libp2pconfig.js'
import { getPeerId } from './config/utils.js'
import {
    toString as uint8ArrayToString,
  } from "uint8arrays";
import fs from "fs";



const startOrbitDB = async ({ id, identity, identities, directory } = {}) => {
  const options =  libp2pOptions
  const peerId = await getPeerId()
  const libp2p = await createLibp2p({peerId, ...options })
  if(!peerId){
    const privKey = uint8ArrayToString(libp2p.peerId.privateKey, "hex");
    fs.writeFileSync(".env", `PEER_PRIV_KEY=${privKey}`);
  }
  console.log(libp2p.peerId.toString())
  directory = directory || '.'
  const blockstore = new LevelBlockstore(`${directory}/ipfs/blocks`)
  const ipfs = await createHelia({ libp2p, blockstore, blockBrokers: [bitswap()] })
  const orbitdb = await createOrbitDB({ ipfs, id, identity, identities, directory })
  return orbitdb
}


const stopOrbitDB = async (orbitdb) => {
  await orbitdb.stop()
  await orbitdb.ipfs.stop()
  await orbitdb.ipfs.blockstore.unwrap().unwrap().close()
}

export {
  startOrbitDB,
  stopOrbitDB,
  libp2pOptions,
}