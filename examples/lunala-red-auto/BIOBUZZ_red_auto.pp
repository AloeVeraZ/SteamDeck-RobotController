{
  "fileName": "BIOBUZZ red auto.pp",
  "version": "deck-sim-1",
  "stopAndTurn": true,
  "timestamp": "2026-10-24T12:18:07.937Z",
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
