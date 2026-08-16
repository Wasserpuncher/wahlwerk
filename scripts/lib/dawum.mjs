// Wahlwerk - Normalisierung der dawum-API
// Lizenz: AGPL-3.0-or-later (Code)
// Datengrundlage: dawum.de, Open Database License (ODbL)
//
// Die Struktur der Quelldatei ist dokumentiert unter https://dawum.de/API/
// Bloecke: Database, Parliaments, Institutes, Taskers, Methods, Parties, Surveys
// Surveys enthaelt je Eintrag: Parliament_ID, Institute_ID, Tasker_ID, Method_ID,
// Results (Partei-ID zu Wert), Date, Survey_Period mit Date_Start und Date_End,
// Surveyed_Persons.
//
// Der Parser ist bewusst defensiv: fehlende oder unerwartete Felder fuehren zu
// einem protokollierten Datensatzfehler, nicht zu einem stillen Ersatzwert.

export function normalize(raw) {
  const problems = [];
  const req = (cond, msg) => {
    if (!cond) problems.push(msg);
    return cond;
  };

  req(raw && typeof raw === 'object', 'Wurzelobjekt fehlt oder ist kein Objekt.');
  const db = raw?.Database ?? {};
  req(db.Last_Update, 'Database.Last_Update fehlt.');

  const lookup = (block) => {
    const src = raw?.[block] ?? {};
    const map = new Map();
    for (const [id, entry] of Object.entries(src)) map.set(String(id), entry);
    return map;
  };

  const parliaments = lookup('Parliaments');
  const institutes = lookup('Institutes');
  const taskers = lookup('Taskers');
  const methods = lookup('Methods');
  const parties = lookup('Parties');

  req(parliaments.size > 0, 'Block Parliaments ist leer.');
  req(parties.size > 0, 'Block Parties ist leer.');

  const surveys = [];
  for (const [id, s] of Object.entries(raw?.Surveys ?? {})) {
    const parliament = parliaments.get(String(s.Parliament_ID));
    const institute = institutes.get(String(s.Institute_ID));
    const tasker = taskers.get(String(s.Tasker_ID));
    const method = methods.get(String(s.Method_ID));

    if (!parliament) {
      problems.push(`Umfrage ${id}: unbekannte Parliament_ID ${s.Parliament_ID}, Datensatz uebersprungen.`);
      continue;
    }
    if (!s.Date) {
      problems.push(`Umfrage ${id}: Feld Date fehlt, Datensatz uebersprungen.`);
      continue;
    }

    const results = {};
    let unknownParty = false;
    for (const [partyId, value] of Object.entries(s.Results ?? {})) {
      const party = parties.get(String(partyId));
      if (!party) {
        problems.push(`Umfrage ${id}: unbekannte Partei-ID ${partyId}.`);
        unknownParty = true;
        continue;
      }
      const n = Number(value);
      if (!Number.isFinite(n)) {
        problems.push(`Umfrage ${id}: nicht numerischer Wert fuer Partei ${party.Shortcut}.`);
        continue;
      }
      results[party.Shortcut ?? party.Name ?? String(partyId)] = n;
    }

    if (Object.keys(results).length === 0) {
      problems.push(`Umfrage ${id}: keine verwertbaren Ergebnisse, Datensatz uebersprungen.`);
      continue;
    }

    const persons = Number(s.Surveyed_Persons);

    surveys.push({
      id: String(id),
      parliament: parliament.Name ?? parliament.Shortcut ?? String(s.Parliament_ID),
      parliamentShortcut: parliament.Shortcut ?? null,
      parliamentElection: parliament.Election ?? null,
      parliamentId: String(s.Parliament_ID),
      institute: institute?.Name ?? null,
      instituteId: String(s.Institute_ID ?? ''),
      tasker: tasker?.Name ?? null,
      taskerId: s.Tasker_ID != null ? String(s.Tasker_ID) : null,
      method: method?.Name ?? null,
      date: s.Date,
      dateStart: s.Survey_Period?.Date_Start ?? null,
      dateEnd: s.Survey_Period?.Date_End ?? null,
      surveyedPersons: Number.isFinite(persons) && persons > 0 ? persons : null,
      results,
      resultSum: Object.values(results).reduce((a, b) => a + b, 0),
      hasUnknownParty: unknownParty,
    });
  }

  surveys.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.id < b.id ? 1 : -1));

  return {
    meta: {
      sourceLastUpdate: db.Last_Update ?? null,
      sourcePublisher: db.Publisher ?? null,
      sourceAuthor: db.Author ?? null,
      sourceLicense: db.License ?? null,
      surveyCount: surveys.length,
      parliamentCount: parliaments.size,
      instituteCount: institutes.size,
      partyCount: parties.size,
    },
    parliaments: [...parliaments.entries()].map(([id, p]) => ({
      id,
      name: p.Name ?? null,
      shortcut: p.Shortcut ?? null,
      election: p.Election ?? null,
    })),
    institutes: [...institutes.entries()].map(([id, i]) => ({ id, name: i.Name ?? null })),
    taskers: [...taskers.entries()].map(([id, t]) => ({ id, name: t.Name ?? null })),
    methods: [...methods.entries()].map(([id, m]) => ({ id, name: m.Name ?? null })),
    parties: [...parties.entries()].map(([id, p]) => ({ id, shortcut: p.Shortcut ?? null, name: p.Name ?? null })),
    surveys,
    problems,
  };
}
