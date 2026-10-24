{
  "fileName": "BIOBUZZ red auto.pp",
  "version": "deck-sim-1",
  "stopAndTurn": true,
  "timestamp": "2026-10-24T12:27:17.177Z",
  "field": {
    "type": "biobuzz",
    "width": 141.348,
    "height": 141.348
  },
  "deckOrigin": {
    "x": 1.326,
    "y": 1.326
  },
  "startPoint": {
    "x": 8.504,
    "y": 25.674,
    "headingDeg": 0,
    "heading": "constant",
    "degrees": 0
  },
  "lines": [
    {
      "id": "line-1",
      "endPoint": {
        "x": 22.674,
        "y": 28.674,
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
      "deckPath": 0,
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
        "x": 20.674,
        "y": 18.674,
        "heading": "linear",
        "startDeg": 0,
        "endDeg": -90
      },
      "controlPoints": [
        {
          "x": 22.007,
          "y": 25.341
        },
        {
          "x": 21.672,
          "y": 20.858
        }
      ],
      "motorPower": 1,
      "kind": "atomic",
      "color": "#16a34a",
      "deckPath": 1,
      "heading": {
        "type": "piecewise",
        "piecewiseHeading": {
          "segments": [
            {
              "startProgress": 0,
              "endProgress": 0.08515,
              "interpolationType": "linear",
              "parameters": {
                "startDeg": 0,
                "endDeg": -7.5
              }
            },
            {
              "startProgress": 0.08515,
              "endProgress": 0.17359,
              "interpolationType": "linear",
              "parameters": {
                "startDeg": -7.5,
                "endDeg": -15
              }
            },
            {
              "startProgress": 0.17359,
              "endProgress": 0.26423,
              "interpolationType": "linear",
              "parameters": {
                "startDeg": -15,
                "endDeg": -22.5
              }
            },
            {
              "startProgress": 0.26423,
              "endProgress": 0.35598,
              "interpolationType": "linear",
              "parameters": {
                "startDeg": -22.5,
                "endDeg": -30
              }
            },
            {
              "startProgress": 0.35598,
              "endProgress": 0.44773,
              "interpolationType": "linear",
              "parameters": {
                "startDeg": -30,
                "endDeg": -37.5
              }
            },
            {
              "startProgress": 0.44773,
              "endProgress": 0.53837,
              "interpolationType": "linear",
              "parameters": {
                "startDeg": -37.5,
                "endDeg": -45
              }
            },
            {
              "startProgress": 0.53837,
              "endProgress": 0.62681,
              "interpolationType": "linear",
              "parameters": {
                "startDeg": -45,
                "endDeg": -52.5
              }
            },
            {
              "startProgress": 0.62681,
              "endProgress": 0.71196,
              "interpolationType": "linear",
              "parameters": {
                "startDeg": -52.5,
                "endDeg": -60
              }
            },
            {
              "startProgress": 0.71196,
              "endProgress": 0.79279,
              "interpolationType": "linear",
              "parameters": {
                "startDeg": -60,
                "endDeg": -67.5
              }
            },
            {
              "startProgress": 0.79279,
              "endProgress": 0.8683,
              "interpolationType": "linear",
              "parameters": {
                "startDeg": -67.5,
                "endDeg": -75
              }
            },
            {
              "startProgress": 0.8683,
              "endProgress": 0.93762,
              "interpolationType": "linear",
              "parameters": {
                "startDeg": -75,
                "endDeg": -82.5
              }
            },
            {
              "startProgress": 0.93762,
              "endProgress": 1,
              "interpolationType": "linear",
              "parameters": {
                "startDeg": -82.5,
                "endDeg": -90
              }
            }
          ]
        }
      }
    },
    {
      "id": "line-3",
      "endPoint": {
        "x": 14.674,
        "y": 11.174,
        "heading": "linear",
        "startDeg": -90,
        "endDeg": -90
      },
      "motorPower": 1,
      "actionPath": true,
      "actionName": "Intake",
      "waitAfterName": "Intake",
      "actionSeconds": 0.6,
      "kind": "atomic",
      "color": "#d97706",
      "deckPath": 2,
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
        "x": 22.674,
        "y": 22.674,
        "heading": "linear",
        "startDeg": -90,
        "endDeg": -90
      },
      "motorPower": 1,
      "kind": "atomic",
      "color": "#9333ea",
      "deckPath": 3,
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
        "x": 34.674,
        "y": 26.674,
        "heading": "linear",
        "startDeg": -90,
        "endDeg": -90
      },
      "controlPoints": [
        {
          "x": 25.174,
          "y": 24.611
        },
        {
          "x": 30.674,
          "y": 25.341
        }
      ],
      "motorPower": 1,
      "actionPath": true,
      "actionName": "Spin up",
      "waitAfterName": "Shoot",
      "kind": "atomic",
      "color": "#dc2626",
      "deckPath": 4,
      "heading": {
        "type": "piecewise",
        "piecewiseHeading": {
          "segments": [
            {
              "startProgress": 0,
              "endProgress": 0.06496,
              "interpolationType": "linear",
              "parameters": {
                "startDeg": -90,
                "endDeg": -90
              }
            },
            {
              "startProgress": 0.06496,
              "endProgress": 0.13553,
              "interpolationType": "linear",
              "parameters": {
                "startDeg": -90,
                "endDeg": -90
              }
            },
            {
              "startProgress": 0.13553,
              "endProgress": 0.2115,
              "interpolationType": "linear",
              "parameters": {
                "startDeg": -90,
                "endDeg": -90
              }
            },
            {
              "startProgress": 0.2115,
              "endProgress": 0.29227,
              "interpolationType": "linear",
              "parameters": {
                "startDeg": -90,
                "endDeg": -90
              }
            },
            {
              "startProgress": 0.29227,
              "endProgress": 0.37708,
              "interpolationType": "linear",
              "parameters": {
                "startDeg": -90,
                "endDeg": -90
              }
            },
            {
              "startProgress": 0.37708,
              "endProgress": 0.465,
              "interpolationType": "linear",
              "parameters": {
                "startDeg": -90,
                "endDeg": -90
              }
            },
            {
              "startProgress": 0.465,
              "endProgress": 0.55504,
              "interpolationType": "linear",
              "parameters": {
                "startDeg": -90,
                "endDeg": -90
              }
            },
            {
              "startProgress": 0.55504,
              "endProgress": 0.64614,
              "interpolationType": "linear",
              "parameters": {
                "startDeg": -90,
                "endDeg": -90
              }
            },
            {
              "startProgress": 0.64614,
              "endProgress": 0.73724,
              "interpolationType": "linear",
              "parameters": {
                "startDeg": -90,
                "endDeg": -90
              }
            },
            {
              "startProgress": 0.73724,
              "endProgress": 0.82727,
              "interpolationType": "linear",
              "parameters": {
                "startDeg": -90,
                "endDeg": -90
              }
            },
            {
              "startProgress": 0.82727,
              "endProgress": 0.91519,
              "interpolationType": "linear",
              "parameters": {
                "startDeg": -90,
                "endDeg": -90
              }
            },
            {
              "startProgress": 0.91519,
              "endProgress": 1,
              "interpolationType": "linear",
              "parameters": {
                "startDeg": -90,
                "endDeg": -90
              }
            }
          ]
        }
      }
    },
    {
      "id": "line-6",
      "endPoint": {
        "x": 14.674,
        "y": 105.674,
        "heading": "linear",
        "startDeg": -90,
        "endDeg": 0
      },
      "motorPower": 1,
      "kind": "atomic",
      "color": "#0891b2",
      "deckPath": 5,
      "controlPoints": [],
      "heading": {
        "type": "linear",
        "startDeg": -90,
        "endDeg": 0
      }
    }
  ],
  "shapes": [],
  "deck": {
    "start": {
      "x": 9.83,
      "y": 27,
      "heading": 0
    },
    "pins": [
      {
        "x": 24,
        "y": 30,
        "wait": 0,
        "action": "Shoot",
        "note": "Shoot all 4 preloaded pollen into the red up cell (the turret aims itself)",
        "path": {
          "kind": "action",
          "action": "Spin up",
          "style": "spline",
          "note": "Leave the wall at full power while the flywheel spins up"
        }
      },
      {
        "x": 22,
        "y": 20,
        "wait": 0,
        "action": "",
        "path": {
          "style": "spline",
          "note": "Turn the intake toward the audience wall",
          "rotate": "turn",
          "heading": -90
        }
      },
      {
        "x": 16,
        "y": 12.5,
        "wait": 0.6,
        "action": "Intake",
        "note": "Keep the intake running while the last pollen feeds in",
        "path": {
          "kind": "action",
          "action": "Intake",
          "style": "sharp",
          "note": "Drive the intake into the red GARDEN pollen"
        }
      },
      {
        "x": 24,
        "y": 24,
        "wait": 0,
        "action": "",
        "path": {
          "style": "sharp",
          "note": "Back out of the corner"
        }
      },
      {
        "x": 36,
        "y": 28,
        "wait": 0,
        "action": "Shoot",
        "note": "Shoot the garden pollen",
        "path": {
          "kind": "action",
          "action": "Spin up",
          "style": "spline",
          "note": "Spin up on the way back"
        }
      },
      {
        "x": 16,
        "y": 107,
        "wait": 0,
        "action": "",
        "note": "PARK: partly inside the red LOADING ZONE",
        "path": {
          "style": "spline",
          "note": "Around the hive frame to the red LOADING ZONE",
          "rotate": "turn",
          "heading": 0
        }
      }
    ],
    "zones": [],
    "signature": "f000a065"
  }
}
