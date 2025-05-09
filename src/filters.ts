export class RedisJSONFilter {
  redis:any
    constructor(redisClient:any) {
      this.redis = redisClient;
    }
  
  
  
    /**
     * Filter JSON data across multiple keys using pattern
     * @param {string} pattern - Redis key pattern (e.g., "user:*")
     * @param {string} path - JSONPath expression
     * @param {Object} conditions - Filter conditions
     * @param {Object} options - Additional options (pagination, sorting)
     */
    async filterAcrossKeys(pattern:any, path:any, conditions:any, options:any = {}) {
      try {
        // Get all keys matching the pattern
        const keys = await this.redis.keys(pattern);
        if (!keys.length) {
          return [];
        }
  
        // Set default options
        const {
          limit = Infinity,
          offset = 0,
          sortBy,
          sortOrder = 'asc'
        } = options;
  
        // Build filter expression
        const jsonPath = path || '.';
        const filterExpr = this.buildFilterExpression(conditions);
        const fullPath = filterExpr ? `${jsonPath}[?(${filterExpr})]` : jsonPath;
        // Fetch and filter data from all matching keys
        const results = await Promise.all(
          keys.map(async (key) => {
            try {
              const data = await this.redis.json.get(key, {path:[fullPath]});
              if (!data) return null;
              const full_data = await this.redis.json.get(key)
              return Array.isArray(full_data) 
                ? full_data.map(item => ({ ...item, _key: key }))
                : full_data;
            } catch (error) {
              //console.error(`Error processing key ${key}:`, error);
              return null;
            }
          })
        );
  
        // Flatten and filter out null results
        let flatResults = results
          .filter(result => result !== null)
          .flat()
          .filter(item => item !== null);
  
        // Apply sorting if specified
        if (sortBy) {
          flatResults.sort((a, b) => {
            const aVal = a[sortBy];
            const bVal = b[sortBy];
            
            if (typeof aVal === 'string') {
              return sortOrder === 'asc' 
                ? aVal.localeCompare(bVal)
                : bVal.localeCompare(aVal);
            }
            
            return sortOrder === 'asc' 
              ? aVal - bVal 
              : bVal - aVal;
          });
        }
  
        // Apply pagination
        return flatResults.slice(offset, offset + limit)
      } catch (error) {
        console.error('Error filtering across keys:', error);
        throw error;
      }
    }
  
  
    /**
     * Build filter expression from conditions
     * @param {Object} conditions - Filter conditions
     * @returns {string} RedisJSON filter expression
     */
    buildFilterExpression(conditions:any) {
      if (!conditions || Object.keys(conditions).length === 0) {
        return '';
      }
  
      const expressions = [];
      for (const [field, value] of Object.entries(conditions)) {
        if (typeof value === 'string') {
          expressions.push(`@.${field} == "${value}"`);
        } else if (typeof value === 'number') {
          expressions.push(`@.${field} == ${value}`);
        } else if (typeof value === 'object') {
          // Handle comparison operators
          for (const [op, val] of Object.entries(value)) {
            const operator = this.getOperator(op);
            expressions.push(`@.${field} ${operator} ${val}`);
          }
        }
      }
  
      return expressions.join(' && ');
    }
  
    /**
     * Convert comparison operators to RedisJSON syntax
     * @param {string} op - Operator
     * @returns {string} RedisJSON operator
     */
    getOperator(op:any) {
      const operators = {
        eq: '==',
        gt: '>',
        gte: '>=',
        lt: '<',
        lte: '<=',
        ne: '!='
      };
      return operators[op] || '==';
    }
  }

 

export class RedisStreamFilter {
  redis:any
    constructor(redisClient:any) {
      this.redis = redisClient;
    }

    async getEntries(dbaddr:string, streamName:string, from='-', to='+') {
        return await this.redis.xRange(`${dbaddr}:${streamName}`, from, to);
      }

      async getLastNEntries(dbaddr:string, streamName:string, count:number) {
        // Get the last N entries
        return await this.redis.xRevRange(`${dbaddr}:${streamName}`, '+', '-', {
          COUNT: count
        });
      }

}


export class RedisSortedSetFilter {
  redis:any
    constructor(redisClient:any) {
      this.redis = redisClient;
    }

    async getEntries(dbaddr:string, min=0, max=-1) {
        const entries =  await this.redis.zRangeWithScores(dbaddr.split("/")[2], min, max);
        return entries.map(({ score, value }) => {
          try {
            const parsed = JSON.parse(value);
            return {
              message: parsed,  // parsed message
              timestamp: score  // score is the timestamp we stored
            };
          } catch (parseError) {
            console.error('Failed to parse message:', parseError);
            return {
              message: value,  // fallback to raw value
              timestamp: score,
              error: 'Parse failed'
            };
          }
        });
      }

}

export class RedisTimeSeriesFilter {
  redis:any
    constructor(redisClient:any) {
      this.redis = redisClient;
    }

    async query(dbaddr:string, fromTimestamp="-", toTimestamp="+", options:any = {}) {
        const {
            aggregation = '',
            filterByLabels = {},
            count = ''
        } = options;

        const queryOptions:any = {};

        // Add aggregation if specified
        if (aggregation) {
            queryOptions.AGGREGATION = {
                type: aggregation.type,
                timeBucket: aggregation.time
            };
        }


        // Add count if specified
        if (count) {
            queryOptions.COUNT = count;
        }

        // Add filters if specified
        if (Object.keys(filterByLabels).length > 0) {
            queryOptions.FILTER_BY_TS = filterByLabels;
        }
        const result = await this.redis.ts.range(dbaddr.split("/")[2], fromTimestamp, toTimestamp, queryOptions);
        return result.map(({ timestamp, value }) => ({
            timestamp: Number(timestamp),
            value: Number(value)
        }));
    }


}

export class RedisGeospatialFilter {
  redis: any;
  
  constructor(redisClient: any) {
    this.redis = redisClient;
  }

  /**
   * Get the distance between two members
   * @param {string} key - Redis key
   * @param {string} member1 - First member
   * @param {string} member2 - Second member
   * @param {string} unit - Unit of measurement (m, km, mi, ft)
   */
  async getDistance(dbaddr: string,key: string, member1: string, member2: string, unit: string) {
    return await this.redis.geoDist(`${dbaddr}:${key}`, member1, member2, unit);
  }

  /**
   * Get the geospatial position of a member
   * @param {string} key - Redis key
   * @param {string} member - Member name
   */
  async getPosition(dbaddr: string,key: string, member: string) {
    const result = await this.redis.geoPos(`${dbaddr}:${key}`, member);
    return result
  }

  /**
   * Get the geohash of a member
   * @param {string} key - Redis key
   * @param {string} member - Member name
   */
  async getGeoHash(dbaddr: string,key: string, member: string) {
    return await this.redis.geoHash(`${dbaddr}:${key}`, member);
  }

  async geoSearch(dbaddr:string,key:string, longitude:any, latitude:any, radius:number, unit:string ){
  return await this.redis.geoSearch(`${dbaddr}:${key}`,
    {
      longitude: longitude,
      latitude: latitude,
    },
    { radius: radius,
      unit: unit,
    }
  )
  }


  async geoSearchWith(dbaddr:string,key:string, member:string, radius:number, unit:string ){
    const result = await this.redis.geoSearch(`${dbaddr}:${key}`,member,
      { radius: radius,
        unit: unit,
      }
    )
    return result
    }
}
