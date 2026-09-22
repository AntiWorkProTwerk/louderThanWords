<script lang="ts">
  let {
    model,
    evaluation,
    evaluationReport,
    acquisition,
    busy,
    operate,
  }: {
    model: any;
    evaluation: any;
    evaluationReport: any;
    acquisition: any;
    busy: boolean;
    operate: (body: unknown) => Promise<void>;
  } = $props();
  let remoteConsent = $state(false),
    annotationText = $state(''),
    notice = $state('');
  function download(value: unknown, filename: string) {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
  async function upload(event: Event, kind: 'collection' | 'annotations') {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      if (file.size > 5_000_000) throw new Error('Use the CLI for larger files.');
      const value = JSON.parse(await file.text());
      await operate(
        kind === 'collection'
          ? { operation: 'collect', plan: value }
          : { operation: 'annotation-save', dataset: value },
      );
    } catch (e) {
      notice = String(e);
    }
  }
</script>

<details class="pipeline-controls">
  <summary>Collection, Luna extraction & quality checks <span>LOCAL PIPELINE ↗</span></summary>
  <div class="pipeline-stages">
    <section>
      <p class="eyebrow">01 / Acquire</p>
      <h3>Bring in the source record</h3>
      <p>
        Upload an acquisition plan to collect official Record text, bill XML and individual votes.
        Raw files and parser diagnostics stay on disk. Imported records replace the working corpus,
        not its review history.
      </p>
      <label
        >Acquisition plan JSON<input
          type="file"
          accept=".json,application/json"
          disabled={busy}
          onchange={(event) => upload(event, 'collection')}
        /></label
      >
      {#if acquisition}<p>
          {acquisition.counts.documents} documents · {acquisition.counts.passages} passages · {acquisition
            .issues.length} collection notices
        </p>
        <button disabled={busy} onclick={() => download(acquisition, 'acquisition-report.json')}
          >Download collection report</button
        >{/if}
    </section>
    <section>
      <p class="eyebrow">02 / Extract</p>
      <h3>Luna · high reasoning</h3>
      <p>
        Runs your installed Codex CLI. Extracts stance, meaning, conditions and sentiment; exact
        quotations are validated. New interpretations require review.
      </p>
      <label class="pipeline-consent"
        ><input type="checkbox" bind:checked={remoteConsent} disabled={busy} />Send this corpus’s
        eligible passages to OpenAI through my Codex account.</label
      >
      <button
        disabled={busy || !remoteConsent}
        onclick={() => operate({ operation: 'extract', allowRemoteInference: true })}
        >Run Luna extraction</button
      >
      {#if model}<p>
          {model.claims} validated claims · {model.abstainedPassages.length} abstentions · {model.batches.filter(
            (b: any) => b.cached,
          ).length} cached batches
        </p>
        <button disabled={busy} onclick={() => download(model, 'model-run.json')}
          >Download model usage & provenance</button
        >{/if}
    </section>
    <section>
      <p class="eyebrow">03 / Evaluate</p>
      <h3>Evidence before confidence</h3>
      <p>
        Bill/debate-day grouped development and held-out sets. Only actual human-reviewed labels
        count toward the accuracy gate. Empty and agent-drafted labels never pass it.
      </p>
      {#if !evaluation}<button
          disabled={busy}
          onclick={() => operate({ operation: 'annotation-template' })}
          >Create annotation set</button
        >
      {:else}<p>
          {evaluation.cases.length} cases · {evaluation.cases.filter(
            (c: any) => c.status === 'human_reviewed',
          ).length} human reviewed
        </p>
        <div class="review-actions">
          <button disabled={busy} onclick={() => download(evaluation, 'annotations.json')}
            >Export annotation set</button
          >
          <button
            disabled={busy}
            onclick={() => {
              annotationText = JSON.stringify(evaluation, null, 2);
            }}>Edit labels locally</button
          >
          <button disabled={busy} onclick={() => operate({ operation: 'evaluate' })}
            >Evaluate current claims</button
          >
        </div>{/if}
      <label
        >Import reviewed annotation JSON<input
          type="file"
          accept=".json,application/json"
          disabled={busy}
          onchange={(event) => upload(event, 'annotations')}
        /></label
      >
      {#if annotationText}<label
          >Annotation editor<textarea rows="16" bind:value={annotationText} spellcheck="false"
          ></textarea></label
        >
        <button
          disabled={busy}
          onclick={async () => {
            try {
              await operate({ operation: 'annotation-save', dataset: JSON.parse(annotationText) });
            } catch (e) {
              notice = String(e);
            }
          }}>Save annotation revision</button
        >{/if}
      {#if evaluationReport}<p class="pipeline-gate">
          {evaluationReport.acceptance.replaceAll('_', ' ')}
        </p>
        <p>
          Held-out exact-reference precision: {evaluationReport.exactReferencePrecision.value ===
          null
            ? 'not yet measurable'
            : `${Math.round(evaluationReport.exactReferencePrecision.value * 100)}%`} (n={evaluationReport
            .exactReferencePrecision.total})
        </p>
        <button disabled={busy} onclick={() => download(evaluationReport, 'evaluation-report.json')}
          >Download metrics, uncertainty & errors</button
        >{/if}
    </section>
  </div>
  {#if notice}<p role="status">{notice}</p>{/if}
</details>
