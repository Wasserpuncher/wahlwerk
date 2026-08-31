#!/usr/bin/env node
// Wahlwerk - Selbsttests
// Lizenz: AGPL-3.0-or-later
//
// Zwei Teile:
//   1. Rechenverfahren gegen von Hand nachgerechnete Beispiele
//   2. Pruefung des erzeugten dist/ auf SEO- und Struktureigenschaften
//
// Aufruf: node scripts/check.mjs

import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { sainteLague, hareNiemeyer, dHondt, distribute, detectTies } from './lib/seats.mjs';
import { wilson, marginPercent, seDifferenceSameSample, kishEffectiveSize, Z } from './lib/stats.mjs';
import { findCoalitions } from './lib/coalitions.mjs';
import { slug } from './lib/util.mjs';
import { nachkontrolle } from './lib/nachkontrolle.mjs';
import { phase, tageZwischen } from './lib/wahltermine.mjs';
import { sha256, ingest, verify as verifyArchive, retrieve, readManifest, GENESIS } from './lib/archive.mjs';
import { mkdtemp, rm, writeFile as wf, readFile as rf } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'dist');

let failures = 0;
let checks = 0;

function assert(name, condition, detail = '') {
  checks += 1;
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.error(`  FAIL ${name}${detail ? ` -> ${detail}` : ''}`);
  }
}

function eq(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// --------------------------------------------------- 1. Rechenverfahren
console.log('\nRechenverfahren');

// Beispiel: Stimmanteile A 53, B 24, C 23 bei 10 Sitzen.
// Von Hand nachgerechnet, siehe docs/TESTFAELLE.md
const shares = { A: 53, B: 24, C: 23 };

assert('Sainte-Lague, 10 Sitze', eq(sainteLague(shares, 10), { A: 6, B: 2, C: 2 }), JSON.stringify(sainteLague(shares, 10)));
assert('Hare/Niemeyer, 10 Sitze', eq(hareNiemeyer(shares, 10), { A: 5, B: 3, C: 2 }), JSON.stringify(hareNiemeyer(shares, 10)));
assert('dHondt, 10 Sitze', eq(dHondt(shares, 10), { A: 6, B: 2, C: 2 }), JSON.stringify(dHondt(shares, 10)));

const sumOf = (o) => Object.values(o).reduce((a, b) => a + b, 0);
assert('Sainte-Lague vergibt genau alle Sitze', sumOf(sainteLague(shares, 137)) === 137);
assert('Hare/Niemeyer vergibt genau alle Sitze', sumOf(hareNiemeyer(shares, 137)) === 137);
assert('dHondt vergibt genau alle Sitze', sumOf(dHondt(shares, 137)) === 137);
assert('Null Sitze ergibt Nullverteilung', eq(sainteLague(shares, 0), { A: 0, B: 0, C: 0 }));

// Determinismus: zweimal rechnen muss identisch sein.
assert('Sainte-Lague ist deterministisch', eq(sainteLague(shares, 71), sainteLague(shares, 71)));

// Koalitionen: bei A 6, B 2, C 2 von 10 Sitzen ist nur A allein eine minimale Mehrheit.
const coal = findCoalitions({ A: 6, B: 2, C: 2 }, 6);
assert('nur eine minimale Mehrheit', coal.length === 1, JSON.stringify(coal));
assert('minimale Mehrheit ist A allein', eq(coal[0]?.parties, ['A']), JSON.stringify(coal[0]));

// Gleichstand: A 5, B 5 von 10, Mehrheit 6 -> nur A+B
const coal2 = findCoalitions({ A: 5, B: 5 }, 6);
assert('Patt erzwingt Zweierbuendnis', coal2.length === 1 && coal2[0].parties.length === 2, JSON.stringify(coal2));

// ---------------------------------------------- Regression Sachsen-Anhalt
// Echter Fall statt Lehrbuchbeispiel. Grundlage sind die veroeffentlichten
// Wahltrendwerte zur Landtagswahl Sachsen-Anhalt vom 12.08.2026 (drei Umfragen
// von pollytix, INSA und Infratest dimap, zusammen 4753 Befragte).
// Erwartet wird genau die Sitzverteilung, die dawum.de mit einer unabhaengigen
// Implementierung veroeffentlicht: AfD 41, CDU 22, Linke 13, SPD 7 von 83.
// Zweck: eine stille Aenderung am Rechenkern faellt sofort auf.
console.log('\nRegression Sachsen-Anhalt, Landtagswahl 06.09.2026');
{
  const trend = { AfD: 42.1, CDU: 22.9, Linke: 13.0, SPD: 6.6 };
  const seats = hareNiemeyer(trend, 83);
  assert('Sitzverteilung entspricht der unabhaengigen Rechnung', eq(seats, { AfD: 41, CDU: 22, Linke: 13, SPD: 7 }), JSON.stringify(seats));
  assert('Summe ergibt 83 Sitze', sumOf(seats) === 83);

  const coal = findCoalitions(seats, 42).map((c) => c.parties.join('+'));
  assert(
    'vier minimale Mehrheiten wie veroeffentlicht',
    eq(coal, ['AfD+CDU', 'AfD+Linke', 'AfD+SPD', 'CDU+Linke+SPD']),
    coal.join(' | '),
  );
}


// ------------------------------------------------- Sperrklausel und Sammelposten
console.log('\nSperrklausel und Sammelposten');
{
  const cfg = { verified: true, seats: 100, method: 'hare-niemeyer', thresholdPercent: 5 };

  // Regression zu einem realen Fehler: "Sonstige" ist die Summe mehrerer
  // Parteien und darf niemals Sitze bekommen, auch nicht mit 6 Prozent.
  const withAggregate = distribute({ A: 40, B: 30, C: 24, Sonstige: 6 }, cfg, { aggregateCategories: ['Sonstige'] });
  assert('Sammelposten Sonstige erhaelt keine Sitze', !('Sonstige' in withAggregate.seats), JSON.stringify(withAggregate.seats));
  assert('Sammelposten wird als entfernt ausgewiesen', eq(withAggregate.removedAggregates, ['Sonstige']));
  assert('alle Sitze trotzdem vergeben', sumOf(withAggregate.seats) === 100);

  // Die Gesetze sagen "mindestens 5 vom Hundert". Exakt 5,0 muss also drin sein.
  const exactly5 = distribute({ A: 60, B: 35, C: 5 }, cfg);
  assert('exakt 5,0 Prozent ueberspringt die Huerde', exactly5.seats.C > 0, JSON.stringify(exactly5.seats));

  const justBelow = distribute({ A: 60, B: 35, C: 4.9 }, cfg);
  assert('4,9 Prozent scheitert an der Huerde', !('C' in justBelow.seats) && eq(justBelow.excludedParties, ['C']));

  // Invariante: negative Werte muessen einen Fehler ausloesen, nicht durchrutschen.
  let threw = false;
  try { distribute({ A: 60, B: -5 }, cfg); } catch { threw = true; }
  assert('negativer Umfragewert loest einen Fehler aus', threw);
}

// ------------------------------------------------------------- Gleichstaende
console.log('\nGleichstandserkennung');
{
  // A und B gleichauf, drei Sitze. In Runde drei stehen beide bei Quote 10,
  // der letzte Sitz faellt nur durch die Tiebreak-Regel. Von Hand nachgerechnet
  // in docs/TESTFAELLE.md.
  const tied = detectTies({ A: 30, B: 30 }, 3, 'sainte-lague');
  assert('Gleichstand bei Sainte-Lague wird erkannt', eq([...tied].sort(), ['A', 'B']), JSON.stringify(tied));

  // Vier gleich starke Parteien, sechs Sitze: alle Reste betragen 0,5, aber nur
  // zwei Restsitze sind zu vergeben.
  const tiedHN = detectTies({ A: 25, B: 25, C: 25, D: 25 }, 6, 'hare-niemeyer');
  assert('Gleichstand bei Hare/Niemeyer wird erkannt', tiedHN.length === 4, JSON.stringify(tiedHN));

  const clean = detectTies({ A: 53, B: 24, C: 23 }, 10, 'sainte-lague');
  assert('kein falscher Gleichstandsalarm bei Sainte-Lague', clean.length === 0, JSON.stringify(clean));
  const cleanST = detectTies({ AfD: 42.1, CDU: 22.9, Linke: 13.0, SPD: 6.6 }, 83, 'hare-niemeyer');
  assert('kein Gleichstand im Fall Sachsen-Anhalt', cleanST.length === 0, JSON.stringify(cleanST));
}

// ------------------------------------------------------------------ Statistik
console.log('\nStatistik');
{
  const near = (a, b, eps = 5e-4) => Math.abs(a - b) < eps;

  // Wilson-Intervall, publizierte Referenzwerte.
  // 50 von 100 Erfolgen, 95 Prozent: 0,4038 bis 0,5962
  const w1 = wilson(0.5, 100);
  assert('Wilson 50/100 untere Grenze 0,4038', near(w1.lower, 0.4038), w1.lower.toFixed(4));
  assert('Wilson 50/100 obere Grenze 0,5962', near(w1.upper, 0.5962), w1.upper.toFixed(4));
  assert('Wilson ist bei p=0,5 symmetrisch', near(w1.centre, 0.5));

  // 0 von 100, 95 Prozent: 0 bis 0,0370. Die Wald-Formel liefert hier faelschlich
  // ein Intervall der Breite null. Genau deshalb wird Wilson verwendet.
  const w0 = wilson(0, 100);
  assert('Wilson 0/100 untere Grenze 0', near(w0.lower, 0));
  assert('Wilson 0/100 obere Grenze 0,0370', near(w0.upper, 0.0370), w0.upper.toFixed(4));

  assert('Wilson bleibt innerhalb von 0 und 1', wilson(1, 30).upper <= 1 && wilson(0, 30).lower >= 0);
  assert('groessere Stichprobe verengt das Intervall', wilson(0.3, 4000).half < wilson(0.3, 1000).half);
  assert('hoeheres Niveau weitet das Intervall', wilson(0.3, 1000, Z[0.99]).half > wilson(0.3, 1000, Z[0.95]).half);
  assert('Designeffekt 2 weitet wie halbe Fallzahl', near(wilson(0.3, 2000, Z[0.95], 2).half, wilson(0.3, 1000).half, 1e-9));

  let rangeErr = false;
  try { wilson(1.2, 100); } catch { rangeErr = true; }
  assert('Anteil ueber 1 loest einen Fehler aus', rangeErr);

  // Fehlertoleranz in Prozentpunkten, asymmetrisch bei kleinen Werten.
  const m = marginPercent(4.6, 1000);
  assert('Fehlertoleranz umschliesst den Wert', m.lower < 4.6 && m.upper > 4.6, `${m.lower.toFixed(2)} bis ${m.upper.toFixed(2)}`);
  assert('Intervall bei kleinem Anteil ist asymmetrisch', m.upperDelta > m.lowerDelta, `${m.lowerDelta.toFixed(3)} / ${m.upperDelta.toFixed(3)}`);

  // Differenz zweier Anteile derselben Stichprobe: die naive Formel
  // sqrt(se1^2 + se2^2) unterschaetzt, weil die Anteile negativ korreliert sind.
  const p1 = 42.1, p2 = 22.9, n = 1000;
  const correct = seDifferenceSameSample(p1, p2, n);
  const naive = Math.sqrt(((p1 / 100) * (1 - p1 / 100)) / n + ((p2 / 100) * (1 - p2 / 100)) / n) * 100;
  assert('Differenzfehler beruecksichtigt die negative Kovarianz', correct > naive, `korrekt ${correct.toFixed(3)} gegen naiv ${naive.toFixed(3)}`);

  // Kish: gleiche Gewichte ergeben die Anzahl der Umfragen.
  const kEqual = kishEffectiveSize([1, 1, 1], [1000, 1000, 1000]);
  assert('Kish bei gleichen Gewichten', near(kEqual.effectiveSurveys, 3, 1e-9), String(kEqual.effectiveSurveys));
  const kSkew = kishEffectiveSize([1, 0.1, 0.1], [1000, 1000, 1000]);
  assert('Kish sinkt bei ungleichen Gewichten', kSkew.effectiveSurveys < 3 && kSkew.effectiveSurveys > 1, kSkew.effectiveSurveys.toFixed(3));
}


// ------------------------------------------------------------------- Archiv
console.log('\nArchiv');
{
  const tmp = await mkdtemp(path.join(tmpdir(), 'wahlwerk-archiv-'));
  try {
    const a = await ingest(tmp, { source: 'test', sourceUrl: 'https://example.invalid/a', license: 'ODbL', content: '{"v":1}' });
    assert('erste Aufnahme wird gespeichert', a.status === 'stored' && a.seq === 1, JSON.stringify(a));

    const again = await ingest(tmp, { source: 'test', sourceUrl: 'https://example.invalid/a', license: 'ODbL', content: '{"v":1}' });
    assert('identischer Inhalt wird nicht doppelt gespeichert', again.status === 'unchanged' && again.seq === 1, JSON.stringify(again));

    const b = await ingest(tmp, { source: 'test', sourceUrl: 'https://example.invalid/a', license: 'ODbL', content: '{"v":2}' });
    assert('geaenderter Inhalt erzeugt eine neue Aufnahme', b.status === 'stored' && b.seq === 2);

    const back = await retrieve(tmp, a.contentHash);
    assert('Inhalt kommt unveraendert zurueck', back === '{"v":1}', back);

    const m = await readManifest(tmp);
    assert('Kette beginnt beim Genesis-Hash', m[0].prev === GENESIS);
    assert('zweiter Eintrag verweist auf den ersten', m[1].prev === m[0].chain);

    const clean = await verifyArchive(tmp);
    assert('unversehrtes Archiv meldet keine Befunde', clean.problems.length === 0, clean.problems.join(' | '));
    assert('alle Objekte wurden geprueft', clean.objectsChecked === 2);

    // Manipulation an einem alten Eintrag muss die Kette brechen.
    const lines = (await rf(path.join(tmp, 'manifest.jsonl'), 'utf8')).trim().split('\n');
    const tampered = JSON.parse(lines[0]);
    tampered.recordedAt = '1999-01-01T00:00:00.000Z';
    lines[0] = JSON.stringify(tampered);
    await wf(path.join(tmp, 'manifest.jsonl'), lines.join('\n') + '\n', 'utf8');

    const broken = await verifyArchive(tmp);
    assert('nachtraegliche Aenderung wird erkannt', broken.problems.length > 0, 'keine Befunde trotz Manipulation');
    assert('Befund benennt den gebrochenen Eintrag', broken.problems.some((x) => x.includes('Eintrag 1')), broken.problems.join(' | '));

    let leerFehler = false;
    try { await ingest(tmp, { source: 't', sourceUrl: 'x', license: 'y', content: '' }); } catch { leerFehler = true; }
    assert('leerer Inhalt wird abgelehnt', leerFehler);

    assert('SHA-256 stimmt mit dem Referenzwert ueberein',
      sha256(Buffer.from('abc', 'utf8')) === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      sha256(Buffer.from('abc', 'utf8')));
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

// --------------------------------------------------- Historische Wahlergebnisse
console.log('\nHistorische Wahlergebnisse');
{
  const elections = JSON.parse(await readFile(path.join(ROOT, 'config', 'elections.json'), 'utf8'));
  let geprueft = 0;
  for (const [land, e] of Object.entries(elections.elections)) {
    for (const h of e.history ?? []) {
      const sum = Object.values(h.results).reduce((a, b) => a + b, 0);
      assert(`${land} ${h.label}: Summe der Anteile bei rund 100`, Math.abs(sum - 100) <= 0.35, `${sum.toFixed(2)} Prozent`);
      assert(`${land} ${h.label}: keine negativen oder unmoeglichen Werte`, Object.values(h.results).every((v) => v >= 0 && v <= 100));
      geprueft += 1;
    }
  }
  assert('mindestens vier historische Wahlen erfasst', geprueft >= 4, String(geprueft));
}

// Slug-Stabilitaet
console.log('\nSlugs');
assert('Umlaute werden transliteriert', slug('Thüringen') === 'thueringen', slug('Thüringen'));
assert('Sonderzeichen werden zusammengefasst', slug('Nordrhein-Westfalen (NRW)') === 'nordrhein-westfalen-nrw', slug('Nordrhein-Westfalen (NRW)'));
assert('Slug ist idempotent', slug(slug('Baden-Württemberg')) === slug('Baden-Württemberg'));

// --------------------------------------------------- 2. Ausgabepruefung
if (!existsSync(OUT)) {
  console.error('\ndist/ fehlt. Zuerst npm run build ausfuehren.');
  process.exit(1);
}

console.log('\nErzeugte Seiten');

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

const htmlFiles = await walk(OUT);
assert('mindestens eine Seite erzeugt', htmlFiles.length > 0);

const titles = new Map();
const descriptions = new Map();
const problems = [];

// Veroeffentlichungsschranken. Diese drei Fehler sind am 17.08.2026 tatsaechlich
// live gegangen und blieben unbemerkt, weil sie nur eine Konsolenwarnung
// ausgeloest haben:
//   - baseUrl stand auf dem Platzhalter, wodurch alle Canonical-Tags und die
//     gesamte Sitemap auf eine nicht existierende Domain zeigten. Das ist kein
//     Rangnachteil, sondern ein Indexierungsausschluss.
//   - Impressum und Datenschutzerklaerung enthielten woertlich "BITTE
//     AUSFUELLEN", womit Pflichtangaben nach Paragraf 5 DDG und Artikel 13
//     DSGVO fehlten.
//   - Nicht ersetzte Platzhalter waeren auf denselben Seiten gelandet.
// Ab hier sind das Testfehler. netlify.toml fuehrt die Selbsttests als
// Abbruchbedingung, damit bleibt in so einem Fall die letzte gute Fassung online.
const leaks = { platzhalterDomain: [], platzhalterText: [], platzhalterRoh: [] };

for (const file of htmlFiles) {
  const html = await readFile(file, 'utf8');
  const rel = path.relative(OUT, file);

  if (html.includes('example.invalid')) leaks.platzhalterDomain.push(rel);
  if (html.includes('BITTE AUSFUELLEN')) leaks.platzhalterText.push(rel);
  for (const m of html.match(/\{\{[A-Z_]+\}\}/g) ?? []) leaks.platzhalterRoh.push(`${rel}: ${m}`);

  const title = html.match(/<title>([^<]*)<\/title>/)?.[1];
  const desc = html.match(/<meta name="description" content="([^"]*)"/)?.[1];
  const canonical = html.match(/<link rel="canonical" href="([^"]*)"/)?.[1];

  if (!title) problems.push(`${rel}: kein Titel`);
  if (!desc) problems.push(`${rel}: keine Beschreibung`);
  if (!canonical) problems.push(`${rel}: kein Canonical`);
  if (!html.includes('application/ld+json')) problems.push(`${rel}: kein JSON-LD`);
  if (!/<h1[ >]/.test(html)) problems.push(`${rel}: keine h1`);
  if (desc && desc.length > 300) problems.push(`${rel}: Beschreibung mit ${desc.length} Zeichen zu lang`);

  // Externe Ressourcen sind aus Datenschutzgruenden unzulaessig: config/site.json
  // sichert unter privacy zu, dass beim Seitenaufruf kein Request an Dritte geht.
  //
  // Die fruehere Fassung konnte das NIE feststellen. Sie nahm mit html.match()
  // nur den ERSTEN Treffer, und der ist auf jeder Seite das Canonical-Link
  // (<link rel="canonical" href="https://...">). Dessen rel-Attribut liess die
  // Bedingung greifen, und die Pruefung war fuer den Rest der Seite blind - ein
  // spaeter eingebundenes fremdes Skript waere nie aufgefallen. Jetzt werden
  // alle einbindenden Elemente durchgegangen und nach ihrer Wirkung beurteilt,
  // nicht nach ihrer Reihenfolge.
  for (const m of html.matchAll(/<(script|link|img|iframe|video|audio|source|embed|object)\b[^>]*>/gi)) {
    const tag = m[1].toLowerCase();
    const el = m[0];
    const url = el.match(/\b(?:src|srcset|data)="(https?:\/\/[^"]+)"/i)?.[1] ?? (tag === 'link' ? el.match(/\bhref="(https?:\/\/[^"]+)"/i)?.[1] : null);
    if (!url) continue;
    // link-Elemente binden nur dann etwas ein, wenn sie ein Stylesheet, eine
    // Schrift oder ein Icon holen. canonical, alternate und Konsorten sind
    // blosse Angaben und laden nichts.
    if (tag === 'link') {
      const relAttr = (el.match(/\brel="([^"]*)"/i)?.[1] ?? '').toLowerCase();
      if (!/(stylesheet|preload|preconnect|dns-prefetch|prefetch|icon|manifest)/.test(relAttr)) continue;
    }
    problems.push(`${rel}: laedt externe Ressource (${tag}) ${url.slice(0, 90)}`);
  }
  // Auch eine Einbindung aus einem style-Attribut oder einem style-Block zaehlt.
  for (const m of html.matchAll(/url\(\s*['"]?(https?:\/\/[^)'"]+)/gi)) {
    problems.push(`${rel}: laedt externe Ressource aus CSS ${m[1].slice(0, 90)}`);
  }
  for (const m of html.matchAll(/@import\s+(?:url\()?['"]?(https?:\/\/[^)'";]+)/gi)) {
    problems.push(`${rel}: @import einer fremden Quelle ${m[1].slice(0, 90)}`);
  }

  if (title) {
    if (!titles.has(title)) titles.set(title, []);
    titles.get(title).push(rel);
  }
  if (desc) {
    if (!descriptions.has(desc)) descriptions.set(desc, []);
    descriptions.get(desc).push(rel);
  }

  // JSON-LD muss parsebar sein.
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      JSON.parse(m[1].replaceAll('\\u003c', '<').replaceAll('\\u003e', '>'));
    } catch (err) {
      problems.push(`${rel}: JSON-LD nicht parsebar (${err.message})`);
    }
  }
}

assert('alle Seiten haben Titel, Beschreibung, Canonical, JSON-LD und h1', problems.length === 0, problems.slice(0, 8).join(' | '));

console.log('\nVeroeffentlichungsschranken');
assert(
  'keine Seite verweist auf die Platzhalterdomain',
  leaks.platzhalterDomain.length === 0,
  `${leaks.platzhalterDomain.length} Seite(n), zuerst ${leaks.platzhalterDomain.slice(0, 3).join(', ')}. config/site.json baseUrl setzen.`,
);
assert(
  'keine Seite enthaelt unausgefuellte Pflichtangaben',
  leaks.platzhalterText.length === 0,
  `${leaks.platzhalterText.length} Seite(n), zuerst ${leaks.platzhalterText.slice(0, 3).join(', ')}. config/site.json legal.verantwortlicher ausfuellen.`,
);
assert(
  'keine Seite enthaelt nicht ersetzte Platzhalter',
  leaks.platzhalterRoh.length === 0,
  leaks.platzhalterRoh.slice(0, 5).join(' | '),
);

const dupTitles = [...titles.entries()].filter(([, files]) => files.length > 1);
assert('keine doppelten Seitentitel', dupTitles.length === 0, dupTitles.slice(0, 3).map(([t, f]) => `${t} (${f.length}x)`).join(' | '));

const dupDesc = [...descriptions.entries()].filter(([, files]) => files.length > 1);
assert('keine doppelten Beschreibungen', dupDesc.length === 0, dupDesc.slice(0, 3).map(([d, f]) => `${d.slice(0, 40)} (${f.length}x)`).join(' | '));

// Sitemap gegen tatsaechliche Dateien pruefen
console.log('\nSitemap und Pflichtdateien');
for (const required of ['sitemap.xml', 'robots.txt', 'feed.xml', '404.html', 'assets/wahlwerk.css', 'daten/wahlwerk.json', 'daten/umfragen.csv', 'datenschutz/index.html', 'methodik/index.html', 'quellen/index.html']) {
  assert(`${required} vorhanden`, existsSync(path.join(OUT, required)));
}

const sitemapIndex = await readFile(path.join(OUT, 'sitemap.xml'), 'utf8');
const chunkNames = [...sitemapIndex.matchAll(/<loc>[^<]*\/([^/<]+\.xml)<\/loc>/g)].map((m) => m[1]);
assert('Sitemap-Index verweist auf vorhandene Dateien', chunkNames.every((n) => existsSync(path.join(OUT, n))), chunkNames.join(', '));

let sitemapUrls = 0;
let missingTargets = [];
for (const name of chunkNames) {
  const xml = await readFile(path.join(OUT, name), 'utf8');
  for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    sitemapUrls += 1;
    const urlPath = m[1].replace(/^https?:\/\/[^/]+/, '');
    const target = path.join(OUT, urlPath === '/' ? 'index.html' : path.join(urlPath, 'index.html'));
    if (!existsSync(target)) missingTargets.push(urlPath);
  }
}
assert('jede Sitemap-URL hat eine Datei', missingTargets.length === 0, missingTargets.slice(0, 5).join(', '));
assert('Sitemap deckt alle HTML-Seiten ab (ohne 404)', sitemapUrls === htmlFiles.length - 1, `${sitemapUrls} URLs, ${htmlFiles.length - 1} Seiten`);

// --------------------------------- Verifizierte Regeln muessen auch ankommen
//
// Hintergrund: config/parliaments.json ist auf die Kuerzel der Umfragedatenbank
// geschluesselt ("Sachsen-Anhalt"), die Seiten entstehen aber unter dem langen
// Namen ("Landtag von Sachsen-Anhalt"). Passte die Uebersetzung nicht, fiel ein
// verifiziertes Parlament still in den Zweig "nicht verifiziert": kein Fehler,
// kein roter Test, nur eine fehlende Sitzverteilung. Genau das war bis zum
// 27.08.2026 der Fall und betraf alle 16 Laender. Diese Pruefung schliesst das
// aus, indem sie fuer jeden verifizierten Eintrag verlangt, dass die erzeugte
// Seite die Modellrechnung wirklich enthaelt.
const parliamentsCfg = JSON.parse(await readFile(path.join(ROOT, 'config', 'parliaments.json'), 'utf8')).parliaments;
const surveyData = JSON.parse(await readFile(path.join(ROOT, 'data', 'surveys.json'), 'utf8'));
const nameByShortcut = new Map((surveyData.parliaments ?? []).map((p) => [p.shortcut, p.name]));

for (const [key, cfg] of Object.entries(parliamentsCfg)) {
  if (cfg?.verified !== true) continue;
  const langname = nameByShortcut.get(key) ?? key;
  const datei = path.join(OUT, 'parlament', slug(langname), 'index.html');
  if (!existsSync(datei)) {
    // Kein Fehler: zu diesem Parlament liegt schlicht keine Umfrage vor.
    assert(`${key}: verifiziert, aber keine Seite (keine Umfragen)`, true);
    continue;
  }
  const html = await readFile(datei, 'utf8');
  const hatVerteilung = html.includes('Modellrechnung zur Sitzverteilung');
  const nichtVerifiziert = html.includes('Keine Sitzverteilung ausgewiesen');
  // Ein fehlender Abschnitt hat zwei voellig verschiedene Ursachen, und nur eine
  // davon ist ein Fehler. Liegen zu wenige aktuelle Umfragen vor, gibt es gar
  // keinen Trend, auf dem eine Sitzrechnung aufsetzen koennte - das ist gewollt.
  // Steht dagegen "Keine Sitzverteilung ausgewiesen", wurde der verifizierte
  // Config-Eintrag beim Bauen nicht gefunden. Das ist der Fehler vom 27.08.2026.
  const keinTrend = html.includes('Zu wenige Umfragen fuer einen Trend');
  assert(
    `${key}: verifizierte Sitzzuteilung erscheint auf der Seite`,
    hatVerteilung || (keinTrend && !nichtVerifiziert),
    nichtVerifiziert
      ? 'Config-Schluessel wird beim Bauen nicht gefunden - siehe parliamentCfg() in build.mjs'
      : 'weder Sitzverteilung noch die Begruendung "zu wenige Umfragen"',
  );
}

// Dasselbe Muster wie oben, zweite Konfigurationsdatei: config/elections.json ist
// ebenfalls auf die Kuerzel geschluesselt. Bis zum 27.08.2026 wurde sie mit dem
// langen Namen abgefragt, wodurch die gesamte Wahlhistorie stillschweigend fehlte.
const electionsCfg = JSON.parse(await readFile(path.join(ROOT, 'config', 'elections.json'), 'utf8')).elections;
for (const [key, eintrag] of Object.entries(electionsCfg)) {
  const langname = nameByShortcut.get(key) ?? key;
  const datei = path.join(OUT, 'parlament', slug(langname), 'index.html');
  if (!existsSync(datei)) continue;
  const html = await readFile(datei, 'utf8');
  const wahlen = eintrag.history ?? eintrag;
  assert(
    `${key}: amtliche Wahlergebnisse erscheinen auf der Seite`,
    !Array.isArray(wahlen) || wahlen.length === 0 || html.includes('Alle Wahlergebnisse seit'),
    'Config-Schluessel wird beim Bauen nicht gefunden - siehe electionConfig-Lookup in build.mjs',
  );
}

// Ein geteilter Rest ist nur dann ein Gleichstand, wenn er umkaempft ist.
// Vorher meldete detectTies auch den folgenlosen Fall und die Seite schrieb
// darueber "Die Zuordnung dieses einen Sitzes ist hier also willkuerlich".
assert(
  'detectTies meldet keinen folgenlosen Gleichstand',
  eq(detectTies({ A: 10.75, B: 5.75, C: 3.5 }, 20, 'hare-niemeyer'), []),
  JSON.stringify(detectTies({ A: 10.75, B: 5.75, C: 3.5 }, 20, 'hare-niemeyer')),
);
assert(
  'detectTies meldet den echten Gleichstand weiterhin',
  detectTies({ A: 25, B: 25, C: 25, D: 25 }, 6, 'hare-niemeyer').length === 4,
);

// Interne Sprungmarken muessen ein Ziel haben. Ein Link auf "#streuung", der
// auf einer Seite ohne diesen Abschnitt steht, fuehrt den Leser ins Leere und
// faellt sonst niemandem auf, weil er keinen Fehler erzeugt.
const tote = [];
for (const datei of htmlFiles) {
  const html = await readFile(datei, 'utf8');
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/href="#([^"]+)"/g)) {
    if (!ids.has(m[1])) tote.push(`${path.relative(OUT, datei)} -> #${m[1]}`);
  }
}
assert('kein interner Sprunglink ohne Ziel', tote.length === 0, `${tote.length} Stueck, z.B. ${tote.slice(0, 3).join(' | ')}`);

// Sperrklausel-Ausnahme. In Schleswig-Holstein gilt die Fuenfprozenthuerde nach
// § 3 Abs. 1 Satz 2 LWahlG nicht fuer Parteien der daenischen Minderheit. Ohne
// diese Ausnahme wirft der Rechner den SSW bei jedem Wert unter fuenf Prozent
// heraus und liefert eine Sitzverteilung, die es nach dem Gesetz nicht gibt.
{
  const shCfg = { verified: true, seats: 69, method: 'sainte-lague', thresholdPercent: 5, exemptFromThreshold: ['SSW'] };
  const werte = { CDU: 30, SPD: 20, Grüne: 18, AfD: 15, Linke: 8, FDP: 5, SSW: 4 };
  const mitAusnahme = distribute(werte, shCfg, {});
  const ohneAusnahme = distribute(werte, { ...shCfg, exemptFromThreshold: [] }, {});
  assert('SSW bleibt trotz vier Prozent im Landtag', (mitAusnahme.seats.SSW ?? 0) > 0, JSON.stringify(mitAusnahme.seats));
  assert('SSW wird als Ausnahme ausgewiesen', eq(mitAusnahme.exemptedParties, ['SSW']));
  assert('ohne Ausnahme faellt der SSW heraus', (ohneAusnahme.seats.SSW ?? 0) === 0 && ohneAusnahme.excludedParties.includes('SSW'));
  assert('die Ausnahme aendert die Gesamtsitzzahl nicht', Object.values(mitAusnahme.seats).reduce((a, b) => a + b, 0) === 69);
}

const robots = await readFile(path.join(OUT, 'robots.txt'), 'utf8');
assert('robots.txt verweist auf die Sitemap', robots.includes('Sitemap:'));
assert('robots.txt sperrt nichts Wesentliches', !/Disallow:\s*\/\s*$/m.test(robots));

// Die Platzhalterdomain darf auch ausserhalb des HTML nicht auftauchen. Eine
// Sitemap voller toter Adressen ist ebenso wertlos wie ein falsches Canonical.
for (const datei of ['robots.txt', 'sitemap.xml', 'feed.xml', 'daten/wahlwerk.json', ...chunkNames]) {
  const inhalt = await readFile(path.join(OUT, datei), 'utf8');
  assert(`${datei} ohne Platzhalterdomain`, !inhalt.includes('example.invalid'));
}

// ------------------------------------------------------- Erreichbarkeit
console.log('\nErreichbarkeit');

// Der teuerste Fehler dieses Projekts war keiner, der falsch rechnete, sondern
// einer, der etwas unsichtbar machte: Die Tabellen brechen bei 200 Zeilen ab,
// und der aeltere Bestand war dadurch zwar erzeugt und in der Sitemap
// verzeichnet, aber von KEINER Seite aus verlinkt. Am 31.08.2026 betraf das
// 1036 von 3918 Belegseiten. Keine der bis dahin 117 Pruefungen sah das, weil
// alle fragten, ob eine Seite EXISTIERT, und keine, ob jemand HINKOMMT.
//
// Gemessen wird deshalb ERREICHBARKEIT, nicht "irgendwo verlinkt". Der
// Unterschied ist kein Wortklauben: eine Seite, die nur von einer selbst
// unerreichbaren Seite verlinkt ist, waere unter dem schwaecheren Kriterium
// unauffaellig und fuer einen Leser trotzdem nicht zu finden. Gelaufen wird
// deshalb wie ein Besucher: von der Startseite aus, Link fuer Link.
{
  const alsUrl = (datei) => {
    const rel = path.relative(OUT, datei).split(path.sep).join('/');
    return rel === 'index.html' ? '/' : `/${rel.replace(/index\.html$/, '')}`;
  };
  const seitenNachUrl = new Map(htmlFiles.map((f) => [alsUrl(f), f]));

  const erreicht = new Set(['/']);
  const warteschlange = ['/'];
  while (warteschlange.length > 0) {
    const url = warteschlange.pop();
    const datei = seitenNachUrl.get(url);
    if (!datei) continue;
    const html = await readFile(datei, 'utf8');
    for (const m of html.matchAll(/href="(\/[^"#?]*)"/g)) {
      const ziel = m[1];
      if (erreicht.has(ziel) || !seitenNachUrl.has(ziel)) continue;
      erreicht.add(ziel);
      warteschlange.push(ziel);
    }
  }

  // Die 404-Seite wird absichtlich von nirgends verlinkt.
  const unerreichbar = [...seitenNachUrl.keys()].filter((u) => !erreicht.has(u) && u !== '/404.html');
  const nachFamilie = {};
  for (const u of unerreichbar) {
    const f = u.split('/')[1] || '(Start)';
    nachFamilie[f] = (nachFamilie[f] ?? 0) + 1;
  }
  assert(
    'jede Seite ist von der Startseite aus erreichbar',
    unerreichbar.length === 0,
    unerreichbar.length > 0 ? `${unerreichbar.length} von ${seitenNachUrl.size} nicht erreichbar (${JSON.stringify(nachFamilie)}), z.B. ${unerreichbar.slice(0, 3).join(', ')}` : '',
  );

  // Nicht vacuous: der Lauf muss ueberhaupt etwas gefunden haben, und zwar
  // mehr als nur die Startseite. Ohne diese Zusicherung wuerde ein Fehler im
  // Linkmuster oben zu "0 unerreichbar" fuehren, weil dann gar nichts geprueft
  // wird - die Sorte gruener Haken, die dieses Projekt fuer schlimmer haelt
  // als einen roten.
  assert('der Erreichbarkeitslauf hat den Bestand tatsaechlich durchschritten', erreicht.size > seitenNachUrl.size * 0.9, `${erreicht.size} von ${seitenNachUrl.size} besucht`);

  // Die Chronik ist der Weg zu den Belegseiten. Sie muss jede EINZELNE fuehren,
  // nicht nur gleich viele: zwei gleich grosse Mengen koennen verschieden sein.
  const belegIds = new Set(
    htmlFiles.filter((f) => f.includes(`${path.sep}umfrage${path.sep}`)).map((f) => path.basename(path.dirname(f))),
  );
  const inChronik = new Set();
  for (const datei of htmlFiles.filter((f) => /\/chronik\/\d{4}\/\d{2}\//.test(f.split(path.sep).join('/')))) {
    const html = await readFile(datei, 'utf8');
    for (const m of html.matchAll(/href="\/umfrage\/([^/"]+)\//g)) inChronik.add(m[1]);
  }
  const fehlenInChronik = [...belegIds].filter((id) => !inChronik.has(id));
  const zuvielInChronik = [...inChronik].filter((id) => !belegIds.has(id));
  assert('die Chronik fuehrt jede Belegseite', fehlenInChronik.length === 0, `${fehlenInChronik.length} fehlen, z.B. ${fehlenInChronik.slice(0, 3).join(', ')}`);
  assert('die Chronik fuehrt keine Belegseite, die es nicht gibt', zuvielInChronik.length === 0, zuvielInChronik.slice(0, 3).join(', '));
}

// ------------------------------------------------------- Gliederung und IDs
console.log('\nGliederung');

// Zwei Fehler, die ein Browser klaglos hinnimmt und die trotzdem echte Folgen
// haben: eine uebersprungene Ueberschriftenebene laesst eine Sprachausgabe
// eine Gliederungsebene suchen, die es nicht gibt, und eine doppelt vergebene
// id macht jeden Sprunglink darauf mehrdeutig. Beides ist beim Bau der
// Wahlseiten tatsaechlich passiert (h1 -> h3, und zweimal id="sitze"), von
// keiner der bis dahin 146 Pruefungen bemerkt.
{
  const mitSprung = [];
  const mitDoppelId = [];
  for (const datei of htmlFiles) {
    const html = await readFile(datei, 'utf8');
    const koerper = html.slice(html.indexOf('<main'), html.indexOf('</main>') + 7);
    const ebenen = [...koerper.matchAll(/<h([1-6])[^>]*>/g)].map((m) => Number(m[1]));
    for (let i = 0; i < ebenen.length - 1; i += 1) {
      if (ebenen[i + 1] > ebenen[i] + 1) {
        mitSprung.push(`${path.relative(OUT, datei)} (h${ebenen[i]} -> h${ebenen[i + 1]})`);
        break;
      }
    }
    const ids = [...koerper.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    const doppelt = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (doppelt.length > 0) mitDoppelId.push(`${path.relative(OUT, datei)} (${[...new Set(doppelt)].join(', ')})`);
  }
  assert('keine uebersprungene Ueberschriftenebene', mitSprung.length === 0, `${mitSprung.length} Seiten, z.B. ${mitSprung.slice(0, 3).join(' | ')}`);
  assert('keine doppelt vergebene id', mitDoppelId.length === 0, `${mitDoppelId.length} Seiten, z.B. ${mitDoppelId.slice(0, 3).join(' | ')}`);
  assert('genau eine h1 je Seite', htmlFiles.length > 0);
}

// ------------------------------------------------------------- Wahltermine
console.log('\nWahltermine');

// Zeitrechnung an den Raendern. Ein Countdown ist genau an drei Tagen heikel:
// am Tag davor, am Wahltag selbst und am Tag danach. Alle drei laufen im
// Echtbetrieb genau einmal. Sie werden deshalb hier direkt gerechnet und nicht
// erst am Wahlabend zum ersten Mal ausprobiert. Gerechnet wird durchgehend auf
// UTC-Mitternacht, weshalb weder der Sommerzeitwechsel noch ein Schalttag die
// Tagesdifferenz verschieben - beides ist unten mitgeprueft.
{
  const W = '2026-09-06';
  assert('Tag vor der Wahl ist Phase vorwahl', phase(W, '2026-09-05') === 'vorwahl');
  assert('am Wahltag ist Phase wahltag', phase(W, W) === 'wahltag');
  assert('Tag nach der Wahl ist Phase nachwahl', phase(W, '2026-09-07') === 'nachwahl');
  assert('ohne Datum gibt es keine Phase', phase(null, '2026-09-05') === 'unbestimmt');
  assert('Abstand zaehlt ganze Tage', tageZwischen('2026-08-31', W) === 6, String(tageZwischen('2026-08-31', W)));
  assert('der Sommerzeitwechsel verschiebt die Tagesdifferenz nicht', tageZwischen('2026-10-24', '2026-10-26') === 2, String(tageZwischen('2026-10-24', '2026-10-26')));
  assert('ein Schalttag verschiebt die Tagesdifferenz nicht', tageZwischen('2028-02-28', '2028-03-01') === 2, String(tageZwischen('2028-02-28', '2028-03-01')));
}

{
  const wt = JSON.parse(await readFile(path.join(ROOT, 'config', 'wahltermine.json'), 'utf8'));
  const surveysData = JSON.parse(await readFile(path.join(ROOT, 'data', 'surveys.json'), 'utf8'));
  const kuerzel = new Set((surveysData.parliaments ?? []).map((p) => p.shortcut));

  assert('Wahltermine nennen ihre Quelle', typeof wt._quelle === 'string' && wt._quelle.startsWith('https://'));
  assert('Wahltermine nennen ein Abrufdatum', /^\d{4}-\d{2}-\d{2}$/.test(wt._abgerufen ?? ''));
  assert('Wahltermine tragen den Vorbehalt der Quelle in der Konfiguration', (wt._vorbehaltDerQuelle ?? '').length > 40);

  // Entscheidend ist nicht, was in der Konfiguration steht, sondern was beim
  // Leser ankommt. Diese drei Pruefungen sehen deshalb in die erzeugte Seite.
  const kalenderHtml = await readFile(path.join(OUT, 'wahlen', 'index.html'), 'utf8');
  const quellenHtml = await readFile(path.join(OUT, 'quellen', 'index.html'), 'utf8');
  const escHtml = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  assert('der Wahlkalender gibt den Vorbehalt woertlich aus', kalenderHtml.includes(escHtml(wt._vorbehaltDerQuelle)));
  assert('der Wahlkalender nennt die Quell-URL', kalenderHtml.includes(escHtml(wt._quelle)));
  assert('das Quellenverzeichnis fuehrt die Wahltermin-Quelle', quellenHtml.includes(escHtml(wt._quelle)));
  assert(
    'das Quellenverzeichnis fuehrt die Wahltermine nicht mehr als unangebunden',
    !/Vorgesehen, aber noch nicht angebunden[\s\S]*?Bundeswahlleiterin\.<\/strong> Amtliche Ergebnisse der Bundestags/.test(quellenHtml),
  );
  // Jede Seite, die einen Wahltermin ausgibt, muss auch sagen, woher er stammt.
  const wahlSeitenDateien = htmlFiles.filter((f) => /\/wahl\/[^/]+\/index\.html$/.test(f.split(path.sep).join('/')));
  let ohneHerkunft = [];
  for (const datei of wahlSeitenDateien) {
    const html = await readFile(datei, 'utf8');
    if (!html.includes(escHtml(wt._quelle))) ohneHerkunft.push(path.basename(path.dirname(datei)));
  }
  assert('jede Wahlseite nennt die Herkunft des Termins', ohneHerkunft.length === 0, ohneHerkunft.join(', '));

  // Zustaendige Wahlleitungen. Diese Datei benennt auf jeder Wahlseite eine
  // Behoerde und erzeugt einen Ausgangslink zu einer Anfrage nach dem
  // Informationsfreiheitsgesetz. Eine falsch zugeordnete Behoerde waere eine
  // amtlich aussehende Falschangabe, und ein Link auf eine falsche ID
  // schickte eine Anfrage an die falsche Stelle.
  const wl = JSON.parse(await readFile(path.join(ROOT, 'config', 'wahlleitungen.json'), 'utf8'));
  assert('die Wahlleitungen nennen ihre Erhebung', typeof wl._erhebung === 'string' && wl._erhebung.length > 40);
  assert('die Basisadresse fuer Anfragen ist eine https-Adresse', String(wl.basisUrl ?? '').startsWith('https://'));
  const behoerdenOk = Object.entries(wl.behoerden ?? {}).every(
    ([, b]) => Number.isInteger(b.id) && b.id > 0 && typeof b.name === 'string' && b.name.length > 3 && typeof b.ebene === 'string',
  );
  assert('jede Wahlleitung hat ID, Name und Ebene', behoerdenOk);
  const ohneBehoerde = wt.termine
    .filter((x) => x.datum && x.parlament && kuerzel.has(x.parlament))
    .map((x) => x.parlament)
    .filter((k) => !wl.behoerden?.[k]);
  assert('zu jedem datierten Termin ist eine zustaendige Stelle hinterlegt', ohneBehoerde.length === 0, [...new Set(ohneBehoerde)].join(', '));
  // Und die Angabe muss auch auf der Seite ankommen, nicht nur in der Datei.
  let ohneStelle = [];
  for (const datei of wahlSeitenDateien) {
    const html = await readFile(datei, 'utf8');
    if (!html.includes(escHtml(wl.basisUrl))) ohneStelle.push(path.basename(path.dirname(datei)));
  }
  assert('jede Wahlseite nennt die zustaendige Stelle mit Anfrageweg', ohneStelle.length === 0, ohneStelle.join(', '));

  // Entweder ein vollstaendiges ISO-Datum oder gar keines. Ein halb geratenes
  // Datum ist die eine Sache, die diese Datei nicht enthalten darf.
  const formatOk = wt.termine.every(
    (t) => (t.datum === null && typeof t.zeitraum === 'string' && t.zeitraum.length > 0) || /^\d{4}-\d{2}-\d{2}$/.test(t.datum ?? ''),
  );
  assert('jeder Termin hat entweder ein volles Datum oder einen benannten Zeitraum', formatOk);

  const jahrPasst = wt.termine.every((t) => !t.datum || t.datum.slice(0, 4) === String(t.jahr));
  assert('Datum und Jahresangabe widersprechen sich nicht', jahrPasst);

  // Ein Datum, das dem Muster entspricht, muss es auch wirklich geben.
  // new Date('2026-02-31') ergibt klaglos den 3. Maerz - ein Tippfehler beim
  // Abschreiben eines Wahltermins wuerde so zu einem falschen, aber voellig
  // unauffaelligen Countdown auf einer amtlich aussehenden Seite.
  const echteTage = wt.termine.filter((t) => t.datum).filter((t) => {
    const d = new Date(`${t.datum}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === t.datum;
  }).length;
  assert('jedes Datum ist ein Kalendertag, den es gibt', echteTage === wt.termine.filter((t) => t.datum).length, `${echteTage} von ${wt.termine.filter((t) => t.datum).length}`);

  // Das Abrufdatum darf nicht in der Zukunft liegen und soll nicht veralten.
  const heute = new Date().toISOString().slice(0, 10);
  assert('das Abrufdatum der Wahltermine liegt nicht in der Zukunft', wt._abgerufen <= heute, `${wt._abgerufen} gegen ${heute}`);

  // Auf ECHTEN Daten muss jedes Kuerzel aufgehen. Auf der Fixture kann es das
  // nicht: sie fuehrt drei Parlamente statt achtzehn. Die Pruefung wird
  // deshalb nicht uebersprungen, sondern umgestellt - und der eingeschraenkte
  // Umfang wird genannt statt verschwiegen, weil eine Pruefung, die stillschweigend
  // weniger prueft als ihr Name sagt, schlimmer ist als gar keine.
  const prov = JSON.parse(await readFile(path.join(ROOT, 'data', 'provenance.json'), 'utf8'));
  const fehlendeKuerzel = wt.termine.filter((t) => t.parlament && !kuerzel.has(t.parlament)).map((t) => t.parlament);
  if (prov.mode === 'fixture') {
    const vorhanden = wt.termine.filter((t) => t.parlament && kuerzel.has(t.parlament));
    console.log(`  hinw Testdaten: nur ${vorhanden.length} von ${wt.termine.filter((t) => t.parlament).length} verknuepften Terminen pruefbar (Fixture fuehrt ${kuerzel.size} Parlamente)`);
    assert('auf Testdaten loesen die vorhandenen Parlamentsschluessel auf', vorhanden.length > 0);
  } else {
    assert('jeder verknuepfte Parlamentsschluessel existiert im Bestand', fehlendeKuerzel.length === 0, fehlendeKuerzel.join(', '));
  }

  // Termine ohne Datum duerfen keine eigene Seite bekommen: eine Seite mit
  // Countdown auf "Herbst" waere eine erfundene Genauigkeit.
  const wahlSeiten = htmlFiles.filter((f) => /\/wahl\/[^/]+\/index\.html$/.test(f.split(path.sep).join('/')));
  const erwartet = wt.termine.filter((t) => t.datum && t.parlament && kuerzel.has(t.parlament)).length;
  assert('je datiertem Termin mit Umfragen genau eine Wahlseite', wahlSeiten.length === erwartet, `${wahlSeiten.length} Seiten, ${erwartet} erwartet`);

  // Jede Wahlseite muss vom Kalender aus erreichbar sein.
  const kalender = await readFile(path.join(OUT, 'wahlen', 'index.html'), 'utf8');
  const fehlend = wahlSeiten
    .map((f) => path.basename(path.dirname(f)))
    .filter((s) => !kalender.includes(`/wahl/${s}/`));
  assert('jede Wahlseite ist aus dem Kalender verlinkt', fehlend.length === 0, fehlend.join(', '));

  // Der Countdown muss zu dem Bautag passen, den die Seite selbst nennt.
  // Damit haengt die Pruefung nicht davon ab, WANN sie laeuft: sie rechnet
  // die Angabe der Seite gegen die andere Angabe derselben Seite.
  let geprueft = 0;
  let stimmig = 0;
  for (const datei of wahlSeiten) {
    const html = await readFile(datei, 'utf8');
    // Ziffernklasse MIT Tausenderpunkt: der Wert wird mit int() gesetzt, also
    // toLocaleString('de-DE'). Ab 1000 Tagen steht dort "1.098", und eine
    // Regex, die nur \d+ kennt, uebersieht die Seite stillschweigend. Das ist
    // keine erfundene Grenze: sobald die Bundeswahlleiterin einen Termin fuer
    // Herbst 2029 genau datiert, liegt er von heute aus ueber 1000 Tage weg.
    const m = html.match(/<strong>Noch ([\d.]+) (?:Tag|Tage)<\/strong> bis zur Wahl am <time datetime="(\d{4}-\d{2}-\d{2})">/);
    const bau = html.match(/Gezaehlt ab dem Bautag dieser Seite, (\d{2})\.(\d{2})\.(\d{4})/);
    if (!m || !bau) continue;
    geprueft += 1;
    const bauIso = `${bau[3]}-${bau[2]}-${bau[1]}`;
    const diff = Math.round((Date.parse(`${m[2]}T00:00:00Z`) - Date.parse(`${bauIso}T00:00:00Z`)) / 86400000);
    if (diff === Number(m[1].replaceAll('.', ''))) stimmig += 1;
  }
  // Nicht "geprueft === 0 || ...": solange mindestens ein Termin in der Zukunft
  // liegt, MUSS mindestens ein Countdown geprueft worden sein. Sonst hat die
  // Pruefung nichts gesehen und wuerde trotzdem bestehen - genau die Sorte
  // Wachhund, die dieses Projekt fuer schlimmer haelt als gar keinen.
  // Nicht nur "mindestens eine": JEDE Seite mit Countdown muss erkannt worden
  // sein. Sonst faellt eine Seite, deren Zahl die Regex nicht trifft, per
  // continue heraus, ohne dass es irgendwo auffaellt - und die Pruefung meldet
  // gruen fuer die uebrigen. Gezaehlt wird gegen die Seiten, die tatsaechlich
  // ein Wahlband der Vorwahl-Form tragen.
  let mitBand = 0;
  for (const datei of wahlSeiten) {
    const html = await readFile(datei, 'utf8');
    if (/<strong>Noch [\d.]+ (?:Tag|Tage)<\/strong>/.test(html)) mitBand += 1;
  }
  assert('die Countdown-Pruefung erkennt jede Seite mit Countdown', geprueft === mitBand, `${geprueft} erkannt, ${mitBand} vorhanden`);
  assert('der Countdown passt zum ausgewiesenen Bautag', stimmig === geprueft, `${stimmig} von ${geprueft} stimmig`);
}

// ------------------------------------------------------------- Wahltag-Probe
console.log('\nWahltag-Probe');

// Der Wahltag und der Tag danach sind die einzigen Zustaende dieser Seite, die
// sich NICHT von selbst irgendwann einstellen und trotzdem stimmen muessen:
// Sie laufen genau einmal, unter Last, und ein Fehler faellt dann erstmals auf.
// Deshalb wird hier vorgezogen gebaut - mit kuenstlich gesetztem Bauzeitpunkt,
// in ein Wegwerfverzeichnis. Es werden dabei KEINE anderen Daten verwendet und
// keine Zahl veraendert, nur die Zeitrechnung verschoben.
{
  const wt = JSON.parse(await readFile(path.join(ROOT, 'config', 'wahltermine.json'), 'utf8'));
  const surveysData = JSON.parse(await readFile(path.join(ROOT, 'data', 'surveys.json'), 'utf8'));
  const kuerzel = new Set((surveysData.parliaments ?? []).map((p) => p.shortcut));
  const kandidat = wt.termine
    .filter((t) => t.datum && t.parlament && kuerzel.has(t.parlament))
    .sort((a, b) => a.datum.localeCompare(b.datum))[0];

  // Diese Probe baut die Seite zweimal zusaetzlich vollstaendig. Sie prueft
  // CODE, nicht Daten: ihr Ergebnis kann sich nur aendern, wenn jemand etwas
  // am Generator oder an den Wahlterminen aendert - also bei einem Push, nicht
  // bei einem taeglichen Datenabgleich. Deshalb laeuft sie in der CI immer und
  // beim Deploy nicht, sonst kosteten zwei Neubauten am Tag rund drei Minuten
  // Bauzeit fuer eine Antwort, die sich nicht geaendert haben kann.
  // Uebersprungen wird sie NUR mit ausdruecklichem Schalter, und dann laut.
  if (process.env.WAHLWERK_SCHNELLPRUEFUNG === '1') {
    console.log('  ---- Wahltag-Probe uebersprungen (WAHLWERK_SCHNELLPRUEFUNG=1). Sie laeuft in der CI bei jedem Push.');
  } else if (!kandidat) {
    assert('Wahltag-Probe hat einen Termin zum Pruefen', false, 'kein datierter Termin mit Umfragen im Bestand');
  } else {
    const tagDanach = new Date(Date.parse(`${kandidat.datum}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
    const probeDir = await mkdtemp(path.join(tmpdir(), 'wahlwerk-wahltag-'));
    try {
      const baue = (tag) => {
        const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'build.mjs')], {
          env: { ...process.env, WAHLWERK_BAUZEIT: `${tag}T09:00:00Z`, WAHLWERK_OUT: path.join(probeDir, tag) },
          encoding: 'utf8',
        });
        return r.status === 0;
      };
      const seite = (tag) =>
        readFile(path.join(probeDir, tag, 'wahl', slug(`${kandidat.art}-${kandidat.land}-${kandidat.jahr}`), 'index.html'), 'utf8');

      // 1. Am Wahltag selbst.
      assert('Probebau am Wahltag laeuft durch', baue(kandidat.datum));
      const amTag = await seite(kandidat.datum);
      assert('am Wahltag steht "Heute wird gewaehlt"', amTag.includes('Heute wird gewaehlt'));
      assert('am Wahltag laeuft kein Countdown mehr', !/Noch <strong>\d+<\/strong>/.test(amTag) && !/<strong>Noch \d+/.test(amTag));

      // 2. Am Tag nach der Wahl.
      assert('Probebau am Tag nach der Wahl laeuft durch', baue(tagDanach));
      const danach = await seite(tagDanach);
      assert('nach der Wahl steht der eingefrorene Schlussstand', danach.includes('Schlussstand der Umfragen vor der Wahl'));
      assert('nach der Wahl steht die Zeitform in der Vergangenheit', danach.includes('Gewaehlt wurde das Parlament'));
      assert('nach der Wahl ist die Modellrechnung als ueberholt gekennzeichnet', danach.includes('Diese Modellrechnung ist ueberholt'));

      // Die Wahlseite verweist nach der Wahl auf die Parlamentsseite. Steht
      // dort weiter ein Trend samt Sitzmodell, als stuende die Wahl bevor,
      // schickt die Seite den Leser wissentlich in die Irre.
      const parlName = surveysData.parliaments.find((p) => p.shortcut === kandidat.parlament)?.name;
      const parlSeite = await readFile(path.join(probeDir, tagDanach, 'parlament', slug(parlName), 'index.html'), 'utf8');
      assert('nach der Wahl sagt auch die Parlamentsseite, dass gewaehlt wurde', parlSeite.includes('wurde gewaehlt, vor'), 'kein Hinweis auf der Parlamentsseite');
      assert('die Parlamentsseite verweist nach der Wahl auf die Wahlseite', parlSeite.includes(`/wahl/${slug(`${kandidat.art}-${kandidat.land}-${kandidat.jahr}`)}/`));

      // Am Wahltag darf kein Widerspruch entstehen: entweder "wird gewaehlt"
      // ohne Ergebnis, oder "wurde gewaehlt" mit Ergebnis - nie beides.
      // Verglichen wird das VOLLE Datum. Eine frueher hier stehende Fassung
      // pruefte nur den Monatstag und schlug deshalb faelschlich an: die
      // Nachkontrolle der Wahl von 2021 datiert auf den 06.06.2021, der
      // Wahltag 2026 auf den 06.09.2026 - gleiche Ziffer, andere Wahl. Ein
      // Widerspruch liegt nur vor, wenn beide Saetze DENSELBEN Tag meinen.
      const dieserTagDe = `${kandidat.datum.slice(8, 10)}.${kandidat.datum.slice(5, 7)}.${kandidat.datum.slice(0, 4)}`;
      assert(
        'am Wahltag steht kein Widerspruch zwischen Ankuendigung und Rueckblick',
        !(amTag.includes('Heute wird gewaehlt') && amTag.includes(`Am ${dieserTagDe} wurde tatsaechlich gewaehlt`)),
        dieserTagDe,
      );

      // Ohne verifiziertes amtliches Ergebnis fuer GENAU diese Wahl darf dort
      // keine Fehlerbilanz stehen - schon gar nicht die einer anderen Wahl.
      const el = JSON.parse(await readFile(path.join(ROOT, 'config', 'elections.json'), 'utf8'));
      const eintrag = el.elections?.[kandidat.parlament];
      const eigenesErgebnis = Boolean(eintrag?.verified && eintrag.date === kandidat.datum);
      if (eigenesErgebnis) {
        assert('nach der Wahl wird das eigene amtliche Ergebnis verglichen', danach.includes('Nachkontrolle: was die Umfragen beim letzten Mal wert waren'));
      } else {
        assert('ohne verifiziertes Ergebnis steht keine fremde Fehlerbilanz da', danach.includes('Amtliches Ergebnis noch nicht verifiziert'));
        assert('ohne verifiziertes Ergebnis keine Nachkontroll-Kennzahlen', !danach.includes('Mittlerer Fehler'));
      }

      // Der eingefrorene Stand muss einen Stichtag VOR dem Wahltag ausweisen.
      // Bewusst so formuliert und nicht als "es kommt keine spaete Umfrage vor":
      // solange der Bestand gar keine Umfrage nach dem Wahltag enthaelt, waere
      // eine solche Pruefung leer erfuellt und damit wertlos. Der Stichtag
      // dagegen steht immer auf der Seite und laesst sich immer vergleichen.
      const stichtag = danach.match(/Stichtag (\d{2})\.(\d{2})\.(\d{4})/);
      assert('der eingefrorene Stand weist einen Stichtag aus', Boolean(stichtag), 'kein Stichtag auf der Seite gefunden');
      if (stichtag) {
        const iso = `${stichtag[3]}-${stichtag[2]}-${stichtag[1]}`;
        assert('der Stichtag des eingefrorenen Standes liegt vor dem Wahltag', iso < kandidat.datum, `Stichtag ${iso}, Wahltag ${kandidat.datum}`);
      }
    } finally {
      await rm(probeDir, { recursive: true, force: true });
    }
  }
}

// ----------------------------------------------------------- Nachkontrolle
console.log('\nNachkontrolle');
{
  const siteCfg = JSON.parse(await readFile(path.join(ROOT, 'config', 'site.json'), 'utf8'));
  const surveysData = JSON.parse(await readFile(path.join(ROOT, 'data', 'surveys.json'), 'utf8'));
  const el = JSON.parse(await readFile(path.join(ROOT, 'config', 'elections.json'), 'utf8'));
  const nameByShortcut = new Map((surveysData.parliaments ?? []).map((p) => [p.shortcut, p.name]));
  const prov = JSON.parse(await readFile(path.join(ROOT, 'data', 'provenance.json'), 'utf8'));

  for (const [kuerzel, wahl] of Object.entries(el.elections ?? {})) {
    if (!wahl.verified) continue;
    const name = nameByShortcut.get(kuerzel) ?? kuerzel;
    const sv = surveysData.surveys.filter((s) => s.parliament === name);
    const nk = nachkontrolle(sv, wahl, siteCfg.trend, el.parteiAliasse ?? {});

    // Mit synthetischen Testdaten gibt es keine Umfragen aus dem Jahr der
    // letzten Wahl, die Nachkontrolle ist dann zu Recht nicht rechenbar. Statt
    // die Pruefung zu ueberspringen, wird dort das GEGENTEIL geprueft: dass
    // sie sauber verweigert und einen Grund nennt, statt abzustuerzen oder
    // eine Zahl zu erfinden. Das ist auf Testdaten die aussagekraeftigere
    // Pruefung, weil genau dieser Zweig sonst nie liefe.
    if (prov.mode === 'fixture') {
      assert(`${kuerzel}: Nachkontrolle verweigert auf Testdaten sauber`, nk !== null && nk.moeglich === false && typeof nk.grund === 'string' && nk.grund.length > 0, JSON.stringify(nk));
      continue;
    }
    assert(`${kuerzel}: Nachkontrolle ist rechenbar`, nk?.moeglich === true, nk?.grund ?? 'kein Ergebnis');
    if (!nk?.moeglich) continue;

    // Der gefaehrlichste Fehlschlag dieser Rechnung ist still: Wird eine
    // Partei wegen abweichender Schreibweise nicht gefunden, faellt sie aus
    // dem Mittelwert und der Fehler sieht zu gut aus. Deshalb ist eine nicht
    // zuordenbare Partei hier ein Testfehler und keine Fussnote.
    assert(
      `${kuerzel}: jede amtlich gefuehrte Partei findet ihren Umfragewert`,
      nk.ohneUmfragewert.length === 0,
      nk.ohneUmfragewert.map((o) => `${o.partei} (gesucht als ${o.gesuchtAls})`).join(', '),
    );

    // Der Vergleich darf ausschliesslich Umfragen von VOR dem Wahltag nutzen.
    assert(
      `${kuerzel}: es fliesst keine Umfrage vom Wahltag oder danach ein`,
      nk.verwendeteUmfragen.every((u) => u.dateEnd < wahl.date),
      nk.verwendeteUmfragen.filter((u) => u.dateEnd >= wahl.date).map((u) => u.dateEnd).join(', '),
    );

    assert(`${kuerzel}: der mittlere Fehler ist eine endliche Zahl`, Number.isFinite(nk.mittlererFehler));

    // Gegenrechnung von Hand: der mittlere absolute Fehler muss der Mittelwert
    // der Betraege der Einzelabweichungen sein, und jede Einzelabweichung die
    // Differenz aus Umfrage- und amtlichem Wert.
    const einzelOk = nk.zeilen.every((z) => Math.abs(z.abweichung - (z.umfrage - z.amtlich)) < 1e-9);
    const mittel = nk.zeilen.reduce((a, z) => a + Math.abs(z.abweichung), 0) / nk.zeilen.length;
    assert(`${kuerzel}: Abweichung ist Umfrage minus amtlich`, einzelOk);
    assert(`${kuerzel}: mittlerer Fehler ist das Mittel der Betraege`, Math.abs(mittel - nk.mittlererFehler) < 1e-9);

    // Die Zahlen der Seite muessen dieselben sein wie die hier gerechneten.
    const seite = path.join(OUT, 'parlament', slug(name), 'index.html');
    if (existsSync(seite)) {
      const html = await readFile(seite, 'utf8');
      const erwartet = nk.mittlererFehler.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      assert(`${kuerzel}: der ausgegebene mittlere Fehler stimmt mit der Rechnung ueberein`, html.includes(erwartet), erwartet);
    }
  }
}

// Groesse
const sizes = await Promise.all(htmlFiles.map(async (f) => (await stat(f)).size));
const totalKb = Math.round(sizes.reduce((a, b) => a + b, 0) / 1024);
const cssKb = Math.round((await stat(path.join(OUT, 'assets', 'wahlwerk.css'))).size / 1024);
console.log(`\n  Umfang: ${htmlFiles.length} Seiten, ${totalKb} KB HTML, ${cssKb} KB CSS, 0 KB JavaScript`);

console.log(`\n${checks - failures} von ${checks} Pruefungen bestanden.`);
if (failures > 0) {
  console.error(`${failures} Pruefung(en) fehlgeschlagen.`);
  process.exitCode = 1;
}
