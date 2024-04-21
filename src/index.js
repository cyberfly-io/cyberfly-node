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
import { addNodeToContract} from './config/utils.js'
import si from 'systeminformation'
import { multiaddr } from '@multiformats/multiaddr'
import mqtt from 'mqtt';

const mqttUrl = "mqtt://localhost:1883"
const clientId = `mqtt_${Math.random().toString(16).slice(3)}`
const mqtt_client = mqtt.connect(mqttUrl, {
  clientId,
  clean: true,
  connectTimeout: 4000,
  reconnectPeriod: 1000,
})
mqtt_client.on('connect', () => {
  console.log('Mqtt connection Established')
})

config();
useAccessController(CyberflyAccessController)
const nodeConfig = await startOrbitDB()
const orbitdb = nodeConfig.orbitdb
const libp2p = await orbitdb.ipfs.libp2p
const pubsub = orbitdb.ipfs.libp2p.services.pubsub
const account = process.env.KADENA_ACCOUNT
if(!account){
  console.log("KADENA_ACCOUNT environment variable is required")
  process.exit(1)
}


mqtt_client.on('message', async(topic, payload) => {
  await pubsub.publish(topic, fromString(JSON.stringify(payload)))
})

const port = 31003;
const discovered = []
const connected = []
addNodeToContract(libp2p.peerId.toString(),libp2p.getMultiaddrs()[0].toString(),account,nodeConfig.kadenaPub, nodeConfig.kadenaSec)
libp2p.addEventListener('peer:connect', (evt) => {
  const peerId = evt.detail
  console.log(peerId)
  connected.push(peerId.toString())
  console.log('Connection established to:', peerId.toString()) // Emitted when a peer has been found
})

libp2p.addEventListener('peer:discovery', (evt) => {
  const peerInfo = evt.detail
  discovered.push(peerInfo.id.toString())
  console.log('Discovered:', peerInfo.id.toString())
  console.log(peerInfo)
})

libp2p.addEventListener('peer:disconnect', (evt) => {
  const peerId = evt.detail
  const index = connected.indexOf(peerId.toString())
  if (index !== -1) {
    connected.splice(index, 1)
    console.log('Disconnected from peer:', peerId.toString())
  }
})


const updateData = async (data, sig, pubkey, dbtype, key='')=>{
   
    try{
      const db = await orbitdb.open(`cyberfly-${pubkey}-${dbtype}`, {type:dbtype, AccessController:CyberflyAccessController(), })
      var id = nanoid()
      if(dbtype=='events'){
        await db.add({publicKey:pubkey, data:data, sig:sig});
      }
      else if(dbtype=='keyvalue'){
        await db.put(key,{publicKey:pubkey, data:data, sig:sig});
      }
      else{
        await db.put({_id:id, publicKey:pubkey, data:data, sig:sig});
      }
      const msg = {dbAddr:db.address}
      pubsub.publish("dbupdate", fromString(JSON.stringify(msg)));
      return db.address
      
    }
    catch(e) {
     console.log(e)
     return "something went wrong"
    }
}

const getAllData = async (dbaddress)=>{
  try{
    const db = await orbitdb.open(dbaddress);
    return await db.all();
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

const app = express();
app.use(cors());
app.use(express.json());
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

app.get("/", async(req, res)=>{
  const peerId = libp2p.peerId
  const con = libp2p.getPeers()
  const info = {peerId:peerId, health:"ok", version:"0.1", 
  multiAddr:libp2p.getMultiaddrs()[0].toString(), 
  publicKey:nodeConfig.kadenaPub,discovered:discovered.length, connected:con.length, peers:con}
  res.json(info)
});

app.get("/sysinfo", async(req, res)=>{
  const cpu = await si.cpu()
  const os = await si.osInfo()
  const disk = await si.diskLayout()
  const memory = await si.mem()
  res.json({cpu:cpu, memory:memory, os:os, storage:disk})
});

app.post("/data", async(req, res)=>{
  if(req.body.dbtype==null){
    req.body.dbtype = 'documents'
  }
  if(req.body.dbtype=='keyvalue' && !req.body.key){
    res.send("Need key for keyvalue store")
  }
  else if (req.body.dbtype=='keyvalue' && req.body.key){
    const dbaddr = await updateData(req.body.data, req.body.sig, req.body.publicKey, req.body.dbtype, req.body.key)
   res.json({"info":"success", "dbAddr":dbaddr})
  }
  else{
    const dbaddr = await updateData(req.body.data, req.body.sig, req.body.publicKey, req.body.dbtype)
    res.json({"info":"success", "dbAddr":dbaddr})
  }

});

app.post("/getdata", async(req, res)=>{
  if(req.body.dbaddress==null || req.body.key==null ){
    res.json({"error":"dbaddress and key is required"})
  }
  else{
    const data = await getData(req.body.dbaddress, req.body.key);
    res.json(data)
  }

});

app.post("/read", async(req, res)=>{
  if( !req.body.dbaddress || !isValidAddress(req.body.dbaddress)){
    res.json({"error":"Invalid db address"})

  }
  else{
    try{
      const data = await getAllData(req.body.dbaddress);
      res.json(data);
    }
    catch(e){
      console.log(e)
    }
   
  }
  
})

app.post('/dial', async(req, res)=>{
  if(req.body.multiAddr){
   try{
    const ma = multiaddr(req.body.multiAddr)
    const d = await libp2p.dial(ma)
    console.log(d)
    res.json({"info":"success"})
   }
   catch{
    res.json({"info":"Failed to dial"})
   }
  }
  else{
    res.json({"info":"multiAddr is required"})
  }
  })

app.post("/dbinfo", async(req, res)=>{
  if(!req.body.dbaddress || !isValidAddress(req.body.dbaddress)){
    res.json({"error":"Invalid db address"})
  }
  else{
    try{
      const dbinfo = await orbitdb.open(req.body.dbaddress)
      
    res.json({dbaddress:dbinfo.address, name:dbinfo.name});
    }
    catch(e){
  console.log(e)
  res.json({"error":"Invalid db address"})
    }
  }

})


await pubsub.subscribe("dbupdate");

pubsub.addEventListener("message", async(message)=>{
  const { topic, data } = message.detail
  if(topic=='dbupdate'){
    try{
    const dat = JSON.parse(toString(data))
    await orbitdb.open(dat.dbAddr)
  }
  catch(e) {
   console.log(e)
  }
  }
})

const subscribedSockets = {}; // Keep track of subscribed channels for each socket
const deviceSockets = {}; // Store user sockets

app.get('/chat/onlinedevices', async(req, res)=>{
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
      mqtt_client.publish(topic, JSON.stringify(message), {qos:0, retain:false}, (error)=>{
        if(error){
          console.log("mqtt_error")
          console.log(error)
        }
      })
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