// Wahlwerk - Archiv
// Lizenz: AGPL-3.0-or-later
//
// ZWECK
// Quellen im Netz verschwinden. Betreiber geben auf, Seiten werden umgebaut,
// Datenbanken werden aufgeraeumt, Institute nehmen alte Umfragen vom Netz.
// Dieses Modul legt jede abgerufene Quelldatei unveraendert und dauerhaft ab,
// damit spaeter noch nachweisbar ist, was zu welchem Zeitpunkt veroeffentlicht
// war, auch wenn das Original nicht mehr existiert.
//
// AUFBAU
//
//   archive/objects/<ab>/<sha256>.json.gz   unveraenderte Quelldatei, gzip
//   archive/manifest.jsonl                  append-only Protokoll, eine Zeile je Aufnahme
//   archive/index.json                      abgeleitete Uebersicht, jederzeit neu berechenbar
//
// Die Speicherung ist inhaltsadressiert: Der Dateiname ist der SHA-256 des
// Inhalts. Daraus folgt zweierlei. Erstens wird eine unveraenderte Quelle nicht
// doppelt gespeichert, ein taeglicher Abruf kostet also nur dann Platz, wenn
// sich wirklich etwas geaendert hat. Zweitens ist jede Manipulation an einem
// Objekt sofort erkennbar, weil der Hash nicht mehr zum Dateinamen passt.
//
// MANIPULATIONSSICHERE KETTE
// Jeder Manifest-Eintrag enthaelt den Hash des vorherigen Eintrags. Daraus
// entsteht eine Kette wie in einem Logbuch mit fortlaufender Seitennummer: Wer
// einen alten Eintrag nachtraeglich aendert oder entfernt, bricht die Kette an
// dieser Stelle, und `verify` meldet genau die Zeile. Das schuetzt nicht gegen
// jemanden, der das gesamte Archiv neu schreibt. Dagegen hilft, dass das
// Archiv im Git-Repository liegt und jeder Snapshot als eigener Commit mit
// Zeitstempel bei einem Dritten liegt.

import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { mkdir, readFile, writeFile, appendFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

export const GENESIS = '0'.repeat(64);

export function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function objectPath(root, hash) {
  return path.join(root, 'objects', hash.slice(0, 2), `${hash}.json.gz`);
}

function entryHash(entry) {
  // Der Hash deckt genau die inhaltlichen Felder ab, nicht das Feld chain
  // selbst. Reihenfolge und Serialisierung sind festgelegt, damit derselbe
  // Eintrag immer denselben Hash ergibt.
  const canonical = JSON.stringify([
    entry.seq,
    entry.recordedAt,
    entry.source,
    entry.sourceUrl,
    entry.contentHash,
    entry.bytes,
    entry.license,
    entry.prev,
  ]);
  return sha256(Buffer.from(canonical, 'utf8'));
}

export async function readManifest(root) {
  const file = path.join(root, 'manifest.jsonl');
  if (!existsSync(file)) return [];
  const text = await readFile(file, 'utf8');
  return text
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l, i) => {
      try {
        return JSON.parse(l);
      } catch (err) {
        throw new Error(`Manifest Zeile ${i + 1} ist kein gueltiges JSON: ${err.message}`);
      }
    });
}

/**
 * Nimmt eine Quelldatei ins Archiv auf.
 * Ist der Inhalt bereits vorhanden, wird kein neues Objekt geschrieben und
 * kein Manifest-Eintrag erzeugt. Der Rueckgabewert sagt, was passiert ist.
 */
export async function ingest(root, { source, sourceUrl, license, content, note = null, meta = {} }) {
  if (typeof content !== 'string' || content.length === 0) {
    throw new Error(`Leerer Inhalt fuer Quelle ${source}. Aufnahme abgebrochen.`);
  }
  const buf = Buffer.from(content, 'utf8');
  const contentHash = sha256(buf);

  const manifest = await readManifest(root);
  const existing = manifest.find((e) => e.contentHash === contentHash);
  const objFile = objectPath(root, contentHash);

  if (existing && existsSync(objFile)) {
    return { status: 'unchanged', contentHash, seq: existing.seq, recordedAt: existing.recordedAt };
  }

  await mkdir(path.dirname(objFile), { recursive: true });
  await writeFile(objFile, gzipSync(buf, { level: 9 }));

  const prevEntry = manifest.at(-1);
  const entry = {
    seq: (prevEntry?.seq ?? 0) + 1,
    recordedAt: new Date().toISOString(),
    source,
    sourceUrl,
    contentHash,
    bytes: buf.length,
    compressedBytes: (await stat(objFile)).size,
    license,
    note,
    meta,
    prev: prevEntry ? prevEntry.chain : GENESIS,
  };
  entry.chain = entryHash(entry);

  await appendFile(path.join(root, 'manifest.jsonl'), `${JSON.stringify(entry)}\n`, 'utf8');
  return { status: 'stored', contentHash, seq: entry.seq, bytes: buf.length, compressedBytes: entry.compressedBytes };
}

/** Holt eine archivierte Quelldatei im Originalzustand zurueck. */
export async function retrieve(root, contentHash) {
  const file = objectPath(root, contentHash);
  if (!existsSync(file)) throw new Error(`Objekt ${contentHash} nicht im Archiv.`);
  const raw = gunzipSync(await readFile(file));
  const actual = sha256(raw);
  if (actual !== contentHash) {
    throw new Error(`Integritaetsfehler: Objekt ${contentHash} hat tatsaechlich den Hash ${actual}. Die Datei wurde veraendert oder ist beschaedigt.`);
  }
  return raw.toString('utf8');
}

/**
 * Prueft das gesamte Archiv: jede Zeile der Kette, jedes Objekt, jeder Hash.
 * Gibt eine Liste von Befunden zurueck, leer bedeutet unbeschaedigt.
 */
export async function verify(root) {
  const problems = [];
  const manifest = await readManifest(root);
  if (manifest.length === 0) return { manifest, problems, objectsChecked: 0 };

  let expectedPrev = GENESIS;
  let expectedSeq = 1;

  for (const entry of manifest) {
    if (entry.seq !== expectedSeq) {
      problems.push(`Eintrag ${entry.seq}: Nummerierung springt, erwartet war ${expectedSeq}. Es fehlt vermutlich ein Eintrag.`);
    }
    if (entry.prev !== expectedPrev) {
      problems.push(`Eintrag ${entry.seq}: Kette gebrochen. Der Vorgaengerhash passt nicht. Ein frueherer Eintrag wurde veraendert oder entfernt.`);
    }
    const recomputed = entryHash(entry);
    if (recomputed !== entry.chain) {
      problems.push(`Eintrag ${entry.seq}: Eigener Kettenhash stimmt nicht. Der Eintrag wurde nachtraeglich veraendert.`);
    }
    expectedPrev = entry.chain;
    expectedSeq = entry.seq + 1;
  }

  let objectsChecked = 0;
  for (const entry of manifest) {
    const file = objectPath(root, entry.contentHash);
    if (!existsSync(file)) {
      problems.push(`Eintrag ${entry.seq}: Objekt ${entry.contentHash} fehlt auf der Platte.`);
      continue;
    }
    try {
      const raw = gunzipSync(await readFile(file));
      const actual = sha256(raw);
      objectsChecked += 1;
      if (actual !== entry.contentHash) {
        problems.push(`Eintrag ${entry.seq}: Inhalt von ${entry.contentHash} stimmt nicht mit dem Hash ueberein.`);
      }
      if (raw.length !== entry.bytes) {
        problems.push(`Eintrag ${entry.seq}: Groesse weicht ab, ${raw.length} statt ${entry.bytes} Bytes.`);
      }
    } catch (err) {
      problems.push(`Eintrag ${entry.seq}: Objekt nicht lesbar (${err.message}).`);
    }
  }

  // Verwaiste Objekte finden: vorhanden, aber in keinem Manifest-Eintrag genannt.
  const objDir = path.join(root, 'objects');
  if (existsSync(objDir)) {
    const known = new Set(manifest.map((e) => e.contentHash));
    for (const sub of await readdir(objDir)) {
      const subPath = path.join(objDir, sub);
      if (!(await stat(subPath)).isDirectory()) continue;
      for (const f of await readdir(subPath)) {
        const h = f.replace(/\.json\.gz$/, '');
        if (!known.has(h)) problems.push(`Verwaistes Objekt ${h}: liegt im Archiv, steht aber in keinem Manifest-Eintrag.`);
      }
    }
  }

  return { manifest, problems, objectsChecked };
}

/** Baut die Uebersichtsdatei neu auf. Sie ist rein abgeleitet und jederzeit verwerfbar. */
export async function rebuildIndex(root) {
  const manifest = await readManifest(root);
  const bySource = {};
  for (const e of manifest) {
    if (!bySource[e.source]) bySource[e.source] = { snapshots: 0, firstRecordedAt: e.recordedAt, lastRecordedAt: e.recordedAt, bytes: 0, license: e.license, sourceUrl: e.sourceUrl, entries: [] };
    const s = bySource[e.source];
    s.snapshots += 1;
    s.lastRecordedAt = e.recordedAt;
    s.bytes += e.bytes;
    s.entries.push({ seq: e.seq, recordedAt: e.recordedAt, contentHash: e.contentHash, meta: e.meta });
  }
  const index = {
    generatedAt: new Date().toISOString(),
    totalSnapshots: manifest.length,
    totalBytes: manifest.reduce((a, e) => a + e.bytes, 0),
    totalCompressedBytes: manifest.reduce((a, e) => a + (e.compressedBytes ?? 0), 0),
    headChain: manifest.at(-1)?.chain ?? GENESIS,
    sources: bySource,
  };
  await writeFile(path.join(root, 'index.json'), JSON.stringify(index, null, 2), 'utf8');
  return index;
}
