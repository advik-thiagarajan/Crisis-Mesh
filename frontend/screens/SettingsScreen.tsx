import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import Database from '../services/database';

export const SettingsScreen = ({ route }: any) => {
  const mesh = route.params?.mesh;
  const deviceId = route.params?.deviceId || 'Unknown';
  const [connectedPeers, setConnectedPeers] = useState<number>(0);

  const handleSimulatePeer = () => {
    if (mesh) {
      const mockPeerId = `peer-${Math.floor(Math.random() * 8999 + 1000)}`;
      mesh.simulatePeerConnection(mockPeerId, `MeshNode-${mockPeerId.slice(-4)}`);
      setConnectedPeers(mesh.getConnectedDevices().length);
      Alert.alert('Peer Added', `Simulated connection with node: ${mockPeerId}`);
    }
  };

  const handleInjectMockData = async () => {
    const mockReports = [
      {
        id: `mock-${Date.now()}-1`,
        timestamp: Date.now(),
        lat: 13.0360,
        lng: 80.2600,
        description: 'Building collapse near coastline, 5 people trapped under debris.',
        priority: 'CRITICAL' as const,
        numPeople: 5,
        deviceId: 'peer-device-101',
        synced: true
      },
      {
        id: `mock-${Date.now()}-2`,
        timestamp: Date.now() - 50000,
        lat: 13.0056,
        lng: 80.2621,
        description: 'Clean drinking water shortage, elderly citizens stranded.',
        priority: 'HIGH' as const,
        numPeople: 3,
        deviceId: 'peer-device-102',
        synced: true
      }
    ];

    for (const item of mockReports) {
      await Database.addSOS(item);
    }
    Alert.alert('Mock Data Generated', 'Inserted mock emergency reports into local database.');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>System Control & Diagnostics</Text>
      
      <View style={styles.infoBox}>
        <Text style={styles.infoText}>Node ID: {deviceId}</Text>
        <Text style={styles.infoText}>Active Peers: {connectedPeers}</Text>
      </View>

      <TouchableOpacity style={styles.button} onPress={handleSimulatePeer}>
        <Text style={styles.buttonText}>Simulate Peer Attachment</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.button, { backgroundColor: '#319795' }]} onPress={handleInjectMockData}>
        <Text style={styles.buttonText}>Populate Test Scenarios</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#FFF' },
  title: { fontSize: 18, fontWeight: 'bold', marginBottom: 16, color: '#2D3748' },
  infoBox: { padding: 14, backgroundColor: '#EDF2F7', borderRadius: 8, marginBottom: 20 },
  infoText: { fontSize: 14, color: '#4A5568', marginVertical: 2 },
  button: { backgroundColor: '#3182CE', padding: 14, borderRadius: 8, alignItems: 'center', marginBottom: 12 },
  buttonText: { color: '#FFF', fontWeight: 'bold' }
});