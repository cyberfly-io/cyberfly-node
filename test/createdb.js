import { getSig } from "../utils.js"

const kp = {"publicKey": "d04bbd8f403e583248aa461896bd7518113f89b85c98f3d9596bbfbf30df0bcb",
"secretKey": "a0ec3175c6c80e60bc8ef18bd7b73a631c507b9f0a42c973036c7f96d21b047a"}

const dbinfo = {name:"contacts", dbtype:"documents"}


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