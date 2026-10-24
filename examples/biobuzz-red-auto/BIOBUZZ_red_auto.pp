{
  "fileName": "BIOBUZZ red auto.pp",
  "version": "deck-sim-1",
  "stopAndTurn": true,
  "timestamp": "2026-10-24T09:53:05.268Z",
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
