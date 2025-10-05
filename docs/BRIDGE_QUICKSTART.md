# Bridge Quick Start Guide

Quick reference for the enhanced MQTT-libp2p-Socket.io bridge.

## 🚀 Quick Start

### Basic Configuration

Create a `.env` file:

```bash
# Bridge Configuration
BRIDGE_MESSAGE_TTL=5000
BRIDGE_MAX_MESSAGE_SIZE=1048576
LOG_LEVEL=info

# MQTT Settings
MQTT_HOST=mqtt://localhost
BRIDGE_MQTT_QOS=0

# Optional: Disable bridges (both ENABLED by default)
# BRIDGE_ENABLE_MQTT=false
# BRIDGE_ENABLE_SOCKET=false

# Optional: Topic filtering
BRIDGE_TOPIC_BLACKLIST=admin,system
```

### Start the Node

```bash
npm run dev
# or
npm run build && node dist/index.js
```

## 📊 Essential Commands

### Check Bridge Health

```bash
# Simple health check
curl http://localhost:31003/api/bridge/health

# Pretty print with jq
curl -s http://localhost:31003/api/bridge/health | jq

# Watch health status
watch -n 5 'curl -s http://localhost:31003/api/bridge/health | jq .status'
```

### View Metrics

```bash
# Full metrics
curl http://localhost:31003/api/bridge/metrics | jq

# Message rates only
curl -s http://localhost:31003/api/bridge/metrics | jq '.rates'

# Circuit breaker status
curl -s http://localhost:31003/api/bridge/metrics | jq '.circuitBreakers'

# Error summary
curl -s http://localhost:31003/api/bridge/metrics | jq '{mqtt: .mqtt.messagesFailed, libp2p: .libp2p.messagesFailed}'
```

## 🔍 Monitoring

### Health Check Script

```bash
#!/bin/bash
# health-check.sh

RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:31003/api/bridge/health)

if [ "$RESPONSE" = "200" ]; then
    echo "✅ Bridge healthy"
    exit 0
else
    echo "❌ Bridge unhealthy (HTTP $RESPONSE)"
    curl -s http://localhost:31003/api/bridge/health | jq .components
    exit 1
fi
```

### Metrics Dashboard (Basic)

```bash
#!/bin/bash
# dashboard.sh

while true; do
    clear
    echo "=== Cyberfly Bridge Dashboard ==="
    echo
    
    METRICS=$(curl -s http://localhost:31003/api/bridge/metrics)
    
    echo "📨 MQTT Bridge"
    echo "  Received: $(echo $METRICS | jq -r '.mqtt.messagesReceived')"
    echo "  Published: $(echo $METRICS | jq -r '.mqtt.messagesPublished')"
    echo "  Failed: $(echo $METRICS | jq -r '.mqtt.messagesFailed')"
    echo "  Duplicates: $(echo $METRICS | jq -r '.mqtt.duplicatesDropped')"
    echo
    
    echo "🌐 libp2p Bridge"
    echo "  Received: $(echo $METRICS | jq -r '.libp2p.messagesReceived')"
    echo "  Published: $(echo $METRICS | jq -r '.libp2p.messagesPublished')"
    echo "  Failed: $(echo $METRICS | jq -r '.libp2p.messagesFailed')"
    echo "  Duplicates: $(echo $METRICS | jq -r '.libp2p.duplicatesDropped')"
    echo
    
    echo "🔌 Socket.io Bridge"
    echo "  Received: $(echo $METRICS | jq -r '.socket.messagesReceived')"
    echo "  Broadcast: $(echo $METRICS | jq -r '.socket.messagesBroadcast')"
    echo "  Failed: $(echo $METRICS | jq -r '.socket.messagesFailed')"
    echo
    
    echo "⚡ Rates"
    echo "  MQTT publish: $(echo $METRICS | jq -r '.rates.mqtt.publishRate') msg/s"
    echo "  libp2p publish: $(echo $METRICS | jq -r '.rates.libp2p.publishRate') msg/s"
    echo
    
    echo "🛡️ Loops Prevented: $(echo $METRICS | jq -r '.loopsPrevented')"
    echo "⏱️  Uptime: $(echo $METRICS | jq -r '.uptime.formatted')"
    
    sleep 5
done
```

## 🐛 Debugging

### Enable Debug Logging

```bash
# Temporary (current session)
LOG_LEVEL=debug npm run dev

# Permanent (in .env)
LOG_LEVEL=debug
```

### Common Issues

#### 1. Circuit Breaker Open

**Symptom:** Health check shows `open` circuit breaker

```bash
# Check which component
curl -s http://localhost:31003/api/bridge/health | jq '.components'

# View last error
curl -s http://localhost:31003/api/bridge/metrics | jq '.mqtt.lastError, .libp2p.lastError'
```

**Solution:**
- Wait for automatic recovery (default: 60s)
- Fix underlying connection issue
- Restart the node

#### 2. High Message Failures

**Symptom:** High `messagesFailed` count

```bash
# Check error rate
curl -s http://localhost:31003/api/bridge/metrics | jq '.rates'
```

**Solutions:**
- Check message sizes: Increase `BRIDGE_MAX_MESSAGE_SIZE`
- Review topic blacklist: Update `BRIDGE_TOPIC_BLACKLIST`
- Enable debug logging to see validation failures

#### 3. Messages Not Bridging

**Symptom:** Messages sent but not received

```bash
# Check bridge enabled
curl -s http://localhost:31003/api/bridge/metrics | jq '.config'

# Check for duplicates being dropped
curl -s http://localhost:31003/api/bridge/metrics | jq '.mqtt.duplicatesDropped, .libp2p.duplicatesDropped'
```

**Solutions:**
- Verify `BRIDGE_ENABLE_MQTT=true`
- Check topic not in blacklist
- Review logs for validation errors

## 🔧 Configuration Reference

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BRIDGE_MESSAGE_TTL` | `5000` | Message hash TTL (ms) |
| `BRIDGE_MAX_MESSAGE_SIZE` | `1048576` | Max message size (bytes) |
| `BRIDGE_ENABLE_MQTT` | `true` | Enable MQTT bridge (set to 'false' to disable) |
| `BRIDGE_ENABLE_SOCKET` | `true` | Enable Socket.io bridge (set to 'false' to disable) |
| `BRIDGE_MQTT_QOS` | `0` | MQTT QoS level (0, 1, 2) |
| `LOG_LEVEL` | `info` | Log level (debug/info/warn/error) |
| `BRIDGE_CIRCUIT_BREAKER_THRESHOLD` | `10` | Failures before opening |
| `BRIDGE_CIRCUIT_BREAKER_TIMEOUT` | `60000` | Recovery timeout (ms) |
| `BRIDGE_TOPIC_BLACKLIST` | `""` | Comma-separated topics |

### Log Levels

| Level | What You'll See |
|-------|-----------------|
| `debug` | All messages including duplicates, validation |
| `info` | Normal operations, circuit breaker changes |
| `warn` | Circuit breaker opens, message drops |
| `error` | Bridge errors, failures |

## 📈 Performance Tips

### For High-Throughput Deployments

```bash
# Reduce TTL to decrease memory usage
BRIDGE_MESSAGE_TTL=3000

# Use QoS 0 for best performance
BRIDGE_MQTT_QOS=0

# Reduce log verbosity
LOG_LEVEL=warn
```

### For Reliability-Critical Deployments

```bash
# Increase circuit breaker tolerance
BRIDGE_CIRCUIT_BREAKER_THRESHOLD=20
BRIDGE_CIRCUIT_BREAKER_TIMEOUT=30000

# Use QoS 1 for at-least-once delivery
BRIDGE_MQTT_QOS=1

# Comprehensive logging
LOG_LEVEL=info
```

### For Resource-Constrained Devices

```bash
# Limit message sizes
BRIDGE_MAX_MESSAGE_SIZE=262144  # 256KB

# Aggressive duplicate prevention
BRIDGE_MESSAGE_TTL=10000

# Minimal logging
LOG_LEVEL=error
```

## 🧪 Testing

### Test Bridge Connectivity

```javascript
// test-bridge.js
import mqtt from 'mqtt';

const client = mqtt.connect('mqtt://localhost:1883');

client.on('connect', () => {
  console.log('Connected to MQTT');
  
  // Subscribe to test topic
  client.subscribe('test/bridge');
  
  // Publish test message
  setInterval(() => {
    const msg = { timestamp: Date.now(), test: 'hello' };
    client.publish('test/bridge', JSON.stringify(msg));
    console.log('Published:', msg);
  }, 5000);
});

client.on('message', (topic, message) => {
  console.log('Received:', topic, message.toString());
});
```

### Test Health Endpoint

```bash
# Test health check
curl -f http://localhost:31003/api/bridge/health || echo "Health check failed"

# Test metrics endpoint
curl -f http://localhost:31003/api/bridge/metrics > /dev/null && echo "Metrics OK"
```

## 📚 More Information

- Full documentation: [BRIDGE_ENHANCEMENTS.md](./BRIDGE_ENHANCEMENTS.md)
- API documentation: [cyberfly-node-api.yaml](./cyberfly-node-api.yaml)
- Main README: [../README.md](../README.md)

## 💡 Tips

1. **Always check health before debugging** - Saves time identifying the problem
2. **Use metrics to track trends** - Catch issues before they become critical
3. **Enable debug logging sparingly** - Can impact performance at high message rates
4. **Monitor circuit breaker states** - Early warning of connectivity issues
5. **Set appropriate blacklists** - Prevent sensitive topics from being bridged
