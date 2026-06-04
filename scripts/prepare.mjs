import { copyFileSync, cpSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

const packages = ['env', 'db'];
const nodeModulesPath = join(process.cwd(), 'node_modules', '@cloud_cost_analyzer');

for (const pkg of packages) {
  const srcDistPath = join(process.cwd(), 'packages', pkg, 'dist');
  const pkgJsonPath = join(process.cwd(), 'packages', pkg, 'package.json');
  const destPath = join(nodeModulesPath, pkg);
  
  try {
    rmSync(destPath, { recursive: true, force: true });
    mkdirSync(destPath, { recursive: true });
    cpSync(srcDistPath, join(destPath, 'dist'), { recursive: true });
    copyFileSync(pkgJsonPath, join(destPath, 'package.json'));
    console.log(`Prepared ${pkg} in node_modules`);
  } catch (err) {
    console.error(`Failed to prepare ${pkg}:`, err.message);
    process.exit(1);
  }
}