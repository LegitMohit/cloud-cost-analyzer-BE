import * as esbuild from 'esbuild';
import { copyFileSync, cpSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

// First prepare env package
const envRoot = join(process.cwd(), 'node_modules', '@cloud_cost_analyzer', 'env');
const envSrcDist = join(process.cwd(), 'packages', 'env', 'dist');

try {
  rmSync(envRoot, { recursive: true, force: true });
  mkdirSync(envRoot, { recursive: true });
  cpSync(envSrcDist, join(envRoot, 'dist'), { recursive: true });
  copyFileSync(join(process.cwd(), 'packages', 'env', 'package.json'), join(envRoot, 'package.json'));
  console.log('Prepared @cloud_cost_analyzer/env');
} catch (err) {
  console.error('Failed to prepare env:', err.message);
  process.exit(1);
}

mkdirSync(join(process.cwd(), 'packages', 'db', 'dist'), { recursive: true });

await esbuild.build({
  entryPoints: [join(process.cwd(), 'packages', 'db', 'src', 'index.ts')],
  outdir: join(process.cwd(), 'packages', 'db', 'dist'),
  bundle: false,
  platform: 'node',
  target: 'node20',
  format: 'esm',
});

console.log('Built @cloud_cost_analyzer/db');