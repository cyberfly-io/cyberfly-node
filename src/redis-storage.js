import { createClient } from 'redis';
import Entry from '@orbitdb/core/src/oplog/entry.js'

const RedisStorage = async (options) => {
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

  const put = async (hash, data) => {
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
    await redis.xAdd(streamName, "*", {message:JSON.stringify(message)})
    }
    else if(objectType==="geo"){
      const data = decoded.payload.value.data
      await redis.geoAdd(`${decoded.id}`, {
        longitude: data.longitude,
        latitude:data.latitude,
        member:data.member
      }
      )
    }
    else if(objectType==="ts"){
      const data = decoded.payload.value.data
      await redis.ts.ADD(`${decoded.id}`, "*", data.value)
    }
    else {
      await redis.json.set(`${decoded.id}:${hash}`, '$',decoded.payload.value);
    }
    await redis.set(hash, "true")
  }

  const get = async (hash) => {
    return null
  }

  const del = async (hash) => {
  }

  const iterator = async function * ({ amount, reverse } = {}) {
  }

  const merge = async (other) => {
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