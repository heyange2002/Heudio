import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)), children=[];
let stopping=false;
function stop(code=0){if(stopping)return;stopping=true;for(const p of children)p.kill('SIGTERM');setTimeout(()=>process.exit(code),250).unref()}
for(const [dir,args]of [
 ['services/qq-music-api',['--env-file-if-exists=.env','start.cjs']],
 ['backend',['--env-file-if-exists=.env','src/server.mjs']],
 ['.',['scripts/frontend-dev.mjs']],
]){
 const child=spawn(process.execPath,args,{cwd:root+dir,stdio:'inherit',env:process.env});children.push(child);
 child.on('error',e=>{console.error(e.message);stop(1)});child.on('exit',code=>{if(!stopping)stop(code||1)});
}
for(const event of ['SIGINT','SIGTERM'])process.on(event,()=>stop());
