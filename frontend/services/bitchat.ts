import { MeshMessage, SOSReport, Device } from '../utils/types';
import { BITCHAT_CONFIG } from '../utils/constants';

type MessageHandler = (message: MeshMessage) => void;
type ConnectionHandler = (device: Device) => void;

class BitChatMesh {
  private messageHandlers: MessageHandler[] = [];
  private connectionHandlers: ConnectionHandler[] = [];
  private disconnectionHandlers: ConnectionHandler[] = [];
  private seenMessageIds: Set<string> = new Set();
  private connectedDevices: Map<string, Device> = new Map();
  private deviceId: string;
  private isInitialized: boolean = false;
  private broadcastInterval: NodeJS.Timeout | null = null;
  private pendingMessages: MeshMessage[] = [];

  constructor(deviceId: string) {
    this.deviceId = deviceId;
  }

  async initialize(): Promise<void> {
    try {
      console.log(`[BitChat] Initializing peer network for device: ${this.deviceId}`);
      this.isInitialized = true;
      this.startBroadcastLoop();
      console.log('[BitChat] Mesh transport layer ready');
    } catch (error) {
      console.error('[BitChat] Initialization failed:', error);
      throw error;
    }
  }

  broadcastSOS(sos: SOSReport): void {
    if (!this.isInitialized) {
      console.warn('[BitChat] Mesh not initialized');
      return;
    }

    const message: MeshMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      type: 'SOS',
      data: sos,
      relayedBy: this.deviceId,
      relayCount: 0,
      timestamp: Date.now()
    };

    console.log('[BitChat] Transmitting SOS Packet:', message.id);
    this.handleIncomingMessage(message);
    this.pendingMessages.push(message);
  }

  broadcast(message: MeshMessage): void {
    if (!this.isInitialized) return;
    
    if (this.seenMessageIds.has(message.id)) {
      return;
    }

    message.relayedBy = this.deviceId;
    message.relayCount = (message.relayCount || 0) + 1;
    message.timestamp = Date.now();

    if (message.relayCount < BITCHAT_CONFIG.MAX_RELAY_COUNT) {
      this.pendingMessages.push(message);
      this.handleIncomingMessage(message);
      console.log(`[BitChat] Hopping message ${message.id} (hop count: ${message.relayCount})`);
    }
  }

  private handleIncomingMessage(message: MeshMessage): void {
    if (this.seenMessageIds.has(message.id)) {
      return;
    }

    this.seenMessageIds.add(message.id);

    this.messageHandlers.forEach(handler => {
      try {
        handler(message);
      } catch (error) {
        console.error('[BitChat] Listener error:', error);
      }
    });

    if (message.relayedBy !== this.deviceId && message.relayCount < BITCHAT_CONFIG.MAX_RELAY_COUNT) {
      setTimeout(() => {
        this.broadcast(message);
      }, BITCHAT_CONFIG.BROADCAST_INTERVAL);
    }
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandlers.push(handler);
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

  simulatePeerConnection(deviceId: string, name: string): void {
    const device: Device = {
      id: deviceId,
      name,
      lastSeen: Date.now(),
      isConnected: true
    };

    this.connectedDevices.set(deviceId, device);
    this.connectionHandlers.forEach(handler => handler(device));
    console.log(`[BitChat Bridge] Peer attached: ${name}`);
  }

  simulatePeerDisconnection(deviceId: string): void {
    const device = this.connectedDevices.get(deviceId);
    if (device) {
      device.isConnected = false;
      this.disconnectionHandlers.forEach(handler => handler(device));
      this.connectedDevices.delete(deviceId);
      console.log(`[BitChat Bridge] Peer detached: ${device.name}`);
    }
  }

  private startBroadcastLoop(): void {
    this.broadcastInterval = setInterval(() => {
      if (this.pendingMessages.length > 0) {
        console.log(`[BitChat] Flushing ${this.pendingMessages.length} pending frames to mesh channel`);
      }
    }, BITCHAT_CONFIG.BROADCAST_INTERVAL);
  }

  destroy(): void {
    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
    }
    this.messageHandlers = [];
    this.connectionHandlers = [];
    this.disconnectionHandlers = [];
    this.isInitialized = false;
    console.log('[BitChat] Mesh instance shut down');
  }
}

export default BitChatMesh;