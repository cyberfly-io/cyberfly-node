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
import { ruruHTML, defaultHTMLParts } from 'ruru/server';
import { nodeConfig, entryStorage, updateData, discovered } from './custom-entry-storage.js';
import CyberflyChatAccessController from './cyberfly-chat-access-control.js';
import { getStreamName, verifyMsg } from './utils.js';
import { nanoid } from 'nanoid'
import { peerIdFromString } from '@libp2p/peer-id'
import { VERSION } from './version.js';
import { isPrivate } from '@libp2p/utils/multiaddr/is-private'



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

  if(!payload.toString().startsWith('"'))
     {
    await pubsub.publish(topic, fromString(JSON.stringify(payload.toString())))
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
  allowedHeaders: ['Content-Type', 'Authorization'],
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
   const array = ["latitude", "longitude", "member"];
   const allInKeys = array.every(item => keys.includes(item));

  if(req.body.objectType==="geo" && !allInKeys){
  res.json({info:"data should contains longitude ,latitude, member"})
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


await pubsub.subscribe("dbupdate");
console.log("Subscribed to dbupdate")
pubsub.addEventListener("message", async(message:any)=>{
  const { topic, data, from } = message.detail

  if(topic=='dbupdate' && from.toString()!==libp2p.peerId.toString()){
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

  socket.on("send message", async(receiver: string, stream:string ,message: string)=>{
    try{
    const msg = JSON.parse(message)
    const from_account = msg.data['fromAccount']
    const public_key = from_account.split(':')[1]
    if(stream===getStreamName(public_key, receiver) && public_key===msg.publicKey && verifyMsg(msg)){
      const db = await orbitdb.open(`cyberfly-chat-${stream}`, {type:"documents", AccessController:CyberflyChatAccessController(),entryStorage})
      await db.put({_id:nanoid(), data:msg.data, sig:msg.sig,publicKey:msg.publicKey, timestamp: Date.now(), objectType:"stream"})
      await libp2p.publish(receiver, JSON.stringify(msg))
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



server.listen(port,()=>{
    console.log(`OrbitDb node api on port ${port}`)
})