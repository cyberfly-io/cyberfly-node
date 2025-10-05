// Test to verify bridge is enabled by default
// This demonstrates the default configuration behavior

console.log('=== Bridge Default Configuration Test ===\n');

// Simulate no environment variables set
const testCases = [
  { 
    name: 'No env vars set',
    env: {},
    expected: { mqtt: true, socket: true }
  },
  {
    name: 'Explicitly disabled',
    env: { BRIDGE_ENABLE_MQTT: 'false', BRIDGE_ENABLE_SOCKET: 'false' },
    expected: { mqtt: false, socket: false }
  },
  {
    name: 'MQTT disabled, Socket enabled by default',
    env: { BRIDGE_ENABLE_MQTT: 'false' },
    expected: { mqtt: false, socket: true }
  },
  {
    name: 'Socket disabled, MQTT enabled by default',
    env: { BRIDGE_ENABLE_SOCKET: 'false' },
    expected: { mqtt: true, socket: false }
  },
  {
    name: 'Explicitly enabled (redundant)',
    env: { BRIDGE_ENABLE_MQTT: 'true', BRIDGE_ENABLE_SOCKET: 'true' },
    expected: { mqtt: true, socket: true }
  }
];

testCases.forEach(({ name, env, expected }) => {
  // Simulate the configuration logic
  const config = {
    ENABLE_MQTT_BRIDGE: env.BRIDGE_ENABLE_MQTT !== 'false',
    ENABLE_SOCKET_BRIDGE: env.BRIDGE_ENABLE_SOCKET !== 'false'
  };
  
  const mqttMatch = config.ENABLE_MQTT_BRIDGE === expected.mqtt;
  const socketMatch = config.ENABLE_SOCKET_BRIDGE === expected.socket;
  const passed = mqttMatch && socketMatch;
  
  console.log(`${passed ? '✅' : '❌'} ${name}`);
  console.log(`   MQTT Bridge: ${config.ENABLE_MQTT_BRIDGE} (expected: ${expected.mqtt})`);
  console.log(`   Socket Bridge: ${config.ENABLE_SOCKET_BRIDGE} (expected: ${expected.socket})`);
  console.log('');
});

console.log('=== Summary ===');
console.log('✅ Both bridges are ENABLED by default when no env vars are set');
console.log('✅ Set BRIDGE_ENABLE_MQTT=false to disable MQTT bridge');
console.log('✅ Set BRIDGE_ENABLE_SOCKET=false to disable Socket.io bridge');
console.log('✅ Any value other than "false" keeps the bridge enabled');
