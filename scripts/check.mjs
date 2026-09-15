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
import { findCoalitions, mehrheitOhne } from './lib/coalitions.mjs';
import { computeAccuracy, huerdenVergleich } from './lib/accuracy.mjs';
import { bereinigeBezeichnung, zuordnePartei, verknuepfeWahlkreise } from './lib/abgeordnetenwatch.mjs';
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

// ------------------------------------------- Amtliches Ergebnis Sachsen-Anhalt
//
// Der schaerfste Test, den dieses Projekt hat: Der Rechenkern bekommt die
// amtlichen Zweitstimmen der Landtagswahl vom 06.09.2026 und muss daraus exakt
// die amtlich festgestellte Sitzverteilung erzeugen. Anders als beim Abgleich
// mit dawum.de steht hier kein zweites Programm gegenueber, sondern die
// Wirklichkeit.
console.log('\nAmtliches Ergebnis Sachsen-Anhalt 2026');
{
  const datei = path.join(ROOT, 'config', 'wahlergebnisse', 'sachsen-anhalt-2026.json');
  if (!existsSync(datei)) {
    assert('amtliches Ergebnis vorhanden', false, 'config/wahlergebnisse/sachsen-anhalt-2026.json fehlt, node scripts/import-wahlergebnis.mjs ausfuehren');
  } else {
    const e = JSON.parse(await readFile(datei, 'utf8'));
    const parl = JSON.parse(await readFile(path.join(ROOT, 'config', 'parliaments.json'), 'utf8'));
    const cfg = parl.parliaments['Sachsen-Anhalt'];

    // Kontrollsummen der Quelle
    const b = e.beteiligung;
    assert('gueltige plus ungueltige Zweitstimmen ergeben die Waehlerzahl',
      b.gueltigeZweitstimmen + b.ungueltigeZweitstimmen === b.waehler,
      `${b.gueltigeZweitstimmen} + ${b.ungueltigeZweitstimmen} != ${b.waehler}`);
    assert('gueltige plus ungueltige Erststimmen ergeben die Waehlerzahl',
      b.gueltigeErststimmen + b.ungueltigeErststimmen === b.waehler);
    const summeStimmen = Object.values(e.zweitstimmen.stimmen).reduce((a, x) => a + x, 0);
    assert('Summe der Parteistimmen ergibt die gueltigen Zweitstimmen',
      summeStimmen === b.gueltigeZweitstimmen, `${summeStimmen} != ${b.gueltigeZweitstimmen}`);

    // Sitzverteilung aus den amtlichen Stimmen nachgerechnet
    const anteile = {};
    for (const [partei, stimmen] of Object.entries(e.zweitstimmen.stimmen)) {
      const ziel = e.parteiZuordnung[partei];
      if (ziel) anteile[ziel] = (stimmen / b.gueltigeZweitstimmen) * 100;
    }
    const gerechnet = distribute(anteile, cfg, { aggregateCategories: parl.aggregateCategories });
    assert('Rechenkern reproduziert die amtliche Sitzverteilung',
      eq(gerechnet.seats, Object.fromEntries(Object.entries(e.sitze.verteilung).filter(([, v]) => v > 0))),
      `berechnet ${JSON.stringify(gerechnet.seats)}, amtlich ${JSON.stringify(e.sitze.verteilung)}`);
    assert('Summe der amtlichen Sitze ergibt die ausgewiesene Gesamtzahl',
      Object.values(e.sitze.verteilung).reduce((a, x) => a + x, 0) === e.sitze.gesamt);
    assert('kein Gleichstand bei der Restsitzvergabe', gerechnet.ties.length === 0, JSON.stringify(gerechnet.ties));

    // Direkt- und Listenmandate
    const summeDirekt = Object.values(e.sitze.detail).reduce((a, d) => a + d.direkt, 0);
    assert('41 Direktmandate aus 41 Wahlkreisen', summeDirekt === 41, String(summeDirekt));
    assert('41 Wahlkreise erfasst', e.wahlkreise.liste.length === 41, String(e.wahlkreise.liste.length));
    for (const [partei, d] of Object.entries(e.sitze.detail)) {
      assert(`${partei}: direkt plus Liste ergibt die Gesamtsitze`, d.direkt + d.liste === d.gesamt);
    }

    // Wahlkreissieger unabhaengig aus den Erststimmenanteilen nachgeprueft
    const ausWahlkreisen = {};
    for (const w of e.wahlkreise.liste) ausWahlkreisen[w.sieger] = (ausWahlkreisen[w.sieger] ?? 0) + 1;
    assert('Wahlkreissieger stimmen mit den amtlichen Direktmandaten ueberein',
      eq(ausWahlkreisen, e.wahlkreise.direktmandate),
      `${JSON.stringify(ausWahlkreisen)} gegen ${JSON.stringify(e.wahlkreise.direktmandate)}`);
    assert('jeder Wahlkreissieger liegt vor dem Zweitplatzierten',
      e.wahlkreise.liste.every((w) => w.vorsprungPunkte === null || w.vorsprungPunkte > 0));

    // Uebereinstimmung mit config/elections.json. Verhindert, dass dort ein
    // Wert von Hand geaendert wird, ohne dass es auffaellt.
    const elections = JSON.parse(await readFile(path.join(ROOT, 'config', 'elections.json'), 'utf8'));
    const eintrag = elections.elections['Sachsen-Anhalt'];
    assert('elections.json nennt denselben Wahltag', eintrag.date === e.wahl.wahltag, `${eintrag.date} gegen ${e.wahl.wahltag}`);
    assert('elections.json nennt dieselbe Sitzzahl', eintrag.seatsActual === e.sitze.gesamt);
    let abweichung = null;
    for (const [partei, wert] of Object.entries(e.ergebnisProjektnamen)) {
      if (Math.abs((eintrag.results[partei] ?? -1) - wert) > 0.051) {
        abweichung = `${partei}: elections.json ${eintrag.results[partei]}, amtlich ${wert}`;
        break;
      }
    }
    assert('elections.json gibt die amtlichen Anteile korrekt wieder', abweichung === null, abweichung ?? '');

    // Der Status ist die Angabe, die am ehesten veraltet. Solange er auf
    // vorlaeufig steht, muss die Begruendung dafuer in der Datei stehen.
    // Ohne Langbezeichnung faellt der Seitentitel auf einen Platzhalter
    // zurueck. Das faellt bei einer neuen Wahl sonst erst im fertigen HTML auf.
    assert('Wahl traegt eine ausgeschriebene Langbezeichnung',
      typeof e.wahl.langbezeichnung === 'string' && e.wahl.langbezeichnung.includes(String(new Date(e.wahl.wahltag).getFullYear())),
      String(e.wahl.langbezeichnung));

    assert('Ergebnisstatus ist ausgewiesen',
      typeof e.status.endgueltig === 'boolean' && typeof e.status.bezeichnung === 'string' && e.status.hinweis.length > 20);
    if (e.status.endgueltig === true) {
      assert('endgueltiges Ergebnis nennt Feststellungsdatum und Fundstelle',
        Boolean(e.status.festgestelltAm) && Boolean(e.status.festgestelltQuelle),
        'endgueltig true erfordert festgestelltAm und festgestelltQuelle');
    }
  }
}

// ------------------------------------------------- Mehrheit ohne eine Partei
console.log('\nMehrheit ohne die staerkste Partei');
{
  // Realer Fall: der Landtag von Sachsen-Anhalt der 9. Wahlperiode. Alle
  // minimalen Mehrheiten mit bis zu vier Partnern enthalten die AfD. Eine
  // Mehrheit ohne sie existiert trotzdem, sie braucht fuenf Partner. Wer nur
  // findCoalitions befragt, zieht daraus den falschen Schluss.
  const sitze = { AfD: 39, CDU: 15, Linke: 8, SPD: 8, 'Grüne': 8, BSW: 5 };
  const viererliste = findCoalitions(sitze, 42);
  assert('alle Viererbuendnisse enthalten die staerkste Partei',
    viererliste.every((c) => c.parties.includes('AfD')), JSON.stringify(viererliste.map((c) => c.parties)));

  const ohne = mehrheitOhne(sitze, 42, 'AfD');
  assert('eine Mehrheit ohne die staerkste Partei wird gefunden', ohne !== null);
  assert('sie umfasst alle fuenf uebrigen Parteien', ohne.partnerCount === 5, String(ohne?.partnerCount));
  assert('sie kommt auf 44 Sitze', ohne.seats === 44, String(ohne?.seats));
  assert('sie ist minimal', ohne.parties.every((p) => ohne.seats - sitze[p] < 42));

  // Gegenprobe: Wenn die uebrigen Parteien zusammen die Mehrheit nicht
  // erreichen, muss null herauskommen und nicht etwa ein Scheinergebnis.
  assert('ohne Mehrheit wird null zurueckgegeben',
    mehrheitOhne({ A: 60, B: 20, C: 20 }, 51, 'A') === null);
}

// ------------------------------------------------------- Institutsgenauigkeit
console.log('\nInstitutsgenauigkeit');
{
  const amtlich = {
    wahl: { wahltag: '2026-09-06' },
    ergebnisProjektnamen: { AfD: 40, CDU: 20, SPD: 10, Sonstige: 30 },
    status: { endgueltig: false },
  };
  const umfragen = [
    { id: 1, institute: 'A', date: '2026-08-20', dateEnd: '2026-08-18', results: { AfD: 38, CDU: 22, SPD: 10 } },
    { id: 2, institute: 'A', date: '2026-07-01', dateEnd: '2026-06-30', results: { AfD: 30, CDU: 30, SPD: 30 } },
    { id: 3, institute: 'B', date: '2026-08-10', dateEnd: '2026-08-08', results: { AfD: 41, CDU: 19, SPD: 10 } },
  ];

  const acc = computeAccuracy(umfragen, amtlich, { fensterTage: 45 });
  assert('Auswertung ist verfuegbar', acc.verfuegbar === true, JSON.stringify(acc));
  assert('je Institut genau eine Umfrage', acc.institute.length === 2, String(acc.institute.length));
  assert('es zaehlt die letzte Umfrage je Institut',
    acc.institute.find((i) => i.institut === 'A').surveyId === 1);

  // A: |40-38| + |20-22| + |10-10| = 4, geteilt durch 3 ergibt 1,33
  const a = acc.institute.find((i) => i.institut === 'A');
  assert('mittlere absolute Abweichung von Hand nachgerechnet',
    a.mittlereAbsoluteAbweichung === 1.33, String(a.mittlereAbsoluteAbweichung));
  assert('Sammelposten Sonstige geht nicht in den Vergleich ein', !('Sonstige' in a.abweichungen));

  // Eine Umfrage nach dem Wahltag darf eine Vorhersagebewertung nicht beeinflussen.
  const mitDanach = computeAccuracy(
    [...umfragen, { id: 4, institute: 'A', date: '2026-09-10', dateEnd: '2026-09-09', results: { AfD: 40, CDU: 20, SPD: 10 } }],
    amtlich,
    { fensterTage: 45 },
  );
  assert('Umfragen nach dem Wahltag bleiben unberuecksichtigt',
    mitDanach.institute.find((i) => i.institut === 'A').surveyId === 1);

  // Der wichtigste Schutz: niemals eine Genauigkeit aus erfundenen Zahlen.
  const synthetisch = computeAccuracy(umfragen, amtlich, { istSynthetisch: true });
  assert('synthetische Daten liefern keine Genauigkeitsauswertung',
    synthetisch.verfuegbar === false && synthetisch.grund === 'synthetisch');

  // Eine Partei, die ein Institut nicht ausweist, darf nicht als null gelten.
  const luecke = computeAccuracy(
    [{ id: 5, institute: 'C', date: '2026-08-20', dateEnd: '2026-08-18', results: { AfD: 38, CDU: 22 } }],
    amtlich,
    { fensterTage: 45 },
  );
  assert('nicht erhobene Partei wird uebersprungen, nicht als null gewertet',
    !('SPD' in luecke.institute[0].abweichungen) && luecke.institute[0].verglicheneParteien === 2);

  // Huerdenvergleich
  const h = huerdenVergleich({ Gruen: 4.6, AfD: 42 }, { Gruen: 8.9, AfD: 43.8 }, 5);
  const gruen = h.find((z) => z.partei === 'Gruen');
  assert('Wechsel ueber die Sperrklausel wird erkannt',
    gruen.abweichend === true && gruen.trendDrin === false && gruen.amtlichDrin === true);
  assert('Partei ohne Huerdenwechsel wird nicht markiert', h.find((z) => z.partei === 'AfD').abweichend === false);
}

// -------------------------------------------------------- abgeordnetenwatch
console.log('\nabgeordnetenwatch');
{
  // Realer Fall: abgeordnetenwatch fuehrt die Gruenen mit einem weichen
  // Trennzeichen im Namen. Ohne Bereinigung schlaegt die Zuordnung fehl, und
  // zwar unsichtbar, weil die Bezeichnung im Protokoll normal aussieht.
  const mitWeichtrenner = 'BÜNDNIS 90/­DIE GRÜNEN';
  assert('weiches Trennzeichen wird entfernt',
    bereinigeBezeichnung(mitWeichtrenner) === 'BÜNDNIS 90/DIE GRÜNEN', bereinigeBezeichnung(mitWeichtrenner));
  assert('Gruene werden trotz Weichtrenner zugeordnet',
    zuordnePartei(mitWeichtrenner) === 'Grüne', String(zuordnePartei(mitWeichtrenner)));
  assert('geschuetztes Leerzeichen wird normalisiert',
    bereinigeBezeichnung('FREIE WÄHLER') === 'FREIE WÄHLER');
  assert('unbekannte Partei behaelt ihre Bezeichnung', zuordnePartei('Gartenpartei') === 'Gartenpartei');

  // Verknuepfung: amtlicher Sieger plus eindeutige Kandidatur ergibt den Namen.
  const amtlicheWk = [
    { nummer: '001', name: 'Salzwedel', sieger: 'AfD' },
    { nummer: '002', name: 'Stendal', sieger: 'CDU' },
  ];
  const aw = {
    wahlkreise: [{ nummer: 1, name: 'Salzwedel' }, { nummer: 2, name: 'Stendal' }],
    kandidaturen: [
      { name: 'Erste Person', partei: 'AfD', wahlkreisNummer: 1, profil: 'https://example.org/1' },
      { name: 'Zweite Person', partei: 'CDU', wahlkreisNummer: 2, profil: 'https://example.org/2' },
      { name: 'Dritte Person', partei: 'CDU', wahlkreisNummer: 2, profil: 'https://example.org/3' },
    ],
    mandate: [],
  };
  const v = verknuepfeWahlkreise(amtlicheWk, aw);
  assert('eindeutige Kandidatur wird zugeordnet',
    v.zeilen[0].gewaehltName === 'Erste Person' && v.zeilen[0].herkunft === 'abgeleitet');
  assert('mehrdeutige Kandidatur wird NICHT zugeordnet',
    v.zeilen[1].gewaehltName === null && v.zeilen[1].herkunft === 'mehrdeutig',
    JSON.stringify(v.zeilen[1]));
  assert('dreistellige und numerische Wahlkreisnummern passen zusammen', v.zugeordnet === 1);

  // Ein erfasstes Mandat hat Vorrang vor der Ableitung.
  const mitMandat = verknuepfeWahlkreise(amtlicheWk, {
    ...aw,
    mandate: [{ name: 'Amtlich Gewaehlte', partei: 'CDU', wahlkreisNummer: 2, profil: 'https://example.org/4' }],
  });
  assert('erfasstes Mandat schlaegt die Ableitung',
    mitMandat.zeilen[1].gewaehltName === 'Amtlich Gewaehlte' && mitMandat.zeilen[1].herkunft === 'mandat');
  assert('Herkunft aus Mandat wird gezaehlt', mitMandat.ausMandat === 1);

  // Widerspruechliche Wahlkreisnamen duerfen keine Zuordnung erzeugen.
  const falscheNamen = verknuepfeWahlkreise(amtlicheWk, {
    ...aw,
    wahlkreise: [{ nummer: 1, name: 'Ganz anderer Ort' }, { nummer: 2, name: 'Stendal' }],
  });
  assert('abweichender Wahlkreisname verhindert die Zuordnung',
    falscheNamen.zeilen[0].herkunft === 'namensabweichung' && falscheNamen.namensabweichungen.length === 1);
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
