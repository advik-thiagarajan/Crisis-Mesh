import asyncio
import json
import os
import socket
import sys
import time
from typing import Dict, Any
import websockets

# Ensure UTF-8 output on Windows terminal
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

PORT = 8765
HISTORY_FILE = os.path.join(os.path.dirname(__file__), 'data', 'mesh_history.json')

connected_clients: Dict[Any, Dict[str, Any]] = {}
sos_history: Dict[str, Dict[str, Any]] = {}

def get_local_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        try:
            return socket.gethostbyname(socket.gethostname())
        except Exception:
            return '127.0.0.1'

def load_history():
    global sos_history
    if os.path.exists(HISTORY_FILE):
        try:
            with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if isinstance(data, list):
                    sos_history = {item['id']: item for item in data if 'id' in item}
                elif isinstance(data, dict):
                    sos_history = data
            print(f"[Mesh Storage] Loaded {len(sos_history)} cached SOS alert(s) from history.")
        except Exception as e:
            print(f"[Mesh Storage] Failed to load history: {e}")

def save_history():
    try:
        os.makedirs(os.path.dirname(HISTORY_FILE), exist_ok=True)
        with open(HISTORY_FILE, 'w', encoding='utf-8') as f:
            json.dump(list(sos_history.values()), f, indent=2)
    except Exception as e:
        print(f"[Mesh Storage] Failed to persist history: {e}")

def get_peer_list(exclude_ws=None):
    peers = []
    for ws, info in connected_clients.items():
        if ws != exclude_ws:
            peers.append({
                "id": info["deviceId"],
                "name": info["name"],
                "ip": info["ip"],
                "connectedAt": info["connectedAt"]
            })
    return peers

async def broadcast_to_peers(message_dict: dict, sender_ws=None):
    raw_payload = json.dumps(message_dict)
    dead_clients = []
    
    for ws in list(connected_clients.keys()):
        if ws == sender_ws:
            continue
        try:
            await ws.send(raw_payload)
        except websockets.ConnectionClosed:
            dead_clients.append(ws)
        except Exception as e:
            print(f"[Broadcast Error] Failed to send: {e}")
            dead_clients.append(ws)

    for dead_ws in dead_clients:
        await handle_disconnect(dead_ws)

async def handle_disconnect(websocket):
    if websocket in connected_clients:
        info = connected_clients.pop(websocket)
        device_id = info.get("deviceId", "Unknown")
        print(f"[-] Node Disconnected: {device_id} ({info.get('name')}) | Remaining peers: {len(connected_clients)}")
        
        leave_msg = {
            "type": "PEER_LEAVE",
            "deviceId": device_id,
            "peers": get_peer_list()
        }
        await broadcast_to_peers(leave_msg)

async def handle_client(websocket):
    remote_ip = websocket.remote_address[0] if websocket.remote_address else "Unknown"
    
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
            except json.JSONDecodeError:
                print(f"[Warning] Invalid JSON from {remote_ip}: {message[:100]}")
                continue

            msg_type = data.get("type")

            if msg_type == "REGISTER":
                device_id = data.get("deviceId", f"node-{id(websocket)}")
                device_name = data.get("name", f"CrisisMesh-{device_id[-4:]}")
                
                connected_clients[websocket] = {
                    "deviceId": device_id,
                    "name": device_name,
                    "ip": remote_ip,
                    "connectedAt": time.time()
                }

                print(f"[+] Node Registered: {device_id} ({device_name}) from {remote_ip}")
                print(f"    Total Active Mesh Nodes: {len(connected_clients)}")

                welcome_packet = {
                    "type": "REGISTER_ACK",
                    "deviceId": device_id,
                    "peers": get_peer_list(exclude_ws=websocket),
                    "serverTime": time.time()
                }
                await websocket.send(json.dumps(welcome_packet))

                if sos_history:
                    sync_packet = {
                        "type": "SYNC_HISTORY",
                        "reports": list(sos_history.values())
                    }
                    await websocket.send(json.dumps(sync_packet))
                    print(f"    -> Synced {len(sos_history)} historical SOS alert(s) to {device_id}")

                join_announcement = {
                    "type": "PEER_JOIN",
                    "peer": {
                        "id": device_id,
                        "name": device_name,
                        "ip": remote_ip,
                        "connectedAt": time.time()
                    },
                    "peers": get_peer_list()
                }
                await broadcast_to_peers(join_announcement, sender_ws=websocket)

            elif msg_type == "SOS":
                sos_data = data.get("data", {})
                sos_id = sos_data.get("id") or f"SOS-{int(time.time()*1000)}"
                sos_data["id"] = sos_id
                priority = sos_data.get("priority", "UNKNOWN")
                origin = sos_data.get("deviceId", "Unknown")
                desc = sos_data.get("description", "")
                num_people = sos_data.get("numPeople", 1)

                print("\n" + "="*60)
                print(f"[!] [EMERGENCY SOS RECEIVED]")
                print(f"   ID:       {sos_id}")
                print(f"   Priority: {priority}")
                print(f"   From:     {origin}")
                print(f"   People:   {num_people}")
                print(f"   Location: Lat {sos_data.get('lat')}, Lng {sos_data.get('lng')}")
                print(f"   Detail:   {desc}")
                print(f"   Broadcasting to {len(connected_clients) - 1} peer node(s)...")
                print("="*60 + "\n")

                sos_history[sos_id] = sos_data
                save_history()

                mesh_packet = {
                    "id": data.get("id", f"msg-{int(time.time()*1000)}"),
                    "type": "SOS",
                    "data": sos_data,
                    "relayedBy": connected_clients.get(websocket, {}).get("deviceId", "Gateway"),
                    "relayCount": (data.get("relayCount") or 0) + 1,
                    "timestamp": int(time.time() * 1000)
                }

                await broadcast_to_peers(mesh_packet, sender_ws=websocket)

            elif msg_type == "PING":
                await websocket.send(json.dumps({"type": "PONG", "timestamp": int(time.time() * 1000)}))

            elif msg_type == "REQUEST_SYNC":
                sync_packet = {
                    "type": "SYNC_HISTORY",
                    "reports": list(sos_history.values())
                }
                await websocket.send(json.dumps(sync_packet))

    except websockets.ConnectionClosed:
        pass
    except Exception as err:
        print(f"[Error in client loop]: {err}")
    finally:
        await handle_disconnect(websocket)

async def main():
    load_history()
    local_ip = get_local_ip()

    print("\n" + "="*65)
    print("  CRISISMESH - OFFLINE PEER-TO-PEER MESH GATEWAY")
    print("="*65)
    print(f"  Status:             ONLINE & LISTENING")
    print(f"  Local Network IP:   {local_ip}")
    print(f"  Port:               {PORT}")
    print(f"  WebSocket URL:      ws://{local_ip}:{PORT}")
    print("="*65)
    print("  Instructions for mobile phones:")
    print(f"  1. Ensure phones & PC are on the same Wi-Fi or Mobile Hotspot.")
    print(f"  2. In the CrisisMesh app Settings, verify Gateway IP is: {local_ip}")
    print("  3. Whenever a node turns on, it will automatically sync.")
    print("="*65 + "\n")

    # Bind to None for dual-stack support (both IPv4 and IPv6)
    async with websockets.serve(handle_client, None, PORT):
        await asyncio.Future()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[CrisisMesh Gateway] Shutting down.")
