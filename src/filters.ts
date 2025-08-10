export class RedisJSONFilter {
  redis:any
    constructor(redisClient:any) {
      this.redis = redisClient;
    }

    /**
     * Filter JSON data across multiple keys using pattern (non-blocking SCAN)
     * Applies optional sort + pagination after collecting results.
     */
    async filterAcrossKeys(pattern:string, path:string, conditions:any, options:any = {}) {
      try {
        const {
          limit = Infinity,
          offset = 0,
          sortBy,
          sortOrder = 'asc'
        } = options;

        const jsonPath = path || '.';
        const filterExpr = this.buildFilterExpression(conditions);
        const fullPath = filterExpr ? `${jsonPath}[?(${filterExpr})]` : jsonPath;

        // Collect keys using SCAN (non-blocking)
        const keys:string[] = [];
        for await (const key of this.redis.scanIterator({ MATCH: pattern, COUNT: 500 })) {
          keys.push(key as string);
        }
        if (!keys.length) return [];

        // Process in batches to limit memory usage
        const BATCH = 200;
        const collected:any[] = [];
        for (let i = 0; i < keys.length; i += BATCH) {
          const batch = keys.slice(i, i + BATCH);

          // First, run server-side JSONPath filter to check match presence
          const filtered = await Promise.all(
            batch.map(k => this.redis.json.get(k, { path: [fullPath] }).catch(() => null))
          );

          // Keys that matched (non-null and non-empty result)
          const matchedKeys:string[] = [];
          filtered.forEach((val, idx) => {
            if (val === null || val === undefined) return;
            // JSON.GET with a path returns either a value or an array of values
            const hasMatch =
              (Array.isArray(val) && val.length > 0) ||
              (!Array.isArray(val) && val !== null);
            if (hasMatch) matchedKeys.push(batch[idx]);
          });

          if (!matchedKeys.length) continue;

          // Fetch full docs only for matched keys
          const fullDocs = await Promise.all(
            matchedKeys.map(k => this.redis.json.get(k).then(d => ({ d, k })).catch(() => null))
          );

          for (const item of fullDocs) {
            if (!item || item.d === null || item.d === undefined) continue;
            const { d, k } = item;
            if (Array.isArray(d)) {
              for (const el of d) collected.push({ ...el, _key: k });
            } else if (typeof d === 'object') {
              collected.push({ ...d, _key: k });
            } else {
              // Non-object JSON value
              collected.push({ value: d, _key: k });
            }
          }

          // Early stop if not sorting and we have enough items past offset
          if (!sortBy && collected.length >= offset + limit) break;
        }

        // Sort if required
        if (sortBy) {
          const dir = sortOrder === 'desc' ? -1 : 1;
          collected.sort((a, b) => {
            const av = a?.[sortBy];
            const bv = b?.[sortBy];
            if (av == null && bv == null) return 0;
            if (av == null) return 1;
            if (bv == null) return -1;
            if (typeof av === 'string' && typeof bv === 'string') {
              return dir * av.localeCompare(bv);
            }
            const na = Number(av), nb = Number(bv);
            if (Number.isFinite(na) && Number.isFinite(nb)) {
              return dir * (na - nb);
            }
            return dir * String(av).localeCompare(String(bv));
          });
        }

        return collected.slice(offset, offset + limit);
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
        // Support correct TS.RANGE options; ignore unknown label filters
        const {
            aggregation,
            count,
            filterByTs,       // number[] of specific timestamps
            filterByValue     // { min: number, max: number }
        } = options || {};

        const queryOptions:any = {};

        if (aggregation?.type && aggregation?.time) {
            queryOptions.AGGREGATION = {
                type: aggregation.type,
                timeBucket: aggregation.time
            };
        }

        if (typeof count === 'number' && count > 0) {
            queryOptions.COUNT = count;
        }

        if (Array.isArray(filterByTs) && filterByTs.length > 0) {
            queryOptions.FILTER_BY_TS = filterByTs;
        }

        if (filterByValue && Number.isFinite(filterByValue.min) && Number.isFinite(filterByValue.max)) {
            queryOptions.FILTER_BY_VALUE = {
              min: filterByValue.min,
              max: filterByValue.max
            };
        }

        const key = dbaddr.split("/")[2];
        const result = await this.redis.ts.range(key, fromTimestamp, toTimestamp, queryOptions);
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

  async geoSearch(dbaddr:string, key:string, longitude:number, latitude:number, radius:number, unit:string ){
    // Keep simple member-only search; callers can use geoSearchWith for coords/dist
    return await this.redis.geoSearch(`${dbaddr}:${key}`,
      { longitude, latitude },
      { radius, unit }
    );
  }

  async geoSearchWith(dbaddr:string, key:string, memberOrLngLat: string | { longitude:number, latitude:number }, radius:number, unit:string ){
    // Use Redis GEOSEARCH WITHCOORD to get coordinates efficiently
    // Accept FROMMEMBER (string) or FROMLONLAT ({longitude, latitude})
    const results = await this.redis.geoSearchWith(
      `${dbaddr}:${key}`,
      memberOrLngLat,
      { radius, unit },
      ['WITHCOORD'] // add 'WITHDIST' or 'WITHHASH' if needed
    );

    // Normalize to a clean shape
    // node-redis returns: [{ member, coordinates: { longitude, latitude }, ... }]
    return results.map((r:any) => ({
      member: r.member,
      coordinates: r.coordinates ? {
        longitude: Number(r.coordinates.longitude),
        latitude: Number(r.coordinates.latitude)
      } : undefined
    }));
  }
}
