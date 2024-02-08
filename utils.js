import Pact from 'pact-lang-api'
import nacl from "tweetnacl";

export const getSig = (data, keypair) => {
    const hashbin = Pact.crypto.hashBin(JSON.stringify(data));
    const signature = nacl.sign.detached(hashbin, Pact.crypto.toTweetNaclSecretKey(keypair));
    return Pact.crypto.binToHex(signature)
  };