import { getSig } from "./utils.js"

function randomIntFromInterval(min, max) { 
    return Math.floor(Math.random() * (max - min + 1) + min)
  }

  const keypair = {"publicKey": "a8c77a2236af3053e2b6ccb09b3ef8675f621cdcb79128a8f53163a9c8ef412b",
    "secretKey": "318e20041c2301abec65a91b553d8284392e7bb1df7f7128a28422c2416e32b0"}
  


//going to test data replication across nodes
//store data to localnode and check on other nodes
const postdata = async ()=>{
    
const data = {"temp": randomIntFromInterval(20, 35), "hello": "123 world love", "timestamp":new Date().toISOString()}

const sig = getSig(data, keypair);

const body = {dbaddr:"/orbitdb/zdpuAyvZNKW7s49sCVDk2MrvMVfhE73AVxzDKDhe14poBHmBM" ,sig:sig, data:data, publicKey:keypair['publicKey']}

console.log(body)
const d = await fetch("http://localhost:31003/api/data", {method:'POST', body:JSON.stringify(body), headers: {
    'Content-Type': 'application/json',
    'Accept':'application/json'
  },});
  const j = await d.json()
  console.log(j)
}

await postdata()
/*var c = 0
while(c<10){
  const start = Date.now();

await postdata();
const end = Date.now();
console.log(`Execution time: ${end - start} ms`);
c++
}*/