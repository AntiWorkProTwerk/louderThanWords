import { schedules } from '@trigger.dev/sdk';
import { publishRemote } from '../scripts/publish-remote';
export const publishCivicData = schedules.task({
  id: 'publish-civic-data',
  cron: '0 6 * * *',
  maxDuration: 600,
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 3, minTimeoutInMs: 5000, maxTimeoutInMs: 60000, factor: 2 },
  run: async () => publishRemote(),
});
