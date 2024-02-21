import {useAccessController  } from '@orbitdb/core'
import CyberflyAccessController from './cyberfly-access-controller.js'
import { nanoid } from 'nanoid'
import http from "http";
import cors from 'cors';
import { Server } from "socket.io";
import { startOrbitDB } from './db-service.js';





useAccessController(CyberflyAccessController)
const orbitdb = await startOrbitDB()
const pubsub = orbitdb.ipfs.libp2p.services.pubsub
import express from 'express';
const port = 3000;

const updateData = async (data, sig, pubkey)=>{
   
    try{
      const db = await orbitdb.open('cyberfly-d04bbd8f403e583248aa461896bd7518113f89b85c98f3d9596bbfbf30df0bcb', {type:'documents', AccessController:CyberflyAccessController(), })
      var id = nanoid()
      const r = await db.put({_id:id, publicKey:pubkey, data:data, sig:sig});
      console.log(db.address)
    }
    catch(e) {
     console.log(e)
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
    res.send("hello world")
});

app.post("/data", async(req, res)=>{
   await updateData(req.body.data, req.body.sig, req.body.publicKey)
   res.send("success")
});


const subscribedSockets = {}; // Keep track of subscribed channels for each socket
const deviceSockets = {}; // Store user sockets

app.get('/chat/onlinedevices', async(req, res)=>{
  const onlineusers = Object.keys(deviceSockets)
   res.json(onlineusers)
});
io.on("connection", (socket) => {
  socket.on('online', (account) => {
    userSockets[account] = socket; // Associate the socket with the account
    io.emit('onlineDevices', Object.keys(deviceSockets));
  });

  socket.on("subscribe", async (topic) => {
    if (!subscribedSockets[socket.id]) {
      subscribedSockets[socket.id] = new Set();
    }
    subscribedSockets[socket.id].add(topic);
    
    pubsub.addEventListener('message', async (message) => {
      const { topic, data } = message.detail

      if (subscribedSockets[socket.id]?.has(topic)) { // Check if the socket is subscribed to the topic
        io.to(socket.id).emit("onmessage", { topic: topic, message: data });
      }
    })
    await pubsub.subscribe(topic)
  });

  socket.on("unsubscribe", async (topic) => {
    if (subscribedSockets[socket.id]) {
      subscribedSockets[socket.id].delete(topic);
      if (subscribedSockets[socket.id].size === 0) {
        delete subscribedSockets[socket.id];
      }
    }
  });
  socket.on("publish", async(topic ,message)=>{
   await pubsub.publish(topic, message);
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