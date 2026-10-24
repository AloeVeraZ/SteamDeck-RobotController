{
  "fileName": "BIOBUZZ red auto.pp",
  "version": "deck-sim-1",
  "stopAndTurn": true,
  "timestamp": "2026-10-24T12:27:16.306Z",
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
    "x": 7.774,
    "y": 24.674,
    "headingDeg": -90,
    "heading": "constant",
    "degrees": -90
  },
  "lines": [
    {
      "id": "line-1",
      "endPoint": {
        "x": 7.974,
        "y": 20.674,
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
      "deckPath": 0,
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
        "x": 7.974,
        "y": 14.674,
        "heading": "linear",
        "startDeg": -90,
        "endDeg": -90
      },
      "motorPower": 1,
      "actionPath": true,
      "actionName": "Intake",
      "waitAfterName": "Intake",
      "actionSeconds": 0.2,
      "kind": "atomic",
      "color": "#16a34a",
      "deckPath": 1,
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
        "x": 22.674,
        "y": 104.674,
        "heading": "linear",
        "startDeg": -90,
        "endDeg": -180
      },
      "controlPoints": [
        {
          "x": 23.674,
          "y": 36.674
        },
        {
          "x": 18.674,
          "y": 78.674
        }
      ],
      "motorPower": 1,
      "actionPath": true,
      "actionName": "Spin up",
      "waitAfterName": "Shoot",
      "kind": "atomic",
      "color": "#d97706",
      "deckPath": 2,
      "deckCurve": "custom",
      "heading": {
        "type": "piecewise",
        "piecewiseHeading": {
          "segments": [
            {
              "startProgress": 0,
              "endProgress": 0.0745,
              "interpolationType": "linear",
              "parameters": {
                "startDeg": -90,
                "endDeg": -97.5
              }
            },
            {
              "startProgress": 0.0745,
              "endProgress": 0.15214,
              "interpolationType": "linear",
              "parameters": {
                "startDeg": -97.5,
                "endDeg": -105
              }
            },
            {
              "startProgress": 0.15214,
              "endProgress": 0.23336,
              "interpolationType": "linear",
              "parameters": {
                "startDeg": -105,
                "endDeg": -112.5
              }
            },
            {
              "startProgress": 0.23336,
              "endProgress": 0.31797,
              "interpolationType": "linear",
              "parameters": {
                "startDeg": -112.5,
                "endDeg": -120
              }
            },
            {
              "startProgress": 0.31797,
              "endProgress": 0.40532,
              "interpolationType": "linear",
              "parameters": {
                "startDeg": -120,
                "endDeg": -127.5
              }
            },
            {
              "startProgress": 0.40532,
              "endProgress": 0.49449,
              "interpolationType": "linear",
              "parameters": {
                "startDeg": -127.5,
                "endDeg": -135
              }
            },
            {
              "startProgress": 0.49449,
              "endProgress": 0.58435,
              "interpolationType": "linear",
              "parameters": {
                "startDeg": -135,
                "endDeg": -142.5
              }
            },
            {
              "startProgress": 0.58435,
              "endProgress": 0.67368,
              "interpolationType": "linear",
              "parameters": {
                "startDeg": -142.5,
                "endDeg": -150
              }
            },
            {
              "startProgress": 0.67368,
              "endProgress": 0.76119,
              "interpolationType": "linear",
              "parameters": {
                "startDeg": -150,
                "endDeg": -157.5
              }
            },
            {
              "startProgress": 0.76119,
              "endProgress": 0.84557,
              "interpolationType": "linear",
              "parameters": {
                "startDeg": -157.5,
                "endDeg": -165
              }
            },
            {
              "startProgress": 0.84557,
              "endProgress": 0.92556,
              "interpolationType": "linear",
              "parameters": {
                "startDeg": -165,
                "endDeg": -172.5
              }
            },
            {
              "startProgress": 0.92556,
              "endProgress": 1,
              "interpolationType": "linear",
              "parameters": {
                "startDeg": -172.5,
                "endDeg": -180
              }
            }
          ]
        }
      }
    },
    {
      "id": "line-4",
      "endPoint": {
        "x": 14.874,
        "y": 105.974,
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
      "deckPath": 3,
      "controlPoints": [],
      "heading": {
        "type": "linear",
        "startDeg": -180,
        "endDeg": -180
      }
    }
  ],
  "shapes": [],
  "deck": {
    "start": {
      "x": 9.1,
      "y": 26,
      "heading": -90
    },
    "pins": [
      {
        "x": 9.3,
        "y": 22,
        "wait": 0,
        "action": "Shoot",
        "note": "Shoot the 4 preloads into the up (south) cell: 3 tip the hive",
        "path": {
          "kind": "action",
          "action": "Spin up",
          "style": "spline",
          "note": "Off the start, pollen flywheel spinning up"
        }
      },
      {
        "x": 9.3,
        "y": 16,
        "wait": 0,
        "action": "Intake",
        "actionSeconds": 0.2,
        "note": "Front sweeper finishes the 4 garden pollen against the audience wall",
        "path": {
          "kind": "action",
          "action": "Intake",
          "style": "sharp",
          "note": "Straight into the red GARDEN corner"
        }
      },
      {
        "x": 24,
        "y": 106,
        "wait": 0,
        "action": "Shoot",
        "cell": "other",
        "note": "Behind the hive: shoot the garden pollen into the other (north) cell",
        "path": {
          "kind": "action",
          "action": "Spin up",
          "style": null,
          "note": "One custom curve from the garden up the left side, bowing away from the wall while turning to face it",
          "rotate": "turn",
          "heading": -180,
          "controls": [
            {
              "x": 25,
              "y": 38
            },
            {
              "x": 20,
              "y": 80
            }
          ]
        }
      },
      {
        "x": 16.2,
        "y": 107.3,
        "wait": 0,
        "action": "Shoot",
        "cell": "other",
        "note": "PARK in the red LOADING ZONE and shoot its 4 pollen into the other cell (second tip)",
        "path": {
          "kind": "action",
          "action": "Intake",
          "style": "sharp",
          "note": "Front sweeper takes the 4 loading-zone pollen off the left wall"
        }
      }
    ],
    "zones": [],
    "signature": "1c285062"
  }
}
