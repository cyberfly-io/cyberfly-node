import { getSig } from "./utils.js"

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

//going to test data replication across nodes
//store data to localnode and check on other nodes
const postdata = async ()=>{


const randomCoordinates = generateRandomCoordinates();
const data = {...randomCoordinates, member:"chai kings", locationLabel:"Coffee shop", streamName:"mystream"}


const sortedJsondata = Object.keys(data)
    .sort() // Sort the keys
    .reduce((obj, key) => {
        obj[key] = data[key]; // Build a new sorted object
        return obj;
    }, {});

const sig = getSig(sortedJsondata, keypair);

const body = {dbaddr:"/orbitdb/zdpuAskvXsjijvGLM5j66ZNCbhMKGY3qyB5cSTq3zhEEPWnmK", objectType:"stream" ,sig:sig, data:sortedJsondata, publicKey:keypair['publicKey']}

const remote = "https://node.cyberfly.io/api/data"
const local = "http://localhost:31003/api/data"
const remote2 = "http://vps-5b1e75a3.vps.ovh.ca:31003/api/data"

console.log(body)
/*const d = await fetch(local, {method:'POST', body:JSON.stringify(body), headers: {
    'Content-Type': 'application/json',
    'Accept':'application/json'
  },});
  const j = await d.json()
  console.log(j)*/
}

await postdata()
/*var c = 0
while(c<10){
  const start = Date.now();

await postdata();
const end = Date.now();
console.log(`Execution time: ${end - start} ms`);
c++
}
*/