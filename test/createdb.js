import { getSig } from "../utils.js"

const kp = {"publicKey": "a8c77a2236af3053e2b6ccb09b3ef8675f621cdcb79128a8f53163a9c8ef412b",
  "secretKey": "318e20041c2301abec65a91b553d8284392e7bb1df7f7128a28422c2416e32b0"}

const dbinfo = {name:"testdb", dbtype:"documents"}


const sig = getSig(dbinfo, kp);

const body = {sig:sig, dbinfo:dbinfo, pubkey:kp['publicKey']}

const postdata = async ()=>{
    const d = await fetch("http://localhost:31003/api/createdb", {method:'POST', body:JSON.stringify(body), headers: {
      'Content-Type': 'application/json',
      'Accept':'application/json'
    },});
    const j = await d.json()
    console.log(j)
  }
  
  postdata();