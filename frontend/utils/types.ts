export type Priority = 'CRITICAL' | 'VERY HIGH' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface UserProfile {
  name: string;
  email: string;
  address: string;
  bloodType: string;
  medicalHistory: string[]; // e.g. ['Diabetes', 'Thyroid', 'Cardiac Issues']
  customMedicalNotes?: string;
  age: number;
  emergencyContactName: string;
  emergencyContactNumber: string;
  registeredAt: number;
}

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
  userProfile?: UserProfile;
  escalationLevel?: number; // 1 = Low, 2 = Medium, 3 = High, 4 = Very High, 5 = Critical
  isAutomated?: boolean;
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
  veryHighCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  summary: string;
  timestamp: number;
}