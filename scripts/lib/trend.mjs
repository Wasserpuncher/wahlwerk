import { kishEffectiveSize, marginPercent } from './stats.mjs';

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
//        w = 2^(-alter / halflifeDays) * (n / referenceSampleSize)^exponent
//      Der erste Faktor ist ein exponentieller Aktualitaetsabschlag mit
//      Halbwertszeit halflifeDays.
//
//      KORREKTUR vom 16.08.2026 zur Begruendung des zweiten Faktors:
//      Die bisherige Begruendung war statistisch falsch. Sie lautete, der
//      Standardfehler falle mit 1/sqrt(n), deshalb sei sqrt(n) das richtige
//      Gewicht. Das ist ein Denkfehler. Bei varianzoptimaler Mittelung ist das
//      Gewicht der Kehrwert der Varianz, und die Varianz eines Anteils faellt
//      mit 1/n. Statistisch optimal waere also der Exponent 1, nicht 0,5.
//
//      Der Exponent ist deshalb konfigurierbar (trend.precisionExponent). Der
//      Standardwert 0,5 ist eine bewusste Daempfung und ausdruecklich keine
//      Herleitung: Der Fehler einer Wahlumfrage wird nicht vom Stichproben-
//      fehler dominiert, sondern von Gewichtungsmodellen, Nonresponse und
//      Hauseffekten. Diese Anteile sinken mit wachsendem n nicht. Exponent 1
//      wuerde ein grosses Onlinepanel gegenueber einer sorgfaeltigen
//      Telefonstichprobe deutlich ueberbewerten. Wer rein varianzoptimal
//      mitteln will, setzt den Exponenten auf 1.
//
//      Fehlt die Fallzahl, wird n = referenceSampleSize gesetzt und die
//      Umfrage in der Ausgabe als angenommen markiert.
//   4. Der Wert einer Partei ist der gewichtete Mittelwert ihrer Werte.
//      Umfragen, die eine Partei nicht einzeln ausweisen, gehen fuer diese
//      Partei nicht in Zaehler und Nenner ein. Sie werden nicht als Null
//      gewertet, weil "nicht ausgewiesen" nicht "null Prozent" bedeutet.
//   5. Es wird NICHT auf 100 normiert. Die Summe kann von 100 abweichen.
//      Das ist ein ehrliches Artefakt der Mittelung und wird ausgewiesen.
//   6. Unterhalb von minSurveys Umfragen wird kein Trend ausgegeben.

export function computeTrend(surveys, config) {
  const { halflifeDays, maxAgeDays, referenceSampleSize, minSurveys } = config;
  const precisionExponent = config.precisionExponent ?? 0.5;
  const designEffect = config.designEffect ?? 1;

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
    const precision = Math.pow(n / referenceSampleSize, precisionExponent);
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

  // Effektiver Stichprobenumfang der Zusammenfassung nach Kish. Der Abschlag
  // gegenueber der blossen Summe der Fallzahlen entsteht dadurch, dass die
  // Umfragen unterschiedlich gewichtet eingehen. Bei gleichen Gewichten bleibt
  // exakt die Summe uebrig. Die Varianz zwischen den Instituten ist darin NICHT
  // enthalten; siehe die ausfuehrliche Warnung ueber kishEffectiveSize.
  const kish = kishEffectiveSize(
    weighted.map((w) => w.weight),
    weighted.map((w) => (w.survey.surveyedPersons && w.survey.surveyedPersons > 0 ? w.survey.surveyedPersons : referenceSampleSize)),
  );

  const intervals = {};
  if (kish && kish.effectiveSampleSize > 0) {
    for (const [party, v] of Object.entries(values)) {
      intervals[party] = marginPercent(v, kish.effectiveSampleSize, { designEffect });
    }
  }

  return {
    insufficient: false,
    anchorDate: cutoffAnchor,
    values,
    sum,
    kish,
    intervals,
    designEffect,
    precisionExponent,
    surveysUsed: weighted.map((w) => ({
      id: w.survey.id,
      institute: w.survey.institute,
      dateEnd: w.survey.dateEnd,
      surveyedPersons: w.survey.surveyedPersons,
      assumedSampleSize: w.assumedSampleSize,
      ageDays: Math.round(w.ageDays),
      weight: w.weight,
    })),
    parameters: { halflifeDays, maxAgeDays, referenceSampleSize, minSurveys, precisionExponent, designEffect },
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
