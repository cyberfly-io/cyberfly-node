import { buildSchema } from 'graphql';
import { createClient } from 'redis';
import { RedisJSONFilter, RedisStreamFilter, RedisTimeSeriesFilter } from './filters.js';
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

type TimeSeries {
timestamp: String!
value: Float!
}

"""
Input type for aggregation options in time series queries
"""
input AggregationInput {
  """
  Type of aggregation (avg, sum, min, max, range, count, first, last, std.p, std.s, var.p, var.s)
  """
  type: AggregationType!

  """
  Time bucket size in milliseconds for aggregation
  """
  time: Int!
}

"""
Available aggregation types for time series data
"""
enum AggregationType {
  AVG
  SUM
  MIN
  MAX
  RANGE
  COUNT
  FIRST
  LAST
  STD_P
  STD_S
  VAR_P
  VAR_S
  TWA
}

"""
Input type for label-based filtering
"""
input FilterByLabelsInput {
  """
  Key-value pairs for filtering time series data
  """
  labels: [LabelInput!]
}

"""
Input type for individual label key-value pairs
"""
input LabelInput {
  """
  Label key
  """
  key: String!

  """
  Label value
  """
  value: String!
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

input TimeSeriesOptions {
 aggregation: AggregationInput
 filterByLabels: FilterByLabelsInput
 count: Int
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

  readTimeSeries(
  dbaddr: String!,
  fromTimestamp: String,
  toTimestamp: String,
  options: TimeSeriesOptions
  ):[TimeSeries]
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
    },
    readTimeSeries : async(params)=>{
     const timeSeriesFilter = new RedisTimeSeriesFilter(redis)
     const result = await timeSeriesFilter.query(params.dbaddr, params.fromTimestamp, params.toTimestamp, params.options)
     return result
    }
  };