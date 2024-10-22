import { buildSchema } from 'graphql';


export const schema = buildSchema(`
    type Query {
      getAll(dbaddr: string!): [JSON]
    }
    scalar JSON
  `);


  export const resolvers = {
    getAll: async (dbaddr) => {
      try {
        const keys = await redis.keys(`orbitdb:${dbaddr}`);
        const items = await Promise.all(
          keys.map(async (key) => {
            const value = await redis.json_get(key);
            if (value) {
              return { id: key, ...value };
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