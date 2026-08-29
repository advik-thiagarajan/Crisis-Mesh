import asyncio
import json
import websockets

async def test_mesh_network():
    uri = "ws://127.0.0.1:8765"
    print("Testing connection to mesh server at:", uri)

    async with websockets.connect(uri) as ws1:
        reg1 = {"type": "REGISTER", "deviceId": "test-phone-1", "name": "CrisisMesh-Node1"}
        await ws1.send(json.dumps(reg1))
        
        # Read until we have registered (may receive SYNC_HISTORY if history exists)
        ack1 = json.loads(await ws1.recv())
        assert ack1["type"] == "REGISTER_ACK"
        print("  [OK] Node 1 registered successfully.")

        async with websockets.connect(uri) as ws2:
            reg2 = {"type": "REGISTER", "deviceId": "test-phone-2", "name": "CrisisMesh-Node2"}
            await ws2.send(json.dumps(reg2))
            ack2 = json.loads(await ws2.recv())
            assert ack2["type"] == "REGISTER_ACK"
            print("  [OK] Node 2 registered successfully.")

            # Node 1 receives messages (skip any SYNC_HISTORY to find PEER_JOIN)
            while True:
                msg = json.loads(await ws1.recv())
                if msg["type"] == "PEER_JOIN":
                    assert msg["peer"]["id"] == "test-phone-2"
                    print("  [OK] Node 1 received PEER_JOIN for Node 2.")
                    break

            # Node 1 broadcasts SOS
            sos_payload = {
                "type": "SOS",
                "id": "msg-test-101",
                "data": {
                    "id": "SOS-TEST-999",
                    "timestamp": 123456789,
                    "lat": 13.0827,
                    "lng": 80.2707,
                    "description": "Flash flood, 4 people trapped on roof",
                    "priority": "CRITICAL",
                    "numPeople": 4,
                    "deviceId": "test-phone-1",
                    "synced": True,
                    "relayCount": 0
                }
            }
            await ws1.send(json.dumps(sos_payload))
            print("  [OK] Node 1 broadcasted SOS.")

            # Node 2 receives messages until SOS
            while True:
                received = json.loads(await ws2.recv())
                if received["type"] == "SOS":
                    assert received["data"]["id"] == "SOS-TEST-999"
                    assert received["data"]["priority"] == "CRITICAL"
                    print(f"  [OK] Node 2 received relayed SOS: {received['data']['description']} (Hop: {received['relayCount']})")
                    break

    print("\nALL OFFLINE MESH PEER-TO-PEER TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    asyncio.run(test_mesh_network())
