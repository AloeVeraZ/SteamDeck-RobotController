{
  "fileName": "BIOBUZZ red auto.pp",
  "version": "deck-sim-1",
  "stopAndTurn": true,
  "timestamp": "2026-10-24T09:32:07.109Z",
  "field": {
    "type": "biobuzz",
    "width": 144,
    "height": 144
  },
  "startPoint": {
    "x": 9.83,
    "y": 27,
    "headingDeg": 0,
    "heading": "constant",
    "degrees": 0
  },
  "lines": [
    {
      "id": "line-1",
      "endPoint": {
        "x": 24,
        "y": 30,
        "heading": "linear",
        "startDeg": 0,
        "endDeg": 0
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
        "startDeg": 0,
        "endDeg": 0
      }
    },
    {
      "id": "line-2",
      "endPoint": {
        "x": 22,
        "y": 20,
        "heading": "linear",
        "startDeg": 0,
        "endDeg": -90
      },
      "controlPoints": [
        {
          "x": 23.333,
          "y": 26.667
        },
        {
          "x": 22.998,
          "y": 22.184
        }
      ],
      "motorPower": 1,
      "kind": "atomic",
      "color": "#16a34a",
      "heading": {
        "type": "linear",
        "startDeg": 0,
        "endDeg": -90
      }
    },
    {
      "id": "line-3",
      "endPoint": {
        "x": 16,
        "y": 12.5,
        "heading": "linear",
        "startDeg": -90,
        "endDeg": -90
      },
      "motorPower": 1,
      "actionPath": true,
      "actionName": "Intake",
      "waitAfterName": "Intake",
      "kind": "atomic",
      "color": "#d97706",
      "controlPoints": [],
      "heading": {
        "type": "linear",
        "startDeg": -90,
        "endDeg": -90
      }
    },
    {
      "id": "line-4",
      "endPoint": {
        "x": 24,
        "y": 24,
        "heading": "linear",
        "startDeg": -90,
        "endDeg": -90
      },
      "motorPower": 1,
      "kind": "atomic",
      "color": "#9333ea",
      "controlPoints": [],
      "heading": {
        "type": "linear",
        "startDeg": -90,
        "endDeg": -90
      }
    },
    {
      "id": "line-5",
      "endPoint": {
        "x": 36,
        "y": 28,
        "heading": "linear",
        "startDeg": -90,
        "endDeg": -90
      },
      "controlPoints": [
        {
          "x": 26.5,
          "y": 25.937
        },
        {
          "x": 32,
          "y": 26.667
        }
      ],
      "motorPower": 1,
      "actionPath": true,
      "actionName": "Spin up",
      "waitAfterName": "Shoot",
      "kind": "atomic",
      "color": "#dc2626",
      "heading": {
        "type": "linear",
        "startDeg": -90,
        "endDeg": -90
      }
    },
    {
      "id": "line-6",
      "endPoint": {
        "x": 16,
        "y": 107,
        "heading": "linear",
        "startDeg": -90,
        "endDeg": 0
      },
      "motorPower": 1,
      "kind": "atomic",
      "color": "#0891b2",
      "controlPoints": [],
      "heading": {
        "type": "linear",
        "startDeg": -90,
        "endDeg": 0
      }
    }
  ],
  "shapes": []
}
