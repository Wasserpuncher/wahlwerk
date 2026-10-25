import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { normalize } from './lib/dawum.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const raw = await readFile(path.join(ROOT, 'fixtures/dawum.sample.json'), 'utf8');
const normalized = normalize(JSON.parse(raw));
const stamp = normalized.meta.sourceLastUpdate;

for (const zustand of ['vollstaendig', 'fehlt', 'ungueltiges JSON', 'leere Umfragen', 'veraenderter Wert', 'force', 'neuer Quellenstand']) {
  test(`Live-Cache: ${zustand}`, async (t) => {
    const root = await mkdtemp(path.join(tmpdir(), 'wahlwerk-cache-test-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    await mkdir(path.join(root, 'scripts/lib'), { recursive: true });
    await mkdir(path.join(root, 'data'));
    await copyFile(path.join(ROOT, 'scripts/fetch-dawum.mjs'), path.join(root, 'scripts/fetch-dawum.mjs'));
    await copyFile(path.join(ROOT, 'scripts/lib/dawum.mjs'), path.join(root, 'scripts/lib/dawum.mjs'));
    await writeFile(path.join(root, 'data/raw-dawum.json'), raw);
    const provenance = { mode: 'live', sourceLastUpdate: stamp, fetchedAt: '2026-01-01T00:00:00Z' };
    await writeFile(path.join(root, 'data/provenance.json'), JSON.stringify(provenance));
    const cached = structuredClone(normalized);
    if (zustand === 'leere Umfragen') cached.surveys = [];
    if (zustand === 'veraenderter Wert') {
      const partei = Object.keys(cached.surveys[0].results)[0];
      cached.surveys[0].results[partei] += 1;
    }
    if (zustand !== 'fehlt') {
      await writeFile(path.join(root, 'data/surveys.json'), zustand === 'ungueltiges JSON' ? '{' : JSON.stringify(cached));
    }
    const remote = JSON.parse(raw);
    if (zustand === 'neuer Quellenstand') remote.Database.Last_Update = '2099-01-01T00:00:00Z';
    await writeFile(path.join(root, 'remote.json'), JSON.stringify(remote));
    // Keine echten Netzaufrufe: Zeitstempel und synthetische API-Antwort kontrolliert liefern.
    await writeFile(path.join(root, 'mock-fetch.mjs'), `
      import { readFile, appendFile } from 'node:fs/promises';
      const raw = await readFile(new URL('./remote.json', import.meta.url), 'utf8');
      globalThis.fetch = async (url) => {
        await appendFile(new URL('./requests.txt', import.meta.url), url + '\\n');
        if (url === 'https://api.dawum.de/last_update.txt') return new Response(JSON.parse(raw).Database.Last_Update);
        if (url === 'https://api.dawum.de/') return new Response(raw);
        throw new Error('Unerwarteter Abruf: ' + url);
      };
    `);
    const run = spawnSync(process.execPath, ['--import', path.join(root, 'mock-fetch.mjs'), path.join(root, 'scripts/fetch-dawum.mjs'), ...(zustand === 'force' ? ['--force'] : [])], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(JSON.parse(await readFile(path.join(root, 'data/surveys.json'), 'utf8')), normalize(remote));
    const requests = (await readFile(path.join(root, 'requests.txt'), 'utf8')).trim().split('\n');
    assert.equal(requests.filter((url) => url === 'https://api.dawum.de/').length, ['force', 'neuer Quellenstand'].includes(zustand) ? 1 : 0);
    if (!['force', 'neuer Quellenstand'].includes(zustand)) {
      const meta = JSON.parse(await readFile(path.join(root, 'data/provenance.json'), 'utf8'));
      assert.equal(meta.fetchedAt, provenance.fetchedAt, 'lokale Reparatur ist kein neuer Quellenabruf');
    }
  });
}
