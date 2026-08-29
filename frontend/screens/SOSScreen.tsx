import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, StyleSheet } from 'react-native';
import * as Location from 'expo-location';
import Database from '../services/database';
import classifyPriority from '../services/priorityEngine';
import { CHENNAI } from '../utils/constants';
import { useMesh } from '../services/MeshContext';

export const SOSScreen = ({ route, navigation }: any) => {
  const meshContext = useMesh();
  const mesh = route.params?.mesh || meshContext.mesh;
  const deviceId = route.params?.deviceId || meshContext.deviceId || 'device-local';

  const [description, setDescription] = useState('');
  const [numPeople, setNumPeople] = useState('1');
  const [hasInjury, setHasInjury] = useState(false);
  const [location, setLocation] = useState<{ lat: number; lng: number }>({ lat: CHENNAI.LAT, lng: CHENNAI.LNG });
  const [isSending, setIsSending] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        let loc = await Location.getCurrentPositionAsync({});
        setLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      }
      try {
        const prof = await Database.getUserProfile();
        if (prof) setUserProfile(prof);
      } catch (_) {}
    })();
  }, []);

  const handleSendSOS = async () => {
    if (!description.trim()) {
      Alert.alert('Validation Error', 'Please describe your condition or requirements.');
      return;
    }

    setIsSending(true);
    const priority = classifyPriority(description, hasInjury);
    const sosPayload = {
      id: `SOS-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: Date.now(),
      lat: location.lat,
      lng: location.lng,
      description,
      priority,
      numPeople: parseInt(numPeople) || 1,
      deviceId,
      synced: true,
      relayCount: 0,
      userProfile: userProfile || undefined
    };

    await Database.addSOS(sosPayload);

    if (mesh) {
      mesh.broadcastSOS(sosPayload);
    }

    setIsSending(false);
    Alert.alert('SOS Transmitted', `Urgency: ${priority}. Relaying across nearby Bluetooth devices.`);
    setDescription('');
    setNumPeople('1');
    setHasInjury(false);
    navigation.navigate('Dashboard');
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.header}>🆘 Distress Signal Transmission</Text>
      <Text style={styles.subtext}>Zero cellular data required. Broadcasts directly over peer-to-peer mesh radio.</Text>

      <Text style={styles.label}>Emergency Situation Summary:</Text>
      <TextInput
        placeholder="e.g. 2 adults stranded on roof, water rising, urgent medical assistance needed"
        value={description}
        onChangeText={setDescription}
        style={styles.textArea}
        multiline
      />

      <Text style={styles.label}>Number of Stranded Persons:</Text>
      <TextInput
        placeholder="1"
        value={numPeople}
        onChangeText={setNumPeople}
        keyboardType="number-pad"
        style={styles.input}
      />

      <TouchableOpacity
        onPress={() => setHasInjury(!hasInjury)}
        style={[styles.checkbox, hasInjury && styles.checkboxActive]}
      >
        <Text style={[styles.checkboxText, hasInjury && styles.checkboxTextActive]}>
          {hasInjury ? '✓ Severe Medical Conditions / Injuries Present' : '+ Tap if medical emergency / injury exists'}
        </Text>
      </TouchableOpacity>

      <Text style={styles.locationText}>
        📍 GPS: {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
      </Text>

      <TouchableOpacity
        onPress={handleSendSOS}
        disabled={isSending}
        style={styles.submitButton}
      >
        <Text style={styles.submitText}>{isSending ? 'BROADCASTING...' : 'BROADCAST EMERGENCY SOS'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: '#FFF5F5', flexGrow: 1 },
  header: { fontSize: 22, fontWeight: 'bold', color: '#C53030', marginBottom: 8 },
  subtext: { fontSize: 13, color: '#742A2A', marginBottom: 16 },
  label: { fontWeight: '600', marginBottom: 6, color: '#2D3748' },
  textArea: { borderWidth: 1, borderColor: '#FEB2B2', backgroundColor: '#FFF', padding: 12, borderRadius: 8, minHeight: 90, marginBottom: 16, textAlignVertical: 'top' },
  input: { borderWidth: 1, borderColor: '#FEB2B2', backgroundColor: '#FFF', padding: 12, borderRadius: 8, marginBottom: 16 },
  checkbox: { padding: 14, backgroundColor: '#EDF2F7', borderRadius: 8, marginBottom: 20 },
  checkboxActive: { backgroundColor: '#FEB2B2' },
  checkboxText: { color: '#2D3748', fontWeight: 'bold' },
  checkboxTextActive: { color: '#9B2C2C' },
  locationText: { fontSize: 13, color: '#4A5568', marginBottom: 20 },
  submitButton: { backgroundColor: '#E53E3E', padding: 16, borderRadius: 8, alignItems: 'center' },
  submitText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' }
});