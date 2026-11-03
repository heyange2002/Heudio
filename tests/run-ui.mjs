import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
await build({entryPoints:['tests/ui.test.tsx'],bundle:true,platform:'node',format:'cjs',packages:'external',outfile:'.wrangler/ui-tests/test.cjs',loader:{'.jpg':'file'},assetNames:'assets/[name]-[hash]',jsx:'automatic'});
const result=spawnSync(process.execPath,['--test','.wrangler/ui-tests/test.cjs'],{stdio:'inherit'});process.exitCode=result.status||0;
