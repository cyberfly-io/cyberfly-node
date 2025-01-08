import fs from 'fs';
import { peerIdFromPrivateKey } from '@libp2p/peer-id';
import * as crypto from '@libp2p/crypto'; // Assuming this or a similar module for key generation
import { genKeyPair} from '@kadena/cryptography-utils';
import { createClient, Pact, createSignWithKeypair } from '@kadena/client';
import pact from 'pact-lang-api'


const client = createClient('https://api.testnet.chainweb.com/chainweb/0.0/testnet04/chain/1/pact',)

  export  const loadOrCreatePeerIdAndKeyPair:any = async(filePath:string, sk:string)=> {
    try {
      if(!fs.existsSync('./data')){
        fs.mkdirSync('./data')
      }
      if(sk){
        const keyPair = await crypto.keys.generateKeyPairFromSeed('Ed25519', pact.crypto.hexToBin(sk))
        const kadenaKP = pact.crypto.restoreKeyPairFromSecretKey(sk)
        const peerId =  peerIdFromPrivateKey(keyPair);
        return  {kadenaPub: kadenaKP.publicKey, kadenaSec: kadenaKP.secretKey, peerId:peerId, privateKey:keyPair};
      }
      else{
        if (fs.existsSync(filePath)) {
          const keyJson = fs.readFileSync(filePath, 'utf-8');
          const keyData = JSON.parse(keyJson);
          const keyPair = await crypto.keys.generateKeyPairFromSeed('Ed25519', pact.crypto.hexToBin(keyData.kadenaSec))
          const peerId = peerIdFromPrivateKey(keyPair)
          return {kadenaPub:keyData.kadenaPub, kadenaSec:keyData.kadenaSec, peerId:peerId, privateKey:keyPair};
      } else {
          const kadenaKP = genKeyPair()
          const keyPair = await crypto.keys.generateKeyPairFromSeed('Ed25519', pact.crypto.hexToBin(kadenaKP.secretKey))
          const peerId =  peerIdFromPrivateKey(keyPair);

          const keyData = {
              kadenaPub: kadenaKP.publicKey,
              kadenaSec: kadenaKP.secretKey
          };
          fs.writeFileSync(filePath, JSON.stringify(keyData));

          console.log(`Generated and saved a new PeerId to ${filePath}`);
          
          return  {kadenaPub: kadenaKP.publicKey, kadenaSec: kadenaKP.secretKey, peerId:peerId, privateKey:keyPair};
      }
      }
    } catch (error) {
        console.error('Error in loadOrCreatePeerId:', error);
        throw error;
    }
  }

  export const getIp = async ()=>{
    try{
      const data = await fetch('http://ip-api.com/json/')
      const json = await  data.json()
      return json.query
    }
    catch(e){
      console.log(e)
      throw new Error("check your internet connection and try again")
      
    }

  }


  const getGuard = (account:string, pubkey:string)=>{
    return {pred:"keys-any", keys:[account.split(':')[1], pubkey]}
  }


  const createNode = async (peerId:string, multiaddr:string, account:string, pubkey:string, seckey:string)=>{
  const utxn = Pact.builder.execution(`(free.cyberfly_node.new-node "${peerId}" "active" "${multiaddr}" "${account}" (read-keyset "ks"))`)
  .addData("ks",getGuard(account, pubkey))
  .addSigner(pubkey, (withCapability)=>[
    withCapability('free.cyberfly-account-gas-station.GAS_PAYER', 'cyberfly-account-gas', { int: 1 }, 1.0),
    withCapability('free.cyberfly_node.NEWNODE')
  ])
  .setMeta({chainId:"1",senderAccount:"cyberfly-account-gas", gasLimit:2000, gasPrice:0.0000001})
  .setNetworkId("testnet04")
  .createTransaction();
  const  signTransaction = createSignWithKeypair({publicKey:pubkey, secretKey:seckey})
  const signedTx:any = await signTransaction(utxn)
  const res = await client.local(signedTx)
  if(res.result.status=="success"){
    const txn = await client.submit(signedTx)
    console.log(txn)
  }
}

  export const addNodeToContract = async (peerId:string, multiaddr:string, account:string, pubkey:string, seckey:string)=>{
    console.log(multiaddr)
  
    const nodeinfo:any = await getNodeInfo(peerId)
    if(nodeinfo &&nodeinfo.result.status == "failure" && nodeinfo.result.error.message.includes("row not found")){
      await createNode(peerId, multiaddr, account, pubkey, seckey)
    }
    
    setInterval(()=>{checkNodeStatus(peerId, multiaddr, pubkey, seckey)}, 100000)

  }


  const getNodeInfo = async (peerId:string) =>{
    const unsignedTransaction = Pact.builder
    .execution(`(free.cyberfly_node.get-node "${peerId}")`)
    .setMeta({
      chainId: '1',
      senderAccount: 'cyberfly-account-gas',
      gasLimit: 2000,
      gasPrice: 0.0000001
    })
    // set networkId
    .setNetworkId('testnet04')
    // create transaction with hash
    .createTransaction();
    
  // Send it or local it
  try{
    const res = await client.local(unsignedTransaction, { signatureVerification:false, preflight:false});
    return res

  }
  catch(e){
  return null
  }
  }


  export const getDevice = async (deviceId:string) =>{
    const unsignedTransaction = Pact.builder
    .execution(`(free.cyberfly_devices.get-device "${deviceId}")`)
    .setMeta({
      chainId: '1',
      senderAccount: 'cyberfly-account-gas',
      gasLimit: 2000,
      gasPrice: 0.0000001
    })
    // set networkId
    .setNetworkId('testnet04')
    // create transaction with hash
    .createTransaction();
    
  // Send it or local it
  const res = await client.local(unsignedTransaction, { signatureVerification:false, preflight:false});
  return res
  }


  export const getNodes = async () =>{
    const unsignedTransaction = Pact.builder
    .execution(`(free.cyberfly_node.get-all-nodes)`)
    .setMeta({
      chainId: '1',
      senderAccount: 'cyberfly-account-gas',
      gasLimit: 55000,
      gasPrice: 0.0000001
    })
    // set networkId
    .setNetworkId('testnet04')
    // create transaction with hash
    .createTransaction();

  // Send it or local it
  const res = await client.local(unsignedTransaction, { signatureVerification:false, preflight:false});
  return res
  }

  export function selectFields(objects:any, fields:any) {
    return objects.map(obj => {
      const newObj = {};
      fields.forEach(field => {
        newObj[field] = obj[field];
      });
      return newObj;
    });
  }

  const activateNode = async(peerId:string, multiaddr:string, pubkey:string, seckey:string)=>{

    const utxn = Pact.builder.execution(`(free.cyberfly_node.update-node "${peerId}" "${multiaddr}" "active")`)
    .addSigner(pubkey, (withCapability)=>[
      withCapability('free.cyberfly-account-gas-station.GAS_PAYER', 'cyberfly-account-gas', { int: 1 }, 1.0),
      withCapability("free.cyberfly_node.NODE_GUARD", peerId)
    ])
    .setMeta({chainId:"1",senderAccount:"cyberfly-account-gas", gasLimit:2000, gasPrice:0.0000001})
    .setNetworkId("testnet04")
    .createTransaction();
    const  signTransaction = createSignWithKeypair({publicKey:pubkey, secretKey:seckey})
    const signedTx:any = await signTransaction(utxn)
    const res = await client.local(signedTx)
    if(res.result.status=="success"){
      const txn = await client.submit(signedTx)
      console.log(txn)
    }
   
     
  }

  const checkNodeStatus = async (peerId:string, multiaddr:string, pubkey:string, seckey:string)=>{
    try{

     const result:any = await getNodeInfo(peerId)
     if(result && result.result.status==="success"){
      if(result.result.data.status!=='active'){
         activateNode(peerId, multiaddr, pubkey, seckey)
      }
     }
    }
    catch(e){
     console.log(e)
    }
  }

  export function extractFields(array:any, field1:any, field2:any) {
    return array.map(obj => ({
      [field1]: obj[field1],
      [field2]: obj[field2]
    }));
  }

  export const removeDuplicateConnections = (connections:any) => {
    // Using Map to keep track of unique remotePeers
    // We'll keep the first occurrence of each remotePeer
    const uniquePeers = new Map();
    
    connections.forEach(connection => {

      if (!uniquePeers.has(connection.remotePeer.toString())) {
        uniquePeers.set(connection.remotePeer.toString(), connection);
      }
    });
    
    // Convert Map values back to array
    return Array.from(uniquePeers.values());
  };


  export const verify = (data:any, sig:any, pubkey:any)=>{
    try{
      const verify = pact.crypto.verifySignature(JSON.stringify(data), sig, pubkey);
      return verify
    }
    catch(e){
      return false
    }
  }

