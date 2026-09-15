import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';

// npm can silently omit other platforms' optional native packages when it
// rewrites a lockfile using an existing, platform-specific node_modules tree.
// Check the lockfile, not installed packages: only the host binary is installed.
export function checkNativeBindings(lockfile) {
  const packages = lockfile.packages;
  const missing = [];
  for (const [location, entry] of Object.entries(packages)) {
    for (const dependency of Object.keys(entry.optionalDependencies ?? {})) {
      if (!/^(?:@rolldown\/binding-|@rollup\/rollup-|@esbuild\/|@tailwindcss\/oxide-|lightningcss-)/.test(dependency)) continue;
      let directory = location;
      let found = false;
      while (true) {
        if (packages[posix.join(directory, 'node_modules', dependency)]) {
          found = true;
          break;
        }
        if (!directory) break;
        directory = posix.dirname(directory);
        if (directory === '.') directory = '';
      }
      if (!found) missing.push(`${location}: ${dependency}`);
    }
  }
  if (missing.length) {
    throw new Error(`Lockfile is missing native build dependencies:\n${missing.join('\n')}\nRegenerate it in a clean directory without node_modules, then verify a Linux build.`);
  }
}

const lockPath = fileURLToPath(new URL('../package-lock.json', import.meta.url));
checkNativeBindings(JSON.parse(readFileSync(lockPath, 'utf8')));
console.log('Lockfile includes native build dependencies for all declared platforms.');
