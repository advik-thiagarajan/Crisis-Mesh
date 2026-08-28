import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SOSScreen } from './screens/SOSScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import Database from './services/database';
import BitChatMesh from './services/bitchat';
import { getOrCreateDeviceId } from './utils/deviceId';

const Stack = createNativeStackNavigator();

export default function App() {
  const [meshInstance, setMeshInstance] = useState<BitChatMesh | null>(null);
  const [deviceId, setDeviceId] = useState<string>('');

  useEffect(() => {
    (async () => {
      await Database.initialize();
      const id = await getOrCreateDeviceId();
      setDeviceId(id);

      const mesh = new BitChatMesh(id);
      await mesh.initialize();

      mesh.onMessage(async (msg) => {
        if (msg.type === 'SOS' && msg.data) {
          await Database.addSOS(msg.data);
        }
      });

      setMeshInstance(mesh);
    })();

    return () => {
      Database.close();
    };
  }, []);

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerTintColor: '#dc2626' }}>
        <Stack.Screen 
          name="Dashboard" 
          component={DashboardScreen}
          options={{ title: 'CrisisMesh Control Center' }}
        />
        <Stack.Screen 
          name="SOS" 
          component={SOSScreen}
          initialParams={{ mesh: meshInstance, deviceId }}
          options={{ title: 'Transmit SOS' }}
        />
        <Stack.Screen 
          name="Settings" 
          component={SettingsScreen}
          initialParams={{ mesh: meshInstance, deviceId }}
          options={{ title: 'Node Diagnostics' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}