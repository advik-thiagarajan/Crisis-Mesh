export type Priority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface SOSReport {
  id: string;
  timestamp: number;
  lat: number;
  lng: number;
  description: string;
  priority: Priority;
  numPeople: number;
  deviceId: string;
  images?: string[];
  voiceNotes?: string[];
  synced: boolean;
  relayCount?: number;
}

export interface MeshMessage {
  id: string;
  type: 'SOS' | 'RELAY' | 'SYNC' | 'HEARTBEAT';
  data: SOSReport;
  relayedBy: string;
  relayCount: number;
  timestamp: number;
}

export interface Device {
  id: string;
  name: string;
  lastSeen: number;
  isConnected: boolean;
}

export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

export interface SummaryData {
  totalReports: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  summary: string;
  timestamp: number;
}