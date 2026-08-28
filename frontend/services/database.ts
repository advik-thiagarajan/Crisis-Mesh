import * as SQLite from 'expo-sqlite';
import { SOSReport } from '../utils/types';
import { DB_CONFIG } from '../utils/constants';

class Database {
  private db: SQLite.SQLiteDatabase | null = null;

  async initialize(): Promise<void> {
    try {
      this.db = await SQLite.openDatabaseAsync(DB_CONFIG.NAME);
      console.log('[DB] Opening database:', DB_CONFIG.NAME);

      await this.db.execAsync(`
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

      console.log('[DB] Database schema operational');
    } catch (error) {
      console.error('[DB] Initialization error:', error);
      throw error;
    }
  }

  async addSOS(sos: SOSReport): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    try {
      await this.db.runAsync(
        `INSERT OR IGNORE INTO sos_reports 
         (id, timestamp, lat, lng, description, priority, num_people, device_id, synced)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          sos.id,
          sos.timestamp,
          sos.lat,
          sos.lng,
          sos.description,
          sos.priority,
          sos.numPeople,
          sos.deviceId,
          sos.synced ? 1 : 0
        ]
      );
      console.log('[DB] Registered SOS:', sos.id);
    } catch (error) {
      console.error('[DB] Error adding SOS:', error);
    }
  }

  async getAllSOS(): Promise<SOSReport[]> {
    if (!this.db) throw new Error('Database not initialized');
    try {
      const result = await this.db.getAllAsync<any>(
        `SELECT * FROM sos_reports ORDER BY timestamp DESC LIMIT 100`
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