import { tcp } from '@libp2p/tcp'
import { identify } from '@libp2p/identify'
import { gossipsub } from '@chainsafe/libp2p-gossipsub'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { bootstrap } from '@libp2p/bootstrap'
import { pubsubPeerDiscovery } from "@libp2p/pubsub-peer-discovery";
import { webSockets } from '@libp2p/websockets'
import * as filters from '@libp2p/websockets/filters'
import { circuitRelayServer, circuitRelayTransport } from '@libp2p/circuit-relay-v2'
import { autoNAT } from "@libp2p/autonat";
import { dcutr } from "@libp2p/dcutr";
import { kadDHT } from "@libp2p/kad-dht";
import { webTransport } from "@libp2p/webtransport";
import { webRTC, webRTCDirect } from "@libp2p/webrtc";
import { preSharedKey, generateKey } from '@libp2p/pnet'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let bsNodes = ["/dns4/vps-5b1e75a3.vps.ovh.ca/tcp/31001/p2p/12D3KooWSfGgUaeogSZuRPa4mhsAU41qJH5EpmwKg9wGVzUwFGth", 
  "/dns4/node.cyberfly.io/tcp/31001/p2p/12D3KooWA8mwP9wGUc65abVDMuYccaAMAkXhKUqpwKUZSN5McDrw"]

export const getLibp2pOptions = (ip, peerId)=> {

let filteredBS = bsNodes.filter(element=> !element.includes(peerId));
const filePath = path.join(__dirname, "swarm.key")

const swarmKey = fs.readFileSync(filePath, 'utf8')

  return {
    peerDiscovery: [
      pubsubPeerDiscovery({
        interval: 10000,
        topics: ["cyberfly._peer-discovery._p2p._pubsub"],
        listenOnly: false,
      }),
      bootstrap({list:filteredBS})
      ],
      connectionProtector: preSharedKey({
        psk: Buffer.from(swarmKey)
      }),
    addresses: {
      listen: ['/ip4/0.0.0.0/tcp/31001',
      '/ip4/0.0.0.0/tcp/31002/wss',
      "/webrtc",
      "/webtransport",
      "/webrtc-direct",
    ],
      announce: [`/ip4/${ip}/tcp/31001/p2p/${peerId}`,`/ip4/${ip}/tcp/31002/wss/p2p/${peerId}`]
    },
    connectionManager: {
      minConnections: 1,
      maxConnections: Infinity,
    },
    transports: [
      webRTC({
        rtcConfiguration: {
          iceServers: [
            {
              urls: [
                "stun:stun.l.google.com:19302",
                "stun:global.stun.twilio.com:3478",
              ],
            },
          ],
        },
      }),
      webTransport(),
      webRTCDirect(),
    tcp(),
    webSockets({
      filter: filters.all
    }),
    circuitRelayTransport({
      discoverRelays: 2,
    })
    ],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    connectionGater: {
      denyDialMultiaddr: () => false,
    },
    services: {
      identify: identify(),
      autoNAT: autoNAT(),
      dcutr: dcutr(),
      pubsub: gossipsub({
        allowPublishToZeroTopicPeers: true, emitSelf: true, 
        scoreThresholds: {
          gossipThreshold: -Infinity,
          publishThreshold: -Infinity,
          graylistThreshold: -Infinity,
        }, }),
      relay: circuitRelayServer({
        reservations: {
          maxReservations: Infinity
        }
      }),
      dht: kadDHT({
        clientMode: false,
      }),
    }
  }
  
}
