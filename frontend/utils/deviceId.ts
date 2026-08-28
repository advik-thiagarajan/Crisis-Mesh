import AsyncStorage from '@react-native-async-storage/async-storage';

const DEVICE_ID_KEY = 'CRISIS_MESH_DEVICE_ID';

export const getOrCreateDeviceId = async (): Promise<string> => {
  try {
    const stored = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (stored) {
      return stored;
    }
    const newId = `device-${Math.random().toString(36).substring(2, 11)}`;
    await AsyncStorage.setItem(DEVICE_ID_KEY, newId);
    return newId;
  } catch (e) {
    console.error('Error getting device ID:', e);
    return `device-${Math.random().toString(36).substring(2, 11)}`;
  }
};

export const getDeviceName = (deviceId: string): string => {
  return `CrisisMesh-${deviceId.slice(-6)}`;
};