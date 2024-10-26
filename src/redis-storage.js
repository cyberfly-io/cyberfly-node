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
    const decoded = await Entry.decode(data)
    delete decoded['hash']
    delete decoded['bytes']
    if(typeof decoded.payload.value.objectType === "stream"){

    }
    else {
      await redis.json.set(`${decoded.id}:${hash}`, '$',decoded.payload.value);
    }
  }

  const get = async (hash) => {
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