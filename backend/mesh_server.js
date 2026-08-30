const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const WebSocket = require(path.join(__dirname, '..', 'frontend', 'node_modules', 'ws'));

const PORT = 8765;
const HISTORY_FILE = path.join(__dirname, 'data', 'mesh_history.json');

let connectedClients = new Map(); // ws -> { deviceId, name, ip, connectedAt }
let sosHistory = new Map(); // id -> sosReport

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  let fallback = '127.0.0.1';
  for (const name of Object.keys(interfaces)) {
    const isVirtual = name.toLowerCase().includes('virtual') || name.toLowerCase().includes('vethernet');
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        if (!iface.address.startsWith('192.168.56.') && !isVirtual) {
          return iface.address; // Real Wi-Fi or LAN
        }
        fallback = iface.address;
      }
    }
  }
  return fallback;
}

function loadHistory() {
  if (fs.existsSync(HISTORY_FILE)) {
    try {
      const raw = fs.readFileSync(HISTORY_FILE, 'utf8');
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        data.forEach(item => { if (item.id) sosHistory.set(item.id, item); });
      }
      console.log(`[Mesh Storage] Loaded ${sosHistory.size} cached SOS alerts from history.`);
    } catch (e) {
      console.warn('[Mesh Storage] Could not load history:', e.message);
    }
  }
}

function saveHistory() {
  try {
    const dir = path.dirname(HISTORY_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(Array.from(sosHistory.values()), null, 2));
  } catch (e) {
    console.warn('[Mesh Storage] Could not persist history:', e.message);
  }
}

function getPeerList(excludeWs = null) {
  const peers = [];
  for (const [ws, info] of connectedClients.entries()) {
    if (ws !== excludeWs) {
      peers.push({
        id: info.deviceId,
        name: info.name,
        ip: info.ip,
        connectedAt: info.connectedAt
      });
    }
  }
  return peers;
}

function broadcast(messageObj, senderWs = null) {
  const payload = JSON.stringify(messageObj);
  for (const [ws, info] of connectedClients.entries()) {
    if (ws === senderWs) continue;
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(payload);
      } catch (err) {
        console.warn(`[Broadcast Error] ${info.deviceId}:`, err.message);
      }
    }
  }
}

function handleDisconnect(ws) {
  if (connectedClients.has(ws)) {
    const info = connectedClients.get(ws);
    connectedClients.delete(ws);
    console.log(`[-] Node Disconnected: ${info.deviceId} (${info.name}) | Active nodes: ${connectedClients.size}`);
    broadcast({
      type: 'PEER_LEAVE',
      deviceId: info.deviceId,
      peers: getPeerList()
    });
  }
}

// HTTP Server for /health and diagnostics
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ONLINE',
      gateway: 'CrisisMesh Relay Server',
      activeNodes: connectedClients.size,
      nodes: getPeerList(),
      cachedAlerts: sosHistory.size
    }, null, 2));
  } else {
    res.writeHead(404);
    res.end();
  }
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
  const remoteIp = req.socket.remoteAddress || 'Unknown';

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      const msgType = data.type;

      if (msgType === 'REGISTER') {
        const deviceId = data.deviceId || `node-${Math.random().toString(36).slice(2, 8)}`;
        const name = data.name || `CrisisMesh-${deviceId.slice(-4)}`;

        connectedClients.set(ws, {
          deviceId,
          name,
          ip: remoteIp,
          connectedAt: Date.now()
        });

        console.log(`[+] Node Registered: ${deviceId} (${name}) from ${remoteIp}`);
        console.log(`    Total Active Mesh Nodes: ${connectedClients.size}`);

        // Send ACK
        ws.send(JSON.stringify({
          type: 'REGISTER_ACK',
          deviceId,
          peers: getPeerList(ws),
          serverTime: Date.now()
        }));

        // Send History
        if (sosHistory.size > 0) {
          ws.send(JSON.stringify({
            type: 'SYNC_HISTORY',
            reports: Array.from(sosHistory.values())
          }));
          console.log(`    -> Synced ${sosHistory.size} historical SOS alert(s) to ${deviceId}`);
        }

        // Broadcast PEER_JOIN
        broadcast({
          type: 'PEER_JOIN',
          peer: { id: deviceId, name, ip: remoteIp, connectedAt: Date.now() },
          peers: getPeerList()
        }, ws);

      } else if (msgType === 'SOS') {
        const sosData = data.data || {};
        const sosId = sosData.id || `SOS-${Date.now()}`;
        sosData.id = sosId;
        const priority = sosData.priority || 'UNKNOWN';
        const origin = sosData.deviceId || 'Unknown';
        const desc = sosData.description || '';
        const people = sosData.numPeople || 1;

        console.log('\n============================================================');
        console.log('🚨 [EMERGENCY SOS BROADCAST]');
        console.log(`   ID:       ${sosId}`);
        console.log(`   Priority: ${priority}`);
        console.log(`   From:     ${origin}`);
        console.log(`   People:   ${people}`);
        console.log(`   GPS:      Lat ${sosData.lat}, Lng ${sosData.lng}`);
        console.log(`   Details:  ${desc}`);
        console.log(`   Fanning out to ${connectedClients.size - 1} peer node(s)...`);
        console.log('============================================================\n');

        sosHistory.set(sosId, sosData);
        saveHistory();

        broadcast({
          id: data.id || `msg-${Date.now()}`,
          type: 'SOS',
          data: sosData,
          relayedBy: connectedClients.get(ws)?.deviceId || 'Gateway',
          relayCount: (data.relayCount || 0) + 1,
          timestamp: Date.now()
        }, ws);

      } else if (msgType === 'RESCUE_PING') {
        console.log('\n============================================================');
        console.log('🚑 [ADMIN RESCUE PING DISPATCHED]');
        console.log(`   From:        ${data.adminName || 'Incident Commander'}`);
        console.log(`   Target Node: ${data.targetDeviceId}`);
        console.log(`   SOS ID:      ${data.sosId}`);
        console.log(`   Message:     ${data.message}`);
        console.log(`   Fanning out to all mesh peers...`);
        console.log('============================================================\n');

        broadcast({
          id: data.id || `ping-${Date.now()}`,
          type: 'RESCUE_PING',
          targetDeviceId: data.targetDeviceId,
          sosId: data.sosId,
          adminName: data.adminName,
          message: data.message,
          relayedBy: connectedClients.get(ws)?.deviceId || 'Gateway',
          relayCount: (data.relayCount || 0) + 1,
          timestamp: Date.now()
        }, ws);

      } else if (msgType === 'PEER_CHAT') {
        const chatData = data.chatPayload || data;
        console.log(`💬 [PEER CHAT] From @${chatData.senderUsername || 'User'} (${chatData.senderId}) -> Target: ${chatData.targetDeviceId || 'ALL'}: "${chatData.text}"`);
        broadcast({
          id: data.id || `chat-${Date.now()}`,
          type: 'PEER_CHAT',
          chatPayload: chatData,
          senderId: chatData.senderId,
          senderUsername: chatData.senderUsername,
          targetDeviceId: chatData.targetDeviceId,
          targetUsername: chatData.targetUsername,
          text: chatData.text,
          relayedBy: connectedClients.get(ws)?.deviceId || 'Gateway',
          relayCount: (data.relayCount || 0) + 1,
          timestamp: chatData.timestamp || Date.now()
        }, ws);

      } else if (msgType === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
      } else if (msgType === 'REQUEST_SYNC') {
        ws.send(JSON.stringify({
          type: 'SYNC_HISTORY',
          reports: Array.from(sosHistory.values())
        }));
      }
    } catch (e) {
      console.warn('[Warning] Invalid JSON received:', e.message);
    }
  });

  ws.on('close', () => handleDisconnect(ws));
  ws.on('error', () => handleDisconnect(ws));
});

loadHistory();
const localIp = getLocalIp();

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n=================================================================');
  console.log('  CRISISMESH - OFFLINE PEER-TO-PEER MESH GATEWAY (NODE.JS)');
  console.log('=================================================================');
  console.log('  Status:             ONLINE & LISTENING (Dual Stack)');
  console.log(`  Local Network IP:   ${localIp}`);
  console.log(`  Port:               ${PORT}`);
  console.log(`  WebSocket URL:      ws://${localIp}:${PORT}`);
  console.log(`  Health Check URL:   http://${localIp}:${PORT}/health`);
  console.log('=================================================================');
  console.log('  Testing Connectivity:');
  console.log(`  Open http://${localIp}:${PORT}/health on your phone browser.`);
  console.log('  If it loads, the phone can reach your computer!');
  console.log('=================================================================\n');
});
