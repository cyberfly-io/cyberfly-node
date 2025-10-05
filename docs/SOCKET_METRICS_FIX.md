# Socket.io Metrics Fix

## Problem

Socket.io metrics (`messagesReceived`, `messagesBroadcast`) were incrementing for **every** libp2p message, even when:
- No Socket.io clients were subscribed to the topic
- Messages were filtered (internal topics like `pindb`, `_peer-discovery`, `dbupdate`)
- Messages were only meant for MQTT bridging
- No actual Socket.io broadcast occurred

### Root Cause

There were **two separate `pubsub.addEventListener('message', ...)` handlers**:

1. **First handler**: Handled `pindb` topic and libp2p → MQTT bridging
2. **Second handler**: Handled Socket.io broadcasting

The second handler executed for **every message** on the network, incrementing `messagesReceived` regardless of whether Socket.io clients existed or messages were actually broadcast.

```typescript
// BEFORE (Problematic Code)
pubsub.addEventListener('message', async (message) => {
  // ... MQTT bridge logic ...
});

// Second handler - runs for ALL messages!
pubsub.addEventListener('message', async (message) => {
  if (!BRIDGE_CONFIG.ENABLE_SOCKET_BRIDGE) return;
  
  bridgeMetrics.socket.messagesReceived++;  // ❌ Increments for every message!
  
  // ... Socket.io broadcast logic ...
});
```

## Solution

**Consolidated the handlers** into a single `pubsub.addEventListener` with Socket.io broadcasting integrated:

```typescript
// AFTER (Fixed Code)
pubsub.addEventListener('message', async (message) => {
  // ... pindb handling ...
  
  if (!topic.includes("_peer-discovery") && !topic.includes("dbupdate") && !isValidAddress(topic)) {
    // ... MQTT bridge logic ...
    
    // Integrated Socket.io broadcasting
    if (BRIDGE_CONFIG.ENABLE_SOCKET_BRIDGE) {
      // ✅ Only check if there are subscribers first!
      const hasSubscribers = Object.values(subscribedSockets).some(
        (topics) => (topics as Set<string>).has(topic)
      );
      
      if (hasSubscribers) {
        bridgeMetrics.socket.messagesReceived++;  // ✅ Only increments when needed!
        // ... broadcast logic ...
      }
    }
  }
});
```

## Key Improvements

### 1. **Single Event Handler**
- Eliminates duplicate processing of every message
- Reduces CPU overhead
- Ensures consistent message processing order

### 2. **Subscriber Check Before Metrics**
```typescript
const hasSubscribers = Object.values(subscribedSockets).some(
  (topics) => (topics as Set<string>).has(topic)
);

if (hasSubscribers) {
  bridgeMetrics.socket.messagesReceived++;  // Only increment when needed
}
```

### 3. **Accurate Metrics**
- `messagesReceived`: Only counts messages with actual Socket.io subscribers
- `messagesBroadcast`: Counts per-client broadcasts (can be > messagesReceived)
- `messagesFailed`: Only counts actual Socket.io errors

## Behavior Changes

### Before Fix

| Scenario | messagesReceived | messagesBroadcast |
|----------|------------------|-------------------|
| Message to topic with 2 Socket.io subscribers | +1 | +2 |
| Message to topic with 0 Socket.io subscribers | +1 ❌ | 0 |
| Internal message (pindb, _peer-discovery) | +1 ❌ | 0 |
| OrbitDB address message | +1 ❌ | 0 |
| MQTT-only message | +1 ❌ | 0 |

### After Fix

| Scenario | messagesReceived | messagesBroadcast |
|----------|------------------|-------------------|
| Message to topic with 2 Socket.io subscribers | +1 ✅ | +2 |
| Message to topic with 0 Socket.io subscribers | 0 ✅ | 0 |
| Internal message (pindb, _peer-discovery) | 0 ✅ | 0 |
| OrbitDB address message | 0 ✅ | 0 |
| MQTT-only message | 0 ✅ | 0 |

## Impact

### Performance
- **Reduced CPU usage**: No longer processes every message twice
- **Accurate metrics**: Metrics reflect actual Socket.io activity
- **Memory efficiency**: Single handler with single message parsing

### Metrics Accuracy
- **Before**: `messagesReceived` included all network messages
- **After**: `messagesReceived` only counts messages broadcast to Socket.io clients

### Example Metrics Comparison

**Scenario**: Node receives 1000 libp2p messages, but only 50 have Socket.io subscribers

| Metric | Before Fix | After Fix |
|--------|------------|-----------|
| socket.messagesReceived | 1000 ❌ | 50 ✅ |
| socket.messagesBroadcast | 100 | 100 |
| Accuracy | 10% error | 100% accurate |

## Testing

Run the test to verify correct behavior:

```bash
node test/socket-metrics-test.js
```

Expected output:
```
✅ Message with subscribers (should increment)
✅ Message without subscribers (should NOT increment)
✅ Internal message - pindb (should NOT increment)
✅ Internal message - _peer-discovery (should NOT increment)
✅ OrbitDB address (should NOT increment)
```

## Verification in Production

### Check Metrics Endpoint

```bash
curl http://localhost:31003/api/bridge/metrics | jq '.socket'
```

**Healthy metrics should show:**
```json
{
  "messagesReceived": 245,
  "messagesBroadcast": 490,
  "messagesFailed": 0,
  "lastError": null,
  "lastErrorTime": null
}
```

Note: `messagesBroadcast` can be 2x `messagesReceived` if each message is broadcast to 2 clients.

### What to Look For

✅ **Good**: `messagesReceived` is proportional to active Socket.io subscriptions
✅ **Good**: `messagesBroadcast ≥ messagesReceived` (one message can broadcast to multiple clients)
✅ **Good**: Metrics increase only when Socket.io clients are connected and subscribed

❌ **Bad** (would indicate the bug is back): 
- `messagesReceived` increases without Socket.io clients
- `messagesReceived` matches libp2p message rate instead of subscription rate
- `messagesBroadcast` is 0 while `messagesReceived` keeps increasing

## Code Location

- **File**: `src/index.ts`
- **Function**: `pubsub.addEventListener('message', ...)`
- **Lines**: ~1033-1138

## Migration Notes

No code changes needed for existing clients. This is a **bug fix** that:
- Improves metrics accuracy
- Reduces CPU overhead
- Maintains all existing functionality

## Related Files

- `test/socket-metrics-test.js` - Test case for the fix
- `docs/BRIDGE_ENHANCEMENTS.md` - Full bridge documentation
- `docs/BRIDGE_QUICKSTART.md` - Monitoring and debugging guide

## Future Considerations

Consider adding:
1. **Rate metrics**: Messages per second for Socket.io
2. **Subscription metrics**: Track active Socket.io subscriptions per topic
3. **Client metrics**: Track connected Socket.io clients
4. **Latency metrics**: Time from libp2p receive to Socket.io emit

These would provide even more visibility into Socket.io bridge performance.
