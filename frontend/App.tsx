import React, { useState, useEffect } from 'react';
import { TouchableOpacity, Text, View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SOSScreen } from './screens/SOSScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { ProfileRegistrationScreen } from './screens/ProfileRegistrationScreen';
import { MeshProvider } from './services/MeshContext';
import { PROFILE_STORAGE_KEY } from './utils/constants';

const Stack = createNativeStackNavigator();

export default function App() {
  const [initialRoute, setInitialRoute] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const profile = await AsyncStorage.getItem(PROFILE_STORAGE_KEY);
        if (profile) {
          setInitialRoute('Dashboard');
        } else {
          setInitialRoute('ProfileRegistration');
        }
      } catch (_) {
        setInitialRoute('ProfileRegistration');
      }
    })();
  }, []);

  if (!initialRoute) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F7FAFC' }}>
        <ActivityIndicator size="large" color="#C53030" />
      </View>
    );
  }

  return (
    <MeshProvider>
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName={initialRoute}
          screenOptions={{ headerTintColor: '#dc2626' }}
        >
          <Stack.Screen
            name="ProfileRegistration"
            component={ProfileRegistrationScreen}
            options={{ title: 'Emergency Registration' }}
          />
          <Stack.Screen 
            name="Dashboard" 
            component={DashboardScreen}
            options={({ navigation }) => ({
              title: 'CrisisMesh Control Center',
              headerRight: () => (
                <TouchableOpacity 
                  onPress={() => navigation.navigate('Settings')}
                  style={{ paddingHorizontal: 8, paddingVertical: 4 }}
                >
                  <Text style={{ fontSize: 18 }}>⚙️</Text>
                </TouchableOpacity>
              )
            })}
          />
          <Stack.Screen 
            name="SOS" 
            component={SOSScreen}
            options={{ title: 'Transmit SOS' }}
          />
          <Stack.Screen 
            name="Settings" 
            component={SettingsScreen}
            options={{ title: 'Node Diagnostics & Profile' }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </MeshProvider>
  );
}