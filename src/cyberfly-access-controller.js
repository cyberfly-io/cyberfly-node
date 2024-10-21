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
        const pubkey = db.name.split('-')[1]
        const verify = Pact.crypto.verifySignature(JSON.stringify(data), sig, pubkey);
     return verify
    }
}
}

CyberflyAccessController.type = type

export default CyberflyAccessController