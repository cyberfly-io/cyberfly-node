import { createClient } from 'redis';
import Entry from '@orbitdb/core/src/oplog/entry.js'
import { TimeSeriesDuplicatePolicies, TimeSeriesEncoding } from '@redis/time-series';

const RedisStorage = async (options:any) => {
  let redis =  createClient({url:`redis://${options.redis_host}`})
  redis.connect();
  redis.on("connect", ()=>{
    console.log("Redis Connected")
  })

  redis.on("error", (error)=>{
console.log(error)
  })

  redis.on("end", ()=>{
    console.log("Redis disconnected")
  })

  // Helpers: remove prior entries that have the same _id
  const deleteJsonDocsById = async (prefixKey: string, targetId: any) => {
    if (!targetId) return;
    try {
      for await (const key of redis.scanIterator({ MATCH: `${prefixKey}:*`, COUNT: 100 })) {
        try {
          const doc: any = await redis.json.get(key as string);
          if (doc && doc._id === targetId) {
            await redis.del(key as string);
          }
        } catch { /* ignore per-key errors */ }
      }
    } catch (e) {
      console.log(`deleteJsonDocsById error: ${e}`);
    }
  };

  const deleteFromSortedSetById = async (zkey: string, targetId: any) => {
    if (!targetId) return;
    try {
      const members = await redis.zRange(zkey, 0, -1); // returns values only
      if (!members?.length) return;
      const toRemove: string[] = [];
      for (const m of members) {
        try {
          const obj = JSON.parse(m);
          if (obj && obj._id === targetId) toRemove.push(m);
        } catch { /* ignore bad JSON */ }
      }
      if (toRemove.length) {
        await redis.zRem(zkey, toRemove);
      }
    } catch (e) {
      console.log(`deleteFromSortedSetById error: ${e}`);
    }
  };

  const put = async (hash:any, data:any) => {
    const hashexist = await redis.get(hash)
    if (hashexist){
      return 
    }
    const decoded = await Entry.decode(data)
    delete decoded['hash']
    delete decoded['bytes']
    const objectType = decoded.payload.value.objectType
    if(objectType === "stream"){
    const message = decoded.payload.value
    const streamName = decoded.payload.value.data.streamName
    try{
      await redis.xAdd(`${decoded.id}:${streamName}`, "*", {timestamp:`${decoded.payload.value.timestamp}`,message:JSON.stringify(message)})
      await redis.set(hash, "true")

    }
    catch(e){
      console.log(`xAdd error: ${e}`)
    }
    }
    else if(objectType==="geo"){
      const data = decoded.payload.value.data
      try{
        await redis.geoAdd(`${decoded.id}:${data.locationLabel}`, {
          longitude: data.longitude,
          latitude:data.latitude,
          member:data.member
        }
        )
        await redis.set(hash, "true")
      }
      catch(e){
        console.log(`geoAdd error: ${e}`)
      }
    }
    else if(objectType==="ts"){
      const data = decoded.payload.value.data
      try{
        await redis.ts.info(decoded.id.split("/")[2])
      }
      catch(e){
       await redis.ts.create(decoded.id.split("/")[2], {
        RETENTION: 86400000, // 1 day in milliseconds
        ENCODING: TimeSeriesEncoding.UNCOMPRESSED, // No compression
        DUPLICATE_POLICY: TimeSeriesDuplicatePolicies.BLOCK // No duplicates
       })
      }
      try{
        await redis.ts.ADD(decoded.id.split("/")[2], decoded.payload.value.timestamp, data.value, {LABELS:data.labels})
        await redis.set(hash, "true")
      }
      catch(e){
        console.log(`time series error ${e}`)
      }
    }
    else if(objectType === 'sortedset'){
      const data = decoded.payload.value
      try{
        // dedupe by _id in the ZSET before adding
        const zkey = decoded.id.split("/")[2]
        await deleteFromSortedSetById(zkey, data?._id)
        await redis.zAdd(zkey, [{score:decoded.payload.value.timestamp, value:JSON.stringify(data)}])
        await redis.set(hash, "true")
      }
      catch(e){
        console.log(`zadd error ${e}`)
      }
    }
    else {
      // Default JSON object: delete any prior docs with same _id under this prefix
      const newDoc = decoded.payload.value
      try {
        await deleteJsonDocsById(decoded.id, newDoc?._id)
        await redis.json.set(`${decoded.id}:${hash}`, '$', newDoc);
        await redis.set(hash, "true")
      } catch(e) {
        console.log(`json set error: ${e}`)
      }
    }
  }

  const get = async (hash:string) => {
  }

  const del = async (hash:string) => {
  }

  const iterator = async function * ({ amount, reverse }:any = {}) {
  }

  const merge = async (other:any) => {
  }

  const clear = async () => {
  }

  const close = async () => {
  }

  return {
    put,
    del,
    get,
    iterator,
    merge,
    clear,
    close
  }
}

export {
    RedisStorage
}