import * as esbuild from 'esbuild';
import { copyFileSync, cpSync, mkdirSync, rmSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const outdir = 'dist';

rmSync(join(process.cwd(), 'dist'), { recursive: true, force: true });
mkdirSync(join(process.cwd(), 'dist'), { recursive: true });

const packages = ['env', 'db'];
const nodeModulesPath = join(process.cwd(), 'node_modules', '@cloud_cost_analyzer');

for (const pkg of packages) {
  const srcDistPath = join(process.cwd(), 'packages', pkg, 'dist');
  const pkgJsonPath = join(process.cwd(), 'packages', pkg, 'package.json');
  const destPath = join(nodeModulesPath, pkg, 'dist');
  
  rmSync(destPath, { recursive: true, force: true });
  mkdirSync(destPath, { recursive: true });
  cpSync(srcDistPath, destPath, { recursive: true });
  copyFileSync(pkgJsonPath, join(nodeModulesPath, pkg, 'package.json'));
  console.log(`Prepared ${pkg} in node_modules`);
}

// Recursively find all TypeScript files
function findTsFiles(dir, files = []) {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      findTsFiles(fullPath, files);
    } else if (entry.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

const entryPoints = findTsFiles(join(process.cwd(), 'src'));

// Compile all source files
await esbuild.build({
  entryPoints,
  bundle: false,
  platform: 'node',
  target: ['node20'],
  format: 'esm',
  outdir: 'dist',
  outbase: 'src',
  packages: 'external',
});

console.log('Build created successfully');