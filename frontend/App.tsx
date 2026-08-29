import React from 'react';
import { TouchableOpacity, Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SOSScreen } from './screens/SOSScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { MeshProvider } from './services/MeshContext';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <MeshProvider>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerTintColor: '#dc2626' }}>
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
            options={{ title: 'Node Diagnostics' }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </MeshProvider>
  );
}