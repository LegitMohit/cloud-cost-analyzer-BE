import { copyFileSync, cpSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

const pkg = 'env';
const nodeModulesPath = join(process.cwd(), 'node_modules', '@cloud_cost_analyzer', pkg);
const srcDistPath = join(process.cwd(), 'packages', pkg, 'dist');
const pkgJsonPath = join(process.cwd(), 'packages', pkg, 'package.json');

try {
  rmSync(nodeModulesPath, { recursive: true, force: true });
  mkdirSync(nodeModulesPath, { recursive: true });
  cpSync(srcDistPath, join(nodeModulesPath, 'dist'), { recursive: true });
  copyFileSync(pkgJsonPath, join(nodeModulesPath, 'package.json'));
  console.log(`Prepared ${pkg} for db compilation`);
} catch (err) {
  console.error(`Failed to prepare ${pkg}:`, err.message);
  process.exit(1);
}