import {isValidAddress, useAccessController  } from '@orbitdb/core'
import CyberflyAccessController from './cyberfly-access-controller.js'
import http from "http";
import cors from 'cors';
import { Server } from "socket.io";
import { config } from 'dotenv';
import express from 'express';
import { toString } from 'uint8arrays/to-string'
import { fromString } from 'uint8arrays/from-string'
import { addNodeToContract, extractFields, removeDuplicateConnections, getDevice, verify} from './config/utils.js'
import si from 'systeminformation'
import { multiaddr } from '@multiformats/multiaddr'
import mqtt from 'mqtt';
import ManifestStore from '@orbitdb/core/src/manifest-store.js'
import { OrbitDBAddress } from '@orbitdb/core/src/orbitdb.js';
import multer from 'multer';
import { unixfs } from '@helia/unixfs';
import { promises as fsPromises } from 'fs';
import fs from 'fs';
import { json } from '@helia/json';
import { CID } from 'multiformats/cid'
import path from 'path';
import { graphqlHTTP } from 'express-graphql';
import { schema, resolvers } from './graphql.js';
import { nodeConfig, entryStorage, updateData, discovered } from './custom-entry-storage.js';
import CyberflyChatAccessController from './cyberfly-chat-access-control.js';
import { getStreamName, verifyMsg } from './utils.js';
import { nanoid } from 'nanoid'
import { peerIdFromString } from '@libp2p/peer-id'
import { VERSION } from './version.js';
import { isPrivate } from '@libp2p/utils/multiaddr/is-private'
import pkg from "ruru/server";
const { ruruHTML, defaultHTMLParts } = pkg;



const storage = multer.diskStorage({
  destination: function (req:any, file:any, cb:any) {
    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    cb(null, tempDir);
  },
  filename: function (req:any, file:any, cb:any) {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ storage: storage });

// Store file metadata temporarily
const fileMetadata = new Map();

const mqttUrl = process.env.MQTT_HOST || 'mqtt://localhost';

const mqtt_port = 1883

const mqtt_host = `${mqttUrl}:${mqtt_port}`

// ========== Bridge Configuration ==========
const BRIDGE_CONFIG = {
  RECENT_MESSAGE_TTL: parseInt(process.env.BRIDGE_MESSAGE_TTL || '5000'), // ms
  MAX_MESSAGE_SIZE: parseInt(process.env.BRIDGE_MAX_MESSAGE_SIZE || '1048576'), // 1MB default
  ENABLE_MQTT_BRIDGE: process.env.BRIDGE_ENABLE_MQTT !== 'false',
  ENABLE_SOCKET_BRIDGE: process.env.BRIDGE_ENABLE_SOCKET !== 'false',
  MQTT_QOS: parseInt(process.env.BRIDGE_MQTT_QOS || '0') as 0 | 1 | 2,
  LOG_LEVEL: process.env.LOG_LEVEL || 'info', // debug, info, warn, error
  CIRCUIT_BREAKER_THRESHOLD: parseInt(process.env.BRIDGE_CIRCUIT_BREAKER_THRESHOLD || '10'),
  CIRCUIT_BREAKER_TIMEOUT: parseInt(process.env.BRIDGE_CIRCUIT_BREAKER_TIMEOUT || '60000'), // 1 minute
  TOPIC_BLACKLIST: (process.env.BRIDGE_TOPIC_BLACKLIST || '').split(',').filter(Boolean),
};

// ========== Bridge Metrics ==========
interface BridgeMetrics {
  mqtt: {
    messagesReceived: number;
    messagesPublished: number;
    messagesFailed: number;
    duplicatesDropped: number;
    lastError: string | null;
    lastErrorTime: number | null;
  };
  libp2p: {
    messagesReceived: number;
    messagesPublished: number;
    messagesFailed: number;
    duplicatesDropped: number;
    lastError: string | null;
    lastErrorTime: number | null;
  };
  socket: {
    messagesReceived: number;
    messagesBroadcast: number;
    messagesFailed: number;
    lastError: string | null;
    lastErrorTime: number | null;
  };
  startTime: number;
  loopsPrevented: number;
}

const bridgeMetrics: BridgeMetrics = {
  mqtt: { messagesReceived: 0, messagesPublished: 0, messagesFailed: 0, duplicatesDropped: 0, lastError: null, lastErrorTime: null },
  libp2p: { messagesReceived: 0, messagesPublished: 0, messagesFailed: 0, duplicatesDropped: 0, lastError: null, lastErrorTime: null },
  socket: { messagesReceived: 0, messagesBroadcast: 0, messagesFailed: 0, lastError: null, lastErrorTime: null },
  startTime: Date.now(),
  loopsPrevented: 0
};

// ========== Circuit Breaker for Error Handling ==========
type CircuitBreakerState = 'closed' | 'open' | 'half-open';

interface CircuitBreaker {
  failures: number;
  lastFailureTime: number;
  state: CircuitBreakerState;
}

const circuitBreakers: Record<'mqtt' | 'libp2p', CircuitBreaker> = {
  mqtt: { failures: 0, lastFailureTime: 0, state: 'closed' },
  libp2p: { failures: 0, lastFailureTime: 0, state: 'closed' }
};

function checkCircuitBreaker(name: 'mqtt' | 'libp2p'): boolean {
  const breaker = circuitBreakers[name];
  
  if (breaker.state === 'open') {
    const timeSinceLastFailure = Date.now() - breaker.lastFailureTime;
    if (timeSinceLastFailure > BRIDGE_CONFIG.CIRCUIT_BREAKER_TIMEOUT) {
      breaker.state = 'half-open';
      logMessage('warn', `Circuit breaker for ${name} entering half-open state`);
      return true;
    }
    return false;
  }
  
  return true;
}

function recordCircuitBreakerFailure(name: 'mqtt' | 'libp2p') {
  const breaker = circuitBreakers[name];
  breaker.failures++;
  breaker.lastFailureTime = Date.now();
  
  if (breaker.failures >= BRIDGE_CONFIG.CIRCUIT_BREAKER_THRESHOLD) {
    breaker.state = 'open';
    logMessage('error', `Circuit breaker for ${name} opened after ${breaker.failures} failures`);
  }
}

function recordCircuitBreakerSuccess(name: 'mqtt' | 'libp2p') {
  const breaker = circuitBreakers[name];
  if (breaker.state === 'half-open') {
    breaker.failures = 0;
    breaker.state = 'closed';
    logMessage('info', `Circuit breaker for ${name} closed - recovered`);
  } else if (breaker.failures > 0) {
    breaker.failures = Math.max(0, breaker.failures - 1);
  }
}

// ========== Structured Logging ==========
function logMessage(level: 'debug' | 'info' | 'warn' | 'error', message: string, context?: any) {
  const levels = { debug: 0, info: 1, warn: 2, error: 3 };
  const configLevel = BRIDGE_CONFIG.LOG_LEVEL as keyof typeof levels;
  
  if (levels[level] >= levels[configLevel]) {
    const timestamp = new Date().toISOString();
    const logData = {
      timestamp,
      level: level.toUpperCase(),
      message,
      ...(context && { context })
    };
    
    const logString = `[${timestamp}] [${level.toUpperCase()}] ${message}${context ? ' ' + JSON.stringify(context) : ''}`;
    
    if (level === 'error') console.error(logString);
    else if (level === 'warn') console.warn(logString);
    else console.log(logString);
  }
}

// ========== Message Validation ==========
function validateMessage(topic: string, data: any): { valid: boolean; reason?: string } {
  // Check topic blacklist
  if (BRIDGE_CONFIG.TOPIC_BLACKLIST.some(pattern => topic.includes(pattern))) {
    return { valid: false, reason: 'Topic blacklisted' };
  }
  
  // Check message size
  const messageStr = typeof data === 'object' ? JSON.stringify(data) : String(data);
  if (Buffer.byteLength(messageStr, 'utf8') > BRIDGE_CONFIG.MAX_MESSAGE_SIZE) {
    return { valid: false, reason: 'Message exceeds size limit' };
  }
  
  // Validate topic format (basic check)
  if (!topic || topic.trim() === '') {
    return { valid: false, reason: 'Empty topic' };
  }
  
  return { valid: true };
}

// Track recently published messages to MQTT to prevent loops
const recentlyPublished = new Set<string>();

// Helper to generate message hash
function getMessageHash(topic: string, data: any): string {
  const content = typeof data === 'object' ? JSON.stringify(data) : String(data);
  return `${topic}:${content}`;
}



config();
useAccessController(CyberflyAccessController)
useAccessController(CyberflyChatAccessController)
export const orbitdb = nodeConfig.orbitdb
const ipfs = orbitdb.ipfs
const libp2p = await orbitdb.ipfs.libp2p
const manifestStore = await ManifestStore({ ipfs })
const pubsub = libp2p.services.pubsub
const account = process.env.KADENA_ACCOUNT
// Print out listening addresses
let maddr:any;
console.log('libp2p listening on addresses:');
libp2p.getMultiaddrs().forEach((addr:any) => {
  if(!isPrivate(addr) && addr.toString().includes('31001')){
    console.log(addr.toString());
    maddr = addr.toString()
  }

});
if(!account){
  console.log("KADENA_ACCOUNT environment variable is required")
  process.exit(1)
}

const clientId = `${libp2p.peerId.toString()}`
console.log(`MQTT client id: ${clientId}`)
const mqtt_client = mqtt.connect(mqtt_host, {
  clientId,
  clean: true,
  connectTimeout: 4000,
  reconnectPeriod: 1000,
})
mqtt_client.on('connect', () => {
  console.log('Mqtt connection Established')
  mqtt_client.subscribe('#')
})

mqtt_client.on('message', async(topic, payload) => {
  if (!BRIDGE_CONFIG.ENABLE_MQTT_BRIDGE) return;
  
  try {
    bridgeMetrics.mqtt.messagesReceived++;
    
    // Check circuit breaker
    if (!checkCircuitBreaker('mqtt')) {
      logMessage('warn', 'MQTT bridge circuit breaker open, dropping message', { topic });
      bridgeMetrics.mqtt.messagesFailed++;
      return;
    }
    
    const payloadStr = payload.toString();
    let parsedPayload;
    
    try {
      parsedPayload = JSON.parse(payloadStr);
    } catch {
      parsedPayload = payloadStr;
    }
    
    // Validate message
    const validation = validateMessage(topic, parsedPayload);
    if (!validation.valid) {
      logMessage('debug', 'Message validation failed', { topic, reason: validation.reason });
      bridgeMetrics.mqtt.messagesFailed++;
      return;
    }
    
    // Check if we recently published this exact message (prevent loop)
    const messageHash = getMessageHash(topic, parsedPayload);
    if (recentlyPublished.has(messageHash)) {
      bridgeMetrics.mqtt.duplicatesDropped++;
      bridgeMetrics.loopsPrevented++;
      logMessage('debug', 'Duplicate message dropped (loop prevention)', { topic });
      return; // Skip, this came from our libp2p bridge
    }
    
    // Wrap client message with bridge metadata (transparent to client)
    const bridgeMessage = {
      __origin: 'mqtt',
      __broker: libp2p.peerId.toString(),  // Use peerId as unique broker identifier
      __timestamp: Date.now(),
      data: parsedPayload
    };
    
    await pubsub.publish(topic, fromString(JSON.stringify(bridgeMessage)));
    bridgeMetrics.mqtt.messagesPublished++;
    recordCircuitBreakerSuccess('mqtt');
    
    logMessage('debug', 'MQTT → libp2p bridged', { topic, size: Buffer.byteLength(JSON.stringify(bridgeMessage)) });
  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    bridgeMetrics.mqtt.messagesFailed++;
    bridgeMetrics.mqtt.lastError = errorMsg;
    bridgeMetrics.mqtt.lastErrorTime = Date.now();
    recordCircuitBreakerFailure('mqtt');
    logMessage('error', 'Error bridging MQTT to libp2p', { topic, error: errorMsg });
  }
})

libp2p.addEventListener('peer:connect', async(evt) => {   
  const peerId = evt.detail
  await libp2p.peerStore.merge(peerId, {
    tags: {
      'keep-alive': {
        value: 50
      }
    }
  })
})

const port = 31003;
addNodeToContract(clientId, maddr, account,nodeConfig.kadenaPub, nodeConfig.kadenaSec)


const newDb = async (name:string, pubkey:string)=>{
  const db = await orbitdb.open(`${name}-${pubkey}`, {type:"documents", AccessController:CyberflyAccessController(), entryStorage})
  const addr = db.address
  return addr
}

const getAllData = async (dbaddr:string, amount=40)=>{
  try{
    const db = await orbitdb.open(dbaddr, {entryStorage});
    const values:any = []
    for await (const entry of db.iterator({amount:amount})) {
      values.unshift(entry)
    }
    return values
  }
   catch(e){
    console.log(e)
    return []
   }
}


const getData = async (dbaddr:string, key:string)=>{
  try{
    const db = await orbitdb.open(dbaddr, {entryStorage});
    const data = await db.get(key)
    return data;
  }
   catch(e){
    console.log(e)
    return {}
   }
}


const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  optionsSuccessStatus: 204
};
const app = express();
app.use(cors(corsOptions));
app.use(express.json());

app.use('/graphql', (req, res) => {
  // Check if the request accepts JSON (GraphQL clients)
  if (req.headers.accept?.includes('application/json') || 
      req.headers['content-type']?.includes('application/json')) {
    return graphqlHTTP({
      schema,
      rootValue: resolvers,
      graphiql: true
    })(req, res);
  }
  
  // Otherwise serve Ruru HTML interface
  res.type('html');
  res.end(ruruHTML({ endpoint: '/graphql'
  },   {
    ...defaultHTMLParts,
    titleTag: '<title>Cyberfly Graphql</title>',
    styleTags: `<style>
body {
  margin: 0;
}
#ruru-root {
  height: 100vh;
}
/* Hide the footer */
.graphiql-footer {
  display: none !important;
}
  /* Replace logo text */
.graphiql-logo::after {
  content: 'CyberFly' !important;
}
.graphiql-logo {
  visibility: hidden;
  position: relative;
}
.graphiql-logo::after {
  visibility: visible;
  position: absolute;
  left: 0;
  }
</style>`
  }));
});

app.options('*', cors(corsOptions));


const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 204
  },
});




// Bridge metrics endpoint
app.get("/api/bridge/metrics", async(req, res)=>{
  const uptime = Date.now() - bridgeMetrics.startTime;
  const uptimeSeconds = Math.floor(uptime / 1000);
  
  const metrics = {
    ...bridgeMetrics,
    uptime: {
      ms: uptime,
      seconds: uptimeSeconds,
      formatted: `${Math.floor(uptimeSeconds / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m ${uptimeSeconds % 60}s`
    },
    rates: {
      mqtt: {
        publishRate: (bridgeMetrics.mqtt.messagesPublished / uptimeSeconds).toFixed(2),
        receiveRate: (bridgeMetrics.mqtt.messagesReceived / uptimeSeconds).toFixed(2),
        errorRate: (bridgeMetrics.mqtt.messagesFailed / Math.max(1, bridgeMetrics.mqtt.messagesReceived) * 100).toFixed(2) + '%'
      },
      libp2p: {
        publishRate: (bridgeMetrics.libp2p.messagesPublished / uptimeSeconds).toFixed(2),
        receiveRate: (bridgeMetrics.libp2p.messagesReceived / uptimeSeconds).toFixed(2),
        errorRate: (bridgeMetrics.libp2p.messagesFailed / Math.max(1, bridgeMetrics.libp2p.messagesReceived) * 100).toFixed(2) + '%'
      }
    },
    circuitBreakers: {
      mqtt: circuitBreakers.mqtt,
      libp2p: circuitBreakers.libp2p
    },
    config: BRIDGE_CONFIG
  };
  
  res.json(metrics);
});

// Bridge health check endpoint
app.get("/api/bridge/health", async(req, res)=>{
  const mqttConnected = mqtt_client.connected;
  const libp2pPeerCount = libp2p.getPeers().length;
  
  const mqttHealthy = mqttConnected && circuitBreakers.mqtt.state !== 'open';
  const libp2pHealthy = libp2pPeerCount > 0 && circuitBreakers.libp2p.state !== 'open';
  
  const overall = mqttHealthy && libp2pHealthy;
  
  const health = {
    status: overall ? 'healthy' : 'unhealthy',
    components: {
      mqtt: {
        status: mqttHealthy ? 'healthy' : 'unhealthy',
        connected: mqttConnected,
        circuitBreaker: circuitBreakers.mqtt.state,
        lastError: bridgeMetrics.mqtt.lastError,
        lastErrorTime: bridgeMetrics.mqtt.lastErrorTime
      },
      libp2p: {
        status: libp2pHealthy ? 'healthy' : 'unhealthy',
        peerCount: libp2pPeerCount,
        circuitBreaker: circuitBreakers.libp2p.state,
        lastError: bridgeMetrics.libp2p.lastError,
        lastErrorTime: bridgeMetrics.libp2p.lastErrorTime
      },
      socket: {
        status: 'healthy',
        lastError: bridgeMetrics.socket.lastError,
        lastErrorTime: bridgeMetrics.socket.lastErrorTime
      }
    },
    timestamp: Date.now()
  };
  
  res.status(overall ? 200 : 503).json(health);
});

app.get("/api", async(req, res)=>{
  const peerId = libp2p.peerId
  const peers = libp2p.getPeers()

  const conn = libp2p.getConnections()
  let con = conn.filter(obj => obj.status==="open")
  const filteredConn = removeDuplicateConnections(con);
  const info = {peerId:peerId, health:"ok", version:VERSION, 
  multiAddr:maddr, 
  publicKey:nodeConfig.kadenaPub,discovered:discovered.length, 
  connected:filteredConn.length, peers:peers, account:account, 
  connections:extractFields(filteredConn, 'remotePeer', 'remoteAddr')
}
  res.json(info)
});

app.get("/api/multiaddrs", async(req, res)=>{
const maddrs = libp2p.getMultiaddrs();
res.json(maddrs);
});


// Chunk upload endpoint
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
    }

    const { fileName, chunkIndex, totalChunks, mimeType } = req.body;
    
    // Create chunks directory in temp
    const chunksDir = path.join(process.cwd(), 'temp', 'chunks', fileName);
    if (!fs.existsSync(chunksDir)) {
      await fsPromises.mkdir(chunksDir, { recursive: true });
    }

    // Store metadata
    if (!fileMetadata.has(fileName)) {
      fileMetadata.set(fileName, {
        mimeType,
        chunks: new Set(),
        uploadStartTime: Date.now(),
        tempPath: req.file? req.file.path : ''
      });
    }

    // Move chunk to chunks directory
    const chunkPath = path.join(chunksDir, `chunk${chunkIndex}`);
    await fsPromises.rename(req.file? req.file.path: '', chunkPath);

    // Update metadata
    fileMetadata.get(fileName).chunks.add(parseInt(chunkIndex));

    res.json({ 
      success: true, 
      message: 'Chunk uploaded successfully',
      chunkIndex 
    });

  } catch (error) {
    console.error('Chunk upload error:', error);
    res.status(500).json({ error: 'Failed to process chunk' });
  }
});

// Complete upload endpoint
app.post('/api/upload/complete', express.json(), async (req, res) => {
  try {
    const { fileName, totalChunks, mimeType } = req.body;
    const metadata:any = fileMetadata.get(fileName);

    if (!metadata) {
       res.status(400).json({ error: 'No upload in progress for this file' });
    }

    // Verify all chunks are present
    if (metadata.chunks.size !== parseInt(totalChunks)) {
       res.status(400).json({ 
        error: 'Missing chunks',
        expected: totalChunks,
        received: metadata.chunks.size
      });
    }

    // Create temporary directory for final file
    const tempDir = path.join(process.cwd(), 'temp', 'final');
    if (!fs.existsSync(tempDir)) {
      await fsPromises.mkdir(tempDir, { recursive: true });
    }

    // Path for combined file
    const finalPath = path.join(tempDir, fileName);
    const writeStream = fs.createWriteStream(finalPath);

    // Combine chunks
    const chunksDir = path.join(process.cwd(), 'temp', 'chunks', fileName);
    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = path.join(chunksDir, `chunk${i}`);
      const chunkBuffer = await fsPromises.readFile(chunkPath);
      writeStream.write(chunkBuffer);
      
      // Clean up chunk after combining
      await fsPromises.unlink(chunkPath);
    }

    // Wait for write to complete
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
      writeStream.end();
    });

    // Clean up chunks directory
    await fsPromises.rmdir(chunksDir);

    try {
      // Initialize Helia and its plugins
      const helia = ipfs;
      const hfs = unixfs(helia);
      const j = json(helia);

      // Read the final file
      const fileBuffer = await fsPromises.readFile(finalPath);

      // Add to IPFS
      const cid = await hfs.addBytes(fileBuffer);

      // Create IPFS metadata
      const ipfsMetadata = {
        filename: fileName,
        contentType: mimeType,
        uploadDate: new Date().toISOString(),
        fileCid: cid.toString(),
        fileSize: fileBuffer.length,
        uploadDuration: Date.now() - metadata.uploadStartTime
      };

      // Store metadata in IPFS
      const metadataCid = await j.add(ipfsMetadata);

      // Clean up final file
      await fsPromises.unlink(finalPath);

      // Clean up metadata
      fileMetadata.delete(fileName);

      res.json({
        success: true,
        message: 'File uploaded successfully',
        fileCid: cid.toString(),
        metadataCid: metadataCid.toString(),
        filename: fileName,
        contentType: mimeType,
        metadata: ipfsMetadata
      });

    } catch (ipfsError) {
      console.error('IPFS error:', ipfsError);
      res.status(500).json({ error: 'Failed to store file in IPFS' });
      
      // Clean up on IPFS error
      await fsPromises.unlink(finalPath);
    }

  } catch (error) {
    console.error('Upload completion error:', error);
    res.status(500).json({ error: 'Failed to complete upload' });
  }
});

// Route to retrieve file from IPFS
app.get('/api/file/:metadataCid', async (req, res) => {
  try {
    const helia = ipfs;
    const hfs = unixfs(helia);
    const j = json(helia);
    const metadataCid = CID.parse(req.params.metadataCid);

    // Get file metadata from IPFS
    const metadata:any = await j.get(metadataCid);
    if (!metadata) {
       res.status(404).json({ error: 'File metadata not found' });
    }

    // Check if it's a video file
    const isVideo = metadata.contentType.startsWith('video/');

    // For video files, handle streaming
    if (isVideo) {
      const range = req.headers.range;
      
      // If no range is provided, send the entire file
      if (!range) {
        res.writeHead(200, {
          'Content-Length': metadata.fileSize,
          'Content-Type': metadata.contentType
        });
        
        for await (const chunk of hfs.cat(metadata.fileCid)) {
          res.write(chunk);
        }
        res.end();
        return;
      }

      // Parse the range header
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : metadata.fileSize - 1;
      const chunkSize = (end - start) + 1;

      // Validate range
      if (start >= metadata.fileSize || end >= metadata.fileSize) {
        res.writeHead(416, {
          'Content-Range': `bytes */${metadata.fileSize}`
        });
        res.end();
        return;
      }

      // Set streaming headers
      const headers = {
        'Content-Range': `bytes ${start}-${end}/${metadata.fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': metadata.contentType
      };

      // Send partial content status
      res.writeHead(206, headers);

      try {
        // Stream the content
        for await (const chunk of hfs.cat(metadata.fileCid, {
          offset: start,
          length: chunkSize
        })) {
          res.write(chunk);
        }
        res.end();
      } catch (streamError) {
        console.error('Streaming error:', streamError);
        // Don't send error response here as headers are already sent
        res.end();
      }
      return;
    }

    // For non-video files, return the complete file
    const chunks:any = [];
    for await (const chunk of hfs.cat(metadata.fileCid)) {
      chunks.push(chunk);
    }
    const fileBuffer = Buffer.concat(chunks);

    res.setHeader('Content-Type', metadata.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${metadata.filename}"`);
    res.setHeader('Content-Length', fileBuffer.length);
    res.send(fileBuffer);

  } catch (error) {
    console.error('File retrieval error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to retrieve file' });
    }
  }
});

// Optional: Route to get file metadata only
app.get('/api/metadata/:metadataCid', async (req, res) => {
  try {
      const helia = ipfs;
      const j = json(helia);
      const metadataCid = CID.parse(req.params.metadataCid);

      // Get file metadata from IPFS
      const metadata = await j.get(metadataCid);
      if (!metadata) {
          res.status(404).json({ error: 'File metadata not found' });
      }

      res.json(metadata);
  } catch (error) {
      console.error('Metadata retrieval error:', error);
      res.status(500).json({ error: 'Failed to retrieve metadata' });
  }
});




app.get("/api/location/:ip", async(req, res)=>{
try{
  const loc =await fetch(`http://ip-api.com/json/${req.params.ip}`)
  res.json(await loc.json())
}
catch{
res.json({info:"Something went wrong"})
}
});

app.get("/api/sysinfo", async(req, res)=>{
  const cpu = await si.cpu()
  const os = await si.osInfo()
  const disk = await si.diskLayout()
  const memory = await si.mem()
  res.json({cpu,memory, os, storage:disk})
});

app.get("/api/device/:deviceId", async(req, res)=>{
  try{
  const data:any = await getDevice(req.params.deviceId)
  const deviceData = data.result.data
  res.json(deviceData)
}
catch(e){
res.json({"info":"something went wrong"})
}
});

app.get("/api/subscribe/:topic", async(req, res)=>{
  const topic = req.params.topic
    await pubsub.subscribe(topic)
    res.json({"info":"success"})
})

app.post("/api/data", async(req, res)=>{
  if(req.body.dbaddr==null || req.body.dbaddr==''){
    res.json({"info":"dbaddr is required"})
  }
  if(req.body.dbtype==null){
    req.body.dbtype = 'documents'
  }
  if(typeof req.body.data !=="object"){
    res.json({info:"Data should be a json object"})
  }
  if(!req.body.objectType){
    res.json({info:"objectType is required"})
  }
  if(req.body.objectType==="stream" && !req.body.data.streamName){
    res.json({info:"streamName in data is required"})
  }
  const keys = Object.keys(req.body.data);
   const array = ["latitude", "longitude", "member", 'locationLabel'];
   const allInKeys = array.every(item => keys.includes(item));

  if(req.body.objectType==="geo" && !allInKeys){
  res.json({info:"data should contains longitude ,latitude, member, locationLabel"})
  }
  if(req.body.objectType==="ts" && !("value" in req.body.data)){
    res.json({info:"data should contains value"})
   }
   if(req.body.objectType==="ts" && !req.body.data.labels){
    res.json({info:"data should contains labels"})
   }
  const timestamp = Date.now()
  const dbaddr = await updateData(req.body.dbaddr, req.body.objectType ,req.body.data, req.body.sig, req.body.publicKey,timestamp,req.body.dbtype,req.body._id)
  res.json({"info":"success", "dbaddr":dbaddr})
});

app.post("/api/createdb", async(req, res)=>{

  if(req.body.dbinfo==null){
    res.json({"info":"dbinfo is required"});
  }
  try{
     if(verify(req.body.dbinfo, req.body.sig, req.body.pubkey)){
      if(req.body.dbinfo.name == null){
        res.json({info:"name is required"})
      }
      const address = await newDb(req.body.dbinfo.name,req.body.pubkey)
      res.json({dbaddr:address})
     }
  }
  catch(e){
    console.log(e)
    res.json({info:"something went wrong"})
  }
})

app.post("/api/createchatdb", async(req, res)=>{
  try{
      if(req.body.stream == null){
        res.json({info:"stream is required"})
      }
      const address = await orbitdb.open(`cyberfly-chat-${req.body.stream}`, {type:"documents", AccessController:CyberflyChatAccessController(),entryStorage})
      res.json({dbaddr:address})
  }
  catch(e){
    console.log(e)
    res.json({info:"something went wrong"})
  }
})

app.post("/api/getdata", async(req, res)=>{
  if(req.body.dbaddr==null || req.body.id==null ){
    res.json({"error":"dbaddr and id are required"})
  }
  else{
    const data = await getData(req.body.dbaddr, req.body.id);
    if(data){
      res.json(data)

    }
    else {
      res.json({info:`Data not found for this ${req.body.id} id`})
    }
  }
});


app.post("/api/dropdb", async(req, res)=>{
  if( !req.body.dbaddr || !isValidAddress(req.body.dbaddr)){
    res.json({"error":"Invalid db address"})
  }
  else{
    const db = await orbitdb.open(req.body.dbaddr, {entryStorage})
    //db.drop() //check authorization before perform this action
    res.json({info:"success"})
  }
})


app.post("/api/read", async(req, res)=>{
  if( !req.body.dbaddr || !isValidAddress(req.body.dbaddr)){
    res.json({"error":"Invalid db address"})

  }
  else{
    try{
      const data = await getAllData(req.body.dbaddr, req.body.count);
      res.json(data);
    }
    catch(e){
      console.log(e)
    }
   
  }
  
})

app.post('/api/dial', async(req, res)=>{
  if(req.body.multiAddr){
   try{
    const ma = multiaddr(req.body.multiAddr)
    const d = await libp2p.dial(ma)
    res.json({"info":"success"})
   }
   catch(e){
    console.log(e.stack)
    res.json({"info":e.toString()})
   }
  }
  else{
    res.json({"info":"multiAddr is required"})
  }
  })

  app.post('/api/findpeer', async(req, res)=>{
    if(req.body.peerId){
     try{
      const peerId = peerIdFromString(req.body.peerId)
      const peerInfo = await libp2p.peerRouting.findPeer(peerId, {maxTimeout:1000})
      res.json(peerInfo)
     }
     catch(e){
      res.json({"info":e.toString()})
     }
    }
    else{
      res.json({"info":"peerId is required"})
    }
    })

  app.post('/api/pindb', async(req, res)=>{
    const dbaddr =  req.body.dbaddr
    if(dbaddr){
      await pubsub.publish("pindb", fromString(JSON.stringify({dbaddr})))
      await orbitdb.open(dbaddr, {entryStorage})
      res.json({"info":"success"})
    }
    else{
      res.json({"info":"dbaddr is required"})
    }
  })

app.post("/api/dbinfo", async(req, res)=>{
  if(!req.body.dbaddr || !isValidAddress(req.body.dbaddr)){
    res.json({"error":"Invalid db address"})
  }
  else{
    try{
      const db = await orbitdb.open(req.body.dbaddr, {entryStorage})
    res.json({dbaddr:db.address, name:db.name});
    }
    catch(e){
  res.json({"error":"Invalid db address"})
    }
  }
})


await pubsub.subscribe("pindb");
console.log("Subscribed to pindb")
await pubsub.subscribe("fetch-latency-request");
console.log("Subscribed to fetch-latency-request")
pubsub.addEventListener("message", async(message:any)=>{
  const { topic, data, from } = message.detail

  // Handle fetch latency requests
  if(topic === 'fetch-latency-request') {
    try {
      const requestData = JSON.parse(toString(data));
      console.log('Received fetch-latency-request:', requestData);
      
      // Extract data, sig, and pubkey
      const { data: fetchData, sig, pubkey } = requestData;
      
      // Whitelist of allowed public keys
      const WHITELISTED_KEYS = [
        'efcfe1ac4de7bcb991d8b08a7d8ebed2377a6ed1070636dc66d9cdd225458aaa'
      ];
      
      const startTime = performance.now();
      
      // Verify public key is whitelisted
      if (!pubkey || !WHITELISTED_KEYS.includes(pubkey)) {
        const result = {
          status: 403,
          statusText: 'Forbidden',
          data: null,
          latency: performance.now() - startTime,
          nodeRegion: 'unknown',
          error: 'Public key not whitelisted',
          nodeId: libp2p.peerId.toString(),
        };
        await pubsub.publish('api-latency', fromString(JSON.stringify(result)));
        return;
      }
      
      // Verify signature
      if (!verify(fetchData, sig, pubkey)) {
        const result = {
          status: 403,
          statusText: 'Forbidden',
          data: null,
          latency: performance.now() - startTime,
          nodeRegion: 'unknown',
          error: 'Invalid signature',
          nodeId: libp2p.peerId.toString(),
        };
        await pubsub.publish('api-latency', fromString(JSON.stringify(result)));
        return;
      }
      
      // Get node region
      let nodeRegion = 'unknown';
      try {
        const locResponse = await fetch(`http://ip-api.com/json/`);
        const locData = await locResponse.json();
        
        const awsRegionMap: { [key: string]: string } = {
          'US': 'us-east-1',
          'CA': 'ca-central-1',
          'BR': 'sa-east-1',
          'IE': 'eu-west-1',
          'GB': 'eu-west-2',
          'FR': 'eu-west-3',
          'DE': 'eu-central-1',
          'IT': 'eu-south-1',
          'ES': 'eu-south-2',
          'SE': 'eu-north-1',
          'CH': 'eu-central-2',
          'AE': 'me-south-1',
          'IL': 'il-central-1',
          'IN': 'ap-south-1',
          'SG': 'ap-southeast-1',
          'ID': 'ap-southeast-3',
          'MY': 'ap-southeast-5',
          'TH': 'ap-southeast-2',
          'JP': 'ap-northeast-1',
          'KR': 'ap-northeast-2',
          'CN': 'cn-north-1',
          'HK': 'ap-east-1',
          'AU': 'ap-southeast-2',
          'NZ': 'ap-southeast-4',
          'ZA': 'af-south-1',
        };
        
        if (locData.countryCode) {
          nodeRegion = awsRegionMap[locData.countryCode] || `${locData.countryCode.toLowerCase()}-region-1`;
        }
      } catch (locError) {
        console.error('Error getting node location:', locError);
      }
      
      // Perform the fetch
      const method = fetchData.method.toUpperCase();
      const fetchOptions: RequestInit = {
        method: method,
      };
      
      // Add headers if provided
      if (fetchData.headers && fetchData.headers.length > 0) {
        const headersObj: { [key: string]: string } = {};
        fetchData.headers.forEach((header: { key: string; value: string }) => {
          headersObj[header.key] = header.value;
        });
        fetchOptions.headers = headersObj;
      }
      
      // Add body if provided
      if (fetchData.body && (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE')) {
        fetchOptions.body = fetchData.body;
      }
      
      // Perform the fetch and measure latency
      const fetchStartTime = performance.now();
      const response = await fetch(fetchData.url, fetchOptions);
      const fetchEndTime = performance.now();
      const latency = fetchEndTime - fetchStartTime;
      
      // Parse response
      let responseData;
      const contentType = response.headers.get('content-type');
      try {
        if (contentType && contentType.includes('application/json')) {
          responseData = await response.json();
        } else {
          const textData = await response.text();
          responseData = { text: textData };
        }
      } catch (parseError) {
        responseData = { raw: await response.text() };
      }
      
      // Publish result to api-latency topic
      const result = {
        status: response.status,
        statusText: response.statusText,
        data: responseData,
        latency: latency,
        nodeRegion: nodeRegion,
        nodeId: libp2p.peerId.toString(),
        error: null,
      };
      
      await pubsub.publish('api-latency', fromString(JSON.stringify(result)));
      console.log('Published api-latency result:', { status: result.status, latency: result.latency, nodeRegion: result.nodeRegion });
      
    } catch (error: any) {
      console.error('Error processing fetch-latency-request:', error);
      const result = {
        status: 0,
        statusText: 'Error',
        data: null,
        latency: 0,
        nodeRegion: 'unknown',
        nodeId: libp2p.peerId.toString(),
        error: error.message || 'Failed to process request',
      };
      await pubsub.publish('api-latency', fromString(JSON.stringify(result)));
    }
    return;
  }

  if(topic=='pindb' && from.toString()!==libp2p.peerId.toString()){
    try{
    let dat = JSON.parse(toString(data))
    if(typeof dat == "string"){
      dat = JSON.parse(dat)
    }
    const addr = OrbitDBAddress(dat.dbaddr)
    const manifest = await manifestStore.get(addr.hash)
    if(manifest.accessController.includes('cyberfly')){
    await orbitdb.open(dat.dbaddr, {entryStorage})
    }
  }
  catch(e) {
   console.log(e)
  }
  }
  
  // Bridge libp2p messages to MQTT (with loop prevention)
  if(!topic.includes("_peer-discovery") && !topic.includes("dbupdate") && !isValidAddress(topic)){
    if (!BRIDGE_CONFIG.ENABLE_MQTT_BRIDGE) return;
    
    try {
      bridgeMetrics.libp2p.messagesReceived++;
      
      // Check circuit breaker
      if (!checkCircuitBreaker('libp2p')) {
        logMessage('warn', 'libp2p bridge circuit breaker open, dropping message', { topic });
        bridgeMetrics.libp2p.messagesFailed++;
        return;
      }
      
      const messageStr = toString(data);
      let messageData;
      
      try {
        messageData = JSON.parse(messageStr);
      } catch {
        messageData = messageStr;
      }
      
      // Check if this is a bridge message
      let actualData = messageData;
      let origin = 'unknown';
      let broker = null;
      
      if (messageData && typeof messageData === 'object' && messageData.__origin) {
        origin = messageData.__origin;
        broker = messageData.__broker;
        actualData = messageData.data;
        
        // Skip if message originated from THIS node's MQTT broker
        // (prevents local MQTT clients from receiving duplicates)
        if (origin === 'mqtt' && broker === libp2p.peerId.toString()) {
          bridgeMetrics.loopsPrevented++;
          logMessage('debug', 'Skipped message from own MQTT broker', { topic, broker });
          return;
        }
      }
      
      // Validate message
      const validation = validateMessage(topic, actualData);
      if (!validation.valid) {
        logMessage('debug', 'Message validation failed', { topic, reason: validation.reason });
        bridgeMetrics.libp2p.messagesFailed++;
        return;
      }
      
      // Send clean data to MQTT clients (no bridge metadata)
      const mqttPayload = typeof actualData === 'object' ? JSON.stringify(actualData) : actualData;
      
      // Track this message hash to prevent loop
      const messageHash = getMessageHash(topic, actualData);
      
      // Only publish if we haven't recently published this exact message
      if (!recentlyPublished.has(messageHash)) {
        recentlyPublished.add(messageHash);
        
        // Remove from tracking after TTL
        setTimeout(() => {
          recentlyPublished.delete(messageHash);
        }, BRIDGE_CONFIG.RECENT_MESSAGE_TTL);
        
        mqtt_client.publish(topic, mqttPayload, {qos: BRIDGE_CONFIG.MQTT_QOS, retain:false}, (error)=>{
          if(error){
            const errorMsg = error?.message || String(error);
            bridgeMetrics.libp2p.messagesFailed++;
            bridgeMetrics.libp2p.lastError = errorMsg;
            bridgeMetrics.libp2p.lastErrorTime = Date.now();
            recordCircuitBreakerFailure('libp2p');
            logMessage('error', 'MQTT publish error', { topic, error: errorMsg });
          } else {
            bridgeMetrics.libp2p.messagesPublished++;
            recordCircuitBreakerSuccess('libp2p');
            logMessage('debug', 'libp2p → MQTT bridged', { topic, size: Buffer.byteLength(mqttPayload) });
          }
        });
      } else {
        bridgeMetrics.libp2p.duplicatesDropped++;
        bridgeMetrics.loopsPrevented++;
        logMessage('debug', 'Duplicate message dropped (loop prevention)', { topic });
      }
      
      // Bridge to Socket.io clients (integrated to avoid duplicate handlers)
      if (BRIDGE_CONFIG.ENABLE_SOCKET_BRIDGE) {
        try {
          // Check if any Socket.io clients are subscribed to this topic
          const hasSubscribers = Object.values(subscribedSockets).some(
            (topics) => (topics as Set<string>).has(topic)
          );
          
          if (hasSubscribers) {
            bridgeMetrics.socket.messagesReceived++;
            
            // Broadcast to all sockets subscribed to this topic
            let broadcastCount = 0;
            for (const [socketId, topics] of Object.entries(subscribedSockets)) {
              if ((topics as Set<string>).has(topic)) {
                io.to(socketId).emit("onmessage", { 
                  topic: topic, 
                  message: actualData
                });
                broadcastCount++;
              }
            }
            
            if (broadcastCount > 0) {
              bridgeMetrics.socket.messagesBroadcast += broadcastCount;
              logMessage('debug', 'Message broadcast to sockets', { topic, recipients: broadcastCount });
            }
          }
        } catch (error: any) {
          const errorMsg = error?.message || String(error);
          bridgeMetrics.socket.messagesFailed++;
          bridgeMetrics.socket.lastError = errorMsg;
          bridgeMetrics.socket.lastErrorTime = Date.now();
          logMessage('error', 'Error broadcasting to sockets', { topic, error: errorMsg });
        }
      }
      
    } catch (error: any) {
      const errorMsg = error?.message || String(error);
      bridgeMetrics.libp2p.messagesFailed++;
      bridgeMetrics.libp2p.lastError = errorMsg;
      bridgeMetrics.libp2p.lastErrorTime = Date.now();
      recordCircuitBreakerFailure('libp2p');
      logMessage('error', 'Error bridging libp2p to MQTT', { topic, error: errorMsg });
    }
  }
})

const subscribedSockets = {}; // Keep track of subscribed channels for each socket
const deviceSockets = {}; // Store user sockets

// NOTE: Socket.io broadcasting is integrated into the main pubsub listener above
// to avoid duplicate event handlers and ensure metrics accuracy

app.get('/api/onlinedevices', async(req, res)=>{
  const onlineusers = Object.keys(deviceSockets)
   res.json(onlineusers)
});
io.on("connection", (socket) => {
  socket.on('online', (account) => {
    try{
      deviceSockets[account] = socket; // Associate the socket with the account
    io.emit('onlineDevices', Object.keys(deviceSockets));
    }
    catch(e){
      console.log(e)
    }
  });

  socket.on("subscribe", async (topic) => {
    try{
      if (!subscribedSockets[socket.id]) {
        subscribedSockets[socket.id] = new Set();
      }
      
      // Check if already subscribed
      if (subscribedSockets[socket.id].has(topic)) {
        console.log(`Socket ${socket.id} already subscribed to ${topic}`);
        return;
      }
      
      subscribedSockets[socket.id].add(topic);
      
      // Only subscribe to pubsub/mqtt if no other socket is subscribed to this topic
      const isFirstSubscriber = !Object.values(subscribedSockets).some((topics, idx) => 
        idx !== Object.keys(subscribedSockets).indexOf(socket.id) && 
        (topics as Set<string>).has(topic)
      );
      
      if (isFirstSubscriber) {
        await pubsub.subscribe(topic);
        mqtt_client.subscribe([topic], ()=>{
          console.log(`Subscribed to topic '${topic}'`);
        });
      }
      
      console.log(`Socket ${socket.id} subscribed to ${topic}`);
    }
    catch(e){
      console.log(e)
    }
  });

  socket.on("unsubscribe", async (topic) => {
    try{
      if (subscribedSockets[socket.id]) {
        subscribedSockets[socket.id].delete(topic);
        if (subscribedSockets[socket.id].size === 0) {
          delete subscribedSockets[socket.id];
        }
        
        // Check if any other socket is still subscribed to this topic
        const hasOtherSubscribers = Object.values(subscribedSockets).some(
          (topics) => (topics as Set<string>).has(topic)
        );
        
        // Only unsubscribe from pubsub/mqtt if no other socket is subscribed
        if (!hasOtherSubscribers) {
          pubsub.unsubscribe(topic);
          mqtt_client.unsubscribe([topic], ()=>{
            console.log(`Unsubscribed from topic '${topic}'`);
          });
        }
        
        console.log(`Socket ${socket.id} unsubscribed from ${topic}`);
      }
    }
    catch(e){
      console.log(e)
    }
  });
  socket.on("publish", async(data)=>{
    try{
      const { topic, message } = data
      // Wrap client message with bridge metadata (transparent to client)
      const bridgeMessage = {
        __origin: 'socket',
        __timestamp: Date.now(),
        data: message
      };
      await pubsub.publish(topic, fromString(JSON.stringify(bridgeMessage)));
    }
    catch(e){
      console.log(e)
    }
  })

  socket.on("send message", async(data)=>{
    try{
    const {receiver,stream, message} = data
    const msg = JSON.parse(message)
    const from_account = msg.data['fromAccount']
    const public_key = from_account.slice(2)
    if(stream===getStreamName(public_key, receiver) && public_key===msg.publicKey && verifyMsg(msg)){
      const db = await orbitdb.open(`cyberfly-chat-${stream}`, {type:"documents", AccessController:CyberflyChatAccessController(),entryStorage})
      await db.put({_id:nanoid(), data:msg.data, sig:msg.sig,publicKey:msg.publicKey, timestamp: Date.now(), objectType:"stream"})
      await pubsub.publish(receiver, fromString(JSON.stringify(msg)))
    }
    }
catch(err){console.log(err)}
  })

  socket.on("disconnect", () => {

    if (subscribedSockets[socket.id]) {
      delete subscribedSockets[socket.id];
    }

    const disconnectedAccount = Object.keys(deviceSockets).find(
      (account) => deviceSockets[account] === socket
    );
    if (disconnectedAccount) {
      delete deviceSockets[disconnectedAccount];
      io.emit('onlineDevices', Object.keys(deviceSockets));
    }
  });
});


// Proxy balance endpoint
app.get('/api/balance/:account', async (req, res) => {
  const account = req.params.account;
  if (!account) {
    return res.status(400).json({ error: 'account is required' });
  }

  // Keep colon unencoded to match upstream path format (encode other chars)
  const safeAccount = encodeURIComponent(account).replace(/%3A/g, ':');
  const url = `https://backend-kda.euclabs.net/indexer/v1/account/${safeAccount}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const upstream = await fetch(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: 'Upstream error',
        status: upstream.status,
      });
    }

    const data = await upstream.json();
    return res.json(data);
  } catch (err: any) {
    clearTimeout(timer);
    const aborted = err?.name === 'AbortError';
    return res.status(502).json({
      error: aborted ? 'Upstream timeout' : 'Failed to fetch upstream',
      detail: String(err)
    });
  }
});



server.listen(port,()=>{
    console.log(`OrbitDb node api on port ${port}`)
})