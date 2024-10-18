import { getSig } from "./utils.js"

function randomIntFromInterval(min, max) { 
    return Math.floor(Math.random() * (max - min + 1) + min)
  }

  const keypair = {"publicKey": "94faf73efcd9af950d4dbca3e5c65459221377b6ea31e3ed30112939a5c79aa8",
    "secretKey": "15756809a14b846680f2254b292e6015c4b446f37230bd0669159752521729fa"}
  


//going to test data replication across nodes
//store data to localnode and check on other nodes
const postdata = async ()=>{
    
const data = {"temperature": randomIntFromInterval(20,40), "replica": "testing 12345"}


const sortedJsondata = Object.keys(data)
    .sort() // Sort the keys
    .reduce((obj, key) => {
        obj[key] = data[key]; // Build a new sorted object
        return obj;
    }, {});

const sig = getSig(sortedJsondata, keypair);

const body = {dbaddr:"/orbitdb/zdpuAsf7awdQSZueHatVJMWM46tSQrW8c8CinMFfFH59qg41H" ,sig:sig, data:sortedJsondata, publicKey:keypair['publicKey']}

const remote = "https://node.cyberfly.io/api/data"
const local = "http://localhost:31003/api/data"

console.log(body)
const d = await fetch(local, {method:'POST', body:JSON.stringify(body), headers: {
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