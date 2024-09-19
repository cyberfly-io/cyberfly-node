import { getSig } from "./utils.js"

function randomIntFromInterval(min, max) { 
    return Math.floor(Math.random() * (max - min + 1) + min)
  }

const keypair = {"publicKey": "d04bbd8f403e583248aa461896bd7518113f89b85c98f3d9596bbfbf30df0bcb",
"secretKey": "a0ec3175c6c80e60bc8ef18bd7b73a631c507b9f0a42c973036c7f96d21b047a"}


//going to test data replication across nodes
//store data to localnode and check on other nodes
const postdata = async ()=>{
    
const data = {"temp": randomIntFromInterval(20, 35),hello:"123 world love", "timestamp":new Date().toISOString()}

const sig = getSig(data, keypair);



const body = {dbaddr:"/orbitdb/zdpuAuK55h4CZee8dkA7sHuQSxidEWzNJcZXbWh2H713Sx15f" ,sig:sig, data:data, publicKey:keypair['publicKey']}

console.log(body)
const d = await fetch("https://node.cyberfly.io/api/data", {method:'POST', body:JSON.stringify(body), headers: {
    'Content-Type': 'application/json',
    'Accept':'application/json'
  },});
  const j = await d.json()
  console.log(j)
}

await postdata()
var c = 0
/*while(c<10){
  const start = Date.now();

await postdata();
const end = Date.now();
console.log(`Execution time: ${end - start} ms`);
c++
}*/