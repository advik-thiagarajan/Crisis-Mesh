import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import Database from '../services/database';
import { generateSummary } from '../services/summarizer';
import { optimizeRoute } from '../services/routeOptimizer';
import { SOSReport, UserProfile, Priority } from '../utils/types';
import {
  CHENNAI,
  PRIORITY_COLORS,
  PRIORITY_BG_COLORS,
  PRIORITY_ORDER,
  PROFILE_STORAGE_KEY,
  FLOOD_SIMULATION_KEY,
  ESCALATION_LEVELS
} from '../utils/constants';
import { useMesh } from '../services/MeshContext';

export const DashboardScreen = ({ navigation }: any) => {
  const { mesh, deviceId, isConnected, peerCount } = useMesh();

  // Core Data
  const [reports, setReports] = useState<SOSReport[]>([]);
  const [summaryText, setSummaryText] = useState('');
  const [activeTab, setActiveTab] = useState<'list' | 'map' | 'route'>('list');
  const [activeAlert, setActiveAlert] = useState<SOSReport | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number }>({
    lat: CHENNAI.LAT,
    lng: CHENNAI.LNG
  });

  // Flood Disaster Simulation States
  const [showInitialFloodModal, setShowInitialFloodModal] = useState<boolean>(false);
  const [persistentSafeBanner, setPersistentSafeBanner] = useState<boolean>(false);
  const [isMonitoringUnsafe, setIsMonitoringUnsafe] = useState<boolean>(false);

  // Periodic Check-In States (2 mins loop / 15s timer)
  const [showCheckInModal, setShowCheckInModal] = useState<boolean>(false);
  const [countdown, setCountdown] = useState<number>(15);
  const [escalationStep, setEscalationStep] = useState<number>(0); // 0=none, 1=LOW, 2=MED, 3=HIGH, 4=V.HIGH, 5=CRIT
  const [fastDemoMode, setFastDemoMode] = useState<boolean>(false);

  const countdownTimerRef = useRef<any>(null);
  const periodicCheckInTimerRef = useRef<any>(null);

  // Load Initial Data & GPS
  useEffect(() => {
    (async () => {
      // 1. Fetch User Profile
      try {
        const storedProfile = await AsyncStorage.getItem(PROFILE_STORAGE_KEY);
        if (storedProfile) {
          setUserProfile(JSON.parse(storedProfile));
        } else {
          const dbProfile = await Database.getUserProfile();
          if (dbProfile) setUserProfile(dbProfile);
        }
      } catch (err) {
        console.warn('Could not read user profile:', err);
      }

      // 2. Fetch GPS
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({});
          setMyLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
        }
      } catch (_) {}

      // 3. Check Initial Flood Alert status
      const floodStatus = await AsyncStorage.getItem(FLOOD_SIMULATION_KEY);
      if (!floodStatus) {
        setShowInitialFloodModal(true);
      } else if (floodStatus === 'SAFE_BANNER_ACTIVE') {
        setPersistentSafeBanner(true);
      } else if (floodStatus === 'UNSAFE_MONITORING') {
        startUnsafeMonitoring(false);
      }

      refreshData();
    })();

    const interval = setInterval(refreshData, 3000);
    return () => clearInterval(interval);
  }, []);

  const refreshData = async () => {
    const data = await Database.getAllSOS();
    const sorted = [...data].sort((a, b) => {
      const pDiff = (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99);
      if (pDiff !== 0) return pDiff;
      return b.timestamp - a.timestamp;
    });
    setReports(sorted);
    setSummaryText(generateSummary(sorted).summary);
  };

  // Mesh packet listener
  useEffect(() => {
    if (!mesh) return;

    mesh.onMessage((msg) => {
      if (msg.type === 'SOS' && msg.data) {
        refreshData();
        if (msg.data.deviceId !== deviceId) {
          setActiveAlert(msg.data);
        }
      }
    });
  }, [mesh, deviceId]);

  // Initial Flood Alert: "I am in a safe place"
  const handleSelectSafePlace = async () => {
    setShowInitialFloodModal(false);
    setPersistentSafeBanner(true);
    await AsyncStorage.setItem(FLOOD_SIMULATION_KEY, 'SAFE_BANNER_ACTIVE');
  };

  // Initial Flood Alert or Persistent Banner: "I am not safe"
  const handleSelectNotSafe = async () => {
    setShowInitialFloodModal(false);
    setPersistentSafeBanner(false);
    await AsyncStorage.setItem(FLOOD_SIMULATION_KEY, 'UNSAFE_MONITORING');
    startUnsafeMonitoring(true);
  };

  // Dismiss Persistent Warning Banner
  const handleDismissBanner = async () => {
    setPersistentSafeBanner(false);
    await AsyncStorage.setItem(FLOOD_SIMULATION_KEY, 'DISMISSED');
  };

  // Start the Unsafe Monitoring Loop
  const startUnsafeMonitoring = (triggerImmediatePopup = false) => {
    setIsMonitoringUnsafe(true);
    if (triggerImmediatePopup) {
      launchCheckInPopup();
    }
  };

  // Launch the 15-second countdown Check-in Modal
  const launchCheckInPopup = () => {
    setShowCheckInModal(true);
    setCountdown(15);

    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);

    countdownTimerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownTimerRef.current);
          handleAutoTimeoutDistress();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Triggered when user confirms: "I am Safe"
  const handleUserConfirmedSafe = async () => {
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    if (periodicCheckInTimerRef.current) clearTimeout(periodicCheckInTimerRef.current);

    setShowCheckInModal(false);
    setIsMonitoringUnsafe(false);
    setEscalationStep(0);
    await AsyncStorage.setItem(FLOOD_SIMULATION_KEY, 'RESOLVED_SAFE');

    Alert.alert('Status Confirmed: Safe', 'Safety confirmed. Active emergency check-ins cancelled.');
  };

  // Triggered when user clicks "I am not Safe" OR 15s Timer expires
  const handleAutoTimeoutDistress = () => {
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    setShowCheckInModal(false);

    // Calculate next escalation priority: LOW -> MEDIUM -> HIGH -> VERY HIGH -> CRITICAL
    const nextStep = Math.min(escalationStep + 1, 5);
    setEscalationStep(nextStep);

    const priority: Priority = ESCALATION_LEVELS[nextStep - 1] || 'LOW';
    broadcastEscalatedSOS(priority, nextStep);

    // Schedule next check-in popup (Fast demo: 15s, Normal: 120s / 2mins)
    const nextIntervalMs = fastDemoMode ? 15000 : 120000;
    if (periodicCheckInTimerRef.current) clearTimeout(periodicCheckInTimerRef.current);
    periodicCheckInTimerRef.current = setTimeout(() => {
      launchCheckInPopup();
    }, nextIntervalMs);
  };

  // Broadcast Escalated SOS to Mesh
  const broadcastEscalatedSOS = async (priority: Priority, step: number) => {
    const medConditions = userProfile?.medicalHistory?.join(', ') || 'None reported';
    const sosPayload: SOSReport = {
      id: `SOS-AUTO-${deviceId.slice(-6)}-${step}`,
      timestamp: Date.now(),
      lat: myLocation.lat + (Math.random() - 0.5) * 0.003,
      lng: myLocation.lng + (Math.random() - 0.5) * 0.003,
      description: `[AUTOMATED CHECK-IN TIMEOUT - ESCALATION ${step}/5] User failed to confirm safety in heavy flood zone.`,
      priority,
      numPeople: 1,
      deviceId,
      synced: true,
      relayCount: 0,
      escalationLevel: step,
      isAutomated: true,
      userProfile: userProfile || undefined
    };

    await Database.addSOS(sosPayload);
    if (mesh) {
      mesh.broadcastSOS(sosPayload);
    }
    refreshData();

    Alert.alert(
      `🚨 Emergency SOS Dispatched [${priority}]`,
      `Safety check-in expired. Automated SOS broadcasted to all nearby rescue peers with your medical records & blood type.`
    );
  };

  const routePlan = optimizeRoute(CHENNAI.LAT, CHENNAI.LNG, reports, 5);

  return (
    <View style={{ flex: 1, backgroundColor: '#F7FAFC' }}>
      {/* Mesh Network Status Header */}
      <TouchableOpacity
        style={[styles.meshStatusBar, { backgroundColor: isConnected ? '#22543D' : '#744210' }]}
        onPress={() => navigation.navigate('Settings')}
        activeOpacity={0.8}
      >
        <View style={styles.meshStatusRow}>
          <View style={[styles.statusDot, { backgroundColor: isConnected ? '#48BB78' : '#ECC94B' }]} />
          <Text style={styles.meshStatusText}>
            {isConnected
              ? `MESH ONLINE: ${peerCount} Nearby Peer${peerCount === 1 ? '' : 's'} Synchronized`
              : 'SEARCHING FOR PEERS... (Tap to configure gateway)'}
          </Text>
        </View>
      </TouchableOpacity>

      {/* Incoming Peer Distress Banner */}
      {activeAlert && (
        <View style={styles.alertBanner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.alertTitle}>🚨 INCOMING DISTRESS SIGNAL</Text>
            <Text style={styles.alertDesc} numberOfLines={2}>
              [{activeAlert.priority}] {activeAlert.description}
            </Text>
            {activeAlert.userProfile && (
              <Text style={styles.alertMedical}>
                Victim: {activeAlert.userProfile.name} ({activeAlert.userProfile.age}y) | 🩸 {activeAlert.userProfile.bloodType} | ⚠️ {activeAlert.userProfile.medicalHistory.join(', ')}
              </Text>
            )}
            <Text style={styles.alertSource}>Node: {activeAlert.deviceId.slice(-8)}</Text>
          </View>
          <TouchableOpacity
            style={styles.alertDismissBtn}
            onPress={() => setActiveAlert(null)}
          >
            <Text style={styles.alertDismissText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Persistent User-Only Safe Status Warning Banner */}
      {persistentSafeBanner && (
        <View style={styles.persistentSafeCard}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={styles.safeCardTitle}>⚠️ HEAVY FLOOD WARNING ACTIVE IN YOUR AREA</Text>
            <Text style={styles.safeCardSubtext}>
              You reported you are in a safe place. Stay alert as conditions change rapidly.
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <TouchableOpacity style={styles.bannerDismissBtn} onPress={handleDismissBanner}>
              <Text style={styles.bannerDismissText}>Dismiss</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.bannerNotSafeBtn} onPress={handleSelectNotSafe}>
              <Text style={styles.bannerNotSafeText}>I am not safe</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Unsafe Monitoring State Active Banner */}
      {isMonitoringUnsafe && (
        <View style={styles.activeMonitoringBanner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.monitoringTitle}>🔴 SAFETY MONITORING ACTIVE</Text>
            <Text style={styles.monitoringSubtext}>
              Check-in triggers every {fastDemoMode ? '15s (Demo)' : '2 mins'}. Escalation: Step {escalationStep}/5
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <TouchableOpacity
              style={styles.demoToggleBtn}
              onPress={() => setFastDemoMode(!fastDemoMode)}
            >
              <Text style={styles.demoToggleText}>
                {fastDemoMode ? '⏱️ Fast (15s)' : '⏱️ 2m'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.checkNowBtn}
              onPress={launchCheckInPopup}
            >
              <Text style={styles.checkNowText}>Check-In Now</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Sitrep Header */}
      <View style={{ padding: 12, backgroundColor: '#2B6CB0' }}>
        <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 13 }}>LOCAL MESH SITREP</Text>
        <Text style={{ color: '#EBF8FF', fontSize: 11, marginTop: 4 }}>{summaryText}</Text>
      </View>

      {/* Tabs */}
      <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: '#E2E8F0' }}>
        <TouchableOpacity
          onPress={() => setActiveTab('list')}
          style={[styles.tab, activeTab === 'list' && styles.activeTab]}
        >
          <Text style={styles.tabText}>Incidents ({reports.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setActiveTab('map')}
          style={[styles.tab, activeTab === 'map' && styles.activeTab]}
        >
          <Text style={styles.tabText}>Live Map</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setActiveTab('route')}
          style={[styles.tab, activeTab === 'route' && styles.activeTab]}
        >
          <Text style={styles.tabText}>Rescue Path</Text>
        </TouchableOpacity>
      </View>

      {/* Incidents List (Strict Priority Order) */}
      {activeTab === 'list' && (
        <FlatList
          data={reports}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const isFromOtherPeer = item.deviceId && item.deviceId !== deviceId;
            const prof = item.userProfile;
            return (
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: PRIORITY_BG_COLORS[item.priority] || '#FFF',
                    borderLeftColor: PRIORITY_COLORS[item.priority] || '#CBD5E0'
                  }
                ]}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Text style={[styles.priorityBadge, { color: PRIORITY_COLORS[item.priority] }]}>
                      {item.priority}
                    </Text>
                    {item.isAutomated && (
                      <View style={styles.autoBadge}>
                        <Text style={styles.autoBadgeText}>🤖 AUTO TIMEOUT</Text>
                      </View>
                    )}
                    {isFromOtherPeer && (
                      <View style={styles.peerBadge}>
                        <Text style={styles.peerBadgeText}>🌐 PEER SYNC</Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ fontSize: 11, color: '#4A5568' }}>
                    People: {item.numPeople}
                  </Text>
                </View>

                {/* Victim Profile Details */}
                {prof && (
                  <View style={styles.victimProfileBox}>
                    <Text style={styles.victimName}>
                      👤 {prof.name}, {prof.age}y &nbsp;
                      <Text style={styles.bloodTag}>[Blood: {prof.bloodType}]</Text>
                    </Text>
                    {prof.medicalHistory && prof.medicalHistory.length > 0 && prof.medicalHistory[0] !== 'None' && (
                      <Text style={styles.medicalAlertText}>
                        ⚠️ Medical Conditions: {prof.medicalHistory.join(', ')}
                        {prof.customMedicalNotes ? ` (${prof.customMedicalNotes})` : ''}
                      </Text>
                    )}
                    {prof.emergencyContactName ? (
                      <Text style={styles.contactText}>
                        📞 Emergency Contact: {prof.emergencyContactName} ({prof.emergencyContactNumber})
                      </Text>
                    ) : null}
                    {prof.address ? (
                      <Text style={styles.addressText}>🏠 {prof.address}</Text>
                    ) : null}
                  </View>
                )}

                <Text style={{ fontSize: 14, fontWeight: '500', marginVertical: 4, color: '#1A202C' }}>
                  {item.description}
                </Text>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                  <Text style={{ fontSize: 11, color: '#718096' }}>
                    📍 {item.lat.toFixed(4)}, {item.lng.toFixed(4)}
                  </Text>
                  <Text style={{ fontSize: 10, color: '#A0AEC0' }}>
                    Node: {item.deviceId ? item.deviceId.slice(-8) : 'local'}
                  </Text>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* Live Map */}
      {activeTab === 'map' && (
        <MapView
          style={{ flex: 1 }}
          initialRegion={{
            latitude: CHENNAI.LAT,
            longitude: CHENNAI.LNG,
            latitudeDelta: CHENNAI.DELTA,
            longitudeDelta: CHENNAI.DELTA
          }}
        >
          {reports.map((item) => (
            <Marker
              key={item.id}
              coordinate={{ latitude: item.lat, longitude: item.lng }}
              title={`[${item.priority}] ${item.userProfile ? item.userProfile.name : `${item.numPeople} Stranded`}`}
              description={item.description}
              pinColor={PRIORITY_COLORS[item.priority] || '#E53E3E'}
            />
          ))}
        </MapView>
      )}

      {/* Rescue Path */}
      {activeTab === 'route' && (
        <FlatList
          data={routePlan}
          keyExtractor={(item) => item.sos.id}
          renderItem={({ item }) => (
            <View style={styles.routeCard}>
              <Text style={styles.stepIndex}>Stop #{item.index}</Text>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={{ fontWeight: 'bold', color: PRIORITY_COLORS[item.sos.priority] || '#2D3748' }}>
                  [{item.sos.priority}] {item.sos.userProfile?.name ? `${item.sos.userProfile.name} - ` : ''}{item.sos.description}
                </Text>
                {item.sos.userProfile && (
                  <Text style={{ fontSize: 11, color: '#C53030', fontWeight: 'bold', marginTop: 2 }}>
                    🩸 {item.sos.userProfile.bloodType} | {item.sos.userProfile.medicalHistory.join(', ')}
                  </Text>
                )}
                <Text style={{ fontSize: 12, color: '#718096', marginTop: 2 }}>
                  Distance from previous stop: {item.distance} km
                </Text>
              </View>
            </View>
          )}
        />
      )}

      {/* Floating Action Button for Manual SOS */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('SOS')}
      >
        <Text style={styles.fabText}>+ SOS</Text>
      </TouchableOpacity>

      {/* ================= MODAL 1: INITIAL HEAVY FLOOD ALERT ================= */}
      <Modal
        visible={showInitialFloodModal}
        transparent
        animationType="fade"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.floodAlertCard}>
            <Text style={styles.floodIcon}>🌊 🚨</Text>
            <Text style={styles.floodModalTitle}>SEVERE HEAVY FLOOD ALERT</Text>
            <Text style={styles.floodModalSub}>EMERGENCY DISASTER ZONE DETECTED</Text>

            <Text style={styles.floodModalBody}>
              Rapidly rising flash flood waters and severe inundation have been detected in your current sector. First responders require your immediate status.
            </Text>

            <View style={styles.floodButtonGroup}>
              <TouchableOpacity
                style={styles.safePlaceBtn}
                onPress={handleSelectSafePlace}
              >
                <Text style={styles.safePlaceText}>I am in a safe place</Text>
                <Text style={styles.safePlaceSub}>(Not harmed, staying alert)</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.notSafeBtn}
                onPress={handleSelectNotSafe}
              >
                <Text style={styles.notSafeText}>I am not safe</Text>
                <Text style={styles.notSafeSub}>(Water rising / need monitoring)</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ================= MODAL 2: 15-SECOND CHECK-IN ESCALATION MODAL ================= */}
      <Modal
        visible={showCheckInModal}
        transparent
        animationType="slide"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.checkInCard}>
            <Text style={styles.checkInHeader}>⚠️ EMERGENCY SAFETY CHECK-IN</Text>
            <Text style={styles.checkInSubtext}>
              Confirm your physical status now. If you do not click "I am Safe", an escalated emergency SOS will be placed automatically!
            </Text>

            {/* Countdown Badge */}
            <View style={styles.countdownBox}>
              <Text style={styles.countdownLabel}>Time to Auto-SOS Broadcast:</Text>
              <Text style={styles.countdownDigits}>⏱️ {countdown}s</Text>
            </View>

            <Text style={styles.nextEscalationText}>
              Next Escalation Level: <Text style={{ fontWeight: 'bold', color: '#C53030' }}>{ESCALATION_LEVELS[Math.min(escalationStep, 4)]}</Text>
            </Text>

            <View style={styles.checkInBtnGroup}>
              {/* Option 1: "I am Safe" */}
              <TouchableOpacity
                style={styles.confirmSafeBtn}
                onPress={handleUserConfirmedSafe}
              >
                <Text style={styles.confirmSafeText}>✓ I am Safe</Text>
              </TouchableOpacity>

              {/* Option 2: "I am not Safe" (Bright Red Highlighted) */}
              <TouchableOpacity
                style={styles.brightRedNotSafeBtn}
                onPress={handleAutoTimeoutDistress}
              >
                <Text style={styles.brightRedNotSafeText}>🚨 I am not Safe</Text>
                <Text style={styles.brightRedSub}>(Transmit SOS Now)</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  meshStatusBar: { paddingVertical: 8, paddingHorizontal: 12 },
  meshStatusRow: { flexDirection: 'row', alignItems: 'center' },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  meshStatusText: { color: '#FFF', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },

  // Incoming Alert
  alertBanner: { backgroundColor: '#9B2C2C', padding: 12, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 2, borderColor: '#FED7D7' },
  alertTitle: { color: '#FED7D7', fontWeight: 'bold', fontSize: 12, letterSpacing: 0.5 },
  alertDesc: { color: '#FFF', fontSize: 13, fontWeight: '600', marginTop: 2 },
  alertMedical: { color: '#FEFCBF', fontSize: 11, fontWeight: '700', marginTop: 2 },
  alertSource: { color: '#E2E8F0', fontSize: 10, marginTop: 2 },
  alertDismissBtn: { backgroundColor: '#FFF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 4, marginLeft: 8 },
  alertDismissText: { color: '#9B2C2C', fontWeight: 'bold', fontSize: 11 },

  // Persistent Safe Warning Card
  persistentSafeCard: { backgroundColor: '#FEFCBF', padding: 12, borderLeftWidth: 5, borderColor: '#D69E2E', flexDirection: 'row', alignItems: 'center', margin: 8, borderRadius: 6 },
  safeCardTitle: { fontSize: 12, fontWeight: 'bold', color: '#744210' },
  safeCardSubtext: { fontSize: 11, color: '#975A16', marginTop: 2 },
  bannerDismissBtn: { backgroundColor: '#CBD5E0', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 4 },
  bannerDismissText: { color: '#2D3748', fontSize: 11, fontWeight: 'bold' },
  bannerNotSafeBtn: { backgroundColor: '#E53E3E', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 4 },
  bannerNotSafeText: { color: '#FFF', fontSize: 11, fontWeight: 'bold' },

  // Unsafe Active Monitoring Banner
  activeMonitoringBanner: { backgroundColor: '#742A2A', padding: 12, flexDirection: 'row', alignItems: 'center', marginHorizontal: 8, marginTop: 8, borderRadius: 6 },
  monitoringTitle: { color: '#FED7D7', fontWeight: 'bold', fontSize: 12 },
  monitoringSubtext: { color: '#FEB2B2', fontSize: 11, marginTop: 2 },
  demoToggleBtn: { backgroundColor: '#9B2C2C', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 4, borderWidth: 1, borderColor: '#FEB2B2' },
  demoToggleText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
  checkNowBtn: { backgroundColor: '#FFF', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 4 },
  checkNowText: { color: '#742A2A', fontSize: 11, fontWeight: 'bold' },

  // Tabs
  tab: { flex: 1, padding: 12, alignItems: 'center', backgroundColor: '#EDF2F7' },
  activeTab: { backgroundColor: '#FFF', borderBottomWidth: 2, borderColor: '#3182CE' },
  tabText: { fontWeight: 'bold', color: '#2D3748', fontSize: 12 },

  // Cards
  card: { padding: 12, marginHorizontal: 10, marginTop: 10, borderRadius: 8, borderLeftWidth: 6, elevation: 1 },
  priorityBadge: { fontWeight: 'bold', fontSize: 13, letterSpacing: 0.5 },
  peerBadge: { backgroundColor: '#3182CE', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  peerBadgeText: { color: '#FFF', fontSize: 9, fontWeight: 'bold' },
  autoBadge: { backgroundColor: '#805AD5', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  autoBadgeText: { color: '#FFF', fontSize: 9, fontWeight: 'bold' },

  // Victim Profile in card
  victimProfileBox: { backgroundColor: '#FFF', padding: 8, borderRadius: 6, marginVertical: 6, borderWidth: 1, borderColor: '#E2E8F0' },
  victimName: { fontSize: 13, fontWeight: 'bold', color: '#2D3748' },
  bloodTag: { color: '#C53030', fontWeight: 'bold' },
  medicalAlertText: { fontSize: 11, color: '#C53030', fontWeight: '700', marginTop: 2 },
  contactText: { fontSize: 11, color: '#2B6CB0', marginTop: 2 },
  addressText: { fontSize: 10, color: '#718096', marginTop: 2 },

  // Route & FAB
  routeCard: { flexDirection: 'row', padding: 12, margin: 10, backgroundColor: '#FFF', borderRadius: 6, elevation: 1 },
  stepIndex: { fontSize: 16, fontWeight: 'bold', color: '#2B6CB0' },
  fab: { position: 'absolute', bottom: 20, right: 20, backgroundColor: '#E53E3E', paddingVertical: 14, paddingHorizontal: 22, borderRadius: 30, elevation: 5 },
  fabText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.75)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  floodAlertCard: { backgroundColor: '#FFF', width: '100%', borderRadius: 14, padding: 20, alignItems: 'center', elevation: 10 },
  floodIcon: { fontSize: 36, marginBottom: 8 },
  floodModalTitle: { fontSize: 18, fontWeight: 'bold', color: '#9B2C2C', textAlign: 'center' },
  floodModalSub: { fontSize: 11, fontWeight: 'bold', color: '#C53030', letterSpacing: 0.5, marginBottom: 12 },
  floodModalBody: { fontSize: 13, color: '#4A5568', textAlign: 'center', lineHeight: 18, marginBottom: 20 },
  floodButtonGroup: { width: '100%', gap: 12 },
  safePlaceBtn: { backgroundColor: '#38A169', paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  safePlaceText: { color: '#FFF', fontWeight: 'bold', fontSize: 15 },
  safePlaceSub: { color: '#E6FFFA', fontSize: 11, marginTop: 2 },
  notSafeBtn: { backgroundColor: '#E53E3E', paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  notSafeText: { color: '#FFF', fontWeight: 'bold', fontSize: 15 },
  notSafeSub: { color: '#FFF5F5', fontSize: 11, marginTop: 2 },

  // Check-In Modal
  checkInCard: { backgroundColor: '#FFF', width: '100%', borderRadius: 14, padding: 22, alignItems: 'center', elevation: 10 },
  checkInHeader: { fontSize: 18, fontWeight: 'bold', color: '#C53030', textAlign: 'center' },
  checkInSubtext: { fontSize: 13, color: '#4A5568', textAlign: 'center', marginTop: 8, lineHeight: 18 },
  countdownBox: { backgroundColor: '#FFF5F5', borderWidth: 2, borderColor: '#FEB2B2', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10, marginVertical: 14, alignItems: 'center', width: '100%' },
  countdownLabel: { fontSize: 12, color: '#742A2A', fontWeight: '600' },
  countdownDigits: { fontSize: 28, fontWeight: 'bold', color: '#E53E3E', marginTop: 4 },
  nextEscalationText: { fontSize: 12, color: '#718096', marginBottom: 14 },
  checkInBtnGroup: { width: '100%', gap: 12 },
  confirmSafeBtn: { backgroundColor: '#38A169', paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  confirmSafeText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  brightRedNotSafeBtn: { backgroundColor: '#FF0000', paddingVertical: 16, borderRadius: 8, alignItems: 'center', elevation: 6, shadowColor: '#FF0000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 6 },
  brightRedNotSafeText: { color: '#FFF', fontSize: 17, fontWeight: '900', letterSpacing: 0.5 },
  brightRedSub: { color: '#FFF', fontSize: 11, fontWeight: 'bold', marginTop: 2 }
});
