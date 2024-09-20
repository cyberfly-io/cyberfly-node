import { getSig } from "../utils.js"

const kp = {"publicKey": "e98491755d82bde4c7f4fa22d6bb96d5b22a05d3d74c84ab90de836781524c63",
  "secretKey": "ba0df5cd73a197011ec02d8a9939e8738be87d7807958b3ceeaacdc0bc8190e0"}

const dbinfo = {name:"testdb", dbtype:"documents"}


const sig = getSig(dbinfo, kp);

const body = {sig:sig, dbinfo:dbinfo, pubkey:kp['publicKey']}

const postdata = async ()=>{
    const d = await fetch("http://139.99.91.128:31003/api/createdb", {method:'POST', body:JSON.stringify(body), headers: {
      'Content-Type': 'application/json',
      'Accept':'application/json'
    },});
    const j = await d.json()
    console.log(j)
  }
  
  postdata();