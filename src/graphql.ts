import { buildSchema } from 'graphql';
import { createClient } from 'redis';
import CyberflyAccessController from './cyberfly-access-controller.js'
import { RedisJSONFilter, RedisSortedSetFilter, RedisStreamFilter, RedisTimeSeriesFilter, RedisGeospatialFilter } from './filters.js';
import { updateData, nodeConfig, discovered, entryStorage } from './custom-entry-storage.js';
import { removeDuplicateConnections, extractFields, getDevice, verify } from './config/utils.js';
import si from 'systeminformation'
import { VERSION } from './version.js';
import { isPrivate } from '@libp2p/utils/multiaddr/is-private'
import CyberflyChatAccessController from './cyberfly-chat-access-control.js';
import { useAccessController  } from '@orbitdb/core'
import { listDirectories } from './utils.js';

const redis_port = 6379
const redis_ip = process.env.REDIS_HOST || '127.0.0.1';
const redis_host = `${redis_ip}:${redis_port}`
let redis =  createClient({url:`redis://${redis_host}`});
const account = process.env.KADENA_ACCOUNT
useAccessController(CyberflyChatAccessController)

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

type GeoSearchResult {
  member: String!
}

type GeoPosition {
  longitude: Float!
  latitude: Float!
}


type Query {
  sysInfo: SystemInfo
  getAllDB: [String!]!
  dbInfo(dbaddr: String!) : DBInfo

  nodeInfo: NodeInfo
    getDevice(deviceId: String!): Device

    getIPLocation(
    ip: String
    ): IPLocation

  readJSONDB(
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

  readChatHistory(
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

  getDistance(
    dbaddr: String!,
    locationLabel: String!,
    member1: String!,
    member2: String!,
    unit: String!
  ): Float

  getPosition(
    dbaddr: String!,
    locationLabel: String!,
    member: String!
  ): [GeoPosition]

  getGeoHash(
    dbaddr: String!,
    locationLabel: String!,
    member: String!
  ): [String]

  geoSearch(
    dbaddr: String!
    locationLabel: String!
    longitude: Float!
    latitude: Float!
    radius: Float!
    unit: String!
  ): [GeoSearchResult]

    geoSearchWith(
    dbaddr: String!
    locationLabel: String!
    member: String!
    radius: Float!
    unit: String!
  ): [GeoSearchResult]
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

input CreateChatDatabaseInput {
  stream: String!
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
  createChatDatabase(input: CreateChatDatabaseInput!): CreateDatabaseResult!
  updateData(input: UpdateDataInput!): UpdateDataResponse!
}
  `);

const orbitdb = nodeConfig.orbitdb
const libp2p = orbitdb.ipfs.libp2p
export const resolvers = {
  dbInfo: async (params: any) => {
    try {
      const db = await orbitdb.open(params.dbaddr, { entryStorage });
      return { dbaddr: db.address, name: db.name };
    } catch (error) {
      console.error('Error in dbInfo:', error);
      throw new Error('Failed to fetch database info');
    }
  },
  getAllDB: async () => {
    try {
      const dbaddrs = await listDirectories('./data/orbitdb');
      return dbaddrs;
    } catch (error) {
      console.error('Error in getAllDB:', error);
      throw new Error('Failed to fetch items');
    }
  },
  readJSONDB: async (params: any) => {
    try {
      const db = await orbitdb.open(params.dbaddr, { entryStorage });
      const filters = new RedisJSONFilter(redis);
      return filters.filterAcrossKeys(`${params.dbaddr}:*`, ".", params.filters, params.options);
    } catch (error) {
      console.error('Error in readJSONDB:', error);
      throw new Error('Failed to fetch items');
    }
  },
  readStream: async (params: any) => {
    try {
      const db = await orbitdb.open(params.dbaddr, { entryStorage });
      const streamFilters = new RedisStreamFilter(redis);
      const result = await streamFilters.getEntries(params.dbaddr, params.streamName, params.from, params.to);
      return result;
    } catch (error) {
      console.error('Error in readStream:', error);
      throw new Error('Failed to fetch streams');
    }
  },
  readChatHistory: async (params: any) => {
    try {
      const db = await orbitdb.open(`cyberfly-chat-${params.streamName}`, { type: "documents", AccessController: CyberflyChatAccessController(), entryStorage });
      console.log(db.address);
      const streamFilters = new RedisStreamFilter(redis);
      const result = await streamFilters.getEntries(db.address, params.streamName, params.from, params.to);
      return result;
    } catch (error) {
      console.error('Error in readChatHistory:', error);
      throw new Error('Failed to fetch chat history');
    }
  },
  readSortedSet: async (params: any) => {
    try {
      const db = await orbitdb.open(params.dbaddr, { entryStorage });
      const sortedSetFilters = new RedisSortedSetFilter(redis);
      const result = await sortedSetFilters.getEntries(params.dbaddr, params.min, params.max);
      return result;
    } catch (error) {
      console.error('Error in readSortedSet:', error);
      throw new Error('Failed to fetch sorted set');
    }
  },
  readLastNStreams: async (params: any) => {
    try {
      const db = await orbitdb.open(params.dbaddr, { entryStorage });
      const streamFilters = new RedisStreamFilter(redis);
      const result = await streamFilters.getLastNEntries(params.dbaddr, params.streamName, params.count);
      return result;
    } catch (error) {
      console.error('Error in readLastNStreams:', error);
      throw new Error('Failed to fetch last N streams');
    }
  },
  readTimeSeries: async (params: any) => {
    try {
      const db = await orbitdb.open(params.dbaddr, { entryStorage });
      const timeSeriesFilter = new RedisTimeSeriesFilter(redis);
      const result = await timeSeriesFilter.query(params.dbaddr, params.fromTimestamp, params.toTimestamp, params.options);
      return result;
    } catch (error) {
      console.error('Error in readTimeSeries:', error);
      throw new Error('Failed to fetch time series');
    }
  },
  getDistance: async (params: any) => {
    try {
      const { dbaddr, locationLabel, member1, member2, unit } = params;
      if (!dbaddr || !locationLabel || !member1 || !member2 || !unit) {
        throw new Error('Missing required parameters');
      }
      const db = await orbitdb.open(dbaddr, { entryStorage });
      const geoFilters = new RedisGeospatialFilter(redis);
      const result = await geoFilters.getDistance(dbaddr, locationLabel, member1, member2, unit);
      return result;
    } catch (error) {
      console.error('Error in getDistance:', error);
      throw new Error('Failed to fetch distance');
    }
  },
  getPosition: async (params: any) => {
    try {
      const { dbaddr, locationLabel, member } = params;
      if (!dbaddr || !locationLabel || !member) {
        throw new Error('Missing required parameters');
      }
      const db = await orbitdb.open(dbaddr, { entryStorage });
      const geoFilters = new RedisGeospatialFilter(redis);
      const result = await geoFilters.getPosition(dbaddr, locationLabel, member);
      return result.map((pos: any) => ({
        longitude: parseFloat(pos.longitude),
        latitude: parseFloat(pos.latitude)
      }));
    } catch (error) {
      console.error('Error in getPosition:', error);
      throw new Error('Failed to fetch position');
    }
  },
  getGeoHash: async (params: any) => {
    try {
      const { dbaddr, locationLabel, member } = params;
      if (!dbaddr || !locationLabel || !member) {
        throw new Error('Missing required parameters');
      }
      const db = await orbitdb.open(dbaddr, { entryStorage });
      const geoFilters = new RedisGeospatialFilter(redis);
      const result = await geoFilters.getGeoHash(dbaddr, locationLabel, member);
      return result;
    } catch (error) {
      console.error('Error in getGeoHash:', error);
      throw new Error('Failed to fetch geohash');
    }
  },
  geoSearch: async (params: any) => {
    try {
      const { dbaddr, locationLabel, longitude, latitude, radius, unit } = params;
      if (!dbaddr || !locationLabel || longitude === undefined || latitude === undefined || radius === undefined || !unit) {
        throw new Error('Missing required parameters');
      }
      const validUnits = ['m', 'km', 'mi', 'ft'];
      if (!validUnits.includes(unit)) {
        throw new Error('Invalid unit. Must be one of: m, km, mi, ft');
      }
      const db = await orbitdb.open(dbaddr, { entryStorage });
      const geoFilters = new RedisGeospatialFilter(redis);
      const results = await geoFilters.geoSearch(dbaddr, locationLabel, longitude, latitude, radius, unit);
      return results.map((member: string) => ({ member }));
    } catch (error) {
      console.error('Error in geoSearch:', error);
      throw new Error('Failed to perform geo search');
    }
  },
  geoSearchWith: async (params: any) => {
    try {
      const { dbaddr, locationLabel, member, radius, unit } = params;
      if (!dbaddr || !locationLabel || !member || radius === undefined || !unit) {
        throw new Error('Missing required parameters');
      }
      const validUnits = ['m', 'km', 'mi', 'ft'];
      if (!validUnits.includes(unit)) {
        throw new Error('Invalid unit. Must be one of: m, km, mi, ft');
      }
      const db = await orbitdb.open(dbaddr, { entryStorage });
      const geoFilters = new RedisGeospatialFilter(redis);
      const results = await geoFilters.geoSearchWith(dbaddr, locationLabel, member, radius, unit);
      return results.map((member: string) => ({ member }));
    } catch (error) {
      console.error('Error in geoSearchWith:', error);
      throw new Error('Failed to perform geo search');
    }
  },
  nodeInfo: async () => {
    try {
      const peerId = libp2p.peerId;
      const peers = libp2p.getPeers();
      const conn = libp2p.getConnections();
      let maddr;
      libp2p.getMultiaddrs().forEach((addr: any) => {
        if (!isPrivate(addr) && addr.toString().includes('31001')) {
          console.log(addr.toString());
          maddr = addr.toString();
        }
      });
      let con = conn.filter(obj => obj.status === "open");
      const filteredConn = removeDuplicateConnections(con);
      const info = {
        peerId: peerId,
        health: "ok",
        version: VERSION,
        multiAddr: maddr,
        publicKey: nodeConfig.kadenaPub,
        discovered: discovered.length,
        connected: filteredConn.length,
        peers: peers,
        account: account,
        connections: extractFields(filteredConn, 'remotePeer', 'remoteAddr')
      };
      return info;
    } catch (error) {
      console.error('Error in nodeInfo:', error);
      throw new Error('Failed to fetch node info');
    }
  },
  getIPLocation: async (input: any) => {
    try {
      if (input.ip) {
        const loc = await fetch(`http://ip-api.com/json/${input.ip}`);
        return await loc.json();
      } else {
        const loc = await fetch(`http://ip-api.com/json/`);
        return await loc.json();
      }
    } catch (error) {
      console.error('Error in getIPLocation:', error);
      return { info: "Something went wrong" };
    }
  },
  getDevice: async (input: any) => {
    try {
      const data = await getDevice(input.deviceId);
      const result: any = data.result;
      return result;
    } catch (error) {
      console.error('Error in getDevice:', error);
      throw new Error('Failed to fetch device');
    }
  },
  sysInfo: async () => {
    try {
      const cpu = await si.cpu();
      const os = await si.osInfo();
      const memory = await si.mem();
      const storage = await si.diskLayout();
      return {
        cpu,
        memory,
        os,
        storage,
      };
    } catch (error) {
      console.error('Error in sysInfo:', error);
      throw new Error('Failed to fetch system info');
    }
  },
  createDatabase: async ({ input }) => {
    try {
      const { dbinfo, sig, pubkey } = input;
      if (!dbinfo) {
        return { __typename: 'ErrorResponse', info: 'dbinfo is required' };
      }
      if (verify(dbinfo, sig, pubkey)) {
        if (!dbinfo.name) {
          return { __typename: 'ErrorResponse', info: 'name is required' };
        }
        const db = await orbitdb.open(`${dbinfo.name}-${pubkey}`, { type: "documents", AccessController: CyberflyAccessController(), entryStorage });
        return { __typename: 'DatabaseAddress', dbaddr: db.address };
      } else {
        return { __typename: 'ErrorResponse', info: 'Verification failed' };
      }
    } catch (e) {
      console.error('Error in createDatabase:', e);
      return { __typename: 'ErrorResponse', info: 'Something went wrong' };
    }
  },
  createChatDatabase: async ({ input }) => {
    try {
      const { stream } = input;
      if (!stream) {
        return { __typename: 'ErrorResponse', info: 'stream is required' };
      }
      const db = await orbitdb.open(`cyberfly-chat-${stream}`, { type: "documents", AccessController: CyberflyChatAccessController(), entryStorage });
      return { __typename: 'DatabaseAddress', dbaddr: db.address };
    } catch (e) {
      console.error('Error in createChatDatabase:', e);
      return { __typename: 'ErrorResponse', info: 'Something went wrong' };
    }
  },
  updateData: async ({ input }) => {
    try {
      const {
        dbaddr,
        dbtype = 'documents',
        data,
        objectType,
        sig,
        publicKey,
        _id
      } = input;
      switch (objectType) {
        case 'stream':
          if (!data.streamName) {
            throw new Error("streamName in data is required");
          }
          break;
        case 'geo':
          const requiredGeoFields = ["latitude", "longitude", "member", "locationLabel"];
          const hasAllGeoFields = requiredGeoFields.every(field =>
            field in data
          );
          if (!hasAllGeoFields) {
            throw new Error("data should contains longitude, latitude, member, locationLabel");
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
    } catch (error) {
      console.error('Error in updateData:', error);
      throw new Error('Failed to update data');
    }
  }
};