import fs from 'fs';
import ManifestStore from '@orbitdb/core/src/manifest-store.js'

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

/**
 * Lists all directories in the specified path
 * @param {string} directoryPath - The path to list directories from
 * @returns {Promise<string[]>} - Array of directory names
 */
export function listDirectories(directoryPath) {
  return new Promise((resolve, reject) => {
    // Check if the provided path exists
    fs.access(directoryPath, fs.constants.F_OK, (err) => {
      if (err) {
        return reject(`Directory path does not exist: ${directoryPath}`);
      }
      
      // Read the directory contents
      fs.readdir(directoryPath, { withFileTypes: true }, (err, files) => {
        if (err) {
          return reject(`Error reading directory: ${err.message}`);
        }
        
        // Filter only directories
        const directories = files
          .filter(dirent => dirent.isDirectory())
          .map(dirent => dirent.name);
        
        resolve(directories);
      });
    });
  });
}

export const getAddress = async (orbitdb:any, name:any) => {
    const manifestStore = await ManifestStore({ ipfs:orbitdb.ipfs })

    const db = await manifestStore.create({name, type: 'documents', accessController:'/cyberfly/access-controller' });
    return "/orbitdb/"+db.hash
  }