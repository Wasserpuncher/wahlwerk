#!/usr/bin/env node
// Wahlwerk - Generator fuer synthetische Testdaten
// Lizenz: AGPL-3.0-or-later
//
// Erzeugt fixtures/dawum.sample.json in der Struktur der dawum-API, aber mit
// FREI ERFUNDENEN Zahlen. Zweck ist ausschliesslich der Offline-Test der
// Build-Pipeline. Die Institutsnamen sind bewusst fiktiv, damit ein
// versehentlich veroeffentlichter Testbuild sofort als solcher erkennbar ist.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

// Deterministischer Pseudozufall, damit Builds reproduzierbar sind.
let seed = 20260816;
function rnd() {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}

const parliaments = {
  1: { Shortcut: 'Bundestag', Name: 'Bundestag', Election: 'Bundestagswahl' },
  2: { Shortcut: 'Sachsen-Anhalt', Name: 'Sachsen-Anhalt', Election: 'Landtagswahl' },
  3: { Shortcut: 'Berlin', Name: 'Berlin', Election: 'Abgeordnetenhauswahl' },
};

const institutes = {
  1: { Name: 'TESTINSTITUT ALPHA (synthetisch)' },
  2: { Name: 'TESTINSTITUT BETA (synthetisch)' },
  3: { Name: 'TESTINSTITUT GAMMA (synthetisch)' },
  4: { Name: 'TESTINSTITUT DELTA (synthetisch)' },
};

const taskers = {
  1: { Name: 'TESTAUFTRAGGEBER EINS (synthetisch)' },
  2: { Name: 'TESTAUFTRAGGEBER ZWEI (synthetisch)' },
};

const methods = {
  1: { Name: 'Online-Befragung' },
  2: { Name: 'Telefonbefragung' },
  3: { Name: 'Mixed-Mode' },
};

const parties = {
  1: { Shortcut: 'CDU/CSU', Name: 'Christlich Demokratische Union / Christlich-Soziale Union' },
  2: { Shortcut: 'SPD', Name: 'Sozialdemokratische Partei Deutschlands' },
  3: { Shortcut: 'Grüne', Name: 'Bündnis 90/Die Grünen' },
  4: { Shortcut: 'FDP', Name: 'Freie Demokratische Partei' },
  5: { Shortcut: 'AfD', Name: 'Alternative für Deutschland' },
  6: { Shortcut: 'Linke', Name: 'Die Linke' },
  7: { Shortcut: 'BSW', Name: 'Bündnis Sahra Wagenknecht' },
  8: { Shortcut: 'Sonstige', Name: 'Sonstige Parteien' },
};

const baseline = {
  1: { 1: 24, 2: 15, 3: 13, 4: 4, 5: 24, 6: 10, 7: 4, 8: 6 },
  2: { 1: 21, 2: 8, 3: 5, 4: 3, 5: 33, 6: 13, 7: 8, 8: 9 },
  3: { 1: 22, 2: 17, 3: 18, 4: 4, 5: 15, 6: 15, 7: 4, 8: 5 },
};

function isoDate(offsetDays) {
  const d = new Date(Date.UTC(2026, 7, 16));
  d.setUTCDate(d.getUTCDate() - offsetDays);
  return d.toISOString().slice(0, 10);
}

const surveys = {};
let id = 1000;

for (const parliamentId of Object.keys(parliaments)) {
  const surveyCount = parliamentId === '1' ? 40 : 14;
  for (let i = 0; i < surveyCount; i += 1) {
    const instituteId = String((i % Object.keys(institutes).length) + 1);
    const offset = i * (parliamentId === '1' ? 4 : 11) + Math.floor(rnd() * 3);
    const results = {};
    for (const [partyId, base] of Object.entries(baseline[parliamentId])) {
      const drift = (rnd() - 0.5) * 4 + Math.sin((i + Number(partyId)) / 6) * 1.5;
      results[partyId] = Math.round(Math.max(0.5, base + drift) * 10) / 10;
    }
    id += 1;
    surveys[String(id)] = {
      Parliament_ID: parliamentId,
      Institute_ID: instituteId,
      Tasker_ID: String((i % 2) + 1),
      Method_ID: String((i % 3) + 1),
      Date: isoDate(offset),
      Survey_Period: { Date_Start: isoDate(offset + 4), Date_End: isoDate(offset + 1) },
      Surveyed_Persons: i % 7 === 0 ? null : 1000 + Math.floor(rnd() * 1500),
      Results: results,
    };
  }
}

const fixture = {
  _WARNUNG: 'SYNTHETISCHE TESTDATEN. Alle Zahlen und Institutsnamen sind frei erfunden. Nicht veroeffentlichen.',
  Database: {
    License: {
      Name: 'SYNTHETISCH - keine Lizenz, keine echten Daten',
      Shortcut: 'TEST',
      Link: 'https://example.invalid',
    },
    Publisher: 'fixture.invalid',
    Author: 'Wahlwerk make-fixture.mjs',
    Last_Update: '2026-08-16T00:00:00+02:00',
  },
  Parliaments: parliaments,
  Institutes: institutes,
  Taskers: taskers,
  Methods: methods,
  Parties: parties,
  Surveys: surveys,
};

await mkdir(path.join(ROOT, 'fixtures'), { recursive: true });
await writeFile(path.join(ROOT, 'fixtures', 'dawum.sample.json'), JSON.stringify(fixture, null, 2), 'utf8');
console.log(`Fixture geschrieben: ${Object.keys(surveys).length} synthetische Umfragen.`);
