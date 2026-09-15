import { execFileSync } from 'node:child_process';

const production = !process.argv.includes('--preview');
let branch = 'main';

if (!production) {
  branch = execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim();
  if (!branch) {
    throw new Error('Preview deploys require a checked-out Git branch.');
  }
}

execFileSync('npm', ['run', 'build'], { stdio: 'inherit', shell: process.platform === 'win32' });

const args = [
  'wrangler',
  'pages',
  'deploy',
  'dist',
  '--project-name',
  'louder-than-words',
  '--branch',
  branch,
];

execFileSync('npx', args, { stdio: 'inherit', shell: process.platform === 'win32' });
