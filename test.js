import { getSig } from "./utils.js"

function randomIntFromInterval(min, max) { 
    return Math.floor(Math.random() * (max - min + 1) + min)
  }

const keypair = {"publicKey": "d04bbd8f403e583248aa461896bd7518113f89b85c98f3d9596bbfbf30df0bcb",
"secretKey": "a0ec3175c6c80e60bc8ef18bd7b73a631c507b9f0a42c973036c7f96d21b047a"}
  
const data = {"temp": randomIntFromInterval(20, 35)}

const sig = getSig(data, keypair);

const body = {sig:sig, data:data, publicKey:keypair['publicKey']}

fetch("http://localhost:3000/data", {method:'POST', body:JSON.stringify(body), headers: {
    'Content-Type': 'application/json'
  },}).then(res => console.log(res.text()));

