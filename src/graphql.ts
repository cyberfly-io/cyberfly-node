import { buildSchema } from 'graphql';
import { createClient } from 'redis';
import CyberflyAccessController from './cyberfly-access-controller.js'
import { RedisJSONFilter, RedisSortedSetFilter, RedisStreamFilter, RedisTimeSeriesFilter } from './filters.js';
import { updateData, nodeConfig, discovered, entryStorage } from './custom-entry-storage.js';
import { removeDuplicateConnections, extractFields, getDevice, verify } from './config/utils.js';
import si from 'systeminformation'

const redis_port = 6379
const redis_ip = process.env.REDIS_HOST || '127.0.0.1';
const redis_host = `${redis_ip}:${redis_port}`
let redis =  createClient({url:`redis://${redis_host}`});
const account = process.env.KADENA_ACCOUNT

redis.connect();
export const schema = buildSchema(`
 scalar JSON
 scalar Timestamp


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

type NodeInfo {
peerId: String!
health: String!
version: String!
multiAddr: String!
publicKey: String!
discovered: Int!
connected: Int!
peers: JSON
account: String!
connections: JSON
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

type IPLocation {
  status: String
  country: String
  countryCode: String
  region: String
  regionName: String
  city: String
  zip: String
  lat: Float
  lon: Float
  timezone: String
  isp: String
  org: String
  as: String
  query: String
}



type Device {
  status: String
  device_id: ID
  guard: JSON
  name: String
}

type CPU {
    manufacturer: String
    brand: String
    speed: Float
    cores: Int
  }

  type OS {
    platform: String
    distro: String
    release: String
    codename: String
    arch: String
  }

  type Disk {
    device: String
    type: String
    name: String
    vendor: String
    size: Float
  }

  type Memory {
    total: Float
    free: Float
    used: Float
    active: Float
    available: Float
  }

  type SystemInfo {
    cpu: CPU
    memory: Memory
    os: OS
    storage: [Disk]
  }

  type DBInfo {
  dbaddr: String!
  name: String!
  }

  type SortedSet {
  timestamp: Timestamp!
  message: JSON!
  }

type Query {
  sysInfo: SystemInfo
  dbInfo(dbaddr: String!) : DBInfo

  nodeInfo: NodeInfo
    getDevice(deviceId: String!): Device

    getIPLocation(
    ip: String
    ): IPLocation


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

  readSortedSet(
  dbaddr: String!,
  min: Timestamp,
  max: Timestamp):[SortedSet]

  readTimeSeries(
  dbaddr: String!,
  fromTimestamp: String,
  toTimestamp: String,
  options: TimeSeriesOptions
  ):[TimeSeries]
}
  # Types for the schema
type DatabaseAddress {
  dbaddr: String!
}

type ErrorResponse {
  info: String!
}

# Union type to handle both success and error responses
union CreateDatabaseResult = DatabaseAddress | ErrorResponse

# Input type for database creation
input DatabaseInfo {
  name: String!
}



input CreateDatabaseInput {
  dbinfo: DatabaseInfo!
  sig: String!
  pubkey: String!
}

 enum ObjectType {
    stream
    geo
    ts
    json
  }
  

    input UpdateDataInput {
    dbaddr: String!
    data: JSON!
    objectType: ObjectType!
    sig: String!
    publicKey: String!
    _id: ID
  }

    type UpdateDataResponse {
    info: String!
    dbaddr: String
  }

type Mutation {
  createDatabase(input: CreateDatabaseInput!): CreateDatabaseResult!
  updateData(input: UpdateDataInput!): UpdateDataResponse!
}
  `);


const orbitdb = nodeConfig.orbitdb
const libp2p = orbitdb.ipfs.libp2p
export const resolvers = {
  dbInfo: async(params:any)=>{
    const db = await orbitdb.open(params.dbaddr)
  return {dbaddr:db.address, name:db.name};
  }
  ,
  readDB: async (params:any) => {
    try {
      await orbitdb.open(params.dbaddr) //ensure db is open and sync
      const filters = new RedisJSONFilter(redis)
      return filters.filterAcrossKeys(`${params.dbaddr}:*`, ".", params.filters, params.options)
    } catch (error) {
      console.error('Error fetching all items:', error);
      throw new Error('Failed to fetch items');
    }
  },
  readStream: async (params:any)=>{
    try{
    await orbitdb.open(params.dbaddr) 
    const streamFilters = new RedisStreamFilter(redis)
    const result = await streamFilters.getEntries(params.dbaddr, params.streamName, params.from, params.to)
    return result
    }
    catch(e){
      console.error("Error fetching stream" ,e)
      throw new Error('Failed to fetch streams');

    }
  },
  readSortedSet: async (params:any)=>{
    try{
    await orbitdb.open(params.dbaddr) 
    const sortedSetFilters = new RedisSortedSetFilter(redis)
    const result = await sortedSetFilters.getEntries(params.dbaddr, params.min, params.max)
    return result
    }
    catch(e){
      console.error("Error fetching sorted set" ,e)
      throw new Error('Failed to fetch sorted set');

    }
  },
  readLastNStreams: async (params:any)=>{

    await orbitdb.open(params.dbaddr) 
    const streamFilters = new RedisStreamFilter(redis)
    const result = await streamFilters.getLastNEntries(params.dbaddr, params.streamName,params.count)
    return result
  },
  readTimeSeries : async(params:any)=>{
   await orbitdb.open(params.dbaddr) 
   const timeSeriesFilter = new RedisTimeSeriesFilter(redis)
   const result = await timeSeriesFilter.query(params.dbaddr, params.fromTimestamp, params.toTimestamp, params.options)
   return result
  },
  nodeInfo: async ()=>{
    const peerId = libp2p.peerId
    const peers = libp2p.getPeers()
  
    const conn = libp2p.getConnections()
    let con = conn.filter(obj => obj.status==="open")
    const filteredConn = removeDuplicateConnections(con);
    const info = {peerId:peerId, health:"ok", version:"0.2.1", 
    multiAddr:libp2p.getMultiaddrs()[0].toString(), 
    publicKey:nodeConfig.kadenaPub,discovered:discovered.length, 
    connected:filteredConn.length, peers:peers, account:account, 
    connections:extractFields(filteredConn, 'remotePeer', 'remoteAddr')
  }
  return info
  },
  getIPLocation: async (input:any)=>{
    try{
      if(input.ip){
        const loc = await fetch(`http://ip-api.com/json/${input.ip}`)
      return await loc.json()
      }
      else{
        const loc = await fetch(`http://ip-api.com/json/`)
        return await loc.json()
      }
    }
    catch{
    return {info:"Something went wrong"}
    }
  },
  getDevice: async (input:any)=>{
    const data = await getDevice(input.deviceId)
    const result:any = data.result
    return result
  },
  sysInfo: async () => {
    const cpu = await si.cpu();
    const os = await si.osInfo();
    const memory = await si.mem();
    const disk = await si.diskLayout();

    return {
      cpu,
      memory,
      os,
      storage: disk,
    };
  } 
  ,
  createDatabase: async ({input}) => {
    const { dbinfo, sig, pubkey } = input;

    if (!dbinfo) {
      return { __typename: 'ErrorResponse', info: 'dbinfo is required' };
    }

    try {
      if (verify(dbinfo, sig, pubkey)) {
        if (!dbinfo.name) {
          return { __typename: 'ErrorResponse', info: 'name is required' };
        }

        const db = await orbitdb.open(`${dbinfo.name}-${pubkey}`, {type:"documents", AccessController:CyberflyAccessController(), entryStorage})
        return { __typename: 'DatabaseAddress', dbaddr: db.address };
      } else {
        return { __typename: 'ErrorResponse', info: 'Verification failed' };
      }
    } catch (e) {
      console.log(e)
      return { __typename: 'ErrorResponse', info: 'Something went wrong' };
    }
  },
  updateData: async ({ input }) => {
    const {
      dbaddr,
      dbtype = 'documents',
      data,
      objectType,
      sig,
      publicKey,
      _id
    } = input;

    // Object type specific validations
    switch (objectType) {
      case 'stream':
        if (!data.streamName) {
          throw new Error("streamName in data is required");
        }
        break;

      case 'geo':
        const requiredGeoFields = ["latitude", "longitude", "member"];
        const hasAllGeoFields = requiredGeoFields.every(field => 
          field in data
        );
        if (!hasAllGeoFields) {
          throw new Error("data should contains longitude, latitude, member");
        }
        break;

      case 'ts':
        if (!('value' in data)) {
          throw new Error("data should contains value");
        }
        if (!data.labels) {
          throw new Error("data should contains labels");
        }
        break;
    }

    const timestamp = Date.now();
    
    // Call the existing updateData function
    const updatedDbaddr = await updateData(
      dbaddr,
      objectType,
      data,
      sig,
      publicKey,
      timestamp,
      dbtype,
      _id
    );

    return {
      info: "success",
      dbaddr: updatedDbaddr
    };
  }
  };