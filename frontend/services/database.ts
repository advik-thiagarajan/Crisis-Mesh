import * as SQLite from 'expo-sqlite';
import { SOSReport, UserProfile } from '../utils/types';
import { DB_CONFIG, PRIORITY_ORDER } from '../utils/constants';

class Database {
  private db: SQLite.SQLiteDatabase | null = null;

  async initialize(): Promise<void> {
    try {
      this.db = await SQLite.openDatabaseAsync(DB_CONFIG.NAME);
      console.log('[DB] Opening database:', DB_CONFIG.NAME);

      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS user_profiles (
          id TEXT PRIMARY KEY,
          name TEXT,
          email TEXT,
          address TEXT,
          blood_type TEXT,
          medical_history TEXT,
          custom_medical_notes TEXT,
          age INTEGER,
          emergency_contact_name TEXT,
          emergency_contact_number TEXT,
          registered_at INTEGER
        );

        CREATE TABLE IF NOT EXISTS sos_reports (
          id TEXT PRIMARY KEY,
          timestamp INTEGER,
          lat REAL,
          lng REAL,
          description TEXT,
          priority TEXT,
          num_people INTEGER,
          device_id TEXT,
          synced INTEGER DEFAULT 0,
          user_metadata TEXT,
          escalation_level INTEGER DEFAULT 0,
          is_automated INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS mesh_messages (
          id TEXT PRIMARY KEY,
          type TEXT,
          data TEXT,
          relay_count INTEGER,
          received_at INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_sos_priority ON sos_reports(priority);
        CREATE INDEX IF NOT EXISTS idx_sos_timestamp ON sos_reports(timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_msg_type ON mesh_messages(type);
      `);

      // Safe column additions for existing installs
      try { await this.db.execAsync(`ALTER TABLE sos_reports ADD COLUMN user_metadata TEXT;`); } catch (_) {}
      try { await this.db.execAsync(`ALTER TABLE sos_reports ADD COLUMN escalation_level INTEGER DEFAULT 0;`); } catch (_) {}
      try { await this.db.execAsync(`ALTER TABLE sos_reports ADD COLUMN is_automated INTEGER DEFAULT 0;`); } catch (_) {}

      console.log('[DB] Database schema operational with profile and metadata support');
    } catch (error) {
      console.error('[DB] Initialization error:', error);
      throw error;
    }
  }

  async saveUserProfile(profile: UserProfile): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    try {
      await this.db.runAsync(
        `INSERT OR REPLACE INTO user_profiles
         (id, name, email, address, blood_type, medical_history, custom_medical_notes, age, emergency_contact_name, emergency_contact_number, registered_at)
         VALUES ('current_user', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          profile.name,
          profile.email,
          profile.address,
          profile.bloodType,
          JSON.stringify(profile.medicalHistory),
          profile.customMedicalNotes || '',
          profile.age,
          profile.emergencyContactName,
          profile.emergencyContactNumber,
          profile.registeredAt || Date.now()
        ]
      );
      console.log('[DB] Saved user profile for:', profile.name);
    } catch (error) {
      console.error('[DB] Error saving user profile:', error);
      throw error;
    }
  }

  async getUserProfile(): Promise<UserProfile | null> {
    if (!this.db) throw new Error('Database not initialized');
    try {
      const row = await this.db.getFirstAsync<any>(
        `SELECT * FROM user_profiles WHERE id = 'current_user'`
      );
      if (!row) return null;
      return {
        name: row.name,
        email: row.email,
        address: row.address,
        bloodType: row.blood_type,
        medicalHistory: row.medical_history ? JSON.parse(row.medical_history) : [],
        customMedicalNotes: row.custom_medical_notes,
        age: row.age,
        emergencyContactName: row.emergency_contact_name,
        emergencyContactNumber: row.emergency_contact_number,
        registeredAt: row.registered_at
      };
    } catch (error) {
      console.error('[DB] Error reading user profile:', error);
      return null;
    }
  }

  async addSOS(sos: SOSReport): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    try {
      await this.db.runAsync(
        `INSERT OR REPLACE INTO sos_reports 
         (id, timestamp, lat, lng, description, priority, num_people, device_id, synced, user_metadata, escalation_level, is_automated)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          sos.id,
          sos.timestamp,
          sos.lat,
          sos.lng,
          sos.description,
          sos.priority,
          sos.numPeople,
          sos.deviceId,
          sos.synced ? 1 : 0,
          sos.userProfile ? JSON.stringify(sos.userProfile) : null,
          sos.escalationLevel || 0,
          sos.isAutomated ? 1 : 0
        ]
      );
      console.log('[DB] Registered SOS:', sos.id, `[${sos.priority}]`);
    } catch (error) {
      console.error('[DB] Error adding SOS:', error);
    }
  }

  async getAllSOS(): Promise<SOSReport[]> {
    if (!this.db) throw new Error('Database not initialized');
    try {
      const result = await this.db.getAllAsync<any>(
        `SELECT * FROM sos_reports LIMIT 100`
      );
      const mapped: SOSReport[] = result.map(row => {
        let userProfile: UserProfile | undefined = undefined;
        if (row.user_metadata) {
          try {
            userProfile = JSON.parse(row.user_metadata);
          } catch (_) {}
        }
        return {
          id: row.id,
          timestamp: row.timestamp,
          lat: row.lat,
          lng: row.lng,
          description: row.description,
          priority: row.priority,
          numPeople: row.num_people,
          deviceId: row.device_id,
          synced: row.synced === 1,
          userProfile,
          escalationLevel: row.escalation_level || 0,
          isAutomated: row.is_automated === 1,
          images: [],
          voiceNotes: []
        };
      });

      // Strict Priority Ordering: CRITICAL > VERY HIGH > HIGH > MEDIUM > LOW
      mapped.sort((a, b) => {
        const pDiff = (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99);
        if (pDiff !== 0) return pDiff;
        return b.timestamp - a.timestamp;
      });

      return mapped;
    } catch (error) {
      console.error('[DB] Error fetching SOS reports:', error);
      return [];
    }
  }

  async getSOSByPriority(priority: string): Promise<SOSReport[]> {
    if (!this.db) throw new Error('Database not initialized');
    try {
      const result = await this.db.getAllAsync<any>(
        `SELECT * FROM sos_reports WHERE priority = ? ORDER BY timestamp DESC`,
        [priority]
      );
      return result.map(row => ({
        id: row.id,
        timestamp: row.timestamp,
        lat: row.lat,
        lng: row.lng,
        description: row.description,
        priority: row.priority,
        numPeople: row.num_people,
        deviceId: row.device_id,
        synced: row.synced === 1,
        images: [],
        voiceNotes: []
      }));
    } catch (error) {
      console.error('[DB] Error getting SOS by priority:', error);
      return [];
    }
  }

  async markSynced(sosId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    try {
      await this.db.runAsync(
        'UPDATE sos_reports SET synced = 1 WHERE id = ?',
        [sosId]
      );
    } catch (error) {
      console.error('[DB] Error marking synced:', error);
    }
  }

  async addMeshMessage(id: string, type: string, data: any, relayCount: number): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    try {
      await this.db.runAsync(
        `INSERT INTO mesh_messages (id, type, data, relay_count, received_at)
         VALUES (?, ?, ?, ?, ?)`,
        [id, type, JSON.stringify(data), relayCount, Date.now()]
      );
    } catch (error) {
      console.error('[DB] Error adding message:', error);
    }
  }

  async getMessageById(id: string): Promise<any> {
    if (!this.db) throw new Error('Database not initialized');
    try {
      return await this.db.getFirstAsync<any>(
        'SELECT * FROM mesh_messages WHERE id = ?',
        [id]
      );
    } catch (error) {
      console.error('[DB] Error getting message:', error);
      return null;
    }
  }

  async clearOldMessages(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    try {
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      await this.db.runAsync(
        'DELETE FROM mesh_messages WHERE received_at < ?',
        [oneDayAgo]
      );
      console.log('[DB] Garbage collection: cleared expired messages');
    } catch (error) {
      console.error('[DB] Error clearing old messages:', error);
    }
  }

  async getStatistics() {
    if (!this.db) throw new Error('Database not initialized');
    try {
      return await this.db.getFirstAsync<any>(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN priority = 'CRITICAL' THEN 1 ELSE 0 END) as critical,
          SUM(CASE WHEN priority = 'HIGH' THEN 1 ELSE 0 END) as high,
          SUM(CASE WHEN priority = 'MEDIUM' THEN 1 ELSE 0 END) as medium,
          SUM(CASE WHEN priority = 'LOW' THEN 1 ELSE 0 END) as low
        FROM sos_reports
      `);
    } catch (error) {
      console.error('[DB] Error calculating statistics:', error);
      return null;
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.closeAsync();
      console.log('[DB] Database closed');
    }
  }
}

export default new Database();