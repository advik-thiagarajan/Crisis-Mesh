import subprocess
import json
import re
import os
import time

# Script for fallback demo mode: Extracts BitChat native log payloads via ADB
LOG_OUTPUT_PATH = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'assets', 'mesh_store.json')

def main():
    print("[CrisisMesh Gateway] Listening for BitChat Bluetooth packets via ADB logcat...")
    process = subprocess.Popen(['adb', 'logcat', '-s', 'BitChatEngine:V'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    while True:
        line = process.stdout.readline().decode('utf-8', errors='ignore')
        if not line:
            time.sleep(0.1)
            continue

        if "RECEIVED_MESH_MSG" in line:
            match = re.search(r'\{.*\}', line)
            if match:
                try:
                    payload = json.loads(match.group(0))
                    print(f"[Packet Received] Node: {payload.get('deviceId', 'Unknown')} | Urgency: {payload.get('priority', 'UNKNOWN')}")
                    
                    with open(LOG_OUTPUT_PATH, 'w', encoding='utf-8') as f:
                        json.dump(payload, f, indent=2)
                except json.JSONDecodeError:
                    print("[Warning] Failed to parse JSON frame from packet.")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n[CrisisMesh Gateway] Terminated logcat stream.")