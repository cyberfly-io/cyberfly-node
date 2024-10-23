import { buildSchema } from 'graphql';
import Redis from 'ioredis-rejson'

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
    type Query {
      readDB(dbaddr: String!): [Data]
    }
  `);


export const resolvers = {
    readDB: async (dbaddr) => {
      try {
        const keys = await redis.keys(`${dbaddr.dbaddr}:*`);
        const items = await Promise.all(
          keys.map(async (key) => {
            
            const value = await redis.json_get(key);
            if (value) {
              return { ...value };
            }
            return null;
          })
        );
        return items.filter(item => item !== null);
      } catch (error) {
        console.error('Error fetching all items:', error);
        throw new Error('Failed to fetch items');
      }
    }
  };