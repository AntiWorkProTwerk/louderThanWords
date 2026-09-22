<script lang="ts">
  import { onMount } from 'svelte';
  import { startDiagnostics, sampleFrames } from './diagnostics';
  let device = $state(''),
    measuring = $state(false),
    message = $state('');
  let metrics: ReturnType<typeof startDiagnostics> | undefined;
  onMount(() => {
    metrics = startDiagnostics();
    return () => metrics?.stop();
  });
  async function download() {
    measuring = true;
    message = 'Measuring frames for 1.2 seconds…';
    const frames = await sampleFrames();
    const report = {
      formatVersion: 1,
      environment: 'manual-device-session',
      deviceLabel: device,
      at: new Date().toISOString(),
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      userAgent: navigator.userAgent,
      visibility: document.visibilityState,
      metrics: metrics?.snapshot(),
      frameTimesMs: frames,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `said-did-device-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    measuring = false;
    message = 'Saved on this device. Nothing was sent to a server.';
  }
</script>

<details class="pipeline-controls diagnostics-panel" open>
  <summary>Local performance measurements</summary>
  <div class="pipeline-stages">
    <section>
      <p>
        Opt-in diagnostics. Browse comparisons, use filters, and expand the mobile panel before
        exporting. For physical-phone evidence, open this page on that phone; desktop emulation is
        not a physical-device test.
      </p>
      <label
        >Device and network description<input
          bind:value={device}
          placeholder="e.g. Pixel 8 / Chrome / home Wi-Fi"
        /></label
      >
      <button disabled={measuring || !device.trim()} onclick={download}
        >Download this device’s measurements</button
      >
      <p role="status">{message}</p>
    </section>
  </div>
</details>
