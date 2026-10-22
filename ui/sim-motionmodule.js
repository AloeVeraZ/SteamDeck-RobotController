(function(root,factory){const node=typeof module==='object'&&module.exports,value=factory(node?require('./sim-timed.js'):root.DeckTimed,node?require('./sim-export.js'):root.DeckSimExport);if(node)module.exports=value;else root.DeckSimMotionModule=value;})(typeof globalThis==='object'?globalThis:this,(Timed,Export)=>{
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
    const compiled=Timed.compile(route,timing),start=route.heading||0,power=compiled.config.power,steps=[];let target=start/DEG,lastPower=null;
    for(const s of compiled.steps){
      if(s.kind==='disabled'){steps.push(['disabled']);break;}
      const stepPower=s.power??power;if(stepPower!==lastPower){steps.push(['power',stepPower]);lastPower=stepPower;}
      const divisor=Math.max(.000001,stepPower);
      // Turning while driving: each piece holds a field direction (from the IMU heading) while the
      // heading hold turns toward that piece's share of the turn, so a lagging turn does not steer it off.
      if(s.kind!=='turn'&&(s.forward||s.strafe)&&Number.isFinite(s.mid)){const fs=compiled.config.forwardSpeed,ss=compiled.config.strafeSpeed,vf=s.forward*fs,vl=s.strafe*ss,c=Math.cos(s.mid-start/DEG),n=Math.sin(s.mid-start/DEG);
        steps.push(['glide',+((vf*c-vl*n)/(fs*divisor)).toFixed(4),+((vf*n+vl*c)/(fs*divisor)).toFixed(4),+s.seconds.toFixed(3),+wrap(s.heading*DEG-start).toFixed(2),...(s.moving?[s.moving]:[])]);target=s.heading;continue;}
      if(s.kind!=='turn'&&(s.forward||s.strafe)&&Number.isFinite(s.heading)&&Math.abs(wrap((s.heading-target)*DEG))>1e-6){steps.push(['aim',+wrap(s.heading*DEG-start).toFixed(2)]);target=s.heading;}
      if(s.kind==='turn'){steps.push(['turn',+wrap(s.heading*DEG-start).toFixed(2)]);target=s.heading;}
      else if(!s.forward&&!s.strafe)steps.push(s.action?['action',s.action,+s.seconds.toFixed(3)]:['hold',+s.seconds.toFixed(3)]);
      else steps.push(['drive',+(s.forward/divisor).toFixed(4),+(-s.strafe/divisor).toFixed(4),+s.seconds.toFixed(3),...(s.moving?[s.moving]:[])]);
    }
    return {steps,power,config:compiled.config};
  }
  function autonomous(route,timing,options={}){
    const p=plan(route,timing),name=String(options.name||'Planned route').replace(/"""/g,'');
    const steps=p.steps.map(s=>s[0]==='power'?`    ("power", ${num(s[1])}),`:s[0]==='disabled'?`    ("disabled",),`:s[0]==='drive'?`    ("drive", ${num(s[1])}, ${num(s[2])}, ${num(s[3])}${s[4]?`, ${pyString(s[4])}`:''}),`:s[0]==='turn'?`    ("turn", ${num(s[1])}),`:s[0]==='action'?`    ("action", ${pyString(s[1])}, ${num(s[2])}),`:s[0]==='aim'?`    ("aim", ${num(s[1])}),`:s[0]==='glide'?`    ("glide", ${num(s[1])}, ${num(s[2])}, ${num(s[3])}, ${num(s[4])}${s[5]?`, ${pyString(s[5])}`:''}),`:`    ("hold", ${num(s[1])}),`).join('\n'),list=Export.actions(route);
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
  ("action", name, seconds)            stay put and run an action (see below)
  ("aim", degrees)                     hold this heading (left of the start) from
                                       the next drive step on
  ("glide", x, y, seconds, degrees)    turning while driving: move along x/y (start
                                       frame, fractions of DRIVE_SPEED at forward
                                       speed) whatever the heading, while turning
                                       toward degrees left of the start
  A 5th drive value names the action run while driving (an action path).

Actions (intake, shooter...) are your code, in robot_actions.py next to this
file: the simulator export creates it once and never overwrites it. Each action
is called every loop while it runs and returns True when finished. The robot
leaves a pin once its action has finished and its pause is over. An action
path's action is called until it finishes or the path ends, and then gets one
last call with step.last set so it can stop its mechanism.
"""

import importlib.util
import math
import os
import time
from types import SimpleNamespace

from motion_module.heading import HeadingController, Settle, TurnPID, wrap180

PLAN = [
${steps}
]

# Each action named in the simulator, and the function it calls in robot_actions.py.
ACTIONS = {
${list.map(a=>`    ${pyString(a.name)}: ${pyString(a.py)},  # ${a.uses.map(u=>Export.where(u)).join('; ').replace(/[\r\n]/g,' ')}`).join('\n')}
}


def load_actions():
    """robot_actions.py next to this file, or None when it is missing."""
    here = globals().get("__file__")
    path = os.path.join(os.path.dirname(os.path.abspath(here)), "robot_actions.py") if here else None
    if not path or not os.path.exists(path):
        return None
    spec = importlib.util.spec_from_file_location("robot_actions", path)
    actions = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(actions)
    return actions

${list.map(a=>`
def ${a.py}(step):
    """Placeholder for "${a.name.replace(/"/g,"'")}" until robot_actions.py defines ${a.py}(step)."""
    return True
`).join('')}
# The reference robot's confirmed mixer turns clockwise for positive rotation,
# so heading feedback is converted to that convention here (as in MotionModule's
# Mecanum autonomous example).
IMU_TO_MIXER_SIGN = -1.0


class PlannedRoute:
    duration_seconds = ${num(Math.max(30,Math.ceil((p.steps.reduce((t,s)=>t+({turn:3,drive:s[3],hold:s[1],action:s[2]+5}[s[0]]||0),0))+5)))}

    DRIVE_SPEED = ${num(p.power)}       # wheel power limit while driving a step
    TURN_SPEED = 1.0          # actual motor power, not a multiplier
    APPROACH_SPEED = 0.6      # maximum power near each target
    CORRECTION_SPEED = 0.28   # lower power cap after overshoot, in either direction
    APPROACH_DEGREES = 25
    APPROACH_RATE = 200       # degrees/second at the start of the approach
    FINAL_APPROACH_RATE = 80  # taper to this as the remaining angle shrinks
    CORRECTION_RATE = 12.0    # stay this slow after overshoot, even if undershooting
    TURN_TIMEOUT = 20.0
    LOOP_SECONDS = 0.02       # 50 updates a second
    IMU_READY_TIMEOUT = 5.0
    HEADING_GAIN = ${num(p.config.headingP)}  # heading hold while driving, per radian of error
    STRAFE_RATIO = ${num(p.config.forwardSpeed/p.config.strafeSpeed)}  # forward speed / strafe speed at the same power

    def __init__(self, module, drive):
        self.module = module
        self.drive = drive
        self.sensors = getattr(drive, "sensors", None)
        self.heading = getattr(drive, "heading", None) or HeadingController()
        self.turn_heading = TurnPID(kp=0.065, kd=0.0035, derivative_seconds=0.01, max_power=self.TURN_SPEED,
                                    integral_power_limit=self.APPROACH_SPEED, settle_seconds=0.2)
        self.raw_move = getattr(drive, "move", drive.drive)
        self.target = 0.0
        self.start = 0.0
        self.progress = {"steps": len(PLAN), "step": None}
        self.actions = load_actions()
        self.moving = None  # the action path action running now
        setup = getattr(self.actions, "setup", None)
        if callable(setup):
            setup(module)

    def move(self, forward, strafe, rotate, speed=1.0):
        # Match the path ceiling for every mixed motor, including turn/heading correction.
        peak = abs(forward) + abs(strafe) + abs(rotate)
        factor = max(0.0, speed) / max(1.0, peak * max(0.0, speed) / max(0.000001, self.DRIVE_SPEED))
        self.raw_move(forward * factor, strafe * factor, rotate * factor, speed=1.0)

    def ready(self):
        return self.sensors is not None and self.sensors.heading() is not None

    def call_action(self, name, step):
        """One call of an action: robot_actions.py's function, else the placeholder. True when finished."""
        slot = ACTIONS.get(name)
        if not slot:
            return True
        function = getattr(self.actions, slot, None) or globals()[slot]
        self.progress = {**self.progress, "action": name}
        return bool(function(step))

    def drive_for(self, forward, strafe, seconds, stop, moving=None, coast=False):
        """Drive at a set power for a set time while holding the heading (running an action path's action).
        coast: the next step drives on, so the motors are not stopped in between."""
        if moving and (self.moving is None or self.moving["name"] != moving):
            self.moving = {"name": moving, "started": time.monotonic(), "done": False,
                           "step": SimpleNamespace(elapsed=0.0, first=True, last=False, moving=True, module=self.module)}
        travelled, last = 0.0, time.monotonic()
        while travelled < seconds:
            if stop.is_set():
                return False
            heading = self.sensors.heading()
            if heading is None:
                return False
            if moving and not self.moving["done"]:
                step = self.moving["step"]
                step.elapsed = time.monotonic() - self.moving["started"]
                self.moving["done"] = self.call_action(moving, step)
                step.first = False
            error = math.radians(wrap180(self.target - heading))
            turn = max(-0.5, min(0.5, error * self.HEADING_GAIN))
            share = 1.0 / max(1.0, abs(forward) + abs(strafe) + abs(turn) / max(0.000001, self.DRIVE_SPEED))
            self.move(forward, strafe, turn / self.DRIVE_SPEED, speed=self.DRIVE_SPEED)
            time.sleep(max(0.0, min(self.LOOP_SECONDS, (seconds - travelled) / share)))
            now = time.monotonic()
            travelled += (now - last) * share
            last = now
        if not coast:
            self.drive.stop()
        return True

    def glide(self, x, y, seconds, aim, stop, moving=None, coast=False):
        """Turning while driving: hold a direction on the field from the IMU heading, turning toward aim.
        The mixer shares wheel power between turning and driving, so the step counts only the share of
        its time that went into driving: it lasts until the planned travel is done."""
        self.target = wrap180(self.start + aim)
        if moving and (self.moving is None or self.moving["name"] != moving):
            self.moving = {"name": moving, "started": time.monotonic(), "done": False,
                           "step": SimpleNamespace(elapsed=0.0, first=True, last=False, moving=True, module=self.module)}
        travelled, last, share = 0.0, time.monotonic(), 1.0
        while travelled < seconds:
            if stop.is_set():
                return False
            heading = self.sensors.heading()
            if heading is None:
                return False
            if moving and not self.moving["done"]:
                step = self.moving["step"]
                step.elapsed = time.monotonic() - self.moving["started"]
                self.moving["done"] = self.call_action(moving, step)
                step.first = False
            h = math.radians(wrap180(heading - self.start))
            forward = x * math.cos(h) + y * math.sin(h)
            left = (-x * math.sin(h) + y * math.cos(h)) * self.STRAFE_RATIO
            scale = max(1.0, abs(forward), abs(left))
            error = math.radians(wrap180(self.target - heading))
            turn = max(-0.5, min(0.5, error * self.HEADING_GAIN))
            rotate = max(-1.0, min(1.0, turn / self.DRIVE_SPEED))
            drive = abs(forward / scale) + abs(left / scale)
            share = max(1.0, drive) / max(1.0, drive + abs(rotate))
            self.move(forward / scale, -left / scale, rotate, speed=self.DRIVE_SPEED)
            time.sleep(max(0.0, min(self.LOOP_SECONDS, (seconds - travelled) / share)))
            now = time.monotonic()
            travelled += (now - last) * share
            last = now
        if not coast:
            self.drive.stop()
        return True

    def end_moving(self):
        """The action path is over: one last call so its action can stop the mechanism."""
        if self.moving and not self.moving["done"]:
            step = self.moving["step"]
            step.elapsed = time.monotonic() - self.moving["started"]
            step.last = True
            self.call_action(self.moving["name"], step)
        self.moving = None

    def act(self, name, seconds, stop):
        """Stay put running an action until it has finished and the pin's pause is over."""
        started = time.monotonic()
        step = SimpleNamespace(elapsed=0.0, first=True, last=False, moving=False, module=self.module)
        done = False
        while True:
            if stop.is_set():
                return False
            heading = self.sensors.heading()
            if heading is None:
                return False
            step.elapsed = time.monotonic() - started
            if not done:
                done = self.call_action(name, step)
                step.first = False
            if done and step.elapsed >= seconds:
                break
            rate = getattr(self.sensors, "rate", None)
            turn = self.heading.power(self.target, heading, rate() if callable(rate) else None, in_place=True)
            self.move(0, 0, turn, speed=1.0)
            time.sleep(self.LOOP_SECONDS)
        self.drive.stop()
        return True

    def turn_to(self, target, stop):
        """Turn in place, correcting in either direction until stable within tolerance.
        The approach and overshoot correction follow MotionModule's Mecanum autonomous example."""
        self.target = wrap180(target)
        self.turn_heading.reset()
        settle = Settle(self.turn_heading)
        approaching = overshot = False
        approach_rate = self.APPROACH_RATE
        direction = previous_error = None
        deadline = time.monotonic() + self.TURN_TIMEOUT
        try:
            while time.monotonic() < deadline:
                if stop.is_set():
                    return False
                heading = self.sensors.heading()
                if heading is None or not math.isfinite(heading):
                    raise RuntimeError("IMU heading lost; autonomous stopped")
                now = time.monotonic()
                error = wrap180(self.target - heading)
                if direction is None:
                    direction = 1 if error >= 0 else -1
                crossed = (previous_error is not None
                           and previous_error * direction > 0 >= error * direction
                           and abs(error - previous_error) < 180)
                overshot = overshot or crossed
                previous_error = error
                approaching = approaching or abs(error) <= self.APPROACH_DEGREES
                limit = self.APPROACH_SPEED if approaching else self.TURN_SPEED
                rate_limit = None
                if approaching:
                    fraction = max(0.0, min(1.0, (abs(error) - self.turn_heading.tolerance)
                                            / (self.APPROACH_DEGREES - self.turn_heading.tolerance)))
                    approach_rate = min(approach_rate, self.FINAL_APPROACH_RATE
                                        + (self.APPROACH_RATE - self.FINAL_APPROACH_RATE) * fraction)
                    rate_limit = approach_rate
                if overshot:
                    limit = min(limit, self.CORRECTION_SPEED)
                    rate_limit = self.CORRECTION_RATE
                turn = self.turn_heading.update(self.target, heading, now, limit=limit, rate_limit=rate_limit)
                still = abs(self.turn_heading.rate) <= self.turn_heading.STOPPED_DPS
                if not still:
                    settle = Settle(self.turn_heading)
                on_target = abs(error) <= self.turn_heading.tolerance
                self.progress = {**self.progress, "target": round(self.target, 1), "heading": round(heading, 1), "error": round(error, 1),
                                 "turn_phase": "settling" if still and on_target else "correction" if overshot else "approach" if approaching else "cruise"}
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
            self.start = start
            self.target = start
            for index, step in enumerate(PLAN):
                if stop.is_set():
                    return
                self.progress = {**self.progress, "step": index}
                kind = step[0]
                if kind == "disabled":
                    self.drive.stop()
                    self.progress = {**self.progress, "phase": "Zero motor power: stopped"}
                    while not stop.is_set():
                        stop.wait(self.LOOP_SECONDS)
                    return
                if kind == "power":
                    self.DRIVE_SPEED = step[1]
                    continue
                if kind == "drive":
                    moving = step[4] if len(step) > 4 else None
                    after = next((s for s in PLAN[index + 1:] if s[0] not in ("aim", "power")), None)
                    done = self.drive_for(step[1], step[2], step[3], stop, moving, coast=bool(after) and after[0] in ("drive", "glide"))
                    # The action path goes on while the next drive step (after any turns) runs the same action.
                    following = next((s for s in PLAN[index + 1:] if s[0] not in ("turn", "aim", "power")), None)
                    if moving and not (following and following[0] in ("drive", "glide") and following[-1] == moving):
                        self.end_moving()
                elif kind == "glide":
                    moving = step[5] if len(step) > 5 else None
                    after = next((s for s in PLAN[index + 1:] if s[0] not in ("aim", "power")), None)
                    done = self.glide(step[1], step[2], step[3], step[4], stop, moving, coast=bool(after) and after[0] in ("drive", "glide"))
                    following = next((s for s in PLAN[index + 1:] if s[0] not in ("turn", "aim", "power")), None)
                    if moving and not (following and following[0] in ("drive", "glide") and following[-1] == moving):
                        self.end_moving()
                elif kind == "turn":
                    done = self.turn_to(start + step[1], stop)
                elif kind == "aim":
                    self.target = wrap180(start + step[1])
                    done = True
                elif kind == "hold":
                    done = self.hold(step[1], stop)
                elif kind == "action":
                    done = self.act(step[1], step[2], stop)
                else:
                    raise ValueError(f"Unknown autonomous step: {step!r}")
                if not done:
                    if not stop.is_set():
                        raise RuntimeError("IMU heading lost; autonomous stopped")
                    return
                self.progress = {**self.progress, "completed": index + 1}
        finally:
            self.drive.stop()
            self.end_moving()
            finish = getattr(self.actions, "stop", None)
            if callable(finish):
                finish(self.module)


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
  // robot_actions.py: the team's mechanism code, created once next to autonomous.py and never overwritten.
  function actionsFile(route,options={}){
    const list=Export.actions(route),name=String(options.name||'Planned route').replace(/"""/g,'');
    return `"""Your mechanism code for the autonomous actions of ${name}.

Deck Driver Station created this file once and never overwrites it. autonomous.py
calls the function named for each action every loop while that action runs; return
True when it has finished. At a pin the robot waits for the action and the pause;
on an action path it keeps driving, and the last call has step.last set.

step.elapsed   seconds since the action started
step.first     True on the first call
step.last      True on the final call of an action path (stop the mechanism now)
step.moving    True on an action path, False at a pin
step.module    the MotionModule object, for its outputs

When you add or rename an action in the simulator, its placeholder appears in the
exported autonomous.py: add a function with the same name here.
"""


def setup(module):
    """Called once when autonomous is created: set up your mechanisms here."""

${list.map(a=>`
def ${a.py}(step):
    """"${a.name.replace(/"/g,"'")}": ${a.uses.map(u=>Export.where(u)+(u.note?` (${u.note.replace(/"/g,"'")})`:'')).join('; ').replace(/[\r\n]/g,' ')}."""
    # TODO: ${a.uses.some(u=>u.moving)?'start the mechanism when step.first, stop it when step.last.':'run the mechanism, return False until it is done.'}
    return True
`).join('')}

def stop(module):
    """Called when autonomous ends or is stopped: stop every mechanism."""
`;
  }
  return {plan,autonomous,actionsFile};
});
