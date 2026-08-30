export const CHENNAI = {
  LAT: 13.0827,
  LNG: 80.2707,
  DELTA: 0.05
};

export const PRIORITY_COLORS = {
  CRITICAL: '#dc2626',
  'VERY HIGH': '#e11d48',
  HIGH: '#f97316',
  MEDIUM: '#eab308',
  LOW: '#22c55e'
};

export const PRIORITY_BG_COLORS = {
  CRITICAL: '#fee2e2',
  'VERY HIGH': '#ffe4e6',
  HIGH: '#fed7aa',
  MEDIUM: '#fef08a',
  LOW: '#dcfce7'
};

export const PRIORITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  'VERY HIGH': 1,
  HIGH: 2,
  MEDIUM: 3,
  LOW: 4
};

export const ESCALATION_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'VERY HIGH', 'CRITICAL'] as const;

export const BITCHAT_CONFIG = {
  BROADCAST_INTERVAL: 5000,
  RECONNECT_INTERVAL: 3000,
  MESSAGE_TIMEOUT: 60000,
  MAX_RELAY_COUNT: 5
};

export const DB_CONFIG = {
  NAME: 'crisis_mesh.db'
};

export const UI_CONFIG = {
  TAP_TARGET_SIZE: 48,
  MAP_ZOOM: 13,
  REFRESH_INTERVAL: 2000,
  SUMMARY_REFRESH: 30000
};

export const MESH_SERVER_CONFIG = {
  DEFAULT_HOST: '172.31.99.246',
  DEFAULT_PORT: 8765,
  STORAGE_KEY_HOST: 'CRISIS_MESH_GATEWAY_HOST',
  STORAGE_KEY_PORT: 'CRISIS_MESH_GATEWAY_PORT',
};

export const PROFILE_STORAGE_KEY = 'CRISIS_MESH_USER_PROFILE';
export const FLOOD_SIMULATION_KEY = 'CRISIS_MESH_FLOOD_SIMULATION_STATE';
export const USER_ROLE_STORAGE_KEY = 'CRISIS_MESH_USER_ROLE';
export const ADMIN_PASSCODE = 'COMMAND7';

export const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'] as const;

export const COMMON_MEDICAL_CONDITIONS = [
  'Diabetes',
  'Thyroid',
  'Cardiac Issues',
  'Hypertension',
  'Asthma',
  'Kidney Disease',
  'Physical Disability',
  'None'
] as const;

export const CRITICAL_KEYWORDS = ['trapped', 'collapse', 'fire', 'severe', 'drowning', 'unconscious', 'bleeding'];
export const HIGH_KEYWORDS = ['elderly', 'child', 'infant', 'medical', 'injury', 'broken', 'diabetic'];
export const MEDIUM_KEYWORDS = ['food', 'water', 'shelter', 'blanket', 'stranded', 'flooded'];