import { getSig } from "./utils.js"
import Pact from 'pact-lang-api'

function randomIntFromInterval(min, max) { 
    return Math.floor(Math.random() * (max - min + 1) + min)
  }

const keypair = Pact.crypto.genKeyPair()
  
const data = {"temp": randomIntFromInterval(20, 35), "timestamp":new Date().toISOString()}

const sig = getSig(data, keypair);

const body = {sig:sig, data:data, publicKey:keypair['publicKey']}



const postdata = async ()=>{
  const d = await fetch("http://localhost:31003/data", {method:'POST', body:JSON.stringify(body), headers: {
    'Content-Type': 'application/json',
    'Accept':'application/json'
  },});
  const j = await d.json()
  console.log(j)
}

postdata();
