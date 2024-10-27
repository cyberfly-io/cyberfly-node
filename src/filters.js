export class RedisJSONFilter {
    constructor(redisClient) {
      this.redis = redisClient;
    }
  
  
  
    /**
     * Filter JSON data across multiple keys using pattern
     * @param {string} pattern - Redis key pattern (e.g., "user:*")
     * @param {string} path - JSONPath expression
     * @param {Object} conditions - Filter conditions
     * @param {Object} options - Additional options (pagination, sorting)
     */
    async filterAcrossKeys(pattern, path, conditions, options = {}) {
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
                ? parsed.map(item => ({ ...item, _key: key }))
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
    buildFilterExpression(conditions) {
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
    getOperator(op) {
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

  export async function exampleFilters(redis) {
    const filter = new RedisJSONFilter(redis);
  
    // Filter across keys with pagination and sorting
    const results = await filter.filterAcrossKeys(
      '/orbitdb/zdpuAsf7awdQSZueHatVJMWM46tSQrW8c8CinMFfFH59qg41H:*',           // key pattern
      '.',               // JSON path
      {                  // conditions
        "temperature": { gt: 19 }
      },
      {                  // options
        //limit: 1,
        offset: 0,
        sortOrder: 'desc'
      }
    );
  
  
    console.log('Filtered Results:', results);
  }

export class RedisStreamFilter {
    constructor(redisClient) {
      this.redis = redisClient;
    }

    async getEntries(dbaddr, streamName, from='-', to='+') {
        return await this.redis.xRange(`${dbaddr}:${streamName}`, from, to);
      }

      async getLastNEntries(dbaddr, streamName, count) {
        // Get the last N entries
        return await this.redis.xRevRange(`${dbaddr}:${streamName}`, '+', '-', {
          COUNT: count
        });
      }

}
