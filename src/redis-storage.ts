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
    else if(objectType=='sortedset'){
      const data = decoded.payload.value.data
      try{
        await redis.zAdd(decoded.id.split("/")[2], [{score:decoded.payload.value.timestamp, value:JSON.stringify(data)}])
        await redis.set(hash, "true")
      }
      catch(e){
        console.log(`zadd error ${e}`)
      }
    }
    else {
      await redis.json.set(`${decoded.id}:${hash}`, '$',decoded.payload.value);
      await redis.set(hash, "true")
    }
  }

  const get = async (hash:string) => {
    return null
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