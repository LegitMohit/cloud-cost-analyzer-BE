import { cpSync, rmSync, mkdirSync, copyFileSync, existsSync, statSync } from 'fs';
import { join, resolve } from 'path';

const packages = ['env', 'db'];
const nodeModulesPath = join(process.cwd(), 'node_modules', '@cloud_cost_analyzer');

for (const pkg of packages) {
  const destPath = join(nodeModulesPath, pkg);
  const srcDistPath = join(process.cwd(), 'packages', pkg, 'dist');
  const pkgJsonPath = join(process.cwd(), 'packages', pkg, 'package.json');
  
  try {
    // Remove existing symlink or directory
    rmSync(destPath, { recursive: true, force: true });
    mkdirSync(destPath, { recursive: true });
    
    // Copy dist contents
    cpSync(srcDistPath, join(destPath, 'dist'), { recursive: true });
    copyFileSync(pkgJsonPath, join(destPath, 'package.json'));
    console.log(`Copied ${pkg}/dist to node_modules/@cloud_cost_analyzer/${pkg}`);
  } catch (err) {
    console.error(`Failed to copy ${pkg}:`, err.message);
    process.exit(1);
  }
}