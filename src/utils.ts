import { verify } from './config/utils.js';

export function isFlatJson(obj:any) {
    // Check if the input is an object and not null
    if (typeof obj !== 'object' || obj === null) {
        return false;
    }

    // Iterate over the object's keys
    for (const key in obj) {
        // Check if the key belongs to the object and is not inherited
        if (obj.hasOwnProperty(key)) {
            // Check if the value is an object or an array
            if (typeof obj[key] === 'object' && obj[key] !== null) {
                return false; // Found a nested object or array
            }
        }
    }
    
    return true; // No nested objects or arrays found
}

export const getStreamName = (senderKey: string, receiverKey: string)=>{
    const sortedKeys = [senderKey, receiverKey].sort(); // Sort the public keys
    const concatenatedKeys = sortedKeys.join(''); // Concatenate the sorted public keys
   return concatenatedKeys
  }

 

  export const toSortJson = (data:any)=>{
    const sortedJsondata = Object.keys(data)
    .sort() // Sort the keys
    .reduce((obj, key) => {
        obj[key] = data[key]; // Build a new sorted object
        return obj;
    }, {});
    return sortedJsondata
  }


 export const verifyMsg = (data:any)=>{
    const msg  = data.data
    const sortedJson = toSortJson(msg)
    return verify(sortedJson, data.sig, data.publicKey)
  }