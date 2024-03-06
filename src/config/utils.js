import fs from 'fs';
import { peerIdFromKeys } from '@libp2p/peer-id';
import * as crypto from '@libp2p/crypto'; // Assuming this or a similar module for key generation


  function uint8ArrayToBase64(bytes) {
    return Buffer.from(bytes).toString('base64');
}

function base64ToUint8Array(base64) {
    return new Uint8Array(Buffer.from(base64, 'base64'));
}

  export async function loadOrCreatePeerId(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            const keyJson = fs.readFileSync(filePath, 'utf-8');
            const keyData = JSON.parse(keyJson);
            // Convert base64 strings back to Uint8Array for privateKey and publicKey
            const privateKeyBytes = base64ToUint8Array(keyData.privateKey);
            const publicKeyBytes = base64ToUint8Array(keyData.publicKey);
            return await peerIdFromKeys(publicKeyBytes, privateKeyBytes);
        } else {
            const privateKey = await crypto.keys.generateKeyPair('RSA', 2048);
            const peerId = await peerIdFromKeys(privateKey.public.bytes, privateKey.bytes);

            // Save keys to file, converting Uint8Array to base64 for JSON serialization
            const keyData = {
                publicKey: uint8ArrayToBase64(privateKey.public.bytes),
                privateKey: uint8ArrayToBase64(privateKey.bytes),
            };
            fs.writeFileSync(filePath, JSON.stringify(keyData));

            console.log(`Generated and saved a new PeerId to ${filePath}`);
            return peerId;
        }
    } catch (error) {
        console.error('Error in loadOrCreatePeerId:', error);
        throw error;
    }
  }

  export const getIp = async ()=>{
    const data = await fetch('https://api.ipify.org?format=json')
    const json = await  data.json()
    return json.ip
  }