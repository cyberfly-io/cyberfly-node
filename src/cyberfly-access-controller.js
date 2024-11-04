import Pact from 'pact-lang-api';
const type = 'cyberfly'

const CyberflyAccessController = () => async ({ orbitdb, identities, address }) => {
  address = '/cyberfly/access-controller'
return  {
    address,
    canAppend : async (entry, identityProvider) =>  {
      //subscription verification should be done here
        const db = await orbitdb.open(entry.id)
        const sig = entry.payload.value.sig;
        const data = entry.payload.value.data;
        const sortedJsondata = Object.keys(data)
        .sort() // Sort the keys
        .reduce((obj, key) => {
            obj[key] = data[key]; // Build a new sorted object
            return obj;
        }, {});
        const pubkey = db.name.split('-').at(-1)
        const verify = Pact.crypto.verifySignature(JSON.stringify(sortedJsondata), sig, pubkey);
     return verify
    }
}
}

CyberflyAccessController.type = type

export default CyberflyAccessController