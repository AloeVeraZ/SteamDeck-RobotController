(function(root,factory){const value=factory(typeof module==='object'&&module.exports?require('./sim-timed.js'):root.DeckTimed);if(typeof module==='object'&&module.exports)module.exports=value;else root.DeckSimMotionModule=value;})(typeof globalThis==='object'?globalThis:this,Timed=>{
  'use strict';
  // MotionModule export: an autonomous.py for MotionModule's runtime (create_autonomous(module, drive)
  // returning an object with run(stop)). The route becomes the timed plan the simulator runs for
  // IMU-only setups: drive steps by power and time with IMU heading hold, IMU-settled turns, holds.
  // It follows MotionModule's own Mecanum autonomous example: its heading controllers, its confirmed
  // mixer (MecanumTestDrive) and IMU_TO_MIXER_SIGN = -1 for the reference robot.
  const DEG=180/Math.PI,wrap=d=>((d+180)%360+360)%360-180;
  const num=v=>{const s=String(Number(Number(v).toFixed(4)));return /[.e]/.test(s)?s:s+'.0';};
  const pyString=s=>JSON.stringify(String(s));
  // The timed plan as MotionModule PLAN steps. Forward/strafe are fractions of DRIVE_SPEED; strafe is
  // positive to the right (MotionModule's convention); turns are degrees left of the start heading.
  function plan(route,timing){
    const compiled=Timed.compile(route,timing),start=route.heading||0,power=compiled.config.power,steps=[];
    for(const s of compiled.steps){
      if(s.kind==='turn')steps.push(['turn',+wrap(s.heading*DEG-start).toFixed(2)]);
      else if(!s.forward&&!s.strafe)steps.push(['hold',+s.seconds.toFixed(3),s.action||'']);
      else steps.push(['drive',+(s.forward/power).toFixed(4),+(-s.strafe/power).toFixed(4),+s.seconds.toFixed(3)]);
    }
    return {steps,power,config:compiled.config};
  }
  function autonomous(route,timing,options={}){
    const p=plan(route,timing),name=String(options.name||'Planned route').replace(/"""/g,'');
    const steps=p.steps.map(s=>s[0]==='drive'?`    ("drive", ${num(s[1])}, ${num(s[2])}, ${num(s[3])}),`:s[0]==='turn'?`    ("turn", ${num(s[1])}),`:`    ("hold", ${num(s[1])}),${s[2]?`  # ${s[2].replace(/[\r\n]/g,' ')}`:''}`).join('\n');
    return `"""${name}: autonomous exported by Deck Driver Station.

MotionModule calls create_autonomous(module, drive) once, then run(stop) each
time autonomous starts. Line the robot up on the planned starting pose first:
every turn in PLAN counts from the heading the robot faces when it is enabled.

The robot has no wheel encoders, so each drive step runs for a set time at a set
power while the IMU holds the heading. Calibrate "Forward/Strafe at full power"
in the simulator's Timed driving settings on your robot; slip, bumps and a
different battery change how far each step goes. There is no X/Y correction.

Steps:
  ("drive", forward, strafe, seconds)  forward/strafe are fractions of DRIVE_SPEED,
                                       strafe positive to the right
  ("turn", degrees)                    face this many degrees left of the start
  ("hold", seconds)                    stay put, correcting the heading
"""

import math
import time

from motion_module.heading import HeadingController, Settle, TurnPID, wrap180

PLAN = [
${steps}
]

# The reference robot's confirmed mixer turns clockwise for positive rotation,
# so heading feedback is converted to that convention here (as in MotionModule's
# Mecanum autonomous example).
IMU_TO_MIXER_SIGN = -1.0


class PlannedRoute:
    duration_seconds = ${num(Math.max(30,Math.ceil((p.steps.reduce((t,s)=>t+(s[0]==='turn'?3:s[s[0]==='drive'?3:1]),0))+5)))}

    DRIVE_SPEED = ${num(p.power)}       # wheel power limit while driving a step
    TURN_SPEED = 0.6
    CORRECTION_SPEED = 0.28
    TURN_TIMEOUT = 20.0
    LOOP_SECONDS = 0.02       # 50 updates a second
    IMU_READY_TIMEOUT = 5.0
    HEADING_GAIN = ${num(p.config.headingP)}  # heading hold while driving, per radian of error

    def __init__(self, module, drive):
        self.module = module
        self.drive = drive
        self.sensors = getattr(drive, "sensors", None)
        self.heading = getattr(drive, "heading", None) or HeadingController()
        self.turn_heading = TurnPID(kp=0.065, kd=0.0035, derivative_seconds=0.01, max_power=self.TURN_SPEED,
                                    integral_power_limit=self.TURN_SPEED, settle_seconds=0.2)
        self.move = getattr(drive, "move", drive.drive)
        self.target = 0.0
        self.progress = {"steps": len(PLAN), "step": None}

    def ready(self):
        return self.sensors is not None and self.sensors.heading() is not None

    def drive_for(self, forward, strafe, seconds, stop):
        """Drive at a set power for a set time while holding the heading."""
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            if stop.is_set():
                return False
            heading = self.sensors.heading()
            if heading is None:
                return False
            error = math.radians(wrap180(self.target - heading))
            turn = max(-0.5, min(0.5, error * self.HEADING_GAIN))
            self.move(forward, strafe, turn / self.DRIVE_SPEED, speed=self.DRIVE_SPEED)
            time.sleep(self.LOOP_SECONDS)
        self.drive.stop()
        return True

    def turn_to(self, target, stop):
        """Turn in place until the IMU heading settles within tolerance."""
        self.target = wrap180(target)
        self.turn_heading.reset()
        settle = Settle(self.turn_heading)
        deadline = time.monotonic() + self.TURN_TIMEOUT
        try:
            while time.monotonic() < deadline:
                if stop.is_set():
                    return False
                heading = self.sensors.heading()
                if heading is None or not math.isfinite(heading):
                    raise RuntimeError("IMU heading lost; autonomous stopped")
                now = time.monotonic()
                turn = self.turn_heading.update(self.target, heading, now, limit=self.TURN_SPEED)
                still = abs(self.turn_heading.rate) <= self.turn_heading.STOPPED_DPS
                if not still:
                    settle = Settle(self.turn_heading)
                self.progress = {**self.progress, "target": round(self.target, 1), "heading": round(heading, 1),
                                 "error": round(wrap180(self.target - heading), 1), "turn_phase": "settling" if still else "turning"}
                if still and settle.update(self.target, heading, now):
                    return True
                self.move(0, 0, turn, speed=1.0)
                time.sleep(self.LOOP_SECONDS)
            raise RuntimeError(f"Turn to {self.target:.1f} degrees did not settle in {self.TURN_TIMEOUT:g} s")
        finally:
            self.drive.stop()

    def hold(self, seconds, stop):
        """Stay still, nudging the heading back if the robot was bumped."""
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            if stop.is_set():
                return False
            heading = self.sensors.heading()
            if heading is None:
                return False
            rate = getattr(self.sensors, "rate", None)
            turn = self.heading.power(self.target, heading, rate() if callable(rate) else None, in_place=True)
            self.move(0, 0, turn, speed=1.0)
            time.sleep(self.LOOP_SECONDS)
        self.drive.stop()
        return True

    def run(self, stop):
        try:
            deadline = time.monotonic() + self.IMU_READY_TIMEOUT
            while not self.ready():
                if stop.is_set():
                    return
                if time.monotonic() >= deadline:
                    raise RuntimeError("Built-in IMU is not ready; autonomous stayed stopped.")
                stop.wait(self.LOOP_SECONDS)
            start = self.sensors.heading()
            self.target = start
            for index, step in enumerate(PLAN):
                if stop.is_set():
                    return
                self.progress = {**self.progress, "step": index}
                kind = step[0]
                if kind == "drive":
                    done = self.drive_for(step[1], step[2], step[3], stop)
                elif kind == "turn":
                    done = self.turn_to(start + step[1], stop)
                elif kind == "hold":
                    done = self.hold(step[1], stop)
                else:
                    raise ValueError(f"Unknown autonomous step: {step!r}")
                if not done:
                    if not stop.is_set():
                        raise RuntimeError("IMU heading lost; autonomous stopped")
                    return
                self.progress = {**self.progress, "completed": index + 1}
        finally:
            self.drive.stop()


def create_autonomous(module, drive):
    """Required entry point. Return anything with run(stop)."""
    if not callable(getattr(drive, "move", None)) or getattr(drive, "sensors", None) is None:
        from types import SimpleNamespace
        from motion_module.mecanum import MecanumTestDrive

        mixer = MecanumTestDrive(module)
        imu = module.imu

        def heading_move(forward, strafe, rotate, speed=1.0):
            return mixer.drive(forward, strafe, IMU_TO_MIXER_SIGN * rotate, speed=speed)

        drive = SimpleNamespace(drive=heading_move, move=heading_move, stop=mixer.stop,
                                sensors=imu, heading=HeadingController())
    return PlannedRoute(module, drive)
`;
  }
  return {plan,autonomous};
});
