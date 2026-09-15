#!/usr/bin/env node
// Wahlwerk - Import amtlicher Wahlergebnisse
// Lizenz: AGPL-3.0-or-later
//
// Liest die veroeffentlichten Ergebnisdateien des Statistischen Landesamtes
// Sachsen-Anhalt und erzeugt daraus config/wahlergebnisse/sachsen-anhalt-2026.json.
//
// Grundsatz: Keine Zahl wird abgetippt. Jeder Wert in der Ausgabedatei stammt
// aus einer Quelldatei unter quellen/, und jede Ableitung wird gegen eine in
// der Quelle mitgelieferte Kontrollsumme geprueft. Schlaegt eine Pruefung fehl,
// bricht der Import ab, statt eine plausibel aussehende Datei zu schreiben.
//
// Aufruf: node scripts/import-wahlergebnis.mjs [--quelle <verzeichnis>]

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const quelleIdx = args.indexOf('--quelle');
const QUELLE = quelleIdx >= 0 ? path.resolve(args[quelleIdx + 1]) : path.join(ROOT, 'quellen', 'sachsen-anhalt-2026');
const ZIEL = path.join(ROOT, 'config', 'wahlergebnisse', 'sachsen-anhalt-2026.json');

// ------------------------------------------------------------------ Parteinamen
//
// Die amtlichen Dateien benennen Parteien anders als die Umfragedatenbank von
// dawum.de, auf der der Rest des Projekts aufsetzt. Ohne diese Zuordnung liessen
// sich amtliches Ergebnis und Umfragen nicht vergleichen.
//
// Die Zuordnung ist bewusst explizit und vollstaendig. Eine Partei, die hier
// fehlt, loest einen Abbruch aus, statt still unter "Sonstige" zu verschwinden.
// Der Wert null bedeutet: bewusst keine Entsprechung in der Umfragedatenbank,
// die Partei wird in den Sammelposten Sonstige gerechnet.
const PARTEI_ZUORDNUNG = {
  CDU: 'CDU',
  AfD: 'AfD',
  'Die Linke': 'Linke',
  SPD: 'SPD',
  FDP: 'FDP',
  'GRÜNE': 'Grüne',
  'FREIE WÄHLER': 'FW',
  BSW: 'BSW',
  dieBasis: null,
  Tierschutzpartei: null,
  Gartenpartei: null,
  'Die PARTEI': null,
  TIERSCHUTZALLIANZ: null,
  PdF: null,
  Volt: null,
  HEIMAT: null,
  EB: null, // Einzelbewerber, nur bei den Erststimmen
};

// ------------------------------------------------------------------- CSV lesen
//
// Die Dateien sind semikolongetrennt, in UTF-8, mit Anfuehrungszeichen um die
// Textfelder. Zahlenfelder koennen leer sein; das bedeutet "nicht erhoben" und
// wird als null gefuehrt, nicht als 0. Der Unterschied ist wesentlich: eine
// Partei, die in einem Wahlkreis nicht angetreten ist, hat dort keine null
// Stimmen, sondern gar kein Ergebnis.
function leseCsv(text) {
  const zeilen = text.split(/\r?\n/).filter((z) => z.trim() !== '');
  const zerlege = (z) => z.split(';').map((feld) => feld.replace(/^"|"$/g, ''));
  const kopf = zerlege(zeilen[0]);
  return zeilen.slice(1).map((z) => {
    const felder = zerlege(z);
    return Object.fromEntries(kopf.map((spalte, i) => [spalte, felder[i]]));
  });
}

const zahl = (v) => (v === undefined || v === null || v === '' ? null : Number(v));

function pflicht(wert, bezeichnung) {
  if (wert === null || !Number.isFinite(wert)) {
    throw new Error(`Pflichtangabe fehlt oder ist keine Zahl: ${bezeichnung}`);
  }
  return wert;
}

// -------------------------------------------------------------------- Einlesen

const ergebnisDatei = 'Ergebnisse_Land_RKR_WKR_LT_2026.csv';
const sitzDatei = 'Sitzverteilung_LT_2026.csv';

const ergebnisRoh = await readFile(path.join(QUELLE, ergebnisDatei), 'utf8');
const sitzRoh = await readFile(path.join(QUELLE, sitzDatei), 'utf8');

const zeilen = leseCsv(ergebnisRoh);
const sitzZeilen = leseCsv(sitzRoh);

// Pruefsummen der Quelldateien. Sie landen in der Ausgabe, damit spaeter
// nachweisbar ist, aus welchem Stand der Quelle die Zahlen stammen.
const pruefsumme = (t) => createHash('sha256').update(t, 'utf8').digest('hex');

// Ergebnisart und Datum sind in jeder Zeile gleich; sie beschreiben den Stand.
const ergebnisarten = [...new Set(zeilen.map((z) => z.Ergebnisart))];
if (ergebnisarten.length !== 1) {
  throw new Error(`Uneinheitliche Ergebnisart in der Quelle: ${ergebnisarten.join(', ')}`);
}
const ergebnisart = ergebnisarten[0];

// ------------------------------------------------- Landesebene, Gesamtergebnis
//
// Satzart LAN ist die Landesebene. Das Feld Wahllokal unterscheidet drei
// Zeilen je Gebiet: "U" nur Urnenwahl, "B" nur Briefwahl, leer das
// Gesamtergebnis. Verwendet wird ausschliesslich das Gesamtergebnis.
const land = zeilen.find((z) => z.Satzart === 'LAN' && z.Wahllokal === '');
if (!land) throw new Error('Keine Landeszeile (Satzart LAN, Gesamtergebnis) in der Quelle gefunden.');

const wahlberechtigte = pflicht(zahl(land['A.Wahlberechtigte']), 'Wahlberechtigte');
const waehler = pflicht(zahl(land['B.Wähler']), 'Wähler');
const ungueltigZweit = pflicht(zahl(land['E.Ungültige.Zweitstimmen']), 'ungueltige Zweitstimmen');
const gueltigZweit = pflicht(zahl(land['F.Gültige.Zweitstimmen']), 'gueltige Zweitstimmen');
const ungueltigErst = pflicht(zahl(land['C.Ungültige.Erststimmen']), 'ungueltige Erststimmen');
const gueltigErst = pflicht(zahl(land['D.Gültige.Erststimmen']), 'gueltige Erststimmen');

// Kontrolle 1: gueltige plus ungueltige Stimmen muessen die Waehlerzahl ergeben.
if (gueltigZweit + ungueltigZweit !== waehler) {
  throw new Error(
    `Kontrollsumme Zweitstimmen verletzt: ${gueltigZweit} + ${ungueltigZweit} = ${gueltigZweit + ungueltigZweit}, erwartet ${waehler}.`,
  );
}
if (gueltigErst + ungueltigErst !== waehler) {
  throw new Error(
    `Kontrollsumme Erststimmen verletzt: ${gueltigErst} + ${ungueltigErst} = ${gueltigErst + ungueltigErst}, erwartet ${waehler}.`,
  );
}

// Spalten F01..Fnn sind Zweitstimmen je Partei, D01..Dnn Erststimmen.
function stimmenJePartei(zeile, praefix) {
  const treffer = {};
  for (const spalte of Object.keys(zeile)) {
    const m = spalte.match(new RegExp(`^${praefix}\\d\\d\\.(.+)$`));
    if (!m) continue;
    const name = m[1];
    if (!(name in PARTEI_ZUORDNUNG)) {
      throw new Error(
        `Partei "${name}" ist in PARTEI_ZUORDNUNG nicht erfasst. Bitte in scripts/import-wahlergebnis.mjs ergaenzen, statt sie stillschweigend zu ignorieren.`,
      );
    }
    const wert = zahl(zeile[spalte]);
    if (wert !== null) treffer[name] = wert;
  }
  return treffer;
}

const zweitstimmen = stimmenJePartei(land, 'F');
const erststimmen = stimmenJePartei(land, 'D');

// Kontrolle 2: Die Summe der Parteistimmen muss den gueltigen Stimmen entsprechen.
const summeZweit = Object.values(zweitstimmen).reduce((a, b) => a + b, 0);
if (summeZweit !== gueltigZweit) {
  throw new Error(`Summe der Zweitstimmen (${summeZweit}) weicht von den gueltigen Zweitstimmen (${gueltigZweit}) ab.`);
}
const summeErst = Object.values(erststimmen).reduce((a, b) => a + b, 0);
if (summeErst !== gueltigErst) {
  throw new Error(`Summe der Erststimmen (${summeErst}) weicht von den gueltigen Erststimmen (${gueltigErst}) ab.`);
}

// ---------------------------------------------------------- Anteile berechnen
//
// Zwei Formen je Partei: der exakte Anteil auf vier Nachkommastellen fuer
// Rechnungen, und der auf eine Stelle gerundete Wert fuer die Anzeige. Beide
// stehen in der Datei, damit niemand aus dem gerundeten Wert zurueckrechnen muss.
function anteile(stimmen, basis) {
  const exakt = {};
  const gerundet = {};
  for (const [name, wert] of Object.entries(stimmen)) {
    const anteil = (wert / basis) * 100;
    exakt[name] = Number(anteil.toFixed(4));
    gerundet[name] = Number(anteil.toFixed(1));
  }
  return { exakt, gerundet };
}

const zweitAnteile = anteile(zweitstimmen, gueltigZweit);
const erstAnteile = anteile(erststimmen, gueltigErst);

// Auf die Projektbezeichner umgestellt. Parteien ohne Entsprechung werden im
// Sammelposten Sonstige zusammengefasst, wie im uebrigen Projekt ueblich.
function aufProjektnamen(exakt) {
  const ergebnis = {};
  let sonstige = 0;
  for (const [amtlich, wert] of Object.entries(exakt)) {
    const ziel = PARTEI_ZUORDNUNG[amtlich];
    if (ziel === null) sonstige += wert;
    else ergebnis[ziel] = Number(wert.toFixed(1));
  }
  if (sonstige > 0) ergebnis.Sonstige = Number(sonstige.toFixed(1));
  return ergebnis;
}

// ------------------------------------------------------- Wahlkreise, Direktmandate
//
// Satzart WKR sind die 41 Wahlkreise. Der Gewinner ergibt sich aus der hoechsten
// Erststimmenzahl. Das Ergebnis wird unten gegen die amtliche Sitzverteilung
// geprueft; stimmen beide nicht ueberein, bricht der Import ab.
const wahlkreise = zeilen.filter((z) => z.Satzart === 'WKR' && z.Wahllokal === '');
if (wahlkreise.length !== 41) {
  throw new Error(`Erwartet werden 41 Wahlkreise, gefunden wurden ${wahlkreise.length}.`);
}

const direktmandate = {};
const wahlkreisListe = [];
for (const wk of wahlkreise) {
  const stimmen = stimmenJePartei(wk, 'D');
  const gueltigWk = pflicht(zahl(wk['D.Gültige.Erststimmen']), `gueltige Erststimmen im Wahlkreis ${wk.Name}`);

  const sortiert = Object.entries(stimmen).sort((a, b) => b[1] - a[1]);
  const [siegerName, siegerStimmen] = sortiert[0];
  const [zweiterName, zweiterStimmen] = sortiert[1] ?? [null, 0];

  // Ein Gleichstand an der Spitze waere im Wahlrecht ein Losfall. Er darf nicht
  // stillschweigend zugunsten der ersten Tabellenspalte entschieden werden.
  if (siegerStimmen === zweiterStimmen) {
    throw new Error(`Stimmengleichheit im Wahlkreis ${wk.Name} zwischen ${siegerName} und ${zweiterName}.`);
  }

  direktmandate[siegerName] = (direktmandate[siegerName] ?? 0) + 1;
  wahlkreisListe.push({
    nummer: wk['Schlüsselnummer'],
    name: wk.Name,
    wahlberechtigte: zahl(wk['A.Wahlberechtigte']),
    waehler: zahl(wk['B.Wähler']),
    gueltigeErststimmen: gueltigWk,
    gueltigeZweitstimmen: zahl(wk['F.Gültige.Zweitstimmen']),
    sieger: PARTEI_ZUORDNUNG[siegerName] ?? siegerName,
    siegerAmtlich: siegerName,
    siegerStimmen,
    siegerAnteil: Number(((siegerStimmen / gueltigWk) * 100).toFixed(2)),
    zweiter: zweiterName ? (PARTEI_ZUORDNUNG[zweiterName] ?? zweiterName) : null,
    zweiterStimmen: zweiterStimmen || null,
    vorsprungPunkte: zweiterName ? Number((((siegerStimmen - zweiterStimmen) / gueltigWk) * 100).toFixed(2)) : null,
  });
}

// ------------------------------------------------------- Amtliche Sitzverteilung

const sitze = {};
const sitzeDetail = {};
let sitzeGesamtAmtlich = null;
for (const z of sitzZeilen) {
  const partei = z.Partei;
  if (!partei) continue;
  const gesamt = pflicht(zahl(z['Sitze.insgesamt']), `Sitze fuer ${partei}`);
  if (partei === 'Insgesamt') {
    sitzeGesamtAmtlich = gesamt;
    continue;
  }
  if (!(partei in PARTEI_ZUORDNUNG)) {
    throw new Error(`Partei "${partei}" aus der Sitzverteilung ist in PARTEI_ZUORDNUNG nicht erfasst.`);
  }
  const ziel = PARTEI_ZUORDNUNG[partei] ?? partei;
  sitze[ziel] = gesamt;
  sitzeDetail[ziel] = {
    gesamt,
    direkt: pflicht(zahl(z.Kreiswahlvorschlaege), `Direktmandate fuer ${partei}`),
    liste: pflicht(zahl(z.Landeswahlvorschlaege), `Listenmandate fuer ${partei}`),
  };
}

// Kontrolle 3: Die Summe der Sitze muss der amtlichen Gesamtzahl entsprechen.
const summeSitze = Object.values(sitze).reduce((a, b) => a + b, 0);
if (summeSitze !== sitzeGesamtAmtlich) {
  throw new Error(`Summe der Sitze (${summeSitze}) weicht von der amtlichen Gesamtzahl (${sitzeGesamtAmtlich}) ab.`);
}

// Kontrolle 4: Die aus den Erststimmen ermittelten Direktmandate muessen exakt
// den amtlich ausgewiesenen Kreiswahlvorschlaegen entsprechen. Diese Pruefung
// ist der Grund, warum die Wahlkreissieger hier neu berechnet und nicht aus
// einer Begleittabelle uebernommen werden.
for (const [amtlichName, anzahl] of Object.entries(direktmandate)) {
  const ziel = PARTEI_ZUORDNUNG[amtlichName] ?? amtlichName;
  const erwartet = sitzeDetail[ziel]?.direkt ?? 0;
  if (anzahl !== erwartet) {
    throw new Error(
      `Direktmandate fuer ${ziel}: aus den Erststimmen ermittelt ${anzahl}, amtlich ausgewiesen ${erwartet}.`,
    );
  }
}
const summeDirekt = Object.values(sitzeDetail).reduce((a, s) => a + s.direkt, 0);
if (summeDirekt !== 41) {
  throw new Error(`Summe der Direktmandate (${summeDirekt}) entspricht nicht den 41 Wahlkreisen.`);
}

// ----------------------------------------------------------------- Ausgabe

const ausgabe = {
  _doku:
    'Amtliches Ergebnis der Landtagswahl Sachsen-Anhalt 2026. Erzeugt von scripts/import-wahlergebnis.mjs aus den Dateien unter quellen/sachsen-anhalt-2026/. Diese Datei wird nicht von Hand bearbeitet. Wer eine Zahl aendern will, aendert die Quelle oder den Importer und laesst den Import erneut laufen.',
  _kontrollen:
    'Beim Import geprueft: gueltige plus ungueltige Stimmen ergeben die Waehlerzahl, die Summe der Parteistimmen ergibt die gueltigen Stimmen, die Summe der Sitze ergibt die amtliche Gesamtzahl, und die aus den Erststimmen ermittelten Wahlkreissieger stimmen mit den amtlich ausgewiesenen Direktmandaten ueberein.',

  wahl: {
    parlament: 'Sachsen-Anhalt',
    bezeichnung: 'Landtagswahl 2026',
    // Ausgeschriebene Form fuer Seitentitel und Ueberschriften. Sie steht hier
    // statt im Generator, weil die richtige Wortstellung von der Wahlart
    // abhaengt und nicht aus Bezeichnung und Land zusammengesetzt werden kann,
    // ohne holprig zu werden.
    langbezeichnung: 'Landtagswahl Sachsen-Anhalt 2026',
    wahltag: '2026-09-06',
    wahlperiode: 9,
  },

  status: {
    // Die Quelldateien fuehren durchgaengig die Ergebnisart "V". Dass der
    // Landeswahlausschuss das Ergebnis endgueltig festgestellt hat, laesst sich
    // aus ihnen nicht belegen. Bis zu einem Beleg gilt es deshalb als
    // vorlaeufig. Wer die Feststellung nachtraegt, setzt endgueltig auf true,
    // traegt Datum und Fundstelle ein und laesst den Build neu laufen.
    ergebnisartQuelle: ergebnisart,
    endgueltig: false,
    bezeichnung: 'vorlaeufiges amtliches Ergebnis',
    standDatum: land.Datum,
    festgestelltAm: null,
    festgestelltQuelle: null,
    hinweis:
      'Die Quelldateien weisen die Ergebnisart "V" aus. Eine Feststellung des endgueltigen Ergebnisses durch den Landeswahlausschuss ist daraus nicht belegt. Die Zahlen werden deshalb als vorlaeufiges amtliches Ergebnis gefuehrt. Erfahrungsgemaess aendern sich dabei einzelne Stimmen, nicht die Sitzverteilung, garantiert ist das aber nicht.',
  },

  beteiligung: {
    wahlberechtigte,
    waehler,
    wahlbeteiligungProzent: Number(((waehler / wahlberechtigte) * 100).toFixed(2)),
    gueltigeZweitstimmen: gueltigZweit,
    ungueltigeZweitstimmen: ungueltigZweit,
    ungueltigeZweitstimmenProzent: Number(((ungueltigZweit / waehler) * 100).toFixed(2)),
    gueltigeErststimmen: gueltigErst,
    ungueltigeErststimmen: ungueltigErst,
  },

  zweitstimmen: {
    _doku: 'Absolute Stimmen und Anteile an den gueltigen Zweitstimmen, nach amtlicher Parteibezeichnung.',
    stimmen: zweitstimmen,
    anteilExakt: zweitAnteile.exakt,
    anteilGerundet: zweitAnteile.gerundet,
  },

  erststimmen: {
    _doku: 'Absolute Stimmen und Anteile an den gueltigen Erststimmen, nach amtlicher Parteibezeichnung.',
    stimmen: erststimmen,
    anteilExakt: erstAnteile.exakt,
    anteilGerundet: erstAnteile.gerundet,
  },

  // Auf die Bezeichner der Umfragedatenbank umgestellt, damit amtliches
  // Ergebnis und Umfragen unmittelbar vergleichbar sind.
  ergebnisProjektnamen: aufProjektnamen(zweitAnteile.exakt),

  // Explizite Zuordnung amtliche Bezeichnung zu Projektbezeichner. Der
  // Generator braucht sie, um die Stimmtabelle mit der Sitzverteilung zu
  // verbinden. Ohne sie muesste er ueber gerundete Anteile zuordnen, was
  // spaetestens dann falsch wird, wenn zwei Parteien denselben gerundeten
  // Anteil haben. null bedeutet: geht in den Sammelposten Sonstige.
  parteiZuordnung: Object.fromEntries(
    Object.keys(zweitstimmen).map((name) => [name, PARTEI_ZUORDNUNG[name] ?? null]),
  ),

  sitze: {
    _doku: 'Amtlich festgestellte Sitzverteilung, Projektbezeichner.',
    gesamt: sitzeGesamtAmtlich,
    gesetzlicheMindestzahl: 83,
    ueberhangUndAusgleich: sitzeGesamtAmtlich - 83,
    mehrheit: Math.floor(sitzeGesamtAmtlich / 2) + 1,
    verteilung: sitze,
    detail: sitzeDetail,
  },

  wahlkreise: {
    _doku:
      'Die 41 Wahlkreise mit dem jeweils direkt gewaehlten Wahlvorschlag, ermittelt aus den Erststimmen der Quelldatei und gegen die amtlichen Direktmandate geprueft.',
    anzahl: wahlkreise.length,
    direktmandate: Object.fromEntries(
      Object.entries(direktmandate).map(([k, v]) => [PARTEI_ZUORDNUNG[k] ?? k, v]),
    ),
    liste: wahlkreisListe,
  },

  quelle: {
    herausgeber: 'Statistisches Landesamt Sachsen-Anhalt, Landeswahlleiterin',
    fundstelle: 'https://wahlergebnisse.sachsen-anhalt.de/',
    rechtsstellung:
      'Amtliches Werk nach Paragraf 5 UrhG und damit gemeinfrei. Die Wiedergabe ist ohne Einschraenkung zulaessig.',
    dateien: [
      { name: ergebnisDatei, sha256: pruefsumme(ergebnisRoh), zeilen: zeilen.length },
      { name: sitzDatei, sha256: pruefsumme(sitzRoh), zeilen: sitzZeilen.length },
    ],
    importiertAm: new Date().toISOString(),
  },
};

await mkdir(path.dirname(ZIEL), { recursive: true });
await writeFile(ZIEL, `${JSON.stringify(ausgabe, null, 2)}\n`, 'utf8');

console.log(`Import erfolgreich: ${path.relative(ROOT, ZIEL)}`);
console.log(`  Stand:             ${ausgabe.status.bezeichnung}, ${ausgabe.status.standDatum}`);
console.log(`  Wahlbeteiligung:   ${ausgabe.beteiligung.wahlbeteiligungProzent} Prozent`);
console.log(`  Gueltige Zweitst.: ${gueltigZweit.toLocaleString('de-DE')}`);
console.log(`  Sitze:             ${sitzeGesamtAmtlich} (gesetzliche Mindestzahl 83)`);
console.log(`  Direktmandate:     ${Object.entries(ausgabe.wahlkreise.direktmandate).map(([p, n]) => `${p} ${n}`).join(', ')}`);
console.log('  Alle vier Kontrollsummen erfuellt.');
