import { getSig } from "./utils.js"

function randomIntFromInterval(min, max) { 
    return Math.floor(Math.random() * (max - min + 1) + min)
  }

const keypair = {"publicKey": "e98491755d82bde4c7f4fa22d6bb96d5b22a05d3d74c84ab90de836781524c63",
"secretKey": "ba0df5cd73a197011ec02d8a9939e8738be87d7807958b3ceeaacdc0bc8190e0"}


//going to test data replication across nodes
//store data to localnode and check on other nodes
const postdata = async ()=>{
    
const data = {"temp": randomIntFromInterval(20, 35),hello:"123 world love", "timestamp":new Date().toISOString()}

const sig = getSig(data, keypair);

const body = {dbaddr:"/orbitdb/zdpuAm5SknkaLJJjR3hBCLkVUCquraBCZMd9kaJ3z3kdA35un" ,sig:sig, data:data, publicKey:keypair['publicKey']}

console.log(body)
const d = await fetch("http://139.99.91.128:31003/api/data", {method:'POST', body:JSON.stringify(body), headers: {
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