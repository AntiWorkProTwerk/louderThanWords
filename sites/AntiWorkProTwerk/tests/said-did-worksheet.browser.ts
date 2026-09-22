import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { demoCorpus } from '../scripts/said-did/fixtures.ts';
import { createEvaluationSet, validateEvaluation } from '../scripts/said-did/evaluation.ts';
import { writeAnnotationPacket } from '../scripts/said-did/annotation-packet.ts';

// Separate from npm test: run explicitly with `npx tsx --test tests/said-did-worksheet.browser.ts`.
test('guided offline worksheet preserves unfinished drafts and exports valid human-reviewed fixtures', async () => {
  const corpus = demoCorpus(),
    labels = createEvaluationSet(corpus);
  const root = await mkdtemp(join(tmpdir(), 'said-did-worksheet-')),
    directory = join(root, 'packet');
  await writeAnnotationPacket(corpus, labels, directory);
  const browser = await chromium.launch({ channel: 'msedge' });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    const errors: string[] = [],
      requests: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (r) => {
      if (r.url().startsWith('http')) requests.push(r.url());
    });
    await page.goto(pathToFileURL(join(directory, 'index.html')).href);
    assert.equal(await page.locator('#welcome').isVisible(), true);
    assert.equal(await page.locator('#workspace').isVisible(), false);
    assert.ok((await page.locator('#scope-summary').innerText()).includes(corpus.scope.title));
    assert.equal(await page.locator('#editor').count(), 0);
    await page.locator('#start').click();
    await page.locator('#use-quote').click();
    await page.locator('#person').selectOption(corpus.passages[0].personId!);
    await page.locator('#check-source').check();
    await page.locator('#step-next').click();
    await page.locator('#claim-decision').selectOption('yes');
    await page.locator('#add-claim').click();
    await page.locator('[data-field="conditions"]').fill('Unfinished condition draft');
    await page.locator('#notes').fill('Synthetic browser test only; not human ground truth.');
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#download').click();
    const download = await downloadPromise,
      downloadPath = (await download.path())!;
    const saved = JSON.parse(await readFile(downloadPath, 'utf8'));
    assert.equal(saved.cases[0].status, 'pending');
    assert.deepEqual(saved.cases[0].expectedClaims, []);
    assert.equal(saved._worksheet.drafts[0].claims[0].conditions, 'Unfinished condition draft');
    validateEvaluation(saved, corpus);
    // Reload from disk, not browser memory, to prove resume works.
    const resumed = await browser.newPage();
    resumed.setDefaultTimeout(15000);
    resumed.on('pageerror', (e) => errors.push(e.message));
    await resumed.goto(pathToFileURL(join(directory, 'index.html')).href);
    await resumed.locator('#start').click();
    await resumed.locator('#import').setInputFiles(downloadPath);
    await resumed.locator('[data-step="1"]').click();
    assert.equal(
      await resumed.locator('[data-field="conditions"]').inputValue(),
      'Unfinished condition draft',
    );
    await resumed.locator('[data-field="targetId"]').selectOption('none');
    await resumed.locator('[data-field="type"]').selectOption('policy');
    await resumed.locator('[data-field="stance"]').selectOption('unclear');
    await resumed.locator('[data-field="sentiment"]').selectOption('not_assessed');
    await resumed.locator('#check-claims').check();
    await resumed.locator('[data-step="2"]').click();
    const action = resumed.locator('.action-card').first();
    await action.locator('summary').first().click();
    await action.getByRole('button', { name: 'Review this action', exact: true }).click();
    await action.locator('[data-field="relevant"]').selectOption('no');
    await action.locator('[data-field="actionKind"]').selectOption(corpus.actions[0].kind);
    await action
      .locator('[data-field="expectedPersonId"]')
      .selectOption(corpus.actions[0].personId ?? '');
    await action.locator('[data-field="expectedVote"]').selectOption(corpus.actions[0].vote);
    await action.locator('[data-field="expectedDate"]').fill(corpus.actions[0].date);
    await action.locator('[data-field="chronology"]').selectOption('unknown');
    await resumed.locator('#check-actions').check();
    await resumed.locator('[data-step="3"]').click();
    // Incomplete independent-review confirmation must not mark the case reviewed.
    await resumed.locator('#complete').click();
    assert.ok((await resumed.locator('#message').innerText()).includes('checkboxes'));
    await resumed.locator('#reviewer').fill('Synthetic UI test');
    await resumed.locator('#check-independent').check();
    await resumed.locator('#complete').click();
    assert.ok((await resumed.locator('#case-status').innerText()).includes('Human-reviewed'));
    const completedPromise = resumed.waitForEvent('download');
    await resumed.locator('#download').click();
    const completed = JSON.parse(await readFile((await (await completedPromise).path())!, 'utf8'));
    const valid = validateEvaluation(completed, corpus);
    assert.equal(valid.cases[0].status, 'human_reviewed');
    assert.equal(valid.cases[0].pairs.length, 1);
    assert.equal(valid.cases[0].expectedClaims.length, 1);
    await resumed.locator('#notes').fill('Edited after review');
    const editedPromise = resumed.waitForEvent('download');
    await resumed.locator('#download').click();
    const edited = JSON.parse(await readFile((await (await editedPromise).path())!, 'utf8'));
    assert.equal(edited.cases[0].status, 'pending');
    assert.equal(edited.cases[0].reviewedAt, null);
    // Rejected import must preserve current edits.
    await resumed.locator('#import').setInputFiles({
      name: 'wrong.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ ...saved, corpusHash: 'wrong' })),
    });
    assert.ok((await resumed.locator('#message').innerText()).includes('different frozen dataset'));
    assert.equal(await resumed.locator('#notes').inputValue(), 'Edited after review');
    await resumed.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await resumed.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(requests, []);
  } finally {
    await browser.close();
  }
});
