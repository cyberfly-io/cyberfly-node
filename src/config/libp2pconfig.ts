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
import { preSharedKey } from '@libp2p/pnet'
import { multiaddr } from '@multiformats/multiaddr'
import { ping } from "@libp2p/ping"


import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let bsNodes = ["/dns4/vps-5b1e75a3.vps.ovh.ca/tcp/31001/p2p/12D3KooWSfGgUaeogSZuRPa4mhsAU41qJH5EpmwKg9wGVzUwFGth", 
  "/dns4/node.cyberfly.io/tcp/31001/p2p/12D3KooWA8mwP9wGUc65abVDMuYccaAMAkXhKUqpwKUZSN5McDrw"]

export const getLibp2pOptions = (ip:string, peerId:string)=> {

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
      '/ip4/0.0.0.0/tcp/31002/ws',
      "/webrtc",
      "/webtransport",
      "/webrtc-direct",
    ],
    appendAnnounce: [`/ip4/${ip}/tcp/31001/p2p/${peerId}`,`/ip4/${ip}/tcp/31002/wss/p2p/${peerId}`, `/ip4/${ip}/tcp/31002/ws/p2p/${peerId}`]
    },
    connectionManager: {
            maxConnections: Infinity,
            minConnections: 1,
            maxIncomingPendingConnections: 200,
            maxOutgoingPendingConnections: 200,
            pollInterval: 2000,
            maxDialTimeout: 30000,
            inboundUpgradeTimeout: 30000,
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
      filter: filters.all,
      /*listener: (socket) => {
        const remoteAddr = multiaddr(socket.remoteAddress).toString()
        logger.info(`WebSocket connection established with: ${remoteAddr}`)
    }*/
    }),
    circuitRelayTransport()
    ],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    connectionGater: {
      denyDialMultiaddr: () => false,
    },
    services: {
      ping: ping(),
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
        circuitRelay: circuitRelayServer({
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
