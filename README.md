# 🌐 CrisisMesh: Offline Peer-to-Peer Disaster Communication & Incident Command

> **Zero-Internet, Zero-Cellular Mesh Network for Disaster Survival, Emergency Medical Telemetry, and Real-Time First Responder Coordination.**

---

## 🚨 The Problem

During catastrophic natural disasters (floods, hurricanes, earthquakes):
* **Cellular towers collapse** and power grids go dark.
* **Emergency helplines (911/112) get overwhelmed** or become completely unreachable.
* **Civilians are trapped** without a way to transmit their GPS coordinates, blood type, or pre-known medical conditions (e.g. insulin-dependent diabetes, cardiac conditions).
* **First responders operate blind**, with no real-time triage data to prioritize critical rescues.

---

## 💡 The Solution: CrisisMesh

**CrisisMesh** transforms everyday smartphones into autonomous, self-healing **mesh communication nodes**. Utilizing local Wi-Fi Direct and localized radio hotspot tethering, CrisisMesh enables continuous peer-to-peer communication **without cellular data, SIM cards, or internet access**.

```
  +------------------+         Offline Radio         +--------------------+
  |  Civilian Node   | <---------------------------> |   Civilian Node    |
  |  (@advik_t)      |         (2.4 / 5 GHz)         |   (@priya_medic)   |
  +------------------+                               +--------------------+
          \                                                    /
           \                  Gossip Relay                    /
            \                                                /
             +----------------------------------------------+
                                    |
                                    v
                     +------------------------------+
                     |   Incident Command Center    |
                     |   (First Responder Node)     |
                     +------------------------------+
                                    |
            [Triage Dashboard | Patient Dossier | Rescue Ping]
```

---

## ✨ Core Features

### 1. 👤 Dual-Role Access: Civilian vs. Administrator
* **Civilian User Mode**:
  - Registers personal identity and emergency medical vitals stored securely on-device.
  - Features automated disaster alerts, safety check-in countdowns, and direct peer text chat.
* **Incident Command Mode**:
  - Passcode-protected access (`COMMAND7`) for disaster response teams and field commanders.
  - Real-time network telemetry, automated triage metrics, and direct rescue dispatch.

### 2. 🩸 Emergency Medical Profile & Triage Dossier
* Captures critical medical vitals locally on the user's phone:
  - **Blood Group**: `A+`, `A-`, `B+`, `B-`, `O+`, `O-`, `AB+`, `AB-`.
  - **Pre-Known Medical Conditions**: `Diabetes`, `Thyroid`, `Cardiac Issues`, `Asthma`, `Hypertension`, allergies.
  - **Emergency Contact**: Name and contact phone number.
* Automatically bundles these vitals into offline SOS packets so rescuers know patient requirements before arriving on site.

### 3. 🌊 Disaster Simulation & 5-Level Priority Escalation
* **Severe Heavy Flood Alert**: Triggers an immediate safety verification alert upon entering an affected sector.
* **Safety Monitoring Loop**:
  - If a user reports they are unsafe, an emergency check-in prompt appears every 2 minutes (or 15s in fast demo mode).
  - Includes a visual **15-second countdown** with **"✓ I am Safe"** and a bright red **"🚨 I am not Safe"** button.
  - If 15 seconds expire without confirmation, the system **automatically places an escalated emergency SOS**.
* **Progressive 5-Level Priority Escalation**:
  $$\text{LOW} \longrightarrow \text{MEDIUM} \longrightarrow \text{HIGH} \longrightarrow \text{VERY HIGH} \longrightarrow \text{CRITICAL}$$
* Network incidents are dynamically sorted and prioritized by severity.

### 4. 🛡️ Incident Command Center & Bi-Directional Rescue Ping
* **Command Center Tab**: Live status dashboard displaying counts for `CRITICAL`, `VERY HIGH`, `HIGH`, and `AUTOMATED TIMEOUTS`.
* **In-Depth SOS Inspection**: Tapping any incident card or incoming banner opens the patient's complete medical record, GPS coordinates, and contact details.
* **"🚑 Ping Victim: Help is Arriving"**:
  - Responders can dispatch an authenticated radio acknowledgment packet directly to the victim's device.
  - On the victim's screen, a prominent alert flashes: **`🚑 RESCUE TEAM EN ROUTE! First responders have acknowledged your distress call.`**
  - Pauses the victim's check-in countdown to provide psychological reassurance.

### 5. 💬 1-on-1 Offline Mesh Text Chat
* **Bottom-Left Blue Chat Bubble (`💬`)**: Accessible from the dashboard with an unread message badge and incoming floating toast notifications.
* **Peer Discovery by Real Username**: Discovers and lists connected mesh peers by their registered `@username` (e.g. `@advik_t`, `@priya_medic`).
* **Direct 1-on-1 Text Messaging**: Instant encrypted radio text chat between nodes with timestamps and message bubbles—completely off-grid.

### 6. 🗺️ Live Map & Rescue Route Optimization
* Visualizes stranded victims and emergency beacons across an interactive map.
* Built-in route optimizer calculates the shortest, most efficient multi-stop path prioritized by incident urgency.

---

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| **Mobile Frontend** | React Native, Expo (SDK 54), TypeScript |
| **Local Offline Storage** | SQLite (`expo-sqlite`), `AsyncStorage` |
| **Mesh Radio Relay** | Node.js / Python Dual-Stack WebSocket Mesh Server |
| **Location & Mapping** | `expo-location`, `react-native-maps` |
| **Network Protocol** | Custom BitChat Gossip Mesh Protocol (JSON Packets over Local Radio) |

---

## 🚀 Quickstart Guide

### Prerequisites
* **Node.js** (v18.x or higher)
* **npm** (v9.x or higher)
* **Expo Go** app installed on physical Android or iOS test devices

---

### Step 1: Clone and Install Dependencies

```powershell
git clone https://github.com/advik-thiagarajan/CrisisMesh.git
cd CrisisMesh/frontend
npm install
```

---

### Step 2: Start the Offline Mesh Relay Server

Open your **first terminal**:
```powershell
cd CrisisMesh/frontend
npm run relay
```
*The relay will launch on port `8765` and display your local network IP (e.g. `ws://192.168.43.xxx:8765`).*

---

### Step 3: Start the Expo Mobile Bundler

Open your **second terminal**:
```powershell
cd CrisisMesh/frontend
npx expo start
```
*A QR code will appear in your terminal.*

---

### Step 4: Launch on Devices (Zero Internet Setup)

1. Turn **OFF Mobile Data** on your test devices.
2. Connect all phones and your laptop to the **same Wi-Fi hotspot** (e.g. phone portable hotspot).
3. Open **Expo Go** and scan the QR code to load CrisisMesh on each phone.
4. Tap the **⚙️ (gear)** icon in CrisisMesh to open Node Diagnostics, tap **`⚡ Auto-Detect IP`**, and tap **`Save & Reconnect`**.
5. Your node status will turn **`🟢 ONLINE & SYNCED`**!

---

## 🎬 Live Hackathon Demo Runbook

### Phase 1: Civilian Victim (Phone 1)
1. Select **`[ 👤 Civilian User ]`**:
   * Name: `Advik`, Username: `advik_t`, Blood Type: `O+`.
   * Check `Diabetes` and `Cardiac Issues`.
   * Emergency Contact: `Priya (+91 9876543210)`.
   * Tap **Save & Login as User**.
2. **Show the Heavy Flood Disaster Alert**:
   * Alert pops up immediately: *"🌊 SEVERE HEAVY FLOOD ALERT"*.
   * Tap **"I am in a safe place"** -> Show the persistent top banner.
   * Tap **"I am not safe"** -> Show the **15-second visual countdown** and bright red **"🚨 I am not Safe"** button.
3. **Trigger Automatic SOS**:
   * Allow the 15-second timer to expire -> Automated SOS broadcasts across the mesh with victim medical vitals!

### Phase 2: First Responder Command (Phone 2)
1. Select **`[ 🛡️ Admin / Responder ]`** -> Tap **Enter Command Center as Admin**.
2. Open the **`🛡️ Command Center`** tab:
   * View the incoming SOS card with `🩸 O+` badge and `⚠️ Diabetes, Cardiac Issues` tags.
3. Tap the incident card -> Inspect the full patient dossier and emergency contact details.
4. Tap **`🚑 Ping Victim: Help is Arriving`**!

### Phase 3: Bi-Directional Mesh Verification (Phone 1)
1. Phone 1 immediately flashes: **`🚑 RESCUE TEAM EN ROUTE! DISTRESS SIGNAL ACKNOWLEDGED`**.
2. Emergency countdown pauses automatically.

### Phase 4: 1-on-1 Offline Text Chat
1. On Phone 1, tap the **bottom-left blue chat bubble (`💬`)**.
2. Select **`🟢 @[Phone 2 Username]`** from the peer list.
3. Send a direct text: *"Are you safe?"* -> Phone 2 receives the message instantly over the offline mesh!

---

## 📂 Project Structure

```
CrisisMesh/
├── backend/
│   ├── mesh_server.js       # Node.js WebSocket mesh relay server
│   ├── mesh_server.py       # Python fallback mesh relay server
│   ├── test_mesh_sync.py    # Automated end-to-end multi-peer integration tests
│   └── data/                # Persistent offline packet storage
└── frontend/
    ├── App.tsx              # Root navigation & app entrypoint
    ├── screens/
    │   ├── ProfileRegistrationScreen.tsx  # User onboarding, Admin login & Vitals
    │   ├── DashboardScreen.tsx            # Sitrep, Command Center, Map, & P2P Chat
    │   ├── SOSScreen.tsx                  # Manual emergency SOS beacon transmission
    │   └── SettingsScreen.tsx             # Node diagnostics & disaster simulator
    ├── services/
    │   ├── bitchat.ts       # BitChat mesh gossip protocol & packet transport
    │   ├── database.ts      # Offline SQLite database manager & queries
    │   ├── routeOptimizer.ts# Rescue path traveling-salesman optimizer
    │   └── summarizer.ts    # AI & heuristic SITREP disaster summarizer
    └── utils/
        ├── types.ts         # TypeScript models (SOSReport, UserProfile, ChatMessage)
        └── constants.ts     # System colors, storage keys & default coordinates
```

---

## 🧪 Automated Testing

CrisisMesh includes automated end-to-end integration tests that verify multi-node registration, gossip relay, escalation, rescue pings, and 1-on-1 text chat:

```powershell
python backend/test_mesh_sync.py
```

```
Testing connection to mesh server at: ws://127.0.0.1:8765
  [OK] Node 1 registered successfully.
  [OK] Node 2 registered successfully.
  [OK] Node 1 received PEER_JOIN for Node 2.
  [OK] Node 1 broadcasted SOS.
  [OK] Node 2 received relayed SOS (Hop: 1)
  [OK] Node 1 broadcasted escalated SOS (VERY HIGH + Medical Profile).
  [OK] Node 2 received escalated SOS: Advik (Blood: O+, Med: ['Diabetes', 'Cardiac Issues'])
  [OK] Node 2 (Admin) transmitted RESCUE_PING to Node 1.
  [OK] Node 1 (Victim) received RESCUE_PING from Incident Commander.
  [OK] Node 1 (@advik_t) transmitted PEER_CHAT to Node 2.
  [OK] Node 2 received PEER_CHAT: 'Hey Priya, are you safe in the flood zone?'
  [OK] Node 2 (@priya_medic) replied with PEER_CHAT to Node 1.
  [OK] Node 1 received reply: 'Yes Advik, safe on the 2nd floor with medical supplies!'

ALL OFFLINE MESH PEER-TO-PEER TESTS PASSED SUCCESSFULLY!
```

---

## 📄 License

Licensed under the [MIT License](LICENSE).