import { unmarshalPrivateKey } from "@libp2p/crypto/keys";
import { createFromPrivKey } from "@libp2p/peer-id-factory";
import {
    fromString as uint8ArrayFromString,
  } from "uint8arrays";

export const getPeerId = async () => {

    const relayPrivKey = process.env.PEER_PRIV_KEY;
    if (relayPrivKey) {
      const encoded = uint8ArrayFromString(relayPrivKey, "hex");
      const privateKey = await unmarshalPrivateKey(encoded);
      const peerId = await createFromPrivKey(privateKey);
      return peerId;
    }
    return undefined;
  };