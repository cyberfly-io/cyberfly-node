import { buildSchema } from 'graphql';
import { createClient } from 'redis';
import { RedisJSONFilter, RedisStreamFilter } from './filters.js';
import { odb } from './db-service.js';
const redis_port = 6379
const redis_ip = process.env.REDIS_HOST || '127.0.0.1';
const redis_host = `${redis_ip}:${redis_port}`
let redis =  createClient({url:`redis://${redis_host}`});
redis.connect();
export const schema = buildSchema(`
 scalar JSON

type Data {
  _id: String!
  sig: String!
  data: JSON!
  publicKey: String!
}

type Message {
id: String!
message: JSON
}

input FilterOptionsInput {
  """
  Maximum number of results to return
  """
  limit: Int

  """
  Number of results to skip
  """
  offset: Int

  """
  Sort order for results: 'asc' or 'desc'
  """
  sortOrder: SortOrder
}

enum SortOrder {
  asc
  desc
}

type Query {
  readDB(
    dbaddr: String!, 
    filters: JSON, 
    options: FilterOptionsInput
  ): [Data]

  readStream(
  dbaddr: String!,
  streamName: String!,
  from: String,
  to: String
  ):[Message]

  readLastNStreams(
  dbaddr: String!,
  streamName: String!,
  count: Int!
  ):[Message]
}
  `);


export const resolvers = {
    readDB: async (params) => {
      try {
        await odb.open(params.dbaddr) //ensure db is open and sync
        const filters = new RedisJSONFilter(redis)
        return filters.filterAcrossKeys(`${params.dbaddr}:*`, ".", params.filters, params.options)
      } catch (error) {
        console.error('Error fetching all items:', error);
        throw new Error('Failed to fetch items');
      }
    },
    readStream: async (params)=>{
      try{
      await odb.open(params.dbaddr) 
      const streamFilters = new RedisStreamFilter(redis)
      const result = await streamFilters.getEntries(params.dbaddr, params.streamName, params.from, params.to)
      return result
      }
      catch(e){
        console.error("Error fetching stream" ,e)
        throw new Error('Failed to fetch streams');

      }
    },
    readLastNStreams: async (params)=>{
      await odb.open(params.dbaddr) 
      const streamFilters = new RedisStreamFilter(redis)
      const result = await streamFilters.getLastNEntries(params.dbaddr, params.streamName,params.count)
      return result
    }
  };