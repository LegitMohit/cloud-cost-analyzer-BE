import * as esbuild from 'esbuild';
import { copyFileSync, cpSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

const outdir = 'dist';
const outfile = join(outdir, 'server.js');

rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

const packages = ['env', 'db'];
const nodeModulesPath = join(process.cwd(), 'node_modules', '@cloud_cost_analyzer');

for (const pkg of packages) {
  const destPath = join(nodeModulesPath, pkg, 'dist');
  const srcDistPath = join(process.cwd(), 'packages', pkg, 'dist');
  const pkgJsonPath = join(process.cwd(), 'packages', pkg, 'package.json');
  
  rmSync(destPath, { recursive: true, force: true });
  mkdirSync(destPath, { recursive: true });
  cpSync(srcDistPath, destPath, { recursive: true });
  copyFileSync(pkgJsonPath, join(nodeModulesPath, pkg, 'package.json'));
  console.log(`Copied ${pkg}/dist to node_modules/@cloud_cost_analyzer/${pkg}/dist`);
}

await esbuild.build({
  entryPoints: ['src/server.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile,
  external: ['@prisma/client', '@prisma/adapter-pg', 'pg', '@cloud_cost_analyzer/env', '@cloud_cost_analyzer/db'],
  nodePaths: ['.'],
  banner: {
    js: `
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
`
  }
});

console.log('Bundled server.js created successfully');