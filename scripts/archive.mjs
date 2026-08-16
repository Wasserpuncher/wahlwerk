#!/usr/bin/env node
// Wahlwerk - Archivwerkzeug
// Lizenz: AGPL-3.0-or-later
//
//   node scripts/archive.mjs snapshot          alle freigeschalteten Quellen abrufen und aufnehmen
//   node scripts/archive.mjs snapshot --file p lokale Datei aufnehmen
//   node scripts/archive.mjs verify            gesamtes Archiv pruefen
//   node scripts/archive.mjs list [quelle]     Aufnahmen auflisten
//   node scripts/archive.mjs restore <hash>    Aufnahme nach data/ zurueckspielen
//   node scripts/archive.mjs diff <a> <b>      zwei Aufnahmen vergleichen
//   node scripts/archive.mjs export <hash>     Aufnahme im Original auf stdout

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { ingest, verify, retrieve, readManifest, rebuildIndex } from './lib/archive.mjs';
import { normalize } from './lib/dawum.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const ARCHIVE = path.join(ROOT, 'archive');
const DATA = path.join(ROOT, 'data');

const sources = JSON.parse(await readFile(path.join(ROOT, 'config', 'sources.json'), 'utf8'));
const [cmd, ...rest] = process.argv.slice(2);

const USER_AGENT = 'Wahlwerk-Archiv/0.3 (+https://github.com/USER/wahlwerk)';

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

async function cmdSnapshot() {
  await mkdir(ARCHIVE, { recursive: true });
  const fileIdx = rest.indexOf('--file');

  if (fileIdx !== -1) {
    const p = rest[fileIdx + 1];
    const sourceKey = rest[rest.indexOf('--source') + 1] ?? 'lokal';
    const src = sources.sources[sourceKey];
    if (!src) throw new Error(`Quelle ${sourceKey} steht nicht in config/sources.json.`);
    const content = await readFile(path.resolve(ROOT, p), 'utf8');
    const res = await ingest(ARCHIVE, { source: sourceKey, sourceUrl: `file://${p}`, license: src.license, content, note: 'manuelle Aufnahme aus lokaler Datei' });
    console.log(`${sourceKey}: ${res.status === 'stored' ? `aufgenommen als Nr. ${res.seq}` : `unveraendert seit Nr. ${res.seq}`} (${res.contentHash.slice(0, 16)})`);
    await rebuildIndex(ARCHIVE);
    return;
  }

  let stored = 0;
  let unchanged = 0;
  let blocked = 0;

  for (const [key, src] of Object.entries(sources.sources)) {
    if (src.enabled !== true) {
      console.log(`[uebersprungen] ${key}: nicht freigeschaltet (${src.licenseStatus})`);
      blocked += 1;
      continue;
    }
    if (!src.url) continue;

    try {
      const res = await fetch(src.url, { headers: { 'User-Agent': USER_AGENT } });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const content = await res.text();

      // Plausibilitaetspruefung vor der Aufnahme. Ein Archiv, das stillschweigend
      // eine Fehlerseite speichert, ist schlimmer als keins.
      if (src.minBytes && content.length < src.minBytes) {
        throw new Error(`Antwort ist mit ${content.length} Bytes zu klein, erwartet mindestens ${src.minBytes}. Vermutlich eine Fehlerseite.`);
      }
      if (src.mustContain && !src.mustContain.every((needle) => content.includes(needle))) {
        throw new Error(`Antwort enthaelt nicht alle Pflichtbestandteile ${JSON.stringify(src.mustContain)}. Vermutlich eine Fehler- oder Wartungsseite.`);
      }

      let meta = {};
      if (src.format === 'dawum-json') {
        const n = normalize(JSON.parse(content));
        if (n.surveys.length === 0) throw new Error('Keine verwertbaren Umfragen in der Antwort.');
        meta = { surveys: n.surveys.length, parliaments: n.parliaments.length, institutes: n.institutes.length, sourceLastUpdate: n.meta.sourceLastUpdate, oldestSurvey: n.surveys.at(-1)?.date, newestSurvey: n.surveys[0]?.date };
      }

      const r = await ingest(ARCHIVE, { source: key, sourceUrl: src.url, license: src.license, content, meta });
      if (r.status === 'stored') {
        stored += 1;
        console.log(`[neu] ${key}: Nr. ${r.seq}, ${fmtBytes(r.bytes)} roh, ${fmtBytes(r.compressedBytes)} komprimiert${meta.surveys ? `, ${meta.surveys} Umfragen ab ${meta.oldestSurvey}` : ''}`);
      } else {
        unchanged += 1;
        console.log(`[unveraendert] ${key}: identisch mit Nr. ${r.seq} vom ${r.recordedAt.slice(0, 10)}`);
      }
    } catch (err) {
      console.error(`[FEHLER] ${key}: ${err.message}`);
      process.exitCode = 1;
    }
  }

  const index = await rebuildIndex(ARCHIVE);
  console.log(`\nArchiv: ${index.totalSnapshots} Aufnahmen, ${fmtBytes(index.totalBytes)} roh, ${fmtBytes(index.totalCompressedBytes)} auf der Platte.`);
  console.log(`Neu ${stored}, unveraendert ${unchanged}, uebersprungen ${blocked}.`);
  console.log(`Kettenkopf: ${index.headChain.slice(0, 32)}`);
}

async function cmdVerify() {
  const { manifest, problems, objectsChecked } = await verify(ARCHIVE);
  console.log(`Geprueft: ${manifest.length} Manifest-Eintraege, ${objectsChecked} Objekte.`);
  if (problems.length === 0) {
    console.log('Archiv unbeschaedigt. Kette geschlossen, alle Hashes stimmen.');
    if (manifest.length > 0) console.log(`Kettenkopf: ${manifest.at(-1).chain}`);
    return;
  }
  console.error(`\n${problems.length} Befund(e):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exitCode = 1;
}

async function cmdList() {
  const filter = rest[0];
  const manifest = await readManifest(ARCHIVE);
  const rows = filter ? manifest.filter((e) => e.source === filter) : manifest;
  if (rows.length === 0) {
    console.log(filter ? `Keine Aufnahmen fuer Quelle ${filter}.` : 'Archiv ist leer.');
    return;
  }
  console.log('Nr.  Aufgenommen           Quelle                Groesse    Hash              Inhalt');
  for (const e of rows) {
    const info = e.meta?.surveys ? `${e.meta.surveys} Umfragen ${e.meta.oldestSurvey ?? '?'} bis ${e.meta.newestSurvey ?? '?'}` : (e.note ?? '');
    console.log(
      `${String(e.seq).padStart(4)} ${e.recordedAt.slice(0, 19).replace('T', ' ')}  ${e.source.padEnd(20).slice(0, 20)}  ${fmtBytes(e.bytes).padStart(9)}  ${e.contentHash.slice(0, 16)}  ${info}`,
    );
  }
}

async function cmdRestore() {
  const ref = rest[0];
  if (!ref) throw new Error('Bitte einen Hash oder eine Nummer angeben.');
  const manifest = await readManifest(ARCHIVE);
  const entry = /^\d+$/.test(ref) ? manifest.find((e) => e.seq === Number(ref)) : manifest.find((e) => e.contentHash.startsWith(ref));
  if (!entry) throw new Error(`Keine Aufnahme zu ${ref} gefunden.`);

  const content = await retrieve(ARCHIVE, entry.contentHash);
  await mkdir(DATA, { recursive: true });
  await writeFile(path.join(DATA, 'raw-dawum.json'), content, 'utf8');

  const normalized = normalize(JSON.parse(content));
  await writeFile(path.join(DATA, 'surveys.json'), JSON.stringify(normalized, null, 2), 'utf8');
  await writeFile(
    path.join(DATA, 'provenance.json'),
    JSON.stringify(
      {
        mode: 'archive',
        source: entry.sourceUrl,
        archiveSeq: entry.seq,
        contentHash: entry.contentHash,
        recordedAt: entry.recordedAt,
        sourceLastUpdate: entry.meta?.sourceLastUpdate ?? null,
        license: entry.license,
        licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
        attribution: 'Daten von dawum.de (Open Database License (ODbL))',
        attributionUrl: 'https://dawum.de',
        warning: `Historischer Stand aus dem Archiv, aufgenommen am ${entry.recordedAt}. Dies ist NICHT der aktuelle Datenstand.`,
        counts: normalized.meta,
      },
      null,
      2,
    ),
    'utf8',
  );
  console.log(`Aufnahme Nr. ${entry.seq} vom ${entry.recordedAt} zurueckgespielt.`);
  console.log(`${normalized.surveys.length} Umfragen. Mit "npm run build" entsteht die Seite im damaligen Stand.`);
}

async function cmdDiff() {
  const [a, b] = rest;
  if (!a || !b) throw new Error('Bitte zwei Nummern oder Hashes angeben.');
  const manifest = await readManifest(ARCHIVE);
  const pick = (ref) => (/^\d+$/.test(ref) ? manifest.find((e) => e.seq === Number(ref)) : manifest.find((e) => e.contentHash.startsWith(ref)));
  const ea = pick(a);
  const eb = pick(b);
  if (!ea || !eb) throw new Error('Mindestens eine der Aufnahmen wurde nicht gefunden.');

  const na = normalize(JSON.parse(await retrieve(ARCHIVE, ea.contentHash)));
  const nb = normalize(JSON.parse(await retrieve(ARCHIVE, eb.contentHash)));
  const ids = (n) => new Set(n.surveys.map((s) => s.id));
  const ia = ids(na);
  const ib = ids(nb);

  const added = nb.surveys.filter((s) => !ia.has(s.id));
  const removed = na.surveys.filter((s) => !ib.has(s.id));
  const changed = nb.surveys.filter((s) => {
    const old = na.surveys.find((x) => x.id === s.id);
    return old && JSON.stringify(old.results) !== JSON.stringify(s.results);
  });

  console.log(`Nr. ${ea.seq} (${ea.recordedAt.slice(0, 10)}, ${na.surveys.length} Umfragen)  ->  Nr. ${eb.seq} (${eb.recordedAt.slice(0, 10)}, ${nb.surveys.length} Umfragen)\n`);
  console.log(`Neu: ${added.length}`);
  for (const s of added.slice(0, 20)) console.log(`  + ${s.date} ${s.parliament}, ${s.institute ?? 'Institut n.a.'}`);
  if (added.length > 20) console.log(`  ... und ${added.length - 20} weitere`);

  console.log(`\nVerschwunden: ${removed.length}${removed.length > 0 ? '   <-- genau dafuer gibt es dieses Archiv' : ''}`);
  for (const s of removed) console.log(`  - ${s.date} ${s.parliament}, ${s.institute ?? 'Institut n.a.'} (nur noch im Archiv unter Nr. ${ea.seq})`);

  console.log(`\nNachtraeglich geaendert: ${changed.length}`);
  for (const s of changed) {
    const old = na.surveys.find((x) => x.id === s.id);
    console.log(`  ~ ${s.date} ${s.parliament}, ${s.institute ?? 'n.a.'}`);
    for (const p of new Set([...Object.keys(old.results), ...Object.keys(s.results)])) {
      if (old.results[p] !== s.results[p]) console.log(`      ${p}: ${old.results[p] ?? 'n.a.'} -> ${s.results[p] ?? 'n.a.'}`);
    }
  }
}

async function cmdExport() {
  const ref = rest[0];
  const manifest = await readManifest(ARCHIVE);
  const entry = /^\d+$/.test(ref) ? manifest.find((e) => e.seq === Number(ref)) : manifest.find((e) => e.contentHash.startsWith(ref));
  if (!entry) throw new Error(`Keine Aufnahme zu ${ref} gefunden.`);
  process.stdout.write(await retrieve(ARCHIVE, entry.contentHash));
}

const commands = { snapshot: cmdSnapshot, verify: cmdVerify, list: cmdList, restore: cmdRestore, diff: cmdDiff, export: cmdExport };

if (!cmd || !commands[cmd]) {
  console.log(`Wahlwerk Archivwerkzeug

  snapshot            alle freigeschalteten Quellen abrufen und aufnehmen
  snapshot --file <p> --source <k>   lokale Datei aufnehmen
  verify              Kette und alle Objekte pruefen
  list [quelle]       Aufnahmen auflisten
  restore <nr|hash>   Aufnahme nach data/ zurueckspielen, danach npm run build
  diff <a> <b>        zwei Aufnahmen vergleichen, zeigt auch verschwundene Umfragen
  export <nr|hash>    Aufnahme im Original auf stdout`);
  process.exit(cmd ? 1 : 0);
}

await commands[cmd]().catch((err) => {
  console.error(`[FEHLER] ${err.message}`);
  process.exitCode = 1;
});
