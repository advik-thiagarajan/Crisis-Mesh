# CrisisMesh

CrisisMesh is an offline-first disaster communication platform designed to maintain vital connectivity when cellular towers and internet infrastructure fail. Leveraging a localized mesh architecture, the system captures offline alerts via Bluetooth/ADB logging mechanisms, stores them locally, and syncs peer status across a React Native frontend interface.

---

## 🏗️ Project Architecture

CrisisMesh/
├── backend/
│   ├── adbBridge.py          # ADB logcat listener & mesh event forwarder
│   ├── requirements.txt      # Python dependencies
│   └── data/                 # Local packet/mesh storage
└── frontend/
├── App.tsx               # Root application component
├── package.json          # React Native dependencies & Expo SDK 54 config
├── tsconfig.json         # TypeScript configuration (React JSX & Node types)
├── services/
│   ├── bitchat.ts        # Mesh packet serialization & protocol handling
│   └── database.ts       # Offline SQLite storage manager
└── screens/              # SOS, Mesh Map, and Chat interfaces

---

## ⚡ Prerequisites

Before running the application, ensure you have installed:

* **Node.js**: `v18.x` or higher
* **npm**: `v9.x` or higher
* **Python**: `3.9+`
* **Android Debug Bridge (ADB)**: Installed and added to system `PATH`
* **Expo Go**: Installed on your physical Android or iOS device (compatible with Expo SDK 54)

---

## 🚀 Setup & Installation

### 1. Backend Setup

From the root project directory:

```bash
# Navigate to root directory
cd CrisisMesh

# Install Python backend dependencies
pip install -r backend/requirements.txt

# Navigate to frontend directory
cd frontend

# Install Node modules
npm install

To intercept offline mesh traffic over ADB, run the bridge script from the project root:
python backend/adbBridge.py

To start the Expo bundler for mobile testing:

cd frontend

npx expo start --clear

1.Open Expo Go on your smartphone.

2.Scan the terminal QR code to view the live app interface.

3.To view the app inside a desktop browser, press w in the terminal.

⚙️ TypeScript Configuration

The frontend relies on the following compiler options in frontend/tsconfig.json:

{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "react-jsx",
    "types": ["node"]
}


🛠️ Stack Overview
1.Frontend: React Native, Expo (SDK 54), TypeScript, Expo SQLite

2.Backend / Hardware Bridge: Python 3, ADB (Android Debug Bridge Logcat)

3.Protocol: Custom BitChat Mesh Protocol abstraction for offline packet broadcast

***

### `backend/requirements.txt`

Save this file directly inside your `backend/` folder:

```text
# Core ADB Logcat Parsing & Networking
pure-python-adb>=0.3.0

# Asynchronous Execution & IO
asyncio>=3.4.3

# Data Handling & Serialization
pydantic>=2.0.0

# Optional GUI/CLI Visualization
colorama>=0.4.6