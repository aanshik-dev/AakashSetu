"""
AkashSetu - FastAPI Backend Server
REST API + WebSocket for real-time drone telemetry.
"""

import asyncio
import json
import time
from typing import List, Set
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from models.drone import (
    AddDroneRequest, DroneState, TelemetryMessage,
    SimulationStats, RestrictedZone
)
from engine.simulation import SimulationEngine
from engine.geofence import get_zones, get_virtual_zones


engine = SimulationEngine()
connected_clients: Set[WebSocket] = set()
simulation_task = None


async def simulation_loop():
    """Main simulation loop running at ~10 Hz."""
    last_time = time.time()
    while True:
        current_time = time.time()
        dt = current_time - last_time
        last_time = current_time

        if engine.running:
            engine.tick(dt)

            if connected_clients:
                telemetry = engine.get_telemetry()
                data = telemetry.model_dump_json()
                disconnected = set()
                for client in connected_clients:
                    try:
                        await client.send_text(data)
                    except Exception:
                        disconnected.add(client)
                connected_clients.difference_update(disconnected)

        await asyncio.sleep(1.0 / 10)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global simulation_task
    simulation_task = asyncio.create_task(simulation_loop())
    yield
    simulation_task.cancel()


app = FastAPI(
    title="AkashSetu - Drone Airspace Coordination",
    description="Real-time multi-operator drone fleet coordination and geo-fencing software",
    version="1.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {
        "name": "AkashSetu",
        "version": "1.1.0",
        "description": "Unified Airspace Coordination & Geo-Fencing Software",
        "status": "running" if engine.running else "idle",
        "active_drones": len(engine.drones),
    }


@app.post("/api/initiate-flight")
async def initiate_flight():
    """Start or redeploy the simulation with 6-12 fresh drones in safe fly zones."""
    drones = engine.initiate_flight()
    return {
        "status": "success",
        "message": f"Fresh simulation started with {len(drones)} drones",
        "drones": [d.model_dump() for d in drones],
    }


@app.post("/api/add-drone")
async def add_drone(request: AddDroneRequest):
    """Add a new custom drone mission with strict safety validation."""
    try:
        drone = engine.add_drone(request)
        return {
            "status": "success",
            "message": f"Drone {drone.id} authorized and active",
            "drone": drone.model_dump(),
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to add drone: {str(e)}")


@app.get("/api/drones")
async def get_drones():
    return {
        "drones": [d.model_dump() for d in engine.drones.values()],
        "count": len(engine.drones),
    }


@app.get("/api/zones")
async def get_restricted_zones():
    zones = get_zones()
    return {
        "zones": [z.model_dump() for z in zones],
        "count": len(zones),
    }


@app.get("/api/virtual-zones")
async def get_virtual_clusters():
    vzones = get_virtual_zones()
    return {
        "virtual_zones": [vz.model_dump() for vz in vzones],
        "count": len(vzones),
    }


@app.get("/api/stats")
async def get_stats():
    return engine.stats.model_dump()


@app.post("/api/speed")
async def set_speed(multiplier: float = 10.0):
    engine.set_speed(multiplier)
    return {"speed_multiplier": engine.speed_multiplier}


@app.post("/api/pause")
async def toggle_pause():
    paused = engine.toggle_pause()
    return {"paused": paused}


@app.post("/api/reset")
async def reset_simulation():
    engine.reset()
    return {"status": "reset"}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    connected_clients.add(websocket)

    try:
        initial = engine.get_telemetry()
        await websocket.send_text(initial.model_dump_json())

        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                msg = json.loads(data)
                if msg.get("type") == "set_speed":
                    engine.set_speed(msg.get("value", 10.0))
                elif msg.get("type") == "toggle_pause":
                    engine.toggle_pause()
                elif msg.get("type") == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))
            except asyncio.TimeoutError:
                try:
                    await websocket.send_text(json.dumps({"type": "heartbeat"}))
                except Exception:
                    break
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        connected_clients.discard(websocket)
