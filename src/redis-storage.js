import Redis from 'ioredis-rejson'
import Entry from '@orbitdb/core/src/oplog/entry.js'

const RedisStorage = async () => {
  let redis = new Redis();
  const prefix = 'orbitdb';
  
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
    let entry = await Entry.decode(data)
    delete entry['hash']
    delete entry['bytes']
    await redis.json_set(`${prefix}:${hash}`, '.',entry,"NX");
  }

  const get = async (hash) => {
    const data = await redis.json_get(`${prefix}:${hash}`, '.');
    const bytes = await Entry.encode(data)
    return data ? bytes : null;
  }

  const del = async (hash) => {
    await redis.del(`${prefix}:${hash}`);
  }

  const iterator = async function * ({ amount, reverse } = {}) {
    const iteratorOptions = { limit: amount || -1, reverse: reverse || false };
    let keys = [];
    let cursor = '0';
    
    do {
      const [nextCursor, batchKeys] = await redis.scan(cursor, 'MATCH', `${prefix}:*`, 'COUNT', 1000);
      cursor = nextCursor;
      keys = keys.concat(batchKeys.map(key => key.split(':').pop()));
      
      if (iteratorOptions.reverse) {
        keys.reverse();
      }
      
      if (iteratorOptions.limit > 0 && keys.length >= iteratorOptions.limit) {
        keys = keys.slice(0, iteratorOptions.limit);
        cursor = '0';  // Stop scanning
      }
      
      for (const key of keys) {
        const value = await get(key);
        yield [key, value];
      }
      
      keys = [];  // Clear processed keys
      
    } while (cursor !== '0' && (iteratorOptions.limit === -1 || keys.length < iteratorOptions.limit));
  }

  const merge = async (other) => {
  }

  const clear = async () => {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', `${prefix}:*`);
      cursor = nextCursor;
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== '0');
  }

  const close = async () => {
   // await redis.quit();
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