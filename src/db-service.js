import { createHelia } from 'helia'
import { createLibp2p } from 'libp2p'
import { createOrbitDB } from '@orbitdb/core'
import { LevelBlockstore } from 'blockstore-level'
import { bitswap } from '@helia/block-brokers'
import { getLibp2pOptions } from './config/libp2pconfig.js'
import { getIp, loadOrCreatePeerIdAndKeyPair } from './config/utils.js'
import { getNodes } from './config/utils.js'



const startOrbitDB = async ({ id, identity, identities, directory, isBootstrapNode } = {}) => {

  const ip = await getIp()
  const config = await loadOrCreatePeerIdAndKeyPair('./data/config.json')
  let bootstrap_nodes = ["/dns4/node.cyberfly.io/tcp/31001/p2p/QmSbaexTeVSBTjhFwJRZpvCc7PqPs84pBHysgvWUz5DeW6"]
if(isBootstrapNode!=="true"){
  try{
    const data =  await getNodes()
    if(data.result.status==='success'){
      data.result.data.forEach(element => {
        bootstrap_nodes.push(element['multiaddr'])
      });
    }
  }
  catch(e){
  console.log(e)
  }
}


  const options =  getLibp2pOptions(ip, config.peerId.toString(), bootstrap_nodes)
  const peerId = config.peerId
  const libp2p = await createLibp2p({peerId, ...options })
  console.log(libp2p.peerId.toString())
  directory = directory || './data'
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