import Pact from 'pact-lang-api'

export const getSig = (data, keypair) => {
  const signed = Pact.crypto.sign(JSON.stringify(data), keypair)
  return signed.sig
  };