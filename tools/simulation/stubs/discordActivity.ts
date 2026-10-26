// Replaces DSIM's src/net/discordActivity.ts in the Deck bundle. DSIM's environment code asks
// this whether the document may fetch cross-origin assets (Poly Haven HDRIs). The driver station
// is offline by design, so it answers like DSIM's restricted Activity document: DSIM then uses
// its own bundled/painted environment fallback and never reaches the network.
export function inDiscordActivity(): boolean {
  return true;
}
