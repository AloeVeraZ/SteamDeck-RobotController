'use strict';
// CI helper: prints the end of a step's log as a GitHub error annotation, so a failure can be read from
// the run's annotations (public) as well as from the job log (which needs a signed-in viewer).
// Usage: node tools/ci-annotate.cjs <log>... (missing logs are skipped)
const fs=require('node:fs'),path=require('node:path');
const escape=s=>s.replace(/%/g,'%25').replace(/\r/g,'%0D').replace(/\n/g,'%0A');
for(const file of process.argv.slice(2)){
  if(!fs.existsSync(file))continue;
  const text=fs.readFileSync(file,'utf8').replace(/\x1b\[[0-9;]*m/g,'').trim().slice(-6000);
  if(text)console.log(`::error title=${path.basename(file)}::${escape(text)}`);
}
