import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
  ScrollView
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
  USER_ROLE_STORAGE_KEY,
  ESCALATION_LEVELS
} from '../utils/constants';
import { useMesh } from '../services/MeshContext';

export const DashboardScreen = ({ navigation, route }: any) => {
  const { mesh, deviceId, isConnected, peerCount } = useMesh();

  // Role: 'USER' or 'ADMIN'
  const [role, setRole] = useState<'USER' | 'ADMIN'>(route.params?.role || 'USER');
  const [adminName, setAdminName] = useState<string>(route.params?.responderName || 'Incident Commander');

  // Core Data
  const [reports, setReports] = useState<SOSReport[]>([]);
  const [summaryText, setSummaryText] = useState('');
  const [activeTab, setActiveTab] = useState<'list' | 'admin' | 'map' | 'route'>('list');
  const [activeAlert, setActiveAlert] = useState<SOSReport | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number }>({
    lat: CHENNAI.LAT,
    lng: CHENNAI.LNG
  });

  // Admin In-Depth SOS Inspection Modal
  const [selectedIncidentForAdmin, setSelectedIncidentForAdmin] = useState<SOSReport | null>(null);
  const [acknowledgedIncidents, setAcknowledgedIncidents] = useState<Set<string>>(new Set());

  // Victim: Incoming Rescue En Route Modal & Persistent Banner
  const [showRescueEnRouteModal, setShowRescueEnRouteModal] = useState<boolean>(false);
  const [rescueEnRouteBanner, setRescueEnRouteBanner] = useState<boolean>(false);
  const [rescuePingDetails, setRescuePingDetails] = useState<any>(null);

  // Flood Disaster Simulation States (For User)
  const [showInitialFloodModal, setShowInitialFloodModal] = useState<boolean>(false);
  const [persistentSafeBanner, setPersistentSafeBanner] = useState<boolean>(false);
  const [isMonitoringUnsafe, setIsMonitoringUnsafe] = useState<boolean>(false);

  // Periodic Check-In States (2 mins loop / 15s timer)
  const [showCheckInModal, setShowCheckInModal] = useState<boolean>(false);
  const [countdown, setCountdown] = useState<number>(15);
  const [escalationStep, setEscalationStep] = useState<number>(0);
  const [fastDemoMode, setFastDemoMode] = useState<boolean>(false);

  const countdownTimerRef = useRef<any>(null);
  const periodicCheckInTimerRef = useRef<any>(null);

  // Load Role, Profile, GPS & Flood Alert
  useEffect(() => {
    (async () => {
      // 1. Determine Role
      const storedRole = await AsyncStorage.getItem(USER_ROLE_STORAGE_KEY);
      const activeRole: 'USER' | 'ADMIN' = (route.params?.role || storedRole || 'USER') as 'USER' | 'ADMIN';
      setRole(activeRole);
      if (activeRole === 'ADMIN' && activeTab === 'list') {
        setActiveTab('admin');
      }

      // 2. Fetch User Profile
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

      // 3. Fetch GPS
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({});
          setMyLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
        }
      } catch (_) {}

      // 4. Guaranteed Flood Simulation Trigger on User Login or explicit trigger
      if (activeRole === 'USER') {
        const forceTrigger = route.params?.triggerFloodAlert;
        const floodStatus = await AsyncStorage.getItem(FLOOD_SIMULATION_KEY);

        if (forceTrigger || !floodStatus) {
          setShowInitialFloodModal(true);
        } else if (floodStatus === 'SAFE_BANNER_ACTIVE') {
          setPersistentSafeBanner(true);
        } else if (floodStatus === 'UNSAFE_MONITORING') {
          startUnsafeMonitoring(false);
        }
      }

      refreshData();
    })();

    const interval = setInterval(refreshData, 3000);
    return () => clearInterval(interval);
  }, [route.params?.triggerFloodAlert, route.params?.role]);

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

  // Mesh packet listener (SOS + RESCUE_PING)
  useEffect(() => {
    if (!mesh) return;

    mesh.onMessage((msg) => {
      if (msg.type === 'SOS' && msg.data) {
        refreshData();
        // If message is from another device, pop up distress banner
        if (msg.data.deviceId !== deviceId) {
          setActiveAlert(msg.data);
        }
      } else if (msg.type === 'RESCUE_PING') {
        console.log(`[Dashboard] Received RESCUE_PING over mesh:`, msg);
        // Is this ping for me? Match targetDeviceId, or if current node is in USER role
        const isTarget = !msg.targetDeviceId || msg.targetDeviceId === deviceId || (role === 'USER');
        if (isTarget) {
          console.log('[Dashboard] MATCHED RESCUE_PING for this victim device! Showing modal.');
          setRescuePingDetails(msg);
          setShowRescueEnRouteModal(true);
          setRescueEnRouteBanner(true);

          // Stop frantic check-in countdown
          if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
          if (periodicCheckInTimerRef.current) clearTimeout(periodicCheckInTimerRef.current);
          setShowCheckInModal(false);
          setIsMonitoringUnsafe(false);
        }
      }
    });
  }, [mesh, deviceId, role]);

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

  // Admin Action: Ping Victim that Help is Arriving
  const handleAdminPingHelp = (incident: SOSReport) => {
    if (!mesh) {
      Alert.alert('Offline', 'Cannot send ping: mesh network is not connected.');
      return;
    }

    mesh.sendRescuePing(incident.deviceId, incident.id, adminName);
    setAcknowledgedIncidents(new Set([...acknowledgedIncidents, incident.id]));

    Alert.alert(
      '🚑 Rescue Dispatched!',
      `Ping transmitted over mesh radio to victim (${incident.userProfile?.name || incident.deviceId.slice(-6)}).\n\nTheir phone will now display "Help is Arriving"!`
    );
    setSelectedIncidentForAdmin(null);
  };

  // Log Out Handler
  const handleLogOut = () => {
    Alert.alert(
      'Confirm Logout',
      'Do you want to log out and switch role or restart the demo?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
            if (periodicCheckInTimerRef.current) clearTimeout(periodicCheckInTimerRef.current);
            await AsyncStorage.removeItem(FLOOD_SIMULATION_KEY);
            navigation.replace('ProfileRegistration');
          }
        }
      ]
    );
  };

  const routePlan = optimizeRoute(CHENNAI.LAT, CHENNAI.LNG, reports, 5);

  return (
    <View style={{ flex: 1, backgroundColor: '#F7FAFC' }}>
      {/* Top Header with Role & Logout */}
      <View style={styles.topControlHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={[styles.roleBadge, { backgroundColor: role === 'ADMIN' ? '#9B2C2C' : '#2B6CB0' }]}>
            <Text style={styles.roleBadgeText}>
              {role === 'ADMIN' ? '🛡️ ADMIN COMMAND' : '👤 USER'}
            </Text>
          </View>
          <Text style={styles.headerDeviceId}>Node: {deviceId.slice(-6)}</Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 6 }}>
          <TouchableOpacity
            style={styles.headerSettingsBtn}
            onPress={() => navigation.navigate('Settings')}
          >
            <Text style={styles.headerSettingsText}>⚙️</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.headerLogoutBtn} onPress={handleLogOut}>
            <Text style={styles.headerLogoutText}>🚪 Log Out</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Mesh Network Status Bar */}
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

      {/* Incoming Peer Distress Banner (CLICKABLE for Admin to inspect & ping!) */}
      {activeAlert && (
        <TouchableOpacity
          style={styles.alertBanner}
          activeOpacity={0.85}
          onPress={() => {
            setSelectedIncidentForAdmin(activeAlert);
          }}
        >
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.alertTitle}>🚨 INCOMING DISTRESS SIGNAL</Text>
              <View style={styles.tapToInspectBadge}>
                <Text style={styles.tapToInspectText}>👆 Tap to Inspect & Ping</Text>
              </View>
            </View>
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
          <View style={{ gap: 6, marginLeft: 8, alignItems: 'flex-end' }}>
            <TouchableOpacity
              style={styles.alertPingBtn}
              onPress={() => setSelectedIncidentForAdmin(activeAlert)}
            >
              <Text style={styles.alertPingBtnText}>🚑 Ping Help</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.alertDismissBtn}
              onPress={(e) => {
                e.stopPropagation();
                setActiveAlert(null);
              }}
            >
              <Text style={styles.alertDismissText}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      )}

      {/* Persistent Victim "HELP IS EN ROUTE" Banner */}
      {rescueEnRouteBanner && (
        <View style={styles.rescueEnRouteCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rescueEnRouteTitle}>🚑 FIRST RESPONDER RESCUE EN ROUTE!</Text>
            <Text style={styles.rescueEnRouteSub}>
              Incident Command has dispatched assistance to your location. Keep your phone near and stay in a safe position.
            </Text>
          </View>
          <TouchableOpacity 
            style={styles.rescueEnRouteDismiss}
            onPress={() => setRescueEnRouteBanner(false)}
          >
            <Text style={styles.rescueEnRouteDismissText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Persistent User-Only Safe Status Warning Banner */}
      {role === 'USER' && persistentSafeBanner && (
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

      {/* Unsafe Monitoring State Active Banner (User Only) */}
      {role === 'USER' && isMonitoringUnsafe && (
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
      <View style={{ padding: 12, backgroundColor: role === 'ADMIN' ? '#742A2A' : '#2B6CB0' }}>
        <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 13 }}>
          {role === 'ADMIN' ? '🛡️ FIRST RESPONDER COMMAND SITREP' : 'LOCAL MESH SITREP'}
        </Text>
        <Text style={{ color: '#EBF8FF', fontSize: 11, marginTop: 4 }}>{summaryText}</Text>
      </View>

      {/* Segmented Navigation Tabs */}
      <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: '#E2E8F0' }}>
        <TouchableOpacity
          onPress={() => setActiveTab('list')}
          style={[styles.tab, activeTab === 'list' && styles.activeTab]}
        >
          <Text style={styles.tabText}>Incidents ({reports.length})</Text>
        </TouchableOpacity>

        {role === 'ADMIN' && (
          <TouchableOpacity
            onPress={() => setActiveTab('admin')}
            style={[styles.tab, activeTab === 'admin' && styles.activeTabAdmin]}
          >
            <Text style={[styles.tabText, activeTab === 'admin' && { color: '#9B2C2C' }]}>
              🛡️ Command Center
            </Text>
          </TouchableOpacity>
        )}

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

      {/* ================= TAB 1: INCIDENTS LIST ================= */}
      {activeTab === 'list' && (
        <FlatList
          data={reports}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const isFromOtherPeer = item.deviceId && item.deviceId !== deviceId;
            const prof = item.userProfile;
            const isAcknowledged = acknowledgedIncidents.has(item.id);
            return (
              <TouchableOpacity
                style={[
                  styles.card,
                  {
                    backgroundColor: PRIORITY_BG_COLORS[item.priority] || '#FFF',
                    borderLeftColor: PRIORITY_COLORS[item.priority] || '#CBD5E0'
                  }
                ]}
                activeOpacity={0.8}
                onPress={() => {
                  // Both user and admin can tap to view full incident details & ping
                  setSelectedIncidentForAdmin(item);
                }}
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

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {isAcknowledged && (
                      <View style={[styles.ackBadge, { backgroundColor: '#C6F6D5' }]}>
                        <Text style={[styles.ackBadgeText, { color: '#22543D' }]}>🚑 HELP EN ROUTE</Text>
                      </View>
                    )}
                    <Text style={{ fontSize: 11, color: '#4A5568' }}>
                      People: {item.numPeople}
                    </Text>
                  </View>
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

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                  <Text style={{ fontSize: 11, color: '#718096' }}>
                    📍 {item.lat.toFixed(4)}, {item.lng.toFixed(4)} | Node: {item.deviceId ? item.deviceId.slice(-6) : 'local'}
                  </Text>

                  {/* Action Button */}
                  <TouchableOpacity
                    style={styles.cardPingBtn}
                    onPress={() => setSelectedIncidentForAdmin(item)}
                  >
                    <Text style={styles.cardPingBtnText}>
                      {isAcknowledged ? '🚑 Acknowledged' : '🚑 Inspect & Ping'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* ================= TAB 2: ADMIN INCIDENT COMMAND TAB ================= */}
      {activeTab === 'admin' && (
        <ScrollView style={{ flex: 1, padding: 12 }}>
          {/* Admin Metrics Bar */}
          <View style={styles.adminStatsRow}>
            <View style={[styles.adminStatCard, { backgroundColor: '#FFF5F5' }]}>
              <Text style={[styles.adminStatCount, { color: '#C53030' }]}>
                {reports.filter(r => r.priority === 'CRITICAL').length}
              </Text>
              <Text style={styles.adminStatLabel}>CRITICAL</Text>
            </View>
            <View style={[styles.adminStatCard, { backgroundColor: '#FFF5F5' }]}>
              <Text style={[styles.adminStatCount, { color: '#E11D48' }]}>
                {reports.filter(r => r.priority === 'VERY HIGH').length}
              </Text>
              <Text style={styles.adminStatLabel}>VERY HIGH</Text>
            </View>
            <View style={[styles.adminStatCard, { backgroundColor: '#FFFAF0' }]}>
              <Text style={[styles.adminStatCount, { color: '#DD6B20' }]}>
                {reports.filter(r => r.priority === 'HIGH').length}
              </Text>
              <Text style={styles.adminStatLabel}>HIGH</Text>
            </View>
            <View style={[styles.adminStatCard, { backgroundColor: '#FAF5FF' }]}>
              <Text style={[styles.adminStatCount, { color: '#805AD5' }]}>
                {reports.filter(r => r.isAutomated).length}
              </Text>
              <Text style={styles.adminStatLabel}>TIMEOUTS</Text>
            </View>
          </View>

          <Text style={styles.adminSectionHeader}>
            Live Mesh Incidents (Tap Any Incident to Inspect & Dispatch Rescue):
          </Text>

          {reports.length === 0 ? (
            <Text style={styles.emptyAdminText}>No active distress signals in mesh radio range.</Text>
          ) : (
            reports.map((incident) => {
              const isAcknowledged = acknowledgedIncidents.has(incident.id);
              const prof = incident.userProfile;
              return (
                <TouchableOpacity
                  key={incident.id}
                  style={[
                    styles.adminIncidentCard,
                    { borderLeftColor: PRIORITY_COLORS[incident.priority] || '#CBD5E0' }
                  ]}
                  onPress={() => setSelectedIncidentForAdmin(incident)}
                  activeOpacity={0.8}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[styles.priorityBadge, { color: PRIORITY_COLORS[incident.priority] }]}>
                        {incident.priority}
                      </Text>
                      {incident.escalationLevel ? (
                        <View style={styles.escalationBadge}>
                          <Text style={styles.escalationBadgeText}>L{incident.escalationLevel}/5</Text>
                        </View>
                      ) : null}
                    </View>

                    <View style={[styles.ackBadge, { backgroundColor: isAcknowledged ? '#C6F6D5' : '#FED7D7' }]}>
                      <Text style={[styles.ackBadgeText, { color: isAcknowledged ? '#22543D' : '#9B2C2C' }]}>
                        {isAcknowledged ? '🚑 HELP EN ROUTE' : '🚨 PENDING'}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.adminCardTitle} numberOfLines={1}>
                    {prof ? `${prof.name} (${prof.age}y) - ` : ''}{incident.description}
                  </Text>

                  {prof && (
                    <View style={{ marginTop: 4 }}>
                      <Text style={{ fontSize: 12, color: '#4A5568' }}>
                        🩸 Blood: <Text style={{ fontWeight: 'bold', color: '#C53030' }}>{prof.bloodType}</Text>
                        {prof.medicalHistory && prof.medicalHistory.length > 0 && prof.medicalHistory[0] !== 'None' ? (
                          <Text style={{ color: '#C53030', fontWeight: 'bold' }}> | ⚠️ {prof.medicalHistory.join(', ')}</Text>
                        ) : null}
                      </Text>
                    </View>
                  )}

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                    <Text style={{ fontSize: 11, color: '#718096' }}>
                      📍 {incident.lat.toFixed(4)}, {incident.lng.toFixed(4)} | Node: {incident.deviceId.slice(-6)}
                    </Text>
                    <View style={styles.cardPingBtn}>
                      <Text style={styles.cardPingBtnText}>
                        {isAcknowledged ? '🚑 Help En Route' : '🚑 Inspect & Ping ➔'}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}

      {/* ================= TAB 3: LIVE MAP ================= */}
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

      {/* ================= TAB 4: RESCUE PATH ================= */}
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

      {/* Floating Action Button for Manual SOS (Visible in User mode) */}
      {role === 'USER' && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => navigation.navigate('SOS')}
        >
          <Text style={styles.fabText}>+ SOS</Text>
        </TouchableOpacity>
      )}

      {/* ================= MODAL 1: INITIAL HEAVY FLOOD ALERT (USER) ================= */}
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

      {/* ================= MODAL 3: ADMIN IN-DEPTH SOS INSPECTION & PING MODAL ================= */}
      <Modal
        visible={!!selectedIncidentForAdmin}
        transparent
        animationType="slide"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.adminInspectCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', borderBottomWidth: 1, borderColor: '#E2E8F0', paddingBottom: 10 }}>
              <Text style={styles.adminInspectTitle}>🚨 Incident Command Telemetry</Text>
              <TouchableOpacity onPress={() => setSelectedIncidentForAdmin(null)}>
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#718096' }}>✕</Text>
              </TouchableOpacity>
            </View>

            {selectedIncidentForAdmin && (
              <ScrollView style={{ width: '100%', maxHeight: 400, marginVertical: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Text style={[styles.priorityBadge, { color: PRIORITY_COLORS[selectedIncidentForAdmin.priority], fontSize: 16 }]}>
                    [{selectedIncidentForAdmin.priority}]
                  </Text>
                  {selectedIncidentForAdmin.isAutomated && (
                    <View style={styles.autoBadge}>
                      <Text style={styles.autoBadgeText}>🤖 AUTOMATED TIMEOUT</Text>
                    </View>
                  )}
                  {selectedIncidentForAdmin.escalationLevel ? (
                    <View style={styles.escalationBadge}>
                      <Text style={styles.escalationBadgeText}>Level {selectedIncidentForAdmin.escalationLevel}/5</Text>
                    </View>
                  ) : null}
                </View>

                <Text style={styles.inspectDesc}>{selectedIncidentForAdmin.description}</Text>

                {/* Victim Medical & Contact Dossier */}
                {selectedIncidentForAdmin.userProfile ? (
                  <View style={styles.inspectProfileBox}>
                    <Text style={styles.inspectProfileHeader}>👤 Patient Medical Record:</Text>
                    <Text style={styles.inspectProfileItem}>
                      Full Name: <Text style={styles.boldVal}>{selectedIncidentForAdmin.userProfile.name}</Text> ({selectedIncidentForAdmin.userProfile.age} years old)
                    </Text>
                    <Text style={styles.inspectProfileItem}>
                      Blood Group: <Text style={[styles.boldVal, { color: '#C53030' }]}>{selectedIncidentForAdmin.userProfile.bloodType}</Text>
                    </Text>

                    {selectedIncidentForAdmin.userProfile.medicalHistory?.length > 0 && (
                      <View style={styles.medicalAlertCard}>
                        <Text style={styles.medicalAlertCardTitle}>⚠️ Pre-Known Medical History:</Text>
                        <Text style={styles.medicalAlertCardBody}>
                          {selectedIncidentForAdmin.userProfile.medicalHistory.join(', ')}
                        </Text>
                      </View>
                    )}

                    {selectedIncidentForAdmin.userProfile.customMedicalNotes ? (
                      <Text style={styles.inspectProfileItem}>
                        Medications/Notes: {selectedIncidentForAdmin.userProfile.customMedicalNotes}
                      </Text>
                    ) : null}

                    <View style={styles.contactDivider} />
                    <Text style={styles.inspectProfileHeader}>📞 Emergency Contact Person:</Text>
                    <Text style={styles.inspectProfileItem}>
                      Name: {selectedIncidentForAdmin.userProfile.emergencyContactName}
                    </Text>
                    <Text style={styles.inspectProfileItem}>
                      Phone: <Text style={{ color: '#2B6CB0', fontWeight: 'bold' }}>{selectedIncidentForAdmin.userProfile.emergencyContactNumber}</Text>
                    </Text>
                    {selectedIncidentForAdmin.userProfile.address ? (
                      <Text style={styles.inspectProfileItem}>
                        Address: {selectedIncidentForAdmin.userProfile.address}
                      </Text>
                    ) : null}
                  </View>
                ) : (
                  <Text style={{ fontStyle: 'italic', color: '#718096', marginVertical: 8 }}>
                    No personal medical record attached (Manual anonymous beacon).
                  </Text>
                )}

                {/* Telemetry */}
                <View style={styles.telemetryBox}>
                  <Text style={styles.telemetryText}>📍 GPS: {selectedIncidentForAdmin.lat.toFixed(5)}, {selectedIncidentForAdmin.lng.toFixed(5)}</Text>
                  <Text style={styles.telemetryText}>📡 Origin Node: {selectedIncidentForAdmin.deviceId}</Text>
                  <Text style={styles.telemetryText}>⏱️ Timestamp: {new Date(selectedIncidentForAdmin.timestamp).toLocaleTimeString()}</Text>
                </View>
              </ScrollView>
            )}

            {/* PING VICTIM BUTTON */}
            <TouchableOpacity
              style={styles.dispatchRescueBtn}
              onPress={() => selectedIncidentForAdmin && handleAdminPingHelp(selectedIncidentForAdmin)}
            >
              <Text style={styles.dispatchRescueBtnText}>🚑 Ping Victim: Help is Arriving</Text>
              <Text style={styles.dispatchRescueSubText}>Broadcasts acknowledgment directly to victim's phone</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ================= MODAL 4: VICTIM "HELP IS ARRIVING" MODAL ================= */}
      <Modal
        visible={showRescueEnRouteModal}
        transparent
        animationType="fade"
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.floodAlertCard, { borderColor: '#38A169', borderWidth: 3 }]}>
            <Text style={{ fontSize: 48, marginBottom: 6 }}>🚑 🚨</Text>
            <Text style={[styles.floodModalTitle, { color: '#22543D', fontSize: 20 }]}>RESCUE TEAM EN ROUTE!</Text>
            <Text style={[styles.floodModalSub, { color: '#276749', fontSize: 13 }]}>DISTRESS SIGNAL ACKNOWLEDGED</Text>

            <Text style={[styles.floodModalBody, { fontSize: 14, color: '#1A202C' }]}>
              First responders at Incident Command have acknowledged your emergency distress call! Rescue units are en route to your location.
            </Text>

            {rescuePingDetails && (
              <View style={{ backgroundColor: '#F0FFF4', padding: 12, borderRadius: 8, marginVertical: 8, width: '100%', borderWidth: 1, borderColor: '#9AE6B4' }}>
                <Text style={{ fontSize: 13, color: '#22543D', fontWeight: 'bold' }}>
                  Commander: {rescuePingDetails.adminName || 'Incident Commander'}
                </Text>
                <Text style={{ fontSize: 12, color: '#276749', marginTop: 4, fontStyle: 'italic' }}>
                  "{rescuePingDetails.message}"
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.safePlaceBtn, { width: '100%', marginTop: 10 }]}
              onPress={() => setShowRescueEnRouteModal(false)}
            >
              <Text style={styles.safePlaceText}>Understood (Help is Coming)</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  topControlHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1A202C', paddingHorizontal: 12, paddingVertical: 8 },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  roleBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  headerDeviceId: { color: '#A0AEC0', fontSize: 11, fontWeight: '600' },
  headerSettingsBtn: { backgroundColor: '#2D3748', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  headerSettingsText: { fontSize: 14 },
  headerLogoutBtn: { backgroundColor: '#742A2A', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#FEB2B2' },
  headerLogoutText: { color: '#FFF', fontSize: 11, fontWeight: 'bold' },

  meshStatusBar: { paddingVertical: 8, paddingHorizontal: 12 },
  meshStatusRow: { flexDirection: 'row', alignItems: 'center' },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  meshStatusText: { color: '#FFF', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },

  // Incoming Alert Banner (Clickable)
  alertBanner: { backgroundColor: '#9B2C2C', padding: 12, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 3, borderColor: '#FEB2B2', elevation: 4 },
  alertTitle: { color: '#FED7D7', fontWeight: 'bold', fontSize: 12, letterSpacing: 0.5 },
  tapToInspectBadge: { backgroundColor: '#E53E3E', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  tapToInspectText: { color: '#FFF', fontSize: 9, fontWeight: 'bold' },
  alertDesc: { color: '#FFF', fontSize: 13, fontWeight: '600', marginTop: 2 },
  alertMedical: { color: '#FEFCBF', fontSize: 11, fontWeight: '700', marginTop: 2 },
  alertSource: { color: '#E2E8F0', fontSize: 10, marginTop: 2 },
  alertPingBtn: { backgroundColor: '#38A169', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 4, elevation: 2 },
  alertPingBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 11 },
  alertDismissBtn: { backgroundColor: '#FFF', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 4 },
  alertDismissText: { color: '#9B2C2C', fontWeight: 'bold', fontSize: 10 },

  // Rescue En Route Card (Victim Persistent)
  rescueEnRouteCard: { backgroundColor: '#C6F6D5', padding: 12, borderLeftWidth: 5, borderColor: '#22543D', flexDirection: 'row', alignItems: 'center', margin: 8, borderRadius: 6, elevation: 2 },
  rescueEnRouteTitle: { fontSize: 12, fontWeight: 'bold', color: '#22543D' },
  rescueEnRouteSub: { fontSize: 11, color: '#276749', marginTop: 2 },
  rescueEnRouteDismiss: { backgroundColor: '#22543D', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 4 },
  rescueEnRouteDismissText: { color: '#FFF', fontSize: 11, fontWeight: 'bold' },

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
  activeTabAdmin: { backgroundColor: '#FFF', borderBottomWidth: 2, borderColor: '#9B2C2C' },
  tabText: { fontWeight: 'bold', color: '#2D3748', fontSize: 11 },

  // Cards
  card: { padding: 12, marginHorizontal: 10, marginTop: 10, borderRadius: 8, borderLeftWidth: 6, elevation: 1 },
  priorityBadge: { fontWeight: 'bold', fontSize: 13, letterSpacing: 0.5 },
  peerBadge: { backgroundColor: '#3182CE', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  peerBadgeText: { color: '#FFF', fontSize: 9, fontWeight: 'bold' },
  autoBadge: { backgroundColor: '#805AD5', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  autoBadgeText: { color: '#FFF', fontSize: 9, fontWeight: 'bold' },
  escalationBadge: { backgroundColor: '#E53E3E', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  escalationBadgeText: { color: '#FFF', fontSize: 9, fontWeight: 'bold' },
  cardPingBtn: { backgroundColor: '#22543D', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  cardPingBtnText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },

  // Victim Profile in card
  victimProfileBox: { backgroundColor: '#FFF', padding: 8, borderRadius: 6, marginVertical: 6, borderWidth: 1, borderColor: '#E2E8F0' },
  victimName: { fontSize: 13, fontWeight: 'bold', color: '#2D3748' },
  bloodTag: { color: '#C53030', fontWeight: 'bold' },
  medicalAlertText: { fontSize: 11, color: '#C53030', fontWeight: '700', marginTop: 2 },
  contactText: { fontSize: 11, color: '#2B6CB0', marginTop: 2 },
  addressText: { fontSize: 10, color: '#718096', marginTop: 2 },

  // Admin Tab Styles
  adminStatsRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  adminStatCard: { flex: 1, padding: 8, borderRadius: 8, alignItems: 'center', elevation: 1 },
  adminStatCount: { fontSize: 18, fontWeight: 'bold' },
  adminStatLabel: { fontSize: 9, fontWeight: '700', color: '#4A5568', marginTop: 2 },
  adminSectionHeader: { fontSize: 13, fontWeight: 'bold', color: '#2D3748', marginBottom: 8 },
  emptyAdminText: { fontStyle: 'italic', color: '#A0AEC0', textAlign: 'center', marginVertical: 20 },
  adminIncidentCard: { backgroundColor: '#FFF', padding: 12, borderRadius: 8, borderLeftWidth: 5, marginBottom: 10, elevation: 2 },
  adminCardTitle: { fontSize: 13, fontWeight: 'bold', color: '#1A202C', marginTop: 4 },
  ackBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  ackBadgeText: { fontSize: 10, fontWeight: 'bold' },

  // Route & FAB
  routeCard: { flexDirection: 'row', padding: 12, margin: 10, backgroundColor: '#FFF', borderRadius: 6, elevation: 1 },
  stepIndex: { fontSize: 16, fontWeight: 'bold', color: '#2B6CB0' },
  fab: { position: 'absolute', bottom: 20, right: 20, backgroundColor: '#E53E3E', paddingVertical: 14, paddingHorizontal: 22, borderRadius: 30, elevation: 5 },
  fabText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.75)', justifyContent: 'center', alignItems: 'center', padding: 16 },
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
  brightRedSub: { color: '#FFF', fontSize: 11, fontWeight: 'bold', marginTop: 2 },

  // Admin Inspection Modal
  adminInspectCard: { backgroundColor: '#FFF', width: '100%', borderRadius: 14, padding: 18, alignItems: 'center', elevation: 12 },
  adminInspectTitle: { fontSize: 16, fontWeight: 'bold', color: '#9B2C2C' },
  inspectDesc: { fontSize: 13, color: '#2D3748', marginBottom: 10, lineHeight: 18 },
  inspectProfileBox: { backgroundColor: '#FFF5F5', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#FEB2B2', marginBottom: 10 },
  inspectProfileHeader: { fontSize: 12, fontWeight: 'bold', color: '#9B2C2C', marginBottom: 4 },
  inspectProfileItem: { fontSize: 12, color: '#4A5568', marginVertical: 2 },
  boldVal: { fontWeight: 'bold', color: '#1A202C' },
  medicalAlertCard: { backgroundColor: '#FED7D7', padding: 8, borderRadius: 6, marginVertical: 6 },
  medicalAlertCardTitle: { fontSize: 11, fontWeight: 'bold', color: '#9B2C2C' },
  medicalAlertCardBody: { fontSize: 12, color: '#742A2A', fontWeight: 'bold', marginTop: 2 },
  contactDivider: { height: 1, backgroundColor: '#FEB2B2', marginVertical: 6 },
  telemetryBox: { backgroundColor: '#EDF2F7', padding: 8, borderRadius: 6, marginTop: 4 },
  telemetryText: { fontSize: 11, color: '#4A5568', marginVertical: 1 },
  dispatchRescueBtn: { backgroundColor: '#22543D', paddingVertical: 14, paddingHorizontal: 16, borderRadius: 8, width: '100%', alignItems: 'center', marginTop: 8, elevation: 4 },
  dispatchRescueBtnText: { color: '#FFF', fontSize: 15, fontWeight: 'bold' },
  dispatchRescueSubText: { color: '#C6F6D5', fontSize: 10, marginTop: 2 }
});
