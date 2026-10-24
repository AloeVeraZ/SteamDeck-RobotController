{
  "fileName": "BIOBUZZ red auto.pp",
  "version": "deck-sim-1",
  "stopAndTurn": true,
  "timestamp": "2026-10-24T08:30:24.710Z",
  "field": {
    "type": "biobuzz",
    "width": 144,
    "height": 144
  },
  "startPoint": {
    "x": 9.1,
    "y": 26,
    "headingDeg": -90,
    "heading": "constant",
    "degrees": -90
  },
  "lines": [
    {
      "id": "line-1",
      "endPoint": {
        "x": 9.3,
        "y": 22,
        "heading": "linear",
        "startDeg": -90,
        "endDeg": -90
      },
      "motorPower": 1,
      "actionPath": true,
      "actionName": "Spin up",
      "waitAfterName": "Shoot",
      "kind": "atomic",
      "color": "#2563eb",
      "controlPoints": [],
      "heading": {
        "type": "linear",
        "startDeg": -90,
        "endDeg": -90
      }
    },
    {
      "id": "line-2",
      "endPoint": {
        "x": 9.3,
        "y": 16,
        "heading": "linear",
        "startDeg": -90,
        "endDeg": -90
      },
      "motorPower": 1,
      "actionPath": true,
      "actionName": "Intake",
      "waitAfterName": "Intake",
      "kind": "atomic",
      "color": "#16a34a",
      "controlPoints": [],
      "heading": {
        "type": "linear",
        "startDeg": -90,
        "endDeg": -90
      }
    },
    {
      "id": "line-3",
      "endPoint": {
        "x": 24,
        "y": 106,
        "heading": "linear",
        "startDeg": -90,
        "endDeg": -180
      },
      "controlPoints": [
        {
          "x": 25,
          "y": 38
        },
        {
          "x": 20,
          "y": 80
        }
      ],
      "motorPower": 1,
      "actionPath": true,
      "actionName": "Spin up",
      "waitAfterName": "Shoot",
      "kind": "atomic",
      "color": "#d97706",
      "heading": {
        "type": "linear",
        "startDeg": -90,
        "endDeg": -180
      }
    },
    {
      "id": "line-4",
      "endPoint": {
        "x": 16.2,
        "y": 107.3,
        "heading": "linear",
        "startDeg": -180,
        "endDeg": -180
      },
      "motorPower": 1,
      "actionPath": true,
      "actionName": "Intake",
      "waitAfterName": "Shoot",
      "kind": "atomic",
      "color": "#9333ea",
      "controlPoints": [],
      "heading": {
        "type": "linear",
        "startDeg": -180,
        "endDeg": -180
      }
    }
  ],
  "shapes": []
}
