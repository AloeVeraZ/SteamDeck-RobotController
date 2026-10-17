# App updates and branches

Open **⋮ → Updates**. The larger popup shows the installed version, saved channel, and GitHub
repository. Switch between Main (stable) and Testing (experimental) in its dropdown.
Entering Testing requires accepting an experimental-features warning. The choice
is saved outside the installation and survives restarts and updates. **Check for updates** reads GitHub Releases over HTTPS. Testing builds
use prereleases named `testing-v2.4.0`; stable builds use `v2.4.0` and channel `main`.
The newest release in that channel must have the asset for this device. The app
can return to an older Main version.

An empty repository or missing channel releases says **No testing releases have
been published yet**. Errors and unpublished releases never say “up to date.”
Private repositories need a distribution solution with authentication; this
personal app uses public release downloads and stores no GitHub access tokens.

**Download update** checks the GitHub asset SHA-256 digest (or its exact matching
`.sha256` file), size, and repository/release URL. Failed downloads are discarded.
**Install & restart** extracts a new copy, validates its app name/version/runtime,
then starts a helper that waits for this app to exit. The helper keeps the previous
app under the update's staging folder, replaces the installed files, and restarts.
Saved robots, browser sessions, and operating-system Wi-Fi profiles remain outside
the replaced installation. Helpers write `install.log` in the staging folder.
Opening Updates closes the active robot page and transport.

Desktop in-app installation requires an installed/packaged app; development
checkouts are protected from replacement. Apple Silicon updates are ad-hoc signed locally, like the initial installation.

## Publishing later

The remote is `https://github.com/AloeVeraZ/SteamDeck-RobotController.git`.
Only the empty repository has been created. No code, branch, tag, or release has
been pushed. Local `main` points at the original v2.0 baseline; `testing` contains
the new work. Keep committing to testing until promotion is requested.

After the user authorizes publication:

1. Push the approved branches. Set GitHub's default branch to testing while work
   continues there. Do not merge into main without explicit instruction.
2. Bump the `package.json` version. Testing packages keep `updateChannel: "testing"`.
3. Run the **Publish app update (manual)** workflow on testing. It tests, builds
   Steam Deck/Windows/Apple Silicon, and publishes all three platforms' assets plus
   checksums as a prerelease only after every build succeeds. It never runs on
   a normal push. An already published version/tag must not be reused.
4. Main publication requires an explicitly approved promotion and changing the
   packaged update channel to main. Current packages intentionally follow testing.

GitHub branch changes alone are not installable releases. The updater never runs
`git pull` against an installed app or pretends an unpublished commit is an update.
API contract: [GitHub Releases documentation](https://docs.github.com/en/rest/releases/releases).
