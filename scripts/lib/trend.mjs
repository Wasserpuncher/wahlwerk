// Wahlwerk - Trendberechnung
// Lizenz: AGPL-3.0-or-later
//
// METHODIK, vollstaendig offengelegt und auf der Seite /methodik/ im Klartext
// wiederholt. Der Trend ist ein gewichteter Mittelwert veroeffentlichter
// Sonntagsfragen, keine Prognose und kein Modell mit Hauseffektkorrektur.
//
//   1. Beruecksichtigt werden nur Umfragen, deren letzter Befragungstag
//      hoechstens maxAgeDays vor dem Stichtag liegt. Stichtag ist der
//      juengste letzte Befragungstag im jeweiligen Parlament.
//   2. Je Institut geht nur die juengste Umfrage in die Rechnung ein. Damit
//      kann kein Institut den Trend durch hohe Publikationsfrequenz dominieren.
//   3. Gewicht je Umfrage:
//        w = 2^(-alter / halflifeDays) * sqrt(n / referenceSampleSize)
//      Der erste Faktor ist ein exponentieller Aktualitaetsabschlag mit
//      Halbwertszeit halflifeDays. Der zweite Faktor bildet ab, dass der
//      Standardfehler einer Stichprobe mit 1/sqrt(n) faellt. Fehlt die
//      Fallzahl, wird n = referenceSampleSize gesetzt und die Umfrage in der
//      Ausgabe als "Fallzahl unbekannt" markiert.
//   4. Der Wert einer Partei ist der gewichtete Mittelwert ihrer Werte.
//      Umfragen, die eine Partei nicht einzeln ausweisen, gehen fuer diese
//      Partei nicht in Zaehler und Nenner ein. Sie werden nicht als Null
//      gewertet, weil "nicht ausgewiesen" nicht "null Prozent" bedeutet.
//   5. Es wird NICHT auf 100 normiert. Die Summe kann von 100 abweichen.
//      Das ist ein ehrliches Artefakt der Mittelung und wird ausgewiesen.
//   6. Unterhalb von minSurveys Umfragen wird kein Trend ausgegeben.

export function computeTrend(surveys, config) {
  const { halflifeDays, maxAgeDays, referenceSampleSize, minSurveys } = config;

  const dated = surveys.filter((s) => s.dateEnd);
  if (dated.length === 0) return null;

  const cutoffAnchor = dated.map((s) => s.dateEnd).sort().at(-1);
  const anchorMs = Date.parse(`${cutoffAnchor}T00:00:00Z`);

  const inWindow = dated.filter((s) => {
    const age = (anchorMs - Date.parse(`${s.dateEnd}T00:00:00Z`)) / 86400000;
    return age >= 0 && age <= maxAgeDays;
  });

  // Nur die juengste Umfrage je Institut.
  const newestPerInstitute = new Map();
  for (const s of inWindow) {
    const prev = newestPerInstitute.get(s.instituteId);
    if (!prev || s.dateEnd > prev.dateEnd || (s.dateEnd === prev.dateEnd && s.id > prev.id)) {
      newestPerInstitute.set(s.instituteId, s);
    }
  }
  const used = [...newestPerInstitute.values()].sort((a, b) => (a.dateEnd < b.dateEnd ? 1 : -1));
  if (used.length < minSurveys) {
    return { insufficient: true, availableSurveys: used.length, requiredSurveys: minSurveys, anchorDate: cutoffAnchor };
  }

  const weighted = [];
  for (const s of used) {
    const ageDays = (anchorMs - Date.parse(`${s.dateEnd}T00:00:00Z`)) / 86400000;
    const n = s.surveyedPersons && s.surveyedPersons > 0 ? s.surveyedPersons : referenceSampleSize;
    const recency = Math.pow(2, -ageDays / halflifeDays);
    const precision = Math.sqrt(n / referenceSampleSize);
    weighted.push({ survey: s, weight: recency * precision, ageDays, assumedSampleSize: !s.surveyedPersons });
  }

  const sums = new Map();
  const weights = new Map();
  for (const { survey, weight } of weighted) {
    for (const [party, value] of Object.entries(survey.results)) {
      sums.set(party, (sums.get(party) ?? 0) + value * weight);
      weights.set(party, (weights.get(party) ?? 0) + weight);
    }
  }

  const values = {};
  for (const [party, sum] of sums) {
    const w = weights.get(party);
    if (w > 0) values[party] = sum / w;
  }

  const sum = Object.values(values).reduce((a, b) => a + b, 0);

  return {
    insufficient: false,
    anchorDate: cutoffAnchor,
    values,
    sum,
    surveysUsed: weighted.map((w) => ({
      id: w.survey.id,
      institute: w.survey.institute,
      dateEnd: w.survey.dateEnd,
      surveyedPersons: w.survey.surveyedPersons,
      assumedSampleSize: w.assumedSampleSize,
      ageDays: Math.round(w.ageDays),
      weight: w.weight,
    })),
    parameters: { halflifeDays, maxAgeDays, referenceSampleSize, minSurveys },
  };
}

/**
 * Spannweite je Partei ueber die verwendeten Umfragen. Zeigt die Streuung
 * zwischen den Instituten, die ein Mittelwert allein verdeckt.
 */
export function computeSpread(surveys) {
  const acc = new Map();
  for (const s of surveys) {
    for (const [party, value] of Object.entries(s.results)) {
      if (!acc.has(party)) acc.set(party, []);
      acc.get(party).push({ value, institute: s.institute, id: s.id });
    }
  }
  const out = {};
  for (const [party, list] of acc) {
    const sorted = [...list].sort((a, b) => a.value - b.value);
    out[party] = { min: sorted[0], max: sorted.at(-1), count: sorted.length };
  }
  return out;
}
