import {isValidAddress, useAccessController  } from '@orbitdb/core'
import CyberflyAccessController from './cyberfly-access-controller.js'
import { nanoid } from 'nanoid'
import http from "http";
import cors from 'cors';
import { Server } from "socket.io";
import { startOrbitDB } from './db-service.js';
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
import { ComposedStorage, IPFSBlockStorage } from '@orbitdb/core';
import { RedisStorage } from './redis-storage.js';
import multer from 'multer';
import { unixfs } from '@helia/unixfs';
import { promises as fsPromises } from 'fs';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { json } from '@helia/json';
import { CID } from 'multiformats/cid'
import path from 'path';
import { graphqlHTTP } from 'express-graphql';
import { schema, resolvers } from './graphql.js';
import { ruruHTML } from 'ruru/server';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    cb(null, tempDir);
  },
  filename: function (req, file, cb) {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ storage: storage });

// Store file metadata temporarily
const fileMetadata = new Map();

const mqttUrl = process.env.MQTT_HOST || 'mqtt://localhost';
const redis_ip = process.env.REDIS_HOST || '127.0.0.1';



const mqtt_port = 1883
const redis_port = 6379

const mqtt_host = `${mqttUrl}:${mqtt_port}`
const redis_host = `${redis_ip}:${redis_port}`


const clientId = `mqtt_${Math.random().toString(16).slice(3)}`
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

config();
useAccessController(CyberflyAccessController)
const node_priv_key = process.env.NODE_PRIV_KEY
const nodeConfig = await startOrbitDB({sk:node_priv_key})
const orbitdb = nodeConfig.orbitdb
const ipfs = orbitdb.ipfs
const libp2p = await orbitdb.ipfs.libp2p
const manifestStore = await ManifestStore({ ipfs })

const pubsub = orbitdb.ipfs.libp2p.services.pubsub
const account = process.env.KADENA_ACCOUNT
// Print out listening addresses
console.log('libp2p listening on addresses:');
libp2p.getMultiaddrs().forEach((addr) => {
  console.log(addr.toString());
});
if(!account){
  console.log("KADENA_ACCOUNT environment variable is required")
  process.exit(1)
}


const entryStorage =  await ComposedStorage(
  await RedisStorage({redis_host}),
  await IPFSBlockStorage({ ipfs, pin: true })
)

mqtt_client.on('message', async(topic, payload) => {

  if(!payload.toString().startsWith('"'))
     {
    await pubsub.publish(topic, fromString(JSON.stringify(payload.toString())))
  }
})

const port = 31003;
const discovered = []
addNodeToContract(libp2p.peerId.toString(),libp2p.getMultiaddrs()[0].toString(),account,nodeConfig.kadenaPub, nodeConfig.kadenaSec)

libp2p.addEventListener('peer:discovery', (evt) => {
  const peerInfo = evt.detail
  if (!discovered.includes(peerInfo.id.toString())) {
    discovered.push(peerInfo.id.toString());
}

  //console.log('Discovered:', peerInfo.id.toString())
  //console.log(peerInfo)
})

const updateData = async (addr, data, sig, pubkey, dbtype, key='', id='')=>{
   
    try{
      let _id
      const db = await orbitdb.open(addr, {type:dbtype, AccessController:CyberflyAccessController(), entryStorage})
      if(id==''){
         _id = nanoid()
      }
      else{
       _id = id
      }
      if(dbtype=='events'){
        await db.add({publicKey:pubkey, data:data, sig:sig});
      }
      else if(dbtype=='keyvalue'){
        await db.put(key,{publicKey:pubkey, data:data, sig:sig});
      }
      else{
        await db.put({_id:_id, publicKey:pubkey, data:data, sig:sig});
      }
      const msg = {dbAddr:db.address}
      // we want the data should be replicated on all the nodes irrespective of the db open or not in a specific node
      //pubsub.publish("dbupdate", fromString(JSON.stringify(msg))); 
      return msg.dbAddr
    }
    catch(e) {
     console.log(msg)
     console.log(e)
     return "something went wrong"
    }
}

const newDb = async (name, pubkey, dbtype)=>{
  const db = await orbitdb.open(`cyberfly-${pubkey}-${name}-${dbtype}`, {type:dbtype, AccessController:CyberflyAccessController(), entryStorage})
  const addr = db.address
  return addr
}

const getAllData = async (dbaddress, amount=40)=>{
  try{
    const db = await orbitdb.open(dbaddress, {entryStorage});
    const values = []
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


const getData = async (dbaddress, key)=>{
  try{
    const db = await orbitdb.open(dbaddress, {entryStorage});
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
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204
};
const app = express();
app.use(cors(corsOptions));
app.use(express.json());

app.use('/graphql', (req, res, next) => {
  // Check if the request accepts JSON (GraphQL clients)
  if (req.headers.accept?.includes('application/json') || 
      req.headers['content-type']?.includes('application/json')) {
    return graphqlHTTP({
      schema,
      rootValue: resolvers,
      graphiql: true
    })(req, res, next);
  }
  
  // Otherwise serve Ruru HTML interface
  res.type('html');
  res.end(ruruHTML({ endpoint: '/graphql' }));
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




app.get("/api", async(req, res)=>{
  const peerId = libp2p.peerId
  const peers = libp2p.getPeers()
  console.log(peers)

  const conn = libp2p.getConnections()
  const filteredConn = removeDuplicateConnections(conn.filter(obj => obj.status==="open"));
  const info = {peerId:peerId, health:"ok", version:"0.1.2", 
  multiAddr:libp2p.getMultiaddrs()[0].toString(), 
  publicKey:nodeConfig.kadenaPub,discovered:discovered.length, 
  connected:filteredConn.length, peers:peers, account:account, 
  connections:extractFields(filteredConn, 'remotePeer', 'remoteAddr')
}
  res.json(info)
});

// Chunk upload endpoint
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
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
        tempPath: req.file.path
      });
    }

    // Move chunk to chunks directory
    const chunkPath = path.join(chunksDir, `chunk${chunkIndex}`);
    await fsPromises.rename(req.file.path, chunkPath);

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
    const metadata = fileMetadata.get(fileName);

    if (!metadata) {
      return res.status(400).json({ error: 'No upload in progress for this file' });
    }

    // Verify all chunks are present
    if (metadata.chunks.size !== parseInt(totalChunks)) {
      return res.status(400).json({ 
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
    const metadata = await j.get(metadataCid);
    if (!metadata) {
      return res.status(404).json({ error: 'File metadata not found' });
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
    const chunks = [];
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
          return res.status(404).json({ error: 'File metadata not found' });
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
  const data = await getDevice(req.params.deviceId)
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
  if(req.body.dbaddr==null){
    res.json({"info":"dbaddr is required"})
  }
  if(req.body.dbtype==null){
    req.body.dbtype = 'documents'
  }
  if(req.body.dbtype=='keyvalue' && !req.body.key){
    res.send("Need key for keyvalue store")
  }
  else if (req.body.dbtype=='keyvalue' && req.body.key){
    const dbaddr = await updateData(req.body.dbaddr, req.body.data, req.body.sig, req.body.publicKey, req.body.dbtype, req.body.key)
   res.json({"info":"success", "dbAddr":dbaddr})
  }
  else{
    const dbaddr = await updateData(req.body.dbaddr,req.body.data, req.body.sig, req.body.publicKey, req.body.dbtype,'',req.body._id)
    res.json({"info":"success", "dbAddr":dbaddr})
  }

});

app.post("/api/createdb", async(req, res)=>{

  if(req.body.dbinfo==null){
    res.json({"info":"dbinfo is required"});
  }

  try{
     if(verify(req.body.dbinfo, req.body.sig, req.body.pubkey)){
      if(req.body.dbinfo.dbtype == null || req.body.dbinfo.name == null){
        res.json({info:"dbtype and name are required"})
      }
      const address = await newDb(req.body.dbinfo.name,req.body.pubkey, req.body.dbinfo.dbtype)
      res.json({dbaddress:address})
     }
  }
  catch(e){
    console.log(e)
    res.json({info:"something went wrong"})
  }
})

app.post("/api/getdata", async(req, res)=>{
  if(req.body.dbaddress==null || req.body.key==null ){
    res.json({"error":"dbaddress and key are required"})
  }
  else{
    const data = await getData(req.body.dbaddress, req.body.key);
    if(data){
      res.json(data)

    }
    else {
      res.json({info:"Data not found for key"})
    }
  }

});


app.post("/api/dropdb", async(req, res)=>{

  if( !req.body.dbaddress || !isValidAddress(req.body.dbaddress)){
    res.json({"error":"Invalid db address"})

  }
  else{
    const db = await orbitdb.open(req.body.dbaddress, {entryStorage})
    db.drop() //check authorization before perform this action
    res.json({info:"success"})
  }
})


app.post("/api/read", async(req, res)=>{
  if( !req.body.dbaddress || !isValidAddress(req.body.dbaddress)){
    res.json({"error":"Invalid db address"})

  }
  else{
    try{
      const data = await getAllData(req.body.dbaddress, req.body.count);
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
    console.log(e)
    res.json({"info":"Failed to dial"})
   }
  }
  else{
    res.json({"info":"multiAddr is required"})
  }
  })

app.post("/api/dbinfo", async(req, res)=>{
  if(!req.body.dbaddress || !isValidAddress(req.body.dbaddress)){
    res.json({"error":"Invalid db address"})
  }
  else{
    try{
      const db = await orbitdb.open(req.body.dbaddress, {entryStorage})
      const dbinfo = db
    res.json({dbaddress:dbinfo.address, name:dbinfo.name});
    }
    catch(e){
  res.json({"error":"Invalid db address"})
    }
  }
})


await pubsub.subscribe("dbupdate");



pubsub.addEventListener("message", async(message)=>{
  const { topic, data, from } = message.detail
  if(topic=='dbupdate' && from.toString()!==libp2p.peerId.toString()){
    try{
    console.log(from.toString())
    let dat = JSON.parse(toString(data))

    if(typeof dat == "string"){
      dat = JSON.parse(dat)
    }
    const addr = OrbitDBAddress(dat.dbAddr)
    const manifest = await manifestStore.get(addr.hash)
    if(manifest.accessController==="/cyberfly/access-controller"){
      const db = await orbitdb.open(dat.dbAddr, {entryStorage})
    }
  }
  catch(e) {
   console.log(e)
  }
  }
  if(!topic.includes("_peer-discovery") && !topic.includes("dbupdate") && !isValidAddress(topic)){
    mqtt_client.publish(topic, toString(data), {qos:0, retain:false}, (error)=>{
      if(error){
        console.log("mqtt_error")
        console.log(error)
      }
    })

  }
})

const subscribedSockets = {}; // Keep track of subscribed channels for each socket
const deviceSockets = {}; // Store user sockets

app.get('/api/onlinedevices', async(req, res)=>{
  const onlineusers = Object.keys(deviceSockets)
   res.json(onlineusers)
});
io.on("connection", (socket) => {
  socket.on('online', (account) => {
    try{
      userSockets[account] = socket; // Associate the socket with the account
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
      subscribedSockets[socket.id].add(topic);
      
      pubsub.addEventListener('message', async (message) => {
        const { topic, data } = message.detail
        if (subscribedSockets[socket.id]?.has(topic)) { // Check if the socket is subscribed to the topic
          io.to(socket.id).emit("onmessage", { topic: topic, message: toString(data) });
        }
      })
      await pubsub.subscribe(topic)
      mqtt_client.subscribe([topic], ()=>{
        console.log(`Subscribed to topic '${topic}'`)
      })
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
    }
  }
  catch(e){
    console.log(e)
  }
  });
  socket.on("publish", async(data)=>{
    try{
      const { topic, message } = data
      await pubsub.publish(topic, fromString(JSON.stringify(message)));
    }
    catch(e){
      console.log(e)
    }
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



server.listen(port,()=>{
    console.log(`OrbitDb node api on port ${port}`)
})