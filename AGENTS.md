# Repository workflow

- Work and commit on `testing`. Keep `main` at its approved baseline until the user explicitly requests promotion to main.
- Do not push code, tags, releases, or branches until the user authorizes a push. Creating the empty GitHub repository is authorized.
- The current 2.4.21 simulation release must work on Windows x64, Steam Deck/Linux and Apple Silicon, with responsive Steam Deck LCD/OLED layouts. Intel Mac and Android are unsupported.
- After publishing 2.4.21 to testing, future prompts default to local development on this laptop's Windows driver station. Hold GitHub pushes/releases and Apple/Linux work until the user requests them; this release's push authorization does not carry forward to future prompts.
- The robot supplies its own web controls. Keep connection setup in Settings and app updates in the three-dot menu.
