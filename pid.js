import * as crypto from '@libp2p/crypto'; // Assuming this or a similar module for key generation
import Pact from 'pact-lang-api';
import { peerIdFromKeys } from '@libp2p/peer-id';

const kp = {kadenaPub:"157a154705943bbb9db610688d63420b33315fa13fd177185b49319caa5b0954",
             kadenaSec:"2a539d383b7b04e87d4766fcaf1123306148513d09373abb75e5026c327b3f5e"}



  const keyPair = await crypto.keys.generateKeyPairFromSeed('Ed25519', Pact.crypto.hexToBin(kp.kadenaSec))

  console.log(Pact.crypto.binToHex(keyPair.public.marshal()))
  console.log(await peerIdFromKeys(keyPair.public.bytes, keyPair.bytes))

