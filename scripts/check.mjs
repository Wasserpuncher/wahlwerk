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
import { sha256, ingest, verify as verifyArchive, retrieve, readManifest, GENESIS } from './lib/archive.mjs';
import { mkdtemp, rm, writeFile as wf, readFile as rf } from 'node:fs/promises';
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

  // Externe Ressourcen sind aus Datenschutzgruenden unzulaessig.
  const externalAsset = html.match(/<(?:script|link|img)[^>]+(?:src|href)="https?:\/\/(?!schema\.org)[^"]+"/);
  if (externalAsset && !/rel="(?:license |external|external )?[^"]*"/.test(externalAsset[0])) {
    // Nur echte Ressourceneinbindungen sind kritisch, normale Textlinks nicht.
    if (/<(?:script|img)/.test(externalAsset[0]) || /<link[^>]+stylesheet/.test(externalAsset[0])) {
      problems.push(`${rel}: laedt externe Ressource ${externalAsset[0].slice(0, 90)}`);
    }
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
