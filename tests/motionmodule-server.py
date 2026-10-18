"""Run the real MotionModule app with simulated GPIO; never open physical hardware."""
import json
import logging
import os
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(os.environ.get("DECK_MOTIONMODULE_SOURCE", root.parent / "MotionModule")) / "core"))
sys.path.insert(0, os.environ.get("DECK_MOTIONMODULE_DEPS", str(root / ".cache/motionmodule-test-deps")))
from flask import jsonify, request
from werkzeug.serving import make_server
from motion_module.config import default_config
from motion_module.controller import MotionModule
from motion_module.dashboard import create_app
from motion_module.gpio import MockGPIO
from motion_module.mecanum import MecanumTestDrive


class Network:
    def status(self):
        return {"ok": True, "wifi": {"ssid": "MotionModule simulation", "mode": "client"}, "addresses": [], "services": {}, "hostname": "motionmodule-sim"}


logging.getLogger("werkzeug").setLevel(logging.ERROR)
with MotionModule(default_config(), gpio=MockGPIO()) as module:
    app = create_app(module, MecanumTestDrive(module), Network(), project_name="Mecanum", camera_auto_install=False)
    commands = []

    @app.before_request
    def observe():
        if request.path == "/api/drive" and request.method == "POST":
            commands.append(request.get_json(silent=True))
            del commands[:-100]

    @app.get("/__test_state")
    def state():
        return jsonify({"commands": commands, "outputs": module.motor_values, "hardware": module.hardware})

    server = make_server("127.0.0.2", 0, app, threaded=True)
    print(json.dumps({"url": f"http://127.0.0.2:{server.server_port}/driver-station"}), flush=True)
    try:
        server.serve_forever()
    finally:
        app.config["STOP_OUTPUTS"]()
        app.config["UPDATE_CHECKER"].close()
        app.config["CAMERA_MANAGER"].close()
        server.server_close()
