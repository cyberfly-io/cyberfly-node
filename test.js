import { getSig } from "./utils.js"
import { io } from "socket.io-client";

const socket = io("https://node.cyberfly.io");
socket.on("connect",()=>{
console.log("Socket Connected")
})
function randomIntFromInterval(min, max) { 
    return Math.floor(Math.random() * (max - min + 1) + min)
  }
  const keypair = {"publicKey": "94faf73efcd9af950d4dbca3e5c65459221377b6ea31e3ed30112939a5c79aa8",
    "secretKey": "15756809a14b846680f2254b292e6015c4b446f37230bd0669159752521729fa"}
  
    function generateRandomCoordinates() {
      const latitude = (Math.random() * 180 - 90).toFixed(6); // Latitude ranges from -90 to 90
      const longitude = (Math.random() * 360 - 180).toFixed(6); // Longitude ranges from -180 to 180
      return { latitude: parseFloat(latitude), longitude: parseFloat(longitude) };
  }
const dbaddr = "/orbitdb/zdpuAyBgp2MYritN8ebpmsaXk2sF4oYgYNrqRzMSRWN7BpfVL"
//going to test data replication across nodes
//store data to localnode and check on other nodes
const postdata = async (i)=>{


const randomCoordinates = generateRandomCoordinates();
const data = {locationLabel:"mylands", longitude:randomCoordinates.longitude,
               latitude:randomCoordinates.latitude, member:"abu house"
}


const sortedJsondata = Object.keys(data)
    .sort() // Sort the keys
    .reduce((obj, key) => {
        obj[key] = data[key]; // Build a new sorted object
        return obj;
    }, {});

const sig = getSig(sortedJsondata, keypair);

console.log(sig)
console.log(data)
const body = {dbaddr: dbaddr, objectType:"geo" ,sig:sig, data:sortedJsondata, publicKey:keypair['publicKey']}

const remote = "https://node.cyberfly.io/api/data"
const local = "http://localhost:31003/api/data"
const remote2 = "https://node2.cyberfly.io/api/data"

console.log(body)
const d = await fetch(remote, {method:'POST', body:JSON.stringify(body), headers: {
    'Content-Type': 'application/json',
    'Accept':'application/json'
  },});
  const j = await d.json()
  console.log(j)
}

await postdata(1)
/*var c = 0
while(c<100){
  const start = Date.now();

await postdata(c+1);
const end = Date.now();
console.log(`Execution time: ${end - start} ms`);
c++
}*/

socket.emit("publish",{topic:"dbupdate", message:JSON.stringify({dbaddr})})