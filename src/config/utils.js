import fs from 'fs';
import { peerIdFromKeys } from '@libp2p/peer-id';
import * as crypto from '@libp2p/crypto'; // Assuming this or a similar module for key generation
import { genKeyPair} from '@kadena/cryptography-utils';
import { createClient, Pact, createSignWithKeypair } from '@kadena/client';


const client = createClient('https://api.testnet.chainweb.com/chainweb/0.0/testnet04/chain/1/pact',)


  function uint8ArrayToBase64(bytes) {
    return Buffer.from(bytes).toString('base64');
}

function base64ToUint8Array(base64) {
    return new Uint8Array(Buffer.from(base64, 'base64'));
}

  export async function loadOrCreatePeerIdAndKeyPair(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            const keyJson = fs.readFileSync(filePath, 'utf-8');
            const keyData = JSON.parse(keyJson);
            // Convert base64 strings back to Uint8Array for privateKey and publicKey
            const privateKeyBytes = base64ToUint8Array(keyData.privateKey);
            const publicKeyBytes = base64ToUint8Array(keyData.publicKey);
            const peerId =  await peerIdFromKeys(publicKeyBytes, privateKeyBytes)
            return {kadenaPub:keyData.kadenaPub, kadenaSec:keyData.kadenaSec, peerId:peerId};
        } else {
            const privateKey = await crypto.keys.generateKeyPair('RSA', 2048);
            const kadenaKP = genKeyPair()
            const peerId = await peerIdFromKeys(privateKey.public.bytes, privateKey.bytes);

            // Save keys to file, converting Uint8Array to base64 for JSON serialization
            const keyData = {
                publicKey: uint8ArrayToBase64(privateKey.public.bytes),
                privateKey: uint8ArrayToBase64(privateKey.bytes),
                kadenaPub: kadenaKP.publicKey,
                kadenaSec: kadenaKP.secretKey
            };
            fs.mkdirSync('./data')
            fs.writeFileSync(filePath, JSON.stringify(keyData));

            console.log(`Generated and saved a new PeerId to ${filePath}`);
            
            return  {kadenaPub: kadenaKP.publicKey, kadenaSec: kadenaKP.secretKey, peerId:peerId};
        }
    } catch (error) {
        console.error('Error in loadOrCreatePeerId:', error);
        throw error;
    }
  }

  export const getIp = async ()=>{
    try{
      const data = await fetch('https://api.ipify.org?format=json')
      const json = await  data.json()
      return json.ip
    }
    catch(e){
      throw new Error("check your internet connection and try again")
      
    }

  }


  const getGuard = (account, pubkey)=>{
    return {pred:"keys-any", keys:[account.split(':')[1], pubkey]}
  }


  const createNode = async (peerId, multiaddr, account, pubkey, seckey)=>{
  const utxn = Pact.builder.execution(`(free.cyberfly_node.new-node "${peerId}" "active" "${multiaddr}" "${account}" (read-keyset "ks"))`)
  .addData("ks",getGuard(account, pubkey))
  .addSigner(pubkey, (withCapability)=>[
    withCapability('free.cyberfly-account-gas-station.GAS_PAYER', 'cyberfly-account-gas', { int: 1 }, 1.0),
  ])
  .setMeta({chainId:"1",senderAccount:"cyberfly-account-gas", gasLimit:2000, gasPrice:0.0000001})
  .setNetworkId("testnet04")
  .createTransaction();
  const  signTransaction = createSignWithKeypair({publicKey:pubkey, secretKey:seckey})
  const signedTx = await signTransaction(utxn)
  const res = await client.local(signedTx)
  if(res.result.status=="success"){
    const txn = await client.submit(signedTx)
    console.log(txn)
  }
}


  export const addNodeToContract = async (peerId, multiaddr, account, pubkey, seckey)=>{
  
    const nodeinfo = await getNodeInfo(peerId, pubkey, seckey)
    if(nodeinfo.result.status == "failure" && nodeinfo.result.error.message.includes("row not found")){
      await createNode(peerId, multiaddr, account, pubkey, seckey)
    }
    
    setInterval(()=>{checkNodeStatus(peerId, multiaddr, account, pubkey, seckey)}, 10000)

  }


  const getNodeInfo = async (peerId) =>{
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
  const res = await client.local(unsignedTransaction, { signatureVerification:false, preflight:false});
  return res
  }


  export const getDevice = async (deviceId) =>{
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

  export function selectFields(objects, fields) {
    return objects.map(obj => {
      const newObj = {};
      fields.forEach(field => {
        newObj[field] = obj[field];
      });
      return newObj;
    });
  }

  const activateNode = async(peerId, multiaddr, account, pubkey, seckey)=>{

    const utxn = Pact.builder.execution(`(free.cyberfly_node.update-node "${peerId}" "${multiaddr}" "${account}" "active")`)
    .addSigner(pubkey, (withCapability)=>[
      withCapability('free.cyberfly-account-gas-station.GAS_PAYER', 'cyberfly-account-gas', { int: 1 }, 1.0),
    ])
    .setMeta({chainId:"1",senderAccount:"cyberfly-account-gas", gasLimit:2000, gasPrice:0.0000001})
    .setNetworkId("testnet04")
    .createTransaction();
    const  signTransaction = createSignWithKeypair({publicKey:pubkey, secretKey:seckey})
    const signedTx = await signTransaction(utxn)
    const res = await client.local(signedTx)
    if(res.result.status=="success"){
      const txn = await client.submit(signedTx)
      console.log(txn)
    }
     
  }

  const  checkNodeStatus = async (peerId, multiaddr, account, pubkey, seckey)=>{
    try{


     const result = await getNodeInfo(peerId)
     if(result.result.status==="success"){
      if(result.result.data.status!=='active' || result.result.data.multiaddr!==multiaddr){
         activateNode(peerId, multiaddr, account, pubkey, seckey)
      }
     }
    }
    catch(e){
     console.log(e)
    }
  }