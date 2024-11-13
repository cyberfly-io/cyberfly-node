import { ComposedStorage, IPFSBlockStorage } from '@orbitdb/core';
import { RedisStorage } from './redis-storage.js';
import { startOrbitDB } from './db-service.js';
import CyberflyAccessController from './cyberfly-access-controller.js'
import { nanoid } from 'nanoid'


const redis_ip = process.env.REDIS_HOST || '127.0.0.1';
const redis_port = 6379
const redis_host = `${redis_ip}:${redis_port}`
const node_priv_key = process.env.NODE_PRIV_KEY
const nodeConfig = await startOrbitDB({sk:node_priv_key})
const ipfs = nodeConfig.orbitdb.ipfs
const orbitdb = nodeConfig.orbitdb
const libp2p = nodeConfig.orbitdb.ipfs.libp2p

const discovered:any = []


libp2p.addEventListener('peer:discovery', (evt:any) => {
    const peerInfo = evt.detail
    const peerId = peerInfo.id.toString()
    if (!discovered.includes(peerId)) {
      discovered.push(peerId);
  }

  })


const entryStorage =  await ComposedStorage(
    await RedisStorage({redis_host}),
    await IPFSBlockStorage({ipfs, pin: true })
  )


  const updateData = async (addr:string, objectType:any, data:any, sig:string, pubkey:string, timestamp:any, dbtype:string, id='')=>{
   
    try{
      const db = await orbitdb.open(addr, {type:dbtype, AccessController:CyberflyAccessController(), entryStorage})
      await db.put({_id:id? id:nanoid(), publicKey:pubkey, data:data,timestamp:timestamp, sig:sig, objectType});
      const msg = {dbAddr:db.address}
      // we want the data should be replicated on all the nodes irrespective of the db open or not in a specific node
      //pubsub.publish("dbupdate", fromString(JSON.stringify(msg))); 
      return msg.dbAddr
    }
    catch(e) {
     console.log(e)
     return e
    }
}


  export  {
    nodeConfig,
    entryStorage,
    updateData,
    discovered
  }