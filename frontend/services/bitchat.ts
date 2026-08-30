import { NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MeshMessage, SOSReport, Device, ChatMessage } from '../utils/types';
import { BITCHAT_CONFIG, MESH_SERVER_CONFIG } from '../utils/constants';
import { getDeviceName } from '../utils/deviceId';

type MessageHandler = (message: MeshMessage) => void;
type ConnectionHandler = (device: Device) => void;
type StatusHandler = (status: { connected: boolean; peerCount: number }) => void;

export const detectBundlerHost = (): string | null => {
  try {
    const scriptURL = NativeModules.SourceCode?.scriptURL;
    if (scriptURL) {
      const match = scriptURL.match(/:\/\/([^:\/]+)/);
      if (match && match[1] && match[1] !== 'localhost' && match[1] !== '127.0.0.1') {
        return match[1];
      }
    }
  } catch (_) {}
  return null;
};

class BitChatMesh {
  private messageHandlers: MessageHandler[] = [];
  private connectionHandlers: ConnectionHandler[] = [];
  private disconnectionHandlers: ConnectionHandler[] = [];
  private statusHandlers: StatusHandler[] = [];
  private seenMessageIds: Set<string> = new Set();
  private connectedDevices: Map<string, Device> = new Map();
  private deviceId: string;
  private username: string = '';
  private isInitialized: boolean = false;
  private pendingMessages: MeshMessage[] = [];
  private chatMessageHandlers: ((msg: ChatMessage) => void)[] = [];

  // WebSocket Transport State
  private ws: WebSocket | null = null;
  private serverHost: string = MESH_SERVER_CONFIG.DEFAULT_HOST;
  private serverPort: number = MESH_SERVER_CONFIG.DEFAULT_PORT;
  private isConnectedToGateway: boolean = false;
  private reconnectTimeout: any = null;
  private heartbeatInterval: any = null;

  constructor(deviceId: string) {
    this.deviceId = deviceId;
  }

  async initialize(customHost?: string, customPort?: number): Promise<void> {
    try {
      console.log(`[BitChat] Initializing live mesh transport for node: ${this.deviceId}`);

      // Retrieve saved gateway host if present, or auto-detect from Expo bundler connection
      const savedHost = await AsyncStorage.getItem(MESH_SERVER_CONFIG.STORAGE_KEY_HOST);
      const savedPort = await AsyncStorage.getItem(MESH_SERVER_CONFIG.STORAGE_KEY_PORT);
      const autoHost = detectBundlerHost();

      this.serverHost = customHost || savedHost || autoHost || MESH_SERVER_CONFIG.DEFAULT_HOST;
      this.serverPort = customPort || (savedPort ? parseInt(savedPort, 10) : MESH_SERVER_CONFIG.DEFAULT_PORT);

      this.isInitialized = true;
      this.connect();
      console.log(`[BitChat] Mesh layer targeting gateway ws://${this.serverHost}:${this.serverPort}`);
    } catch (error) {
      console.error('[BitChat] Initialization failed:', error);
      throw error;
    }
  }

  private connect(): void {
    if (!this.isInitialized) return;

    if (this.ws) {
      try {
        this.ws.close();
      } catch (_) {}
      this.ws = null;
    }

    const wsUrl = `ws://${this.serverHost}:${this.serverPort}`;
    console.log(`[BitChat] Connecting to mesh relay: ${wsUrl}`);

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log(`[BitChat] Successfully connected to mesh relay at ${wsUrl}`);
        this.isConnectedToGateway = true;
        this.notifyStatus();

        // 1. Register this node with gateway
        const registerPayload = {
          type: 'REGISTER',
          deviceId: this.deviceId,
          name: this.username || getDeviceName(this.deviceId)
        };
        this.sendRaw(registerPayload);

        // 2. Start heartbeat ping every 15s
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = setInterval(() => {
          this.sendRaw({ type: 'PING', timestamp: Date.now() });
        }, 15000);

        // 3. Flush any queued offline messages
        this.flushPendingMessages();
      };

      this.ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          this.handleGatewayPayload(payload);
        } catch (e) {
          console.warn('[BitChat] Failed to parse message frame:', event.data);
        }
      };

      this.ws.onclose = (event) => {
        console.log(`[BitChat] Disconnected from mesh relay (code: ${event.code})`);
        this.handleDisconnect();
      };

      this.ws.onerror = (error: any) => {
        console.warn(`[BitChat] WebSocket error on ${wsUrl}:`, error.message || error);
        // onerror will be followed by onclose, which handles reconnect
      };
    } catch (err) {
      console.error('[BitChat] Socket instantiation error:', err);
      this.handleDisconnect();
    }
  }

  private handleDisconnect(): void {
    this.isConnectedToGateway = false;
    this.connectedDevices.clear();
    this.notifyStatus();

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Schedule auto-reconnect
    if (this.isInitialized && !this.reconnectTimeout) {
      this.reconnectTimeout = setTimeout(() => {
        this.reconnectTimeout = null;
        console.log('[BitChat] Retrying gateway connection...');
        this.connect();
      }, BITCHAT_CONFIG.RECONNECT_INTERVAL);
    }
  }

  private handleGatewayPayload(payload: any): void {
    const type = payload.type;

    if (type === 'REGISTER_ACK') {
      console.log(`[BitChat] Registered with mesh gateway. Known peers:`, payload.peers?.length || 0);
      if (Array.isArray(payload.peers)) {
        this.updatePeerList(payload.peers);
      }
    } else if (type === 'PEER_JOIN') {
      const peer = payload.peer;
      if (peer && peer.id !== this.deviceId) {
        const device: Device = {
          id: peer.id,
          name: peer.name || getDeviceName(peer.id),
          lastSeen: Date.now(),
          isConnected: true
        };
        this.connectedDevices.set(peer.id, device);
        this.connectionHandlers.forEach(h => h(device));
        this.notifyStatus();
        console.log(`[BitChat] Peer joined mesh: ${device.name} (${device.id})`);
      }
      if (Array.isArray(payload.peers)) {
        this.updatePeerList(payload.peers);
      }
    } else if (type === 'PEER_LEAVE') {
      const leavingId = payload.deviceId;
      if (leavingId && this.connectedDevices.has(leavingId)) {
        const dev = this.connectedDevices.get(leavingId)!;
        dev.isConnected = false;
        this.disconnectionHandlers.forEach(h => h(dev));
        this.connectedDevices.delete(leavingId);
        this.notifyStatus();
        console.log(`[BitChat] Peer left mesh: ${dev.name} (${leavingId})`);
      }
      if (Array.isArray(payload.peers)) {
        this.updatePeerList(payload.peers);
      }
    } else if (type === 'PEER_LIST') {
      if (Array.isArray(payload.peers)) {
        this.updatePeerList(payload.peers);
      }
    } else if (type === 'SOS') {
      const meshMsg: MeshMessage = {
        id: payload.id || `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        type: 'SOS',
        data: payload.data,
        relayedBy: payload.relayedBy || 'Peer',
        relayCount: payload.relayCount || 1,
        timestamp: payload.timestamp || Date.now()
      };
      this.handleIncomingMessage(meshMsg);
    } else if (type === 'RESCUE_PING') {
      const meshMsg: MeshMessage = {
        id: payload.id || `ping-${Date.now()}`,
        type: 'RESCUE_PING',
        targetDeviceId: payload.targetDeviceId,
        sosId: payload.sosId,
        adminName: payload.adminName || 'Incident Command',
        message: payload.message || 'Help is arriving! First responders have acknowledged your distress call and are en route.',
        relayedBy: payload.relayedBy || 'Gateway',
        relayCount: payload.relayCount || 1,
        timestamp: payload.timestamp || Date.now()
      };
      console.log(`[BitChat] Received RESCUE_PING for target: ${meshMsg.targetDeviceId}, SOS: ${meshMsg.sosId}`);
      this.handleIncomingMessage(meshMsg);
    } else if (type === 'PEER_CHAT') {
      const chatData: ChatMessage = payload.chatPayload || {
        id: payload.id || `chat-${Date.now()}`,
        senderId: payload.senderId,
        senderUsername: payload.senderUsername || 'Anonymous Peer',
        targetDeviceId: payload.targetDeviceId,
        targetUsername: payload.targetUsername,
        text: payload.text || '',
        timestamp: payload.timestamp || Date.now()
      };

      console.log(`[BitChat] Received PEER_CHAT from @${chatData.senderUsername}: "${chatData.text}"`);
      this.chatMessageHandlers.forEach(h => {
        try {
          h(chatData);
        } catch (e) {
          console.error('[BitChat] Chat message handler error:', e);
        }
      });
    } else if (type === 'SYNC_HISTORY') {
      if (Array.isArray(payload.reports)) {
        console.log(`[BitChat] Received ${payload.reports.length} sync reports from mesh gateway`);
        payload.reports.forEach((report: SOSReport) => {
          const meshMsg: MeshMessage = {
            id: `sync-${report.id}`,
            type: 'SOS',
            data: report,
            relayedBy: 'GatewaySync',
            relayCount: 0,
            timestamp: report.timestamp || Date.now()
          };
          this.handleIncomingMessage(meshMsg);
        });
      }
    }
  }

  private updatePeerList(peers: any[]): void {
    this.connectedDevices.clear();
    peers.forEach((p) => {
      if (p.id !== this.deviceId) {
        this.connectedDevices.set(p.id, {
          id: p.id,
          name: p.name || getDeviceName(p.id),
          lastSeen: Date.now(),
          isConnected: true
        });
      }
    });
    this.notifyStatus();
  }

  private notifyStatus(): void {
    const status = {
      connected: this.isConnectedToGateway,
      peerCount: this.connectedDevices.size
    };
    this.statusHandlers.forEach(handler => {
      try {
        handler(status);
      } catch (e) {
        console.error('[BitChat] Status listener error:', e);
      }
    });
  }

  broadcastSOS(sos: SOSReport): void {
    const message: MeshMessage = {
      id: sos.id || `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      type: 'SOS',
      data: sos,
      relayedBy: this.deviceId,
      relayCount: 0,
      timestamp: Date.now()
    };

    console.log('[BitChat] Broadcasting SOS to mesh network:', message.id);
    this.seenMessageIds.add(message.id);

    const payload = {
      type: 'SOS',
      id: message.id,
      data: sos,
      relayCount: 0,
      relayedBy: this.deviceId
    };

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendRaw(payload);
    } else {
      console.warn('[BitChat] Offline: Queuing SOS for transmission when reconnected');
      this.pendingMessages.push(message);
    }
  }

  private sendRaw(payload: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(payload));
      } catch (e) {
        console.error('[BitChat] Failed to send packet:', e);
      }
    }
  }

  private flushPendingMessages(): void {
    if (this.pendingMessages.length > 0) {
      console.log(`[BitChat] Flushing ${this.pendingMessages.length} queued messages to mesh relay...`);
      const queue = [...this.pendingMessages];
      this.pendingMessages = [];
      queue.forEach(msg => {
        this.sendRaw({
          type: 'SOS',
          id: msg.id,
          data: msg.data,
          relayCount: msg.relayCount,
          relayedBy: this.deviceId
        });
      });
    }
  }

  sendRescuePing(targetDeviceId: string, sosId: string, adminName: string = 'Command Center'): void {
    const payload = {
      type: 'RESCUE_PING',
      id: `PING-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      targetDeviceId,
      sosId,
      adminName,
      message: 'Help is arriving! First responders have acknowledged your distress call and are en route.',
      timestamp: Date.now(),
      relayedBy: this.deviceId,
      relayCount: 0
    };
    console.log(`[BitChat] Transmitting RESCUE_PING for target: ${targetDeviceId}, SOS: ${sosId}`);
    this.sendRaw(payload);
  }

  private handleIncomingMessage(message: MeshMessage): void {
    const msgId = message.data?.id || message.id;
    if (this.seenMessageIds.has(msgId)) {
      return;
    }
    this.seenMessageIds.add(msgId);

    console.log(`[BitChat] New mesh message received: ${msgId} (Type: ${message.type})`);

    this.messageHandlers.forEach(handler => {
      try {
        handler(message);
      } catch (error) {
        console.error('[BitChat] Message listener error:', error);
      }
    });
  }

  async setGatewayConfig(host: string, port: number = 8765): Promise<void> {
    this.serverHost = host.trim();
    this.serverPort = port;
    await AsyncStorage.setItem(MESH_SERVER_CONFIG.STORAGE_KEY_HOST, this.serverHost);
    await AsyncStorage.setItem(MESH_SERVER_CONFIG.STORAGE_KEY_PORT, this.serverPort.toString());
    console.log(`[BitChat] Gateway config updated: ws://${this.serverHost}:${this.serverPort}. Reconnecting...`);
    this.connect();
  }

  getGatewayStatus() {
    return {
      connected: this.isConnectedToGateway,
      host: this.serverHost,
      port: this.serverPort,
      peerCount: this.connectedDevices.size,
      peers: this.getConnectedDevices()
    };
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandlers.push(handler);
  }

  onStatusChange(handler: StatusHandler): void {
    this.statusHandlers.push(handler);
    // Send immediate initial status
    handler({
      connected: this.isConnectedToGateway,
      peerCount: this.connectedDevices.size
    });
  }

  onPeerConnected(handler: ConnectionHandler): void {
    this.connectionHandlers.push(handler);
  }

  onPeerDisconnected(handler: ConnectionHandler): void {
    this.disconnectionHandlers.push(handler);
  }

  getConnectedDevices(): Device[] {
    return Array.from(this.connectedDevices.values());
  }

  setUsername(username: string): void {
    this.username = username.trim();
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const registerPayload = {
        type: 'REGISTER',
        deviceId: this.deviceId,
        name: this.username || getDeviceName(this.deviceId)
      };
      this.sendRaw(registerPayload);
      console.log(`[BitChat] Re-registered with username: @${this.username}`);
    }
  }

  getUsername(): string {
    return this.username;
  }

  sendPeerChat(targetDeviceId: string, targetUsername: string, text: string): ChatMessage {
    const chatMsg: ChatMessage = {
      id: `chat-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      senderId: this.deviceId,
      senderUsername: this.username || getDeviceName(this.deviceId),
      targetDeviceId,
      targetUsername,
      text: text.trim(),
      timestamp: Date.now()
    };

    console.log(`[BitChat] Sending PEER_CHAT to @${targetUsername} (${targetDeviceId}): "${text}"`);
    this.sendRaw({
      type: 'PEER_CHAT',
      chatPayload: chatMsg
    });

    return { ...chatMsg, isOutgoing: true };
  }

  onChatMessage(handler: (msg: ChatMessage) => void): () => void {
    this.chatMessageHandlers.push(handler);
    return () => {
      this.chatMessageHandlers = this.chatMessageHandlers.filter(h => h !== handler);
    };
  }

  destroy(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.messageHandlers = [];
    this.connectionHandlers = [];
    this.disconnectionHandlers = [];
    this.statusHandlers = [];
    this.isInitialized = false;
    console.log('[BitChat] Mesh transport shut down');
  }
}

export default BitChatMesh;