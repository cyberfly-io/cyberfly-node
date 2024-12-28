import { getSig } from "../utils.js"

const keypair = {"publicKey": "94faf73efcd9af950d4dbca3e5c65459221377b6ea31e3ed30112939a5c79aa8",
  "secretKey": "15756809a14b846680f2254b292e6015c4b446f37230bd0669159752521729fa"}

const dbinfo = {name:"testnewdb12356"}


const sig = getSig(dbinfo, keypair);

const body = {sig:sig, dbinfo:dbinfo, pubkey:keypair['publicKey']}
console.log(body)

const postdata = async ()=>{
    const d = await fetch("https://node2.cyberfly.io/api/createdb", {method:'POST', body:JSON.stringify(body), headers: {
      'Content-Type': 'application/json',
      'Accept':'application/json'
    },});
    const j = await d.json()
    console.log(j)
  }
  
  postdata();