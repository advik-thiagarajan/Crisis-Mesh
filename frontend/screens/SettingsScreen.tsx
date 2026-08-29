import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Database from '../services/database';
import { useMesh } from '../services/MeshContext';
import { MESH_SERVER_CONFIG, PROFILE_STORAGE_KEY, FLOOD_SIMULATION_KEY } from '../utils/constants';
import { detectBundlerHost } from '../services/bitchat';
import { UserProfile } from '../utils/types';

export const SettingsScreen = ({ navigation }: any) => {
  const { mesh, deviceId, isConnected, peerCount } = useMesh();
  const [gatewayHost, setGatewayHost] = useState(MESH_SERVER_CONFIG.DEFAULT_HOST);
  const [gatewayPort, setGatewayPort] = useState(MESH_SERVER_CONFIG.DEFAULT_PORT.toString());
  const [peers, setPeers] = useState<any[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(PROFILE_STORAGE_KEY);
        if (stored) {
          setUserProfile(JSON.parse(stored));
        } else {
          const dbProfile = await Database.getUserProfile();
          if (dbProfile) setUserProfile(dbProfile);
        }
      } catch (_) {}
    })();

    if (mesh) {
      const status = mesh.getGatewayStatus();
      setGatewayHost(status.host);
      setGatewayPort(status.port.toString());
      setPeers(status.peers);

      mesh.onStatusChange((s) => {
        if (mesh) {
          setPeers(mesh.getConnectedDevices());
        }
      });
    }
  }, [mesh]);

  const handleAutoDetect = async () => {
    const detected = detectBundlerHost();
    if (detected) {
      setGatewayHost(detected);
      if (mesh) {
        await mesh.setGatewayConfig(detected, parseInt(gatewayPort, 10) || 8765);
      }
      Alert.alert('Auto-Detected Host', `Found active host IP: ${detected}. Reconnected!`);
    } else {
      Alert.alert('Detection Failed', 'Could not detect host automatically. Please enter your computer/hotspot IP manually.');
    }
  };

  const handleUpdateGateway = async () => {
    if (!mesh) return;
    if (!gatewayHost.trim()) {
      Alert.alert('Error', 'Please enter a valid IP address or hostname.');
      return;
    }
    const port = parseInt(gatewayPort, 10) || 8765;
    await mesh.setGatewayConfig(gatewayHost.trim(), port);
    Alert.alert('Gateway Updated', `Reconnecting to ws://${gatewayHost.trim()}:${port}...`);
  };

  const handleResetGateway = async () => {
    if (!mesh) return;
    setGatewayHost(MESH_SERVER_CONFIG.DEFAULT_HOST);
    setGatewayPort(MESH_SERVER_CONFIG.DEFAULT_PORT.toString());
    await mesh.setGatewayConfig(MESH_SERVER_CONFIG.DEFAULT_HOST, MESH_SERVER_CONFIG.DEFAULT_PORT);
    Alert.alert('Reset', `Reset gateway to default: ${MESH_SERVER_CONFIG.DEFAULT_HOST}:${MESH_SERVER_CONFIG.DEFAULT_PORT}`);
  };

  const handleBroadcastTestSOS = async () => {
    if (!mesh) return;
    const testSOS = {
      id: `TEST-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`,
      timestamp: Date.now(),
      lat: 13.0827 + (Math.random() - 0.5) * 0.02,
      lng: 80.2707 + (Math.random() - 0.5) * 0.02,
      description: `[DIAGNOSTIC TEST] Radio link check from node ${deviceId.slice(-6)}`,
      priority: 'HIGH' as const,
      numPeople: 2,
      deviceId,
      synced: true,
      relayCount: 0,
      userProfile: userProfile || undefined
    };

    await Database.addSOS(testSOS);
    mesh.broadcastSOS(testSOS);
    Alert.alert('Test Transmitted', `Broadcasted diagnostic packet to ${peerCount} connected peer(s).`);
  };

  const handleResetFloodSimulation = async () => {
    await AsyncStorage.removeItem(FLOOD_SIMULATION_KEY);
    Alert.alert(
      'Simulation Reset',
      'Flood Disaster simulation state has been reset. When you return to the Dashboard, the emergency alert will trigger fresh!'
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>CrisisMesh Node Diagnostics</Text>

      {/* Emergency Medical Profile Card */}
      <View style={[styles.section, { borderColor: '#E53E3E', borderWidth: 1.5 }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Text style={[styles.sectionHeader, { color: '#C53030', marginBottom: 0 }]}>
            🛡️ My Emergency Medical Profile
          </Text>
          <TouchableOpacity
            style={styles.editProfileBtn}
            onPress={() => navigation.navigate('ProfileRegistration', { isEditing: true })}
          >
            <Text style={styles.editProfileText}>✏️ Edit</Text>
          </TouchableOpacity>
        </View>

        {userProfile ? (
          <View style={styles.profileSummaryBox}>
            <Text style={styles.profileName}>{userProfile.name}, {userProfile.age}y</Text>
            <Text style={styles.profileDetail}>🩸 Blood Group: <Text style={{ fontWeight: 'bold', color: '#C53030' }}>{userProfile.bloodType}</Text></Text>
            <Text style={styles.profileDetail}>
              ⚠️ Pre-known Conditions: {userProfile.medicalHistory?.join(', ') || 'None'}
              {userProfile.customMedicalNotes ? ` (${userProfile.customMedicalNotes})` : ''}
            </Text>
            <Text style={styles.profileDetail}>📞 Emergency Contact: {userProfile.emergencyContactName} ({userProfile.emergencyContactNumber})</Text>
            {userProfile.address ? <Text style={styles.profileDetail}>🏠 Address: {userProfile.address}</Text> : null}
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.button, { backgroundColor: '#C53030' }]}
            onPress={() => navigation.navigate('ProfileRegistration', { isEditing: false })}
          >
            <Text style={styles.buttonText}>+ Create Emergency Medical Profile</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Local Hardware Node Status */}
      <View style={styles.infoBox}>
        <View style={styles.statusRow}>
          <Text style={styles.infoLabel}>Node Status:</Text>
          <View style={[styles.badge, { backgroundColor: isConnected ? '#C6F6D5' : '#FEFCBF' }]}>
            <Text style={[styles.badgeText, { color: isConnected ? '#22543D' : '#744210' }]}>
              {isConnected ? 'ONLINE & SYNCED' : 'SEARCHING...'}
            </Text>
          </View>
        </View>

        <Text style={styles.infoText}>Hardware Device ID: {deviceId}</Text>
        <Text style={styles.infoText}>Gateway Endpoint: ws://{gatewayHost}:{gatewayPort}</Text>
        <Text style={styles.infoText}>Active Mesh Peers: {peerCount}</Text>
      </View>

      {/* Connected Peers List */}
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>Connected Peer Nodes ({peers.length}):</Text>
        {peers.length === 0 ? (
          <Text style={styles.emptyText}>
            No other nodes detected yet. Open CrisisMesh on another phone on this network to sync.
          </Text>
        ) : (
          peers.map(p => (
            <View key={p.id} style={styles.peerCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.peerName}>🟢 {p.name}</Text>
                <Text style={styles.peerId}>ID: {p.id}</Text>
              </View>
              <Text style={styles.peerStatus}>Active</Text>
            </View>
          ))
        )}
      </View>

      {/* Gateway Configuration */}
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>Offline Mesh Gateway Config:</Text>
        <Text style={styles.hintText}>
          IP of the computer or phone hosting the CrisisMesh relay:
        </Text>
        <TextInput
          style={styles.input}
          value={gatewayHost}
          onChangeText={setGatewayHost}
          placeholder="e.g. 172.31.99.246 or 192.168.43.1"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 6 }}>
          <TouchableOpacity style={[styles.button, { flex: 1, backgroundColor: '#2B6CB0' }]} onPress={handleAutoDetect}>
            <Text style={styles.buttonText}>⚡ Auto-Detect IP</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, { flex: 1 }]} onPress={handleUpdateGateway}>
            <Text style={styles.buttonText}>Save & Reconnect</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.button, { backgroundColor: '#718096', width: 70 }]} 
            onPress={handleResetGateway}
          >
            <Text style={styles.buttonText}>Reset</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Simulation & Demo Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>Disaster Simulation & Testing:</Text>
        <TouchableOpacity 
          style={[styles.button, { backgroundColor: '#319795' }]} 
          onPress={handleResetFloodSimulation}
        >
          <Text style={styles.buttonText}>🌊 Re-trigger Simulated Heavy Flood Alert</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.button, { backgroundColor: '#DD6B20' }]} 
          onPress={handleBroadcastTestSOS}
        >
          <Text style={styles.buttonText}>📡 Transmit Diagnostic Test Alert</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: '#F7FAFC' },
  title: { fontSize: 18, fontWeight: 'bold', marginBottom: 16, color: '#2D3748' },
  infoBox: { padding: 14, backgroundColor: '#EDF2F7', borderRadius: 8, marginBottom: 16 },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  infoLabel: { fontSize: 14, fontWeight: 'bold', color: '#2D3748' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  infoText: { fontSize: 13, color: '#4A5568', marginVertical: 2 },
  section: { backgroundColor: '#FFF', padding: 14, borderRadius: 8, marginBottom: 16, borderWidth: 1, borderColor: '#E2E8F0' },
  sectionHeader: { fontSize: 14, fontWeight: 'bold', color: '#2D3748', marginBottom: 8 },
  hintText: { fontSize: 12, color: '#718096', marginBottom: 8 },
  emptyText: { fontSize: 12, color: '#A0AEC0', fontStyle: 'italic', paddingVertical: 4 },
  peerCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderColor: '#EDF2F7' },
  peerName: { fontWeight: 'bold', fontSize: 13, color: '#2D3748' },
  peerId: { fontSize: 11, color: '#718096', marginTop: 2 },
  peerStatus: { fontSize: 11, color: '#38A169', fontWeight: 'bold' },
  input: { borderWidth: 1, borderColor: '#CBD5E0', borderRadius: 6, padding: 10, marginBottom: 10, fontSize: 14, backgroundColor: '#FFF' },
  button: { backgroundColor: '#3182CE', padding: 12, borderRadius: 6, alignItems: 'center', marginBottom: 8 },
  buttonText: { color: '#FFF', fontWeight: 'bold', fontSize: 13 },
  editProfileBtn: { backgroundColor: '#EDF2F7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  editProfileText: { color: '#2B6CB0', fontSize: 12, fontWeight: 'bold' },
  profileSummaryBox: { backgroundColor: '#FFF5F5', padding: 10, borderRadius: 6, borderWidth: 1, borderColor: '#FED7D7' },
  profileName: { fontSize: 14, fontWeight: 'bold', color: '#2D3748' },
  profileDetail: { fontSize: 12, color: '#4A5568', marginTop: 3 }
});
