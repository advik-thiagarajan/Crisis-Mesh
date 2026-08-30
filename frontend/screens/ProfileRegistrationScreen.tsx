import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  StyleSheet
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Database from '../services/database';
import { UserProfile } from '../utils/types';
import {
  BLOOD_TYPES,
  COMMON_MEDICAL_CONDITIONS,
  PROFILE_STORAGE_KEY,
  USER_ROLE_STORAGE_KEY,
  FLOOD_SIMULATION_KEY,
  ADMIN_PASSCODE
} from '../utils/constants';

export const ProfileRegistrationScreen = ({ navigation, route }: any) => {
  const isEditing = route.params?.isEditing || false;
  const [activeRoleTab, setActiveRoleTab] = useState<'USER' | 'ADMIN'>('USER');

  // User Profile Form States
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [bloodType, setBloodType] = useState('O+');
  const [selectedConditions, setSelectedConditions] = useState<string[]>([]);
  const [customMedical, setCustomMedical] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Admin Login Form States
  const [adminPasscode, setAdminPasscode] = useState(ADMIN_PASSCODE);
  const [responderName, setResponderName] = useState('Command Center Officer');

  useEffect(() => {
    (async () => {
      try {
        const storedRole = await AsyncStorage.getItem(USER_ROLE_STORAGE_KEY);
        if (storedRole === 'ADMIN') {
          setActiveRoleTab('ADMIN');
        }

        const stored = await AsyncStorage.getItem(PROFILE_STORAGE_KEY);
        if (stored) {
          const profile: UserProfile = JSON.parse(stored);
          setName(profile.name || '');
          setAge(profile.age ? profile.age.toString() : '');
          setEmail(profile.email || '');
          setAddress(profile.address || '');
          setBloodType(profile.bloodType || 'O+');
          setSelectedConditions(profile.medicalHistory || []);
          setCustomMedical(profile.customMedicalNotes || '');
          setEmergencyName(profile.emergencyContactName || '');
          setEmergencyPhone(profile.emergencyContactNumber || '');
        }
      } catch (err) {
        console.warn('Could not load profile:', err);
      }
    })();
  }, []);

  const toggleCondition = (condition: string) => {
    if (condition === 'None') {
      setSelectedConditions(['None']);
      return;
    }
    const filtered = selectedConditions.filter(c => c !== 'None');
    if (filtered.includes(condition)) {
      setSelectedConditions(filtered.filter(c => c !== condition));
    } else {
      setSelectedConditions([...filtered, condition]);
    }
  };

  const handleSaveUserProfile = async () => {
    if (!name.trim()) {
      Alert.alert('Required Field', 'Please enter your full name.');
      return;
    }
    const ageNum = parseInt(age, 10);
    if (!ageNum || ageNum < 1 || ageNum > 120) {
      Alert.alert('Invalid Age', 'Please enter a valid age.');
      return;
    }
    if (!emergencyName.trim() || !emergencyPhone.trim()) {
      Alert.alert(
        'Emergency Contact Required',
        'Please provide an emergency contact person and phone number for disaster rescue coordination.'
      );
      return;
    }

    setIsSaving(true);
    const profile: UserProfile = {
      name: name.trim(),
      age: ageNum,
      email: email.trim(),
      address: address.trim(),
      bloodType,
      medicalHistory: selectedConditions,
      customMedicalNotes: customMedical.trim(),
      emergencyContactName: emergencyName.trim(),
      emergencyContactNumber: emergencyPhone.trim(),
      registeredAt: Date.now()
    };

    try {
      await Database.saveUserProfile(profile);
      await AsyncStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
      await AsyncStorage.setItem(USER_ROLE_STORAGE_KEY, 'USER');

      // Reset Flood Simulation so the flood alert appears fresh for this session
      await AsyncStorage.removeItem(FLOOD_SIMULATION_KEY);

      setIsSaving(false);

      if (isEditing) {
        Alert.alert('Profile Updated', 'Your emergency medical profile has been updated.');
        navigation.goBack();
      } else {
        navigation.replace('Dashboard', { role: 'USER', triggerFloodAlert: true });
      }
    } catch (error) {
      setIsSaving(false);
      Alert.alert('Save Failed', 'Could not save profile. Please try again.');
    }
  };

  const handleLoginAsAdmin = async () => {
    if (adminPasscode.trim() !== ADMIN_PASSCODE && adminPasscode.trim() !== 'admin') {
      Alert.alert('Invalid Passcode', `Incorrect Admin key. Default demo key is: ${ADMIN_PASSCODE}`);
      return;
    }

    await AsyncStorage.setItem(USER_ROLE_STORAGE_KEY, 'ADMIN');
    Alert.alert(
      'Admin Access Granted',
      `Logged in as First Responder: ${responderName || 'Incident Commander'}. Command Center unlocked.`
    );
    navigation.replace('Dashboard', { role: 'ADMIN', responderName, triggerFloodAlert: false });
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Top Segmented Role Switcher */}
      <View style={styles.roleTabsContainer}>
        <TouchableOpacity
          style={[styles.roleTab, activeRoleTab === 'USER' && styles.roleTabActive]}
          onPress={() => setActiveRoleTab('USER')}
        >
          <Text style={[styles.roleTabText, activeRoleTab === 'USER' && styles.roleTabTextActive]}>
            👤 Civilian User
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.roleTab, activeRoleTab === 'ADMIN' && styles.roleTabActiveAdmin]}
          onPress={() => setActiveRoleTab('ADMIN')}
        >
          <Text style={[styles.roleTabText, activeRoleTab === 'ADMIN' && styles.roleTabTextActive]}>
            🛡️ Admin / Responder
          </Text>
        </TouchableOpacity>
      </View>

      {/* ================= USER REGISTRATION VIEW ================= */}
      {activeRoleTab === 'USER' && (
        <View>
          <View style={styles.headerBox}>
            <Text style={styles.headerTitle}>🛡️ Emergency Medical Registration</Text>
            <Text style={styles.headerSubtitle}>
              Stored locally on your phone. Dispatched with offline SOS signals so first responders know your blood type and pre-known medical conditions immediately.
            </Text>
          </View>

          {/* Personal Identity */}
          <Text style={styles.sectionTitle}>1. Personal Information</Text>
          <Text style={styles.label}>Full Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Advik Thiagarajan"
            value={name}
            onChangeText={setName}
          />

          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Age *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 24"
                value={age}
                onChangeText={setAge}
                keyboardType="number-pad"
              />
            </View>
            <View style={{ flex: 2 }}>
              <Text style={styles.label}>Email Address</Text>
              <TextInput
                style={styles.input}
                placeholder="advik@example.com"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
          </View>

          <Text style={styles.label}>Residential Address</Text>
          <TextInput
            style={[styles.input, { height: 50, textAlignVertical: 'top' }]}
            placeholder="e.g. 12 Gandhi Road, T. Nagar, Chennai"
            value={address}
            onChangeText={setAddress}
            multiline
          />

          {/* Medical Profile */}
          <Text style={styles.sectionTitle}>2. Medical Vitals</Text>
          <Text style={styles.label}>Blood Type *</Text>
          <View style={styles.chipRow}>
            {BLOOD_TYPES.map(bt => (
              <TouchableOpacity
                key={bt}
                style={[styles.chip, bloodType === bt && styles.chipActive]}
                onPress={() => setBloodType(bt)}
              >
                <Text style={[styles.chipText, bloodType === bt && styles.chipTextActive]}>
                  {bt}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Pre-known Medical History / Conditions:</Text>
          <View style={styles.chipRow}>
            {COMMON_MEDICAL_CONDITIONS.map(cond => {
              const isSelected = selectedConditions.includes(cond);
              return (
                <TouchableOpacity
                  key={cond}
                  style={[styles.chip, isSelected && styles.chipActiveRed]}
                  onPress={() => toggleCondition(cond)}
                >
                  <Text style={[styles.chipText, isSelected && styles.chipTextActiveRed]}>
                    {isSelected ? `✓ ${cond}` : cond}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.label}>Other Medical Conditions / Medications:</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Daily insulin dependent, pacemaker, penicillin allergy"
            value={customMedical}
            onChangeText={setCustomMedical}
          />

          {/* Emergency Contact */}
          <Text style={styles.sectionTitle}>3. Emergency Contact Person</Text>
          <Text style={styles.label}>Contact Name & Relation *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Priya (Spouse / Mother)"
            value={emergencyName}
            onChangeText={setEmergencyName}
          />

          <Text style={styles.label}>Emergency Phone Number *</Text>
          <TextInput
            style={styles.input}
            placeholder="+91 9876543210"
            value={emergencyPhone}
            onChangeText={setEmergencyPhone}
            keyboardType="phone-pad"
          />

          <TouchableOpacity
            style={styles.saveButton}
            onPress={handleSaveUserProfile}
            disabled={isSaving}
          >
            <Text style={styles.saveButtonText}>
              {isSaving ? 'SAVING PROFILE...' : isEditing ? 'UPDATE PROFILE' : 'SAVE & LOGIN AS USER'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ================= ADMINISTRATOR LOGIN VIEW ================= */}
      {activeRoleTab === 'ADMIN' && (
        <View>
          <View style={[styles.headerBox, { backgroundColor: '#742A2A' }]}>
            <Text style={styles.headerTitle}>🛡️ Incident Command & First Responder</Text>
            <Text style={styles.headerSubtitle}>
              Access real-time multi-node SOS telemetry across the entire peer mesh, inspect full patient medical records, and dispatch "Help is Arriving" acknowledgments directly to victim devices.
            </Text>
          </View>

          <View style={styles.adminCard}>
            <Text style={styles.label}>Responder / Commander Call-sign</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Incident Commander Rajesh / Rescue Unit 1"
              value={responderName}
              onChangeText={setResponderName}
            />

            <Text style={styles.label}>Incident Command Passcode</Text>
            <TextInput
              style={styles.input}
              placeholder="Default: COMMAND7"
              value={adminPasscode}
              onChangeText={setAdminPasscode}
              secureTextEntry
            />

            <TouchableOpacity
              style={[styles.saveButton, { backgroundColor: '#9B2C2C', marginTop: 14 }]}
              onPress={handleLoginAsAdmin}
            >
              <Text style={styles.saveButtonText}>ENTER COMMAND CENTER AS ADMIN</Text>
            </TouchableOpacity>

            <View style={styles.demoNoteBox}>
              <Text style={styles.demoNoteTitle}>💡 Hackathon Demo Note:</Text>
              <Text style={styles.demoNoteText}>
                Demo passcode is pre-filled ({ADMIN_PASSCODE}). Tapping the button unlocks the Admin Incident Command Tab with full patient drill-down and rescue ping capabilities!
              </Text>
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { padding: 18, backgroundColor: '#F7FAFC' },
  roleTabsContainer: { flexDirection: 'row', backgroundColor: '#EDF2F7', borderRadius: 10, padding: 4, marginBottom: 16 },
  roleTab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 8 },
  roleTabActive: { backgroundColor: '#2B6CB0' },
  roleTabActiveAdmin: { backgroundColor: '#9B2C2C' },
  roleTabText: { fontSize: 13, fontWeight: '700', color: '#4A5568' },
  roleTabTextActive: { color: '#FFF' },

  headerBox: { backgroundColor: '#2B6CB0', padding: 16, borderRadius: 10, marginBottom: 18 },
  headerTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  headerSubtitle: { color: '#EBF8FF', fontSize: 12, marginTop: 4, lineHeight: 16 },
  sectionTitle: { fontSize: 15, fontWeight: 'bold', color: '#2D3748', marginTop: 12, marginBottom: 10, borderBottomWidth: 1, borderColor: '#E2E8F0', paddingBottom: 4 },
  label: { fontSize: 13, fontWeight: '600', color: '#4A5568', marginBottom: 4, marginTop: 6 },
  input: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#CBD5E0', borderRadius: 8, padding: 10, fontSize: 14, marginBottom: 8, color: '#1A202C' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 20, backgroundColor: '#EDF2F7', borderWidth: 1, borderColor: '#CBD5E0' },
  chipActive: { backgroundColor: '#2B6CB0', borderColor: '#2B6CB0' },
  chipText: { fontSize: 12, fontWeight: '600', color: '#4A5568' },
  chipTextActive: { color: '#FFF', fontWeight: 'bold' },
  chipActiveRed: { backgroundColor: '#E53E3E', borderColor: '#E53E3E' },
  chipTextActiveRed: { color: '#FFF', fontWeight: 'bold' },
  saveButton: { backgroundColor: '#C53030', padding: 16, borderRadius: 10, alignItems: 'center', marginTop: 20, marginBottom: 20, elevation: 3 },
  saveButtonText: { color: '#FFF', fontSize: 14, fontWeight: 'bold', letterSpacing: 0.5 },

  adminCard: { backgroundColor: '#FFF', padding: 18, borderRadius: 10, borderWidth: 1, borderColor: '#FEB2B2', marginTop: 4 },
  demoNoteBox: { backgroundColor: '#FFF5F5', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#FEB2B2', marginTop: 16 },
  demoNoteTitle: { fontWeight: 'bold', color: '#9B2C2C', fontSize: 12 },
  demoNoteText: { color: '#742A2A', fontSize: 11, marginTop: 2, lineHeight: 16 }
});
