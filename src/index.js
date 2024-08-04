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
import { addNodeToContract, extractFields, getDevice, verify} from './config/utils.js'
import si from 'systeminformation'
import { multiaddr } from '@multiformats/multiaddr'
import mqtt from 'mqtt';
import ManifestStore from '@orbitdb/core/src/manifest-store.js'
import { OrbitDBAddress } from '@orbitdb/core/src/orbitdb.js';


const mqttUrl = process.env.MQTT_HOST || 'mqtt://localhost';


const mqtt_port = 1883
const mqtt_host = `${mqttUrl}:${mqtt_port}`
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
const nodeConfig = await startOrbitDB()
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

  console.log('Discovered:', peerInfo.id.toString())
  console.log(peerInfo)
})

const updateData = async (addr, data, sig, pubkey, dbtype, key='', id='')=>{
   
    try{
      console.log(id)
      let _id
      const db = await orbitdb.open(addr, {type:dbtype, AccessController:CyberflyAccessController()})
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
      //pubsub.publish("dbupdate", fromString(JSON.stringify(msg)));
      db.close()
      return msg.dbAddr
    }
    catch(e) {
     console.log(e)
     return "something went wrong"
    }
}

const newDb = async (name, pubkey, dbtype)=>{
  const db = await orbitdb.open(`cyberfly-${pubkey}-${name}-${dbtype}`, {type:dbtype, AccessController:CyberflyAccessController()})
  return db.address
}

const getAllData = async (dbaddress, amount=20)=>{
  try{
    const db = await orbitdb.open(dbaddress);
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
    const db = await orbitdb.open(dbaddress);
    return await db.get(key);
  }
   catch(e){
    console.log(e)
    return []
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
  const filteredConn = conn.filter(obj => obj.status==="open");
  const info = {peerId:peerId, health:"ok", version:"0.1.2", 
  multiAddr:libp2p.getMultiaddrs()[0].toString(), 
  publicKey:nodeConfig.kadenaPub,discovered:discovered.length, 
  connected:filteredConn.length, peers:peers, account:account, 
  connections:extractFields(filteredConn, 'remotePeer', 'remoteAddr')
}
  res.json(info)
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
    res.json(data)
  }

});

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
      const dbinfo = await orbitdb.open(req.body.dbaddress)
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
      console.log(data)
    let dat = JSON.parse(toString(data))
    if(typeof dat == "string"){
      dat = JSON.parse(dat)
    }
    const addr = OrbitDBAddress(dat.dbAddr)
    const manifest = await manifestStore.get(addr.hash)
    console.log(manifest)
    await orbitdb.open(dat.dbAddr)
  }
  catch(e) {
   console.log(e)
  }
  }
  if(!topic.includes("_peer-discovery") && !topic.includes("dbupdate")){
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