import { getSig } from "./utils.js"
import Pact from 'pact-lang-api'

function randomIntFromInterval(min, max) { 
    return Math.floor(Math.random() * (max - min + 1) + min)
  }

const keypair = Pact.crypto.genKeyPair()
  
const data = {"temp": randomIntFromInterval(20, 35)}

const sig = getSig(data, keypair);

const body = {sig:sig, data:data, publicKey:keypair['publicKey']}



const postdata = async ()=>{
  const d = await fetch("http://89.76.34.43:31000/data", {method:'POST', body:JSON.stringify(body), headers: {
    'Content-Type': 'application/json'
  },});
  const j = await d.json()
  console.log(j)
}

postdata();