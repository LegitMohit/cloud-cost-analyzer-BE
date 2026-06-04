import * as esbuild from 'esbuild';
import { mkdirSync } from 'fs';
import { join } from 'path';

mkdirSync(join(process.cwd(), 'packages', 'env', 'dist'), { recursive: true });

await esbuild.build({
  entryPoints: [join(process.cwd(), 'packages', 'env', 'src', 'server.ts')],
  outdir: join(process.cwd(), 'packages', 'env', 'dist'),
  bundle: false,
  platform: 'node',
  target: 'node20',
  format: 'esm',
});

console.log('Built @cloud_cost_analyzer/env');