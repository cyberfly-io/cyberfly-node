# Bridge Configuration Summary

## ✅ Default Behavior Confirmed

**Both bridges (MQTT and Socket.io) are ENABLED by default without any environment variables.**

## Configuration Logic

```typescript
ENABLE_MQTT_BRIDGE: process.env.BRIDGE_ENABLE_MQTT !== 'false'
ENABLE_SOCKET_BRIDGE: process.env.BRIDGE_ENABLE_SOCKET !== 'false'
```

This means:
- **No env var set** → Bridge is **ENABLED** ✅
- **Set to `'false'`** → Bridge is **DISABLED** ❌
- **Set to any other value** → Bridge is **ENABLED** ✅

## Usage Examples

### Default (Both Bridges Enabled)
```bash
# No configuration needed - just start the node
npm run dev
```
Both MQTT and Socket.io bridges will be active.

### Disable MQTT Bridge Only
```bash
# .env file
BRIDGE_ENABLE_MQTT=false
```
Only Socket.io bridge will be active.

### Disable Socket.io Bridge Only
```bash
# .env file
BRIDGE_ENABLE_SOCKET=false
```
Only MQTT bridge will be active.

### Disable Both Bridges
```bash
# .env file
BRIDGE_ENABLE_MQTT=false
BRIDGE_ENABLE_SOCKET=false
```
No bridging will occur (messages stay in their original domains).

### Explicit Enable (Redundant but Clear)
```bash
# .env file
BRIDGE_ENABLE_MQTT=true
BRIDGE_ENABLE_SOCKET=true
```
Same as default behavior, but explicitly stated.

## Testing

Run the test to verify default behavior:
```bash
node test/bridge-defaults-test.js
```

Expected output:
```
✅ No env vars set
   MQTT Bridge: true (expected: true)
   Socket Bridge: true (expected: true)
```

## Why This Design?

This "opt-out" approach (enabled by default) was chosen because:

1. **Zero Configuration**: New users get full functionality immediately
2. **Sensible Defaults**: Most deployments want bridging enabled
3. **Explicit Disabling**: Users who don't want bridging must explicitly opt-out
4. **Clear Intent**: Setting `=false` clearly indicates intentional disabling
5. **Fail-Safe**: Typos or wrong values default to enabled (safer for production)

## Migration Notes

If you're upgrading from a version that required explicit `=true`:
- **No action needed** - bridges will continue working
- **Optional**: Remove `BRIDGE_ENABLE_*=true` from `.env` (redundant but harmless)

## Common Scenarios

### Scenario 1: Production Deployment (Default)
```bash
# No bridge configuration needed
# Both bridges automatically enabled
```

### Scenario 2: MQTT-Only Node
```bash
# Disable Socket.io to reduce overhead
BRIDGE_ENABLE_SOCKET=false
```

### Scenario 3: WebSocket-Only Node
```bash
# Disable MQTT for security/isolation
BRIDGE_ENABLE_MQTT=false
```

### Scenario 4: Isolated Node (No Bridging)
```bash
# Disable all bridges for testing/isolation
BRIDGE_ENABLE_MQTT=false
BRIDGE_ENABLE_SOCKET=false
```

## Verification

### Check Configuration at Runtime
```bash
curl http://localhost:31003/api/bridge/metrics | jq '.config'
```

Output shows actual configuration:
```json
{
  "ENABLE_MQTT_BRIDGE": true,
  "ENABLE_SOCKET_BRIDGE": true,
  ...
}
```

### Monitor Bridge Activity
```bash
# Check if messages are being bridged
curl http://localhost:31003/api/bridge/metrics | jq '{
  mqtt_received: .mqtt.messagesReceived,
  mqtt_published: .mqtt.messagesPublished,
  socket_received: .socket.messagesReceived
}'
```

If bridges are disabled, counters will remain at 0.

## Troubleshooting

### "Bridge not working"
1. Check health: `curl http://localhost:31003/api/bridge/health`
2. Verify config: `curl http://localhost:31003/api/bridge/metrics | jq '.config'`
3. Check if explicitly disabled in `.env`

### "Want to disable bridge temporarily"
```bash
# Add to .env
BRIDGE_ENABLE_MQTT=false
BRIDGE_ENABLE_SOCKET=false

# Restart node
npm run dev
```

### "Want to re-enable bridge"
```bash
# Remove from .env or set to any value except 'false'
# BRIDGE_ENABLE_MQTT=true  # Optional
# BRIDGE_ENABLE_SOCKET=true  # Optional

# Or just remove the lines entirely
# Restart node
npm run dev
```

## Documentation References

- Full enhancements: [BRIDGE_ENHANCEMENTS.md](./BRIDGE_ENHANCEMENTS.md)
- Quick start guide: [BRIDGE_QUICKSTART.md](./BRIDGE_QUICKSTART.md)
- Example configuration: [../.env.example](../.env.example)
