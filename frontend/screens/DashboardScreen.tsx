import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import Database from '../services/database';
import { generateSummary } from '../services/summarizer';
import { optimizeRoute } from '../services/routeOptimizer';
import { SOSReport } from '../utils/types';
import { CHENNAI, PRIORITY_COLORS, PRIORITY_BG_COLORS } from '../utils/constants';

export const DashboardScreen = ({ navigation }: any) => {
  const [reports, setReports] = useState<SOSReport[]>([]);
  const [summaryText, setSummaryText] = useState('');
  const [activeTab, setActiveTab] = useState<'list' | 'map' | 'route'>('list');

  const refreshData = async () => {
    const data = await Database.getAllSOS();
    const sorted = [...data].sort((a, b) => {
      const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      return order[a.priority] - order[b.priority];
    });
    setReports(sorted);
    setSummaryText(generateSummary(sorted).summary);
  };

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 3000);
    return () => clearInterval(interval);
  }, []);

  const routePlan = optimizeRoute(CHENNAI.LAT, CHENNAI.LNG, reports, 5);

  return (
    <View style={{ flex: 1, backgroundColor: '#F7FAFC' }}>
      <View style={{ padding: 12, backgroundColor: '#2B6CB0' }}>
        <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 13 }}>LOCAL MESH SITREP</Text>
        <Text style={{ color: '#EBF8FF', fontSize: 11, marginTop: 4 }}>{summaryText}</Text>
      </View>

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

      {activeTab === 'list' && (
        <FlatList
          data={reports}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={[styles.card, { 
              backgroundColor: PRIORITY_BG_COLORS[item.priority], 
              borderLeftColor: PRIORITY_COLORS[item.priority] 
            }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={[styles.priorityBadge, { color: PRIORITY_COLORS[item.priority] }]}>
                  {item.priority}
                </Text>
                <Text style={{ fontSize: 11, color: '#4A5568' }}>
                  People: {item.numPeople}
                </Text>
              </View>
              <Text style={{ fontSize: 14, fontWeight: '500', marginVertical: 4, color: '#1A202C' }}>{item.description}</Text>
              <Text style={{ fontSize: 11, color: '#718096' }}>
                📍 {item.lat.toFixed(4)}, {item.lng.toFixed(4)}
              </Text>
            </View>
          )}
        />
      )}

      {activeTab === 'map' && (
        <MapView
          style={{ flex: 1 }}
          initialRegion={{
            latitude: CHENNAI.LAT,
            longitude: CHENNAI.LNG,
            latitudeDelta: CHENNAI.DELTA,
            longitudeDelta: CHENNAI.DELTA,
          }}
        >
          {reports.map((item) => (
            <Marker
              key={item.id}
              coordinate={{ latitude: item.lat, longitude: item.lng }}
              title={`[${item.priority}] ${item.numPeople} Injured/Stranded`}
              description={item.description}
              pinColor={PRIORITY_COLORS[item.priority]}
            />
          ))}
        </MapView>
      )}

      {activeTab === 'route' && (
        <FlatList
          data={routePlan}
          keyExtractor={(item) => item.sos.id}
          renderItem={({ item }) => (
            <View style={styles.routeCard}>
              <Text style={styles.stepIndex}>Stop #{item.index}</Text>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={{ fontWeight: 'bold', color: PRIORITY_COLORS[item.sos.priority] }}>
                  [{item.sos.priority}] {item.sos.description}
                </Text>
                <Text style={{ fontSize: 12, color: '#718096' }}>Distance from previous step: {item.distance} km</Text>
              </View>
            </View>
          )}
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('SOS')}
      >
        <Text style={styles.fabText}>+ SOS</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  tab: { flex: 1, padding: 12, alignItems: 'center', backgroundColor: '#EDF2F7' },
  activeTab: { backgroundColor: '#FFF', borderBottomWidth: 2, borderColor: '#3182CE' },
  tabText: { fontWeight: 'bold', color: '#2D3748', fontSize: 12 },
  card: { padding: 12, marginHorizontal: 10, marginTop: 10, borderRadius: 6, borderLeftWidth: 5 },
  priorityBadge: { fontWeight: 'bold', fontSize: 13 },
  routeCard: { flexDirection: 'row', padding: 12, margin: 10, backgroundColor: '#FFF', borderRadius: 6, elevation: 1 },
  stepIndex: { fontSize: 16, fontWeight: 'bold', color: '#2B6CB0' },
  fab: { position: 'absolute', bottom: 20, right: 20, backgroundColor: '#E53E3E', paddingVertical: 14, paddingHorizontal: 22, borderRadius: 30, elevation: 5 },
  fabText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 }
});