import Pact from 'pact-lang-api';
import { toSortJson } from './utils.js';
const type = 'cyberfly-chat'

const CyberflyChatAccessController = () => async ({ orbitdb, identities, address }) => {
  address = '/cyberfly/chat-access-controller'
return  {
    address,
    canAppend : async (entry:any, identityProvider:any) =>  {
        const db = await orbitdb.open(entry.id)
        const sig = entry.payload.value.sig;
        const pubkey = entry.payload.value.publicKey;
        const data = entry.payload.value.data;
        const sortedJsondata = toSortJson(data)
        const pubkeys = db.name.split('-').at(-1)
        const keyInclude = pubkeys.includes(pubkey)
        const verify = Pact.crypto.verifySignature(JSON.stringify(sortedJsondata), sig, pubkey);
     return verify && keyInclude
    }
}
}

CyberflyChatAccessController.type = type

export default CyberflyChatAccessController