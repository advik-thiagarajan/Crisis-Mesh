import React, { createContext, useContext, useState, useEffect } from 'react';
import Database from './database';
import BitChatMesh from './bitchat';
import { getOrCreateDeviceId } from '../utils/deviceId';

interface MeshContextValue {
  mesh: BitChatMesh | null;
  deviceId: string;
  isConnected: boolean;
  peerCount: number;
}

const MeshContext = createContext<MeshContextValue>({
  mesh: null,
  deviceId: '',
  isConnected: false,
  peerCount: 0,
});

export const MeshProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [meshInstance, setMeshInstance] = useState<BitChatMesh | null>(null);
  const [deviceId, setDeviceId] = useState<string>('');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [peerCount, setPeerCount] = useState<number>(0);

  useEffect(() => {
    let mesh: BitChatMesh | null = null;

    (async () => {
      try {
        await Database.initialize();
        const id = await getOrCreateDeviceId();
        setDeviceId(id);

        mesh = new BitChatMesh(id);
        await mesh.initialize();

        mesh.onStatusChange((status) => {
          setIsConnected(status.connected);
          setPeerCount(status.peerCount);
        });

        mesh.onMessage(async (msg) => {
          if (msg.type === 'SOS' && msg.data) {
            console.log('[MeshContext] Received SOS, persisting to local DB:', msg.data.id);
            await Database.addSOS(msg.data);
          }
        });

        setMeshInstance(mesh);
      } catch (err) {
        console.error('[MeshContext] Failed to initialize mesh:', err);
      }
    })();

    return () => {
      if (mesh) {
        mesh.destroy();
      }
      Database.close();
    };
  }, []);

  return (
    <MeshContext.Provider value={{ mesh: meshInstance, deviceId, isConnected, peerCount }}>
      {children}
    </MeshContext.Provider>
  );
};

export const useMesh = () => useContext(MeshContext);
