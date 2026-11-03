import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
await build({entryPoints:['tests/ui.test.tsx','tests/speech-player.test.ts'],bundle:true,platform:'node',format:'cjs',packages:'external',outdir:'.wrangler/ui-tests',outExtension:{'.js':'.cjs'},loader:{'.jpg':'file'},assetNames:'assets/[name]-[hash]',jsx:'automatic'});
const result=spawnSync(process.execPath,['--test','.wrangler/ui-tests/ui.test.cjs','.wrangler/ui-tests/speech-player.test.cjs'],{stdio:'inherit'});process.exitCode=result.status||0;
