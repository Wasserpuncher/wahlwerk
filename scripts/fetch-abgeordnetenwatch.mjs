#!/usr/bin/env node
// Wahlwerk - Abruf abgeordnetenwatch.de
// Lizenz: AGPL-3.0-or-later
//
// Holt Wahlkreise, Kandidaturen und Mandate zu einer Wahlperiode von der
// offenen API von abgeordnetenwatch.de und legt sie in data/ ab.
//
// Datenquelle: https://www.abgeordnetenwatch.de/api/v2/
// Lizenz der Daten: CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/deed.de)
// Die API weist die Lizenz in jeder Antwort im Feld meta.abgeordnetenwatch_api aus.
// CC0 verlangt keine Attribution. Sie erfolgt hier trotzdem, weil eine Quelle zu
// nennen zum Anspruch dieses Projekts gehoert, nicht weil eine Lizenz es erzwingt.
//
// FAIR USE: Die API ist auf 30 Anfragen je Minute und IP begrenzt, danach
// antwortet sie mit HTTP 429. Dieses Skript haelt einen festen Mindestabstand
// von 2,5 Sekunden zwischen den Anfragen ein und bleibt damit sicher darunter.
// Der Betreiber bittet zusaetzlich darum, groessere Abrufe nachts zwischen 22
// und 6 Uhr zu fahren. Wer dieses Skript in einen Zeitplan haengt, sollte sich
// daran halten.
//
// Aufruf:
//   node scripts/fetch-abgeordnetenwatch.mjs                  Standard: Sachsen-Anhalt, Wahl 2026
//   node scripts/fetch-abgeordnetenwatch.mjs --periode 168    andere Wahlperiode
//   node scripts/fetch-abgeordnetenwatch.mjs --offline        nur pruefen, kein Abruf

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { normalisiere } from './lib/abgeordnetenwatch.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const API = 'https://www.abgeordnetenwatch.de/api/v2';
const USER_AGENT = 'Wahlwerk/0.2 (+https://wahlen.kaipfstr.de) Node-Fetch';

// Mindestabstand zwischen zwei Anfragen. 2500 ms entsprechen 24 Anfragen je
// Minute und damit einem Sicherheitsabstand zum Limit von 30.
const ABSTAND_MS = 2500;
const SEITENGROESSE = 1000; // Maximum laut Dokumentation

const args = process.argv.slice(2);
const periodeArg = args[args.indexOf('--periode') + 1];
const PERIODE = args.includes('--periode') ? Number(periodeArg) : 168;
const offline = args.includes('--offline');

if (!Number.isInteger(PERIODE) || PERIODE <= 0) {
  console.error('[FEHLER] --periode erwartet eine ganze Zahl, etwa 168.');
  process.exit(1);
}

let letzteAnfrage = 0;
let anfragen = 0;

async function warte(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Eine API-Anfrage unter Einhaltung des Mindestabstands. Bei HTTP 429 wird
 * einmal deutlich laenger gewartet und erneut versucht; danach bricht der
 * Abruf ab, statt das Limit weiter zu strapazieren.
 */
async function hole(pfad, versuch = 1, limitVersuch = 1) {
  const seitLetzter = Date.now() - letzteAnfrage;
  if (seitLetzter < ABSTAND_MS) await warte(ABSTAND_MS - seitLetzter);
  letzteAnfrage = Date.now();
  anfragen += 1;

  const url = `${API}${pfad}`;
  let res;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(60000),
    });
  } catch (err) {
    // Netzwerkfehler und Zeitueberschreitungen sind bei einem Abruf ueber das
    // offene Netz normal und kein Grund, den ganzen Lauf zu verwerfen. Bis zu
    // drei Versuche mit wachsendem Abstand, danach wird der Fehler
    // weitergereicht.
    if (versuch >= 3) throw new Error(`Netzwerkfehler bei ${url} nach ${versuch} Versuchen: ${err.message}`);
    const pause = versuch * 5000;
    console.warn(`[HINWEIS] Netzwerkfehler bei Versuch ${versuch} (${err.message}). Neuer Versuch in ${pause / 1000} s.`);
    await warte(pause);
    return hole(pfad, versuch + 1, limitVersuch);
  }

  if (res.status === 429) {
    if (limitVersuch > 1) {
      throw new Error('Wiederholt HTTP 429. Abruf abgebrochen, um das Limit der API zu respektieren.');
    }
    console.warn('[HINWEIS] HTTP 429 erhalten. 60 Sekunden Pause, dann ein zweiter Versuch.');
    await warte(60000);
    return hole(pfad, versuch, limitVersuch + 1);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} bei ${url}`);

  const json = await res.json();
  if (json?.meta?.status && json.meta.status !== 'ok') {
    throw new Error(`API meldet Status "${json.meta.status}": ${json.meta.status_message ?? 'ohne Angabe'}`);
  }
  return json;
}

/** Holt alle Seiten einer Liste. */
async function holeAlle(pfad) {
  const ergebnis = [];
  let start = 0;
  let meta = null;
  for (;;) {
    const trenner = pfad.includes('?') ? '&' : '?';
    const seite = await hole(`${pfad}${trenner}range_start=${start}&range_end=${SEITENGROESSE}`);
    meta = seite.meta;
    const daten = seite.data ?? [];
    ergebnis.push(...daten);

    const gesamt = seite.meta?.result?.total ?? ergebnis.length;
    if (ergebnis.length >= gesamt || daten.length === 0) break;
    start += daten.length;

    // Sicherung gegen eine Endlosschleife bei unerwarteten Antworten.
    if (start > 100000) throw new Error('Abbruch: unplausibel viele Datensaetze.');
  }
  return { daten: ergebnis, meta };
}

async function main() {
  const zielDatei = path.join(DATA_DIR, 'abgeordnetenwatch.json');

  if (offline) {
    if (!existsSync(zielDatei)) {
      console.log('Keine zwischengespeicherten Daten vorhanden. Ohne --offline abrufen.');
      return;
    }
    const vorhanden = JSON.parse(await readFile(zielDatei, 'utf8'));
    console.log(`Zwischenspeicher vom ${vorhanden.abgerufenAm}, Wahlperiode ${vorhanden.periode.label}.`);
    console.log(`  Wahlkreise: ${vorhanden.wahlkreise.length}, Kandidaturen: ${vorhanden.kandidaturen.length}, Mandate: ${vorhanden.mandate.length}`);
    return;
  }

  await mkdir(DATA_DIR, { recursive: true });

  console.log(`Abruf von abgeordnetenwatch.de, Wahlperiode ${PERIODE}`);
  console.log(`  Mindestabstand ${ABSTAND_MS} ms je Anfrage, Limit der API sind 30 je Minute.`);

  const periode = await hole(`/parliament-periods/${PERIODE}`);
  const periodeDaten = Array.isArray(periode.data) ? periode.data[0] : periode.data;
  if (!periodeDaten) throw new Error(`Wahlperiode ${PERIODE} nicht gefunden.`);
  console.log(`  Wahlperiode: ${periodeDaten.label} (${periodeDaten.type}), Wahltag ${periodeDaten.election_date ?? 'n.a.'}`);

  const wahlkreise = await holeAlle(`/constituencies?parliament_period=${PERIODE}`);
  console.log(`  Wahlkreise: ${wahlkreise.daten.length}`);

  const kandidaturen = await holeAlle(`/candidacies-mandates?parliament_period=${PERIODE}`);
  const nurKandidaturen = kandidaturen.daten.filter((k) => k.type === 'candidacy');
  const mandate = kandidaturen.daten.filter((k) => k.type === 'mandate');
  console.log(`  Kandidaturen: ${nurKandidaturen.length}, Mandate: ${mandate.length}`);

  if (mandate.length === 0) {
    console.log('  [HINWEIS] Fuer diese Wahlperiode sind noch keine Mandate erfasst.');
    console.log('            abgeordnetenwatch.de pflegt sie ueblicherweise erst nach der');
    console.log('            konstituierenden Sitzung ein. Die Seite weist das aus, statt');
    console.log('            die Luecke zu verbergen.');
  }

  const normalisiert = normalisiere({
    periode: periodeDaten,
    wahlkreise: wahlkreise.daten,
    kandidaturen: nurKandidaturen,
    mandate,
  });

  const ausgabe = {
    _doku:
      'Daten von abgeordnetenwatch.de zu einer Wahlperiode. Erzeugt von scripts/fetch-abgeordnetenwatch.mjs. Nicht von Hand bearbeiten.',
    quelle: {
      api: API,
      apiVersion: periode.meta?.abgeordnetenwatch_api?.version ?? null,
      lizenz: periode.meta?.abgeordnetenwatch_api?.licence ?? 'CC0 1.0',
      lizenzLink:
        periode.meta?.abgeordnetenwatch_api?.licence_link ?? 'https://creativecommons.org/publicdomain/zero/1.0/deed.de',
      attribution: 'Daten von abgeordnetenwatch.de, lizenziert unter CC0 1.0',
      attributionUrl: 'https://www.abgeordnetenwatch.de/',
      fairUse: 'Die API ist auf 30 Anfragen je Minute und IP begrenzt. Dieser Abruf haelt 2,5 Sekunden Abstand.',
    },
    abgerufenAm: new Date().toISOString(),
    anfragen,
    ...normalisiert,
  };

  await writeFile(zielDatei, `${JSON.stringify(ausgabe, null, 2)}\n`, 'utf8');

  console.log(`\nGespeichert: data/abgeordnetenwatch.json nach ${anfragen} Anfragen.`);
  if (normalisiert.probleme.length > 0) {
    console.warn(`[HINWEIS] ${normalisiert.probleme.length} Auffaelligkeiten, dokumentiert in der Datei unter "probleme".`);
    for (const p of normalisiert.probleme.slice(0, 10)) console.warn(`  - ${p}`);
    if (normalisiert.probleme.length > 10) console.warn(`  ... und ${normalisiert.probleme.length - 10} weitere.`);
  }
}

main().catch((err) => {
  console.error(`[FEHLER] ${err.message}`);
  process.exitCode = 1;
});
