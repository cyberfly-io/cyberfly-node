import { buildSchema } from 'graphql';
import Redis from 'ioredis-rejson'
import { RedisJSONFilter } from './filters.js';
const redis_port = 6379
const redis_ip = process.env.REDIS_HOST || '127.0.0.1';
const redis_host = `${redis_ip}:${redis_port}`
let redis = new Redis(redis_host);

export const schema = buildSchema(`
 scalar JSON

type Data {
  _id: String!
  sig: String!
  data: JSON!
  publicKey: String!
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
}
  `);


export const resolvers = {
    readDB: async (params) => {
      try {
        const filters = new RedisJSONFilter(redis)
        return filters.filterAcrossKeys(`${params.dbaddr}:*`, ".", params.filters, params.options)
      } catch (error) {
        console.error('Error fetching all items:', error);
        throw new Error('Failed to fetch items');
      }
    }
  };