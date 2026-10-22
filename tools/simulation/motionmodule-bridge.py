"""Virtual MotionModule: runs an exported autonomous.py on MotionModule's real runtime.

The robot program is loaded by MotionModule's own load_autonomous() and runs against its real
MotionModule controller with MockGPIO (no hardware is opened) and its confirmed Mecanum mixer.
Only three things are simulated: the clock (time.monotonic/time.sleep follow simulation time, so
the routine runs in lockstep with physics), the built-in IMU (fed from the simulated gyro, degrees,
counter-clockwise positive as on the Pi IMU), and the chassis, which moves as the four channel
outputs command through the inverse of that mixer.

The reference robot's confirmed rotation correction (channels 1 and 4) means positive mixer
rotation turns the robot clockwise; MotionModule's autonomous example handles that with
IMU_TO_MIXER_SIGN = -1. The virtual robot reproduces it, so a program that steers correctly on the
real robot steers correctly here, and one with the wrong sign fails here too.

Protocol: one JSON object per line on stdin/stdout, the same shape as the Java controller bridge.
  {"type": "init", "workDir", "source", "motionModule", "deps", "start": {"heading"}}  -> ready
  {"type": "tick", "seq", "t", "dt", "imu"}  (imu: radians, counter-clockwise)        -> cmd
"""

import json
import math
import os
import sys
import threading
import time
import traceback
from pathlib import Path
from types import SimpleNamespace

protocol = sys.stdout
sys.stdout = sys.stderr


class Clock:
    """Simulation time for the routine thread. sleep() hands control back each tick."""

    def __init__(self):
        self.now = 1000.0
        self.to_routine = threading.Semaphore(0)
        self.to_bridge = threading.Semaphore(0)
        self.routine = None
        self.stopped = False

    def monotonic(self):
        return self.now

    def sleep(self, seconds):
        if threading.current_thread() is not self.routine:
            return
        until = self.now + max(0.0, float(seconds))
        while True:
            self.to_bridge.release()
            self.to_routine.acquire()
            if self.stopped or self.now >= until - 1e-9:
                return


clock = Clock()
real_sleep = time.sleep
time.monotonic = clock.monotonic
time.sleep = clock.sleep


class Stop:
    """The `stop` event a routine checks; its wait() also follows simulation time."""

    def __init__(self):
        self._set = False

    def is_set(self):
        return self._set or clock.stopped

    def set(self):
        self._set = True

    def wait(self, timeout=None):
        clock.sleep(0.02 if timeout is None else timeout)
        return self.is_set()


class VirtualImu:
    """MotionModule's built-in IMU interface, fed from the simulated gyro."""

    def __init__(self, heading_degrees):
        self._zero = heading_degrees
        self._yaw = heading_degrees
        self._rate = 0.0

    def feed(self, yaw, rate):
        self._yaw, self._rate = yaw, rate

    def heading(self):
        return ((self._yaw - self._zero + 180.0) % 360.0) - 180.0

    def total(self):
        return self._yaw - self._zero

    def rate(self):
        return self._rate

    def zero(self):
        self._zero = self._yaw

    def ready(self):
        return True

    def describe(self):
        return "Virtual IMU (simulated gyro)"

    def close(self):
        pass


def chassis(values):
    """Inverse of the confirmed mixer (columns forward, strafe-right, turn-right are orthogonal)."""

    fl, rl, fr, rr = (values.get(channel, 0.0) for channel in (1, 2, 3, 4))
    forward = (fl + rl + fr + rr) / 4
    strafe_right = (fl - rl - fr + rr) / 4
    mixer_turn_right = (-fl + rl - fr + rr) / 4
    # mix() passes -rotate into the turn-right column; on the confirmed robot +rotate turns
    # clockwise, so the counter-clockwise chassis command equals this column's value.
    return forward, -strafe_right, mixer_turn_right


def send(message):
    protocol.write(json.dumps(message) + "\n")
    protocol.flush()


def main():
    state = {}
    for line in sys.stdin:
        if not line.strip():
            continue
        message = json.loads(line)
        kind = message.get("type")
        try:
            if kind == "init":
                send(init(message, state))
            elif kind == "tick":
                send(tick(message, state))
            elif kind == "stop":
                clock.stopped = True
                clock.to_routine.release(1000)
                break
            else:
                raise ValueError(f"Unknown message type {kind}")
        except UserError as e:
            send({"type": "error", "stage": e.stage, "message": str(e), "trace": e.trace})
            break
        except Exception as e:  # noqa: BLE001 - report every bridge failure readably
            send({"type": "error", "stage": "bridge", "message": f"{type(e).__name__}: {e}", "trace": traceback.format_exc().splitlines()[-12:]})
            break


class UserError(Exception):
    def __init__(self, stage, message, trace=()):
        super().__init__(message)
        self.stage = stage
        self.trace = list(trace)


def init(message, state):
    spec = message["program"]
    source_root = Path(spec["motionModule"])
    sys.path.insert(0, str(source_root / "core"))
    if spec.get("deps"):
        sys.path.insert(0, spec["deps"])
    from motion_module.autonomous import load_autonomous
    from motion_module.config import default_config
    from motion_module.controller import MotionModule
    from motion_module.gpio import MockGPIO

    work = Path(message["workDir"]) / "motionmodule-robot"
    work.mkdir(parents=True, exist_ok=True)
    (work / "robot.py").write_text('"""Exported autonomous program."""\n\nPROGRAM_MODE = "autonomous"\n', encoding="utf-8")
    (work / "autonomous.py").write_text(spec["source"], encoding="utf-8")
    if spec.get("actions"):
        (work / "robot_actions.py").write_text(spec["actions"], encoding="utf-8")
    imu = VirtualImu(math.degrees(message["start"]["heading"]))
    module = MotionModule(default_config(), gpio=MockGPIO(), _imu=imu)
    try:
        routine = load_autonomous(module, SimpleNamespace(), work / "robot.py")
    except Exception as e:  # noqa: BLE001
        raise UserError("compile", f"{type(e).__name__}: {e}", traceback.format_exc().splitlines()[-12:])
    if routine is None:
        raise UserError("compile", "The export has no autonomous routine.")
    stop = Stop()
    failure = {}

    def body():
        try:
            routine.run(stop)
        except Exception as e:  # noqa: BLE001
            failure["error"] = f"{type(e).__name__}: {e}"
            failure["trace"] = traceback.format_exc().splitlines()[-12:]
        finally:
            state["finished"] = True
            clock.to_bridge.release()

    state.update(module=module, imu=imu, routine=routine, stop=stop, failure=failure, finished=False, started=False, body=body, heading=None)
    return {"type": "ready", "program": f"MotionModule autonomous ({type(routine).__name__})"}


def tick(message, state):
    imu, module = state["imu"], state["module"]
    clock.now = 1000.0 + float(message["t"])
    yaw = math.degrees(float(message["imu"]))
    if state["heading"] is not None:
        dt = float(message["dt"]) or 1 / 60
        imu.feed(yaw, (((yaw - state["heading"]) + 180) % 360 - 180) / dt)
    else:
        imu.feed(yaw, 0.0)
    state["heading"] = yaw
    if not state["started"]:
        state["started"] = True
        clock.routine = threading.Thread(target=state["body"], name="MotionModule autonomous", daemon=True)
        clock.routine.start()
    elif not state["finished"]:
        clock.to_routine.release()
    if not state["finished"] and not clock.to_bridge.acquire(timeout=2.0):
        raise UserError("loop", "The routine ran for more than 2 s without sleeping; MotionModule loops must sleep between updates.")
    if state["failure"].get("error"):
        raise UserError("loop", state["failure"]["error"], state["failure"]["trace"])
    forward, strafe, turn = chassis(module.motor_values) if not state["finished"] else (0.0, 0.0, 0.0)
    progress = getattr(state["routine"], "progress", {}) or {}
    telemetry = {k: str(v)[:80] for k, v in progress.items() if k in ("step", "completed", "turn_phase", "target", "heading", "error", "action")}
    return {"type": "cmd", "seq": message["seq"], "drive": {"forward": forward, "strafe": strafe, "turn": turn, "float": False},
            "telemetry": telemetry, "done": bool(state["finished"])}


if __name__ == "__main__":
    main()
