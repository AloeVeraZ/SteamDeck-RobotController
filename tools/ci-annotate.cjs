'use strict';
// CI helper: prints the end of a step's log as GitHub error annotations, so a failure can be read from
// the run's annotations (public) as well as from the job log (which needs a signed-in viewer).
// A node --test log is reported from its "failing tests" summary. GitHub keeps about 4 KB of each
// annotation, so the text goes out in chunks.
// Usage: node tools/ci-annotate.cjs <log>... (missing logs are skipped)
const fs=require('node:fs'),path=require('node:path');
const CHUNK=3500,MAX_CHUNKS=4;
const escape=s=>s.replace(/%/g,'%25').replace(/\r/g,'%0D').replace(/\n/g,'%0A');
for(const file of process.argv.slice(2)){
  if(!fs.existsSync(file))continue;
  let text=fs.readFileSync(file,'utf8').replace(/\x1b\[[0-9;]*m/g,'').trim();
  const failing=text.lastIndexOf('✖ failing tests:');
  text=failing>=0?text.slice(failing,failing+CHUNK*MAX_CHUNKS):text.slice(-CHUNK*MAX_CHUNKS);
  for(let i=0,n=Math.ceil(text.length/CHUNK);i<n;i++)console.log(`::error title=${path.basename(file)} (${i+1}/${n})::${escape(text.slice(i*CHUNK,(i+1)*CHUNK))}`);
}
