#!/usr/bin/env node
// Wahlwerk - Datenabruf
// Lizenz: AGPL-3.0-or-later
//
// Holt die Umfragedatenbank von dawum.de, prueft die Aktualitaet gegen
// last_update.txt, normalisiert die Struktur und legt das Ergebnis in data/ ab.
// Die Rohdatei wird ebenfalls gespeichert, damit jeder Wert bis zur Quelle
// zurueckverfolgt werden kann.
//
// Datenquelle: https://api.dawum.de/  Lizenz: ODbL, https://opendatacommons.org/licenses/odbl/1-0/
// Die Nutzung ist von dawum.de ausdruecklich vorgesehen und dokumentiert
// unter https://dawum.de/API/ inklusive Codebeispielen fuer PHP, Python, R und JavaScript.
//
// Aufruf:
//   node scripts/fetch-dawum.mjs             regulaerer Abruf
//   node scripts/fetch-dawum.mjs --force     Abruf auch bei unveraenderten Daten
//   node scripts/fetch-dawum.mjs --fixture   Offline-Build mit synthetischen Testdaten
//   node scripts/fetch-dawum.mjs --file <p>  Offline-Build aus einer lokalen Datei
//                                            in dawum-Struktur, etwa seed/sachsen-anhalt.json

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { normalize } from './lib/dawum.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const API_URL = 'https://api.dawum.de/';
const LAST_UPDATE_URL = 'https://api.dawum.de/last_update.txt';
const USER_AGENT = 'Wahlwerk/0.1 (+https://wahlen.kaipfstr.de) Node-Fetch';

const args = new Set(process.argv.slice(2));
const useFixture = args.has('--fixture');
const force = args.has('--force');
const fileArg = process.argv.slice(2).find((a, i, arr) => arr[i - 1] === '--file');
if (args.has('--file') && !fileArg) throw new Error('--file erwartet einen Pfad.');

async function getText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'text/plain,application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} bei ${url}`);
  return res.text();
}

async function main() {
  await mkdir(DATA_DIR, { recursive: true });

  let rawText;
  let provenance;

  if (fileArg) {
    rawText = await readFile(path.resolve(ROOT, fileArg), 'utf8');
    provenance = {
      mode: 'file',
      source: fileArg,
      fetchedAt: new Date().toISOString(),
      license: 'ODC Open Database License (ODbL) 1.0',
      licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
      attribution: 'Daten von dawum.de (Open Database License (ODbL))',
      attributionUrl: 'https://dawum.de',
      warning:
        'Lokale Datei statt Live-Abruf. Der Bestand ist nur so aktuell wie die Datei. Vor einer Veroeffentlichung pruefen, ob ein Live-Abruf sinnvoller ist.',
    };
    console.log(`Lokale Datei gelesen: ${fileArg}`);
  } else if (useFixture) {
    const fixturePath = path.join(ROOT, 'fixtures', 'dawum.sample.json');
    rawText = await readFile(fixturePath, 'utf8');
    provenance = {
      mode: 'fixture',
      warning:
        'SYNTHETISCHE TESTDATEN. Diese Zahlen sind frei erfunden und bilden keine reale Umfrage ab. Ein damit erzeugter Build darf niemals veroeffentlicht werden.',
      source: fixturePath,
      fetchedAt: new Date().toISOString(),
    };
    console.warn('[WARNUNG] Fixture-Modus aktiv. Die erzeugten Zahlen sind synthetisch.');
  } else {
    const remoteStamp = (await getText(LAST_UPDATE_URL)).trim();
    const localMetaPath = path.join(DATA_DIR, 'provenance.json');

    if (!force && existsSync(localMetaPath)) {
      const local = JSON.parse(await readFile(localMetaPath, 'utf8'));
      if (local.sourceLastUpdate === remoteStamp && existsSync(path.join(DATA_DIR, 'raw-dawum.json'))) {
        console.log(`Datenbank unveraendert (Stand ${remoteStamp}). Kein Abruf noetig. Mit --force erzwingen.`);
        return;
      }
    }

    console.log(`Abruf von ${API_URL} (Fernstand ${remoteStamp})`);
    rawText = await getText(API_URL);
    provenance = {
      mode: 'live',
      source: API_URL,
      sourceLastUpdate: remoteStamp,
      fetchedAt: new Date().toISOString(),
      license: 'ODC Open Database License (ODbL) 1.0',
      licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
      attribution: 'Daten von dawum.de (Open Database License (ODbL))',
      attributionUrl: 'https://dawum.de',
      bytes: Buffer.byteLength(rawText, 'utf8'),
    };
  }

  let raw;
  try {
    raw = JSON.parse(rawText);
  } catch (err) {
    throw new Error(`Antwort ist kein gueltiges JSON: ${err.message}`);
  }

  const normalized = normalize(raw);

  if (normalized.surveys.length === 0) {
    throw new Error('Keine verwertbaren Umfragen im Datensatz. Build wird abgebrochen, um eine leere Seite zu verhindern.');
  }

  if (!useFixture && !fileArg) {
    provenance.sourceLastUpdateInFile = normalized.meta.sourceLastUpdate;
    if (provenance.sourceLastUpdate && normalized.meta.sourceLastUpdate !== provenance.sourceLastUpdate) {
      console.warn(
        `[WARNUNG] last_update.txt (${provenance.sourceLastUpdate}) weicht vom Feld Database.Last_Update (${normalized.meta.sourceLastUpdate}) ab.`,
      );
    }
  }

  provenance.counts = normalized.meta;
  provenance.problemCount = normalized.problems.length;

  await writeFile(path.join(DATA_DIR, 'raw-dawum.json'), rawText, 'utf8');
  await writeFile(path.join(DATA_DIR, 'surveys.json'), JSON.stringify(normalized, null, 2), 'utf8');
  await writeFile(path.join(DATA_DIR, 'provenance.json'), JSON.stringify(provenance, null, 2), 'utf8');

  console.log(`Gespeichert: ${normalized.surveys.length} Umfragen, ${normalized.parliaments.length} Parlamente, ${normalized.institutes.length} Institute.`);
  if (normalized.problems.length > 0) {
    console.warn(`[HINWEIS] ${normalized.problems.length} Datensatzauffaelligkeiten, dokumentiert in data/surveys.json unter "problems".`);
    for (const p of normalized.problems.slice(0, 10)) console.warn(`  - ${p}`);
    if (normalized.problems.length > 10) console.warn(`  ... und ${normalized.problems.length - 10} weitere.`);
  }
}

main().catch((err) => {
  console.error(`[FEHLER] ${err.message}`);
  process.exitCode = 1;
});
