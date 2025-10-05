# Bridge Architecture Enhancements

This document describes the comprehensive enhancements made to the MQTT-libp2p-Socket.io bridge architecture in cyberfly-node.

## Overview

The bridge now includes production-grade features for monitoring, reliability, and security:

- **Comprehensive Metrics**: Track message flow, errors, and performance
- **Circuit Breakers**: Automatic failure detection and recovery
- **Structured Logging**: Configurable log levels with timestamps
- **Message Validation**: Size limits, topic filtering, and content sanitization
- **Health Monitoring**: Real-time status endpoints for observability
- **Configurable Behavior**: Environment-based configuration

## Architecture Components

### 1. Configuration System

The bridge is now fully configurable via environment variables:

```bash
# Message handling
BRIDGE_MESSAGE_TTL=5000              # Message hash TTL in ms (default: 5000)
BRIDGE_MAX_MESSAGE_SIZE=1048576      # Max message size in bytes (default: 1MB)

# Bridge control (both ENABLED by default)
# Only set these to explicitly DISABLE a bridge component
# BRIDGE_ENABLE_MQTT=false           # Disable MQTT bridge
# BRIDGE_ENABLE_SOCKET=false         # Disable Socket.io bridge
BRIDGE_MQTT_QOS=0                    # MQTT QoS level: 0, 1, or 2 (default: 0)

# Logging
LOG_LEVEL=info                       # Log level: debug, info, warn, error (default: info)

# Circuit breaker
BRIDGE_CIRCUIT_BREAKER_THRESHOLD=10  # Failures before opening (default: 10)
BRIDGE_CIRCUIT_BREAKER_TIMEOUT=60000 # Recovery timeout in ms (default: 60s)

# Security
BRIDGE_TOPIC_BLACKLIST=admin,system  # Comma-separated topics to block
```

### 2. Metrics System

Real-time metrics tracking for all bridge components:

**Tracked Metrics:**
- Messages received/published/failed per component
- Duplicate messages dropped (loop prevention)
- Error rates and last error information
- Uptime and message rates (msg/sec)
- Circuit breaker states

**Access Metrics:**
```bash
curl http://localhost:31003/api/bridge/metrics
```

**Response Example:**
```json
{
  "mqtt": {
    "messagesReceived": 1523,
    "messagesPublished": 1520,
    "messagesFailed": 3,
    "duplicatesDropped": 45,
    "lastError": null,
    "lastErrorTime": null
  },
  "libp2p": {
    "messagesReceived": 2341,
    "messagesPublished": 2298,
    "messagesFailed": 5,
    "duplicatesDropped": 38,
    "lastError": null,
    "lastErrorTime": null
  },
  "socket": {
    "messagesReceived": 2341,
    "messagesBroadcast": 4682,
    "messagesFailed": 0,
    "lastError": null,
    "lastErrorTime": null
  },
  "startTime": 1696512000000,
  "loopsPrevented": 83,
  "uptime": {
    "ms": 3600000,
    "seconds": 3600,
    "formatted": "1h 0m 0s"
  },
  "rates": {
    "mqtt": {
      "publishRate": "0.42",
      "receiveRate": "0.42",
      "errorRate": "0.20%"
    },
    "libp2p": {
      "publishRate": "0.64",
      "receiveRate": "0.65",
      "errorRate": "0.21%"
    }
  },
  "circuitBreakers": {
    "mqtt": {
      "failures": 0,
      "lastFailureTime": 0,
      "state": "closed"
    },
    "libp2p": {
      "failures": 0,
      "lastFailureTime": 0,
      "state": "closed"
    }
  }
}
```

### 3. Health Check System

Monitor bridge health in real-time:

```bash
curl http://localhost:31003/api/bridge/health
```

**Response Example:**
```json
{
  "status": "healthy",
  "components": {
    "mqtt": {
      "status": "healthy",
      "connected": true,
      "circuitBreaker": "closed",
      "lastError": null,
      "lastErrorTime": null
    },
    "libp2p": {
      "status": "healthy",
      "peerCount": 5,
      "circuitBreaker": "closed",
      "lastError": null,
      "lastErrorTime": null
    },
    "socket": {
      "status": "healthy",
      "lastError": null,
      "lastErrorTime": null
    }
  },
  "timestamp": 1696515600000
}
```

**HTTP Status Codes:**
- `200`: All components healthy
- `503`: One or more components unhealthy

### 4. Circuit Breaker Pattern

Automatic failure detection and recovery mechanism:

**States:**
- **Closed**: Normal operation, all messages pass through
- **Open**: Too many failures, messages rejected temporarily
- **Half-Open**: Testing recovery, allowing limited traffic

**Behavior:**
1. Tracks failures per bridge component (MQTT, libp2p)
2. Opens circuit after threshold failures (default: 10)
3. Rejects messages while open, preventing cascade failures
4. Automatically attempts recovery after timeout (default: 60s)
5. Closes circuit on successful recovery

**Benefits:**
- Prevents resource exhaustion during outages
- Allows system to recover gracefully
- Provides clear failure visibility in metrics

### 5. Structured Logging

Configurable logging system with context:

**Log Levels:**
- `debug`: Detailed message flow, validation, duplicates
- `info`: Normal operations, circuit breaker state changes
- `warn`: Circuit breaker opens, message drops
- `error`: Bridge errors, publish failures

**Log Format:**
```
[2025-10-05T10:30:45.123Z] [INFO] MQTT → libp2p bridged {"topic":"device/temp","size":42}
[2025-10-05T10:30:46.456Z] [DEBUG] Duplicate message dropped (loop prevention) {"topic":"device/temp"}
[2025-10-05T10:30:47.789Z] [ERROR] Error bridging MQTT to libp2p {"topic":"device/temp","error":"Timeout"}
```

**Configuration:**
```bash
# Only show warnings and errors
LOG_LEVEL=warn

# Show all logs including debug
LOG_LEVEL=debug
```

### 6. Message Validation

Multi-layer validation prevents malicious or malformed messages:

**Validation Checks:**

1. **Topic Blacklist**
   - Blocks specified topics from being bridged
   - Configured via `BRIDGE_TOPIC_BLACKLIST`
   - Example: `BRIDGE_TOPIC_BLACKLIST=admin,system,internal`

2. **Message Size Limits**
   - Prevents memory exhaustion from large messages
   - Default: 1MB (configurable via `BRIDGE_MAX_MESSAGE_SIZE`)
   - Messages exceeding limit are dropped with log entry

3. **Topic Format Validation**
   - Ensures topics are non-empty and valid
   - Prevents empty or malformed topic strings

**Validation Flow:**
```
Message Received → Validate Topic → Check Size → Check Blacklist → Process
                        ↓ Invalid          ↓ Too Large    ↓ Blacklisted
                    Drop + Log         Drop + Log      Drop + Log
```

### 7. Loop Prevention

Enhanced multi-layer loop prevention:

**Layer 1: Broker ID Filtering**
- Each node identifies messages from its own MQTT broker
- Prevents local clients from receiving duplicates
- Uses libp2p peerId as unique broker identifier

**Layer 2: Hash-Based Deduplication**
- Tracks message content hashes for TTL period
- Prevents identical messages from being re-published
- Works across all bridge components

**Layer 3: Origin Tracking**
- Messages tagged with origin (mqtt/libp2p/socket)
- Prevents cross-bridge loops
- Transparent to clients (metadata stripped)

**Metrics:**
- `loopsPrevented`: Total loops prevented
- `duplicatesDropped`: Per-component duplicate tracking

## API Endpoints

### GET /api/bridge/metrics
Returns comprehensive bridge metrics including message counts, rates, errors, and circuit breaker states.

**Response:** JSON object with detailed metrics

### GET /api/bridge/health
Returns health status of all bridge components.

**Response:** 
- `200 OK`: All healthy
- `503 Service Unavailable`: One or more components unhealthy

## Best Practices

### Production Deployment

1. **Configure Circuit Breakers**
   ```bash
   BRIDGE_CIRCUIT_BREAKER_THRESHOLD=20
   BRIDGE_CIRCUIT_BREAKER_TIMEOUT=30000
   ```

2. **Set Appropriate Message Limits**
   ```bash
   BRIDGE_MAX_MESSAGE_SIZE=524288  # 512KB for IoT devices
   ```

3. **Enable Info-Level Logging**
   ```bash
   LOG_LEVEL=info  # Balance visibility and performance
   ```

4. **Use Topic Blacklists**
   ```bash
   BRIDGE_TOPIC_BLACKLIST=admin,internal,system
   ```

### Monitoring

1. **Set up health check polling**
   - Poll `/api/bridge/health` every 30s
   - Alert on `503` status or `unhealthy` components

2. **Track metrics trends**
   - Monitor error rates > 1%
   - Watch for increasing `loopsPrevented` counter
   - Alert on circuit breaker `open` states

3. **Log aggregation**
   - Collect structured logs to centralized system
   - Set up alerts for `ERROR` level messages

### Debugging

1. **Enable debug logging**
   ```bash
   LOG_LEVEL=debug
   ```

2. **Check metrics for anomalies**
   ```bash
   curl http://localhost:31003/api/bridge/metrics | jq
   ```

3. **Monitor health status**
   ```bash
   watch -n 5 'curl -s http://localhost:31003/api/bridge/health | jq'
   ```

## Performance Considerations

### Memory Usage
- Message hash tracking uses TTL-based cleanup
- Default TTL: 5 seconds (configurable)
- Memory usage scales with message rate × TTL

### CPU Usage
- Message validation adds minimal overhead (<1ms per message)
- Hash calculation is lightweight (SHA-256 not required)
- Circuit breaker checks are O(1) operations

### Network Impact
- No additional network overhead
- Metadata stripped before client delivery
- Bridge transparency maintained

## Migration Guide

### Upgrading from Previous Version

No code changes required for existing clients. The enhancements are backward compatible.

**Optional: Add monitoring**
```javascript
// Monitor bridge health
setInterval(async () => {
  const health = await fetch('http://localhost:31003/api/bridge/health').then(r => r.json());
  console.log('Bridge status:', health.status);
}, 30000);
```

**Optional: Configure via environment**
```bash
# .env file
BRIDGE_MESSAGE_TTL=10000
LOG_LEVEL=info
BRIDGE_MAX_MESSAGE_SIZE=2097152
```

## Troubleshooting

### Circuit Breaker Keeps Opening

**Symptoms:** Bridge health shows `open` circuit breaker

**Diagnosis:**
1. Check metrics: `curl http://localhost:31003/api/bridge/metrics`
2. Review `lastError` in failing component
3. Check log files for error patterns

**Solutions:**
- Increase threshold: `BRIDGE_CIRCUIT_BREAKER_THRESHOLD=20`
- Increase timeout: `BRIDGE_CIRCUIT_BREAKER_TIMEOUT=120000`
- Fix underlying connectivity issues (MQTT/libp2p)

### High Message Failure Rate

**Symptoms:** `messagesFailed` increasing rapidly

**Diagnosis:**
1. Check validation failures in debug logs
2. Review message sizes vs `BRIDGE_MAX_MESSAGE_SIZE`
3. Check topic blacklist configuration

**Solutions:**
- Increase message size limit if needed
- Review and update topic blacklist
- Fix message format issues at source

### Memory Usage Growing

**Symptoms:** Node.js process memory increasing over time

**Diagnosis:**
1. Check message rate in metrics
2. Review `BRIDGE_MESSAGE_TTL` setting
3. Monitor `recentlyPublished` Set size (via heap profiling)

**Solutions:**
- Reduce TTL: `BRIDGE_MESSAGE_TTL=3000`
- Implement message rate limiting at source
- Increase message size limit to reduce validation overhead

## Future Enhancements

Potential future improvements:

1. **Message Rate Limiting**: Per-topic/per-client rate limits
2. **Persistent Metrics**: Store metrics in Redis/TimeSeries DB
3. **Distributed Tracing**: OpenTelemetry integration
4. **Message Replay**: Dead letter queue for failed messages
5. **Dynamic Configuration**: Runtime config updates via API
6. **Authentication**: Message-level signature verification
7. **Compression**: Automatic message compression for large payloads

## Contributing

When adding new bridge features:

1. Update metrics tracking
2. Add validation checks
3. Include structured logging
4. Update health checks
5. Document configuration options
6. Add tests for new features

## Support

For issues or questions:
- Check `/api/bridge/health` for component status
- Review `/api/bridge/metrics` for detailed statistics
- Enable debug logging: `LOG_LEVEL=debug`
- Consult bridge logs for error details
