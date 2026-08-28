# CrisisMesh - Offline Emergency Mesh Network

CrisisMesh is an offline, peer-to-peer mobile emergency routing network built to maintain communication during complete infrastructure failures.

## Features
- **Zero Cellular/Wi-Fi Dependency:** Operates via Bluetooth Mesh broadcast channels.
- **SQLite Storage:** Local persistence per device.
- **Local Priority Classifier:** Identifies critical medical emergencies using deterministic logic.
- **Route Planning:** Generates multi-stop emergency response paths based on location and priority.

## Setup Instructions

### Frontend (React Native / Expo)
```bash
cd frontend
npm install
npx expo start