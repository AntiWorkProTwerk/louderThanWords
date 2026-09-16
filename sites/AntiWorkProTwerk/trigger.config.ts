import { defineConfig } from '@trigger.dev/sdk';
export default defineConfig({
  project: process.env.TRIGGER_PROJECT_ID ?? 'configure-your-trigger-project',
  runtime: 'node',
  dirs: ['./trigger'],
  maxDuration: 600,
});
