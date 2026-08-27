// Wahlwerk - Sitzzuteilungsverfahren
// Lizenz: AGPL-3.0-or-later
//
// Alle drei Verfahren sind hier als reine Funktionen implementiert und in
// scripts/check.mjs gegen Lehrbuchbeispiele getestet. Sie arbeiten auf
// Stimmanteilen, nicht auf absoluten Stimmen. Das ist bei einer Sonntagsfrage
// die einzig moegliche Grundlage und zugleich ihre Grenze: das Ergebnis ist
// eine Modellrechnung, keine Prognose.

/**
 * Divisorverfahren mit Standardrundung (Sainte-Lague / Schepers).
 * Umsetzung ueber Hoechstzahlen, damit das Verfahren nachvollziehbar bleibt.
 */
export function sainteLague(shares, seats) {
  return highestAverages(shares, seats, (s) => 2 * s + 1);
}

/** Divisorverfahren mit Abrundung (dHondt). */
export function dHondt(shares, seats) {
  return highestAverages(shares, seats, (s) => s + 1);
}

function highestAverages(shares, seats, divisor) {
  const keys = Object.keys(shares);
  const result = Object.fromEntries(keys.map((k) => [k, 0]));
  if (!seats || seats <= 0) return result;

  for (let i = 0; i < seats; i += 1) {
    let bestKey = null;
    let bestQuot = -Infinity;
    for (const k of keys) {
      const q = shares[k] / divisor(result[k]);
      // Bei exakter Gleichheit gewinnt der lexikografisch kleinere Schluessel.
      // Das ist willkuerlich, aber deterministisch und wird auf der Seite als
      // Hinweis ausgewiesen, sobald ein Gleichstand auftritt.
      if (q > bestQuot || (q === bestQuot && bestKey !== null && k < bestKey)) {
        bestQuot = q;
        bestKey = k;
      }
    }
    if (bestKey === null) break;
    result[bestKey] += 1;
  }
  return result;
}

/**
 * Quotenverfahren mit groesstem Rest (Hare/Niemeyer).
 */
export function hareNiemeyer(shares, seats) {
  const keys = Object.keys(shares);
  const total = keys.reduce((acc, k) => acc + shares[k], 0);
  const result = Object.fromEntries(keys.map((k) => [k, 0]));
  if (!seats || seats <= 0 || total <= 0) return result;

  const exact = {};
  let assigned = 0;
  for (const k of keys) {
    exact[k] = (shares[k] / total) * seats;
    result[k] = Math.floor(exact[k]);
    assigned += result[k];
  }

  const rest = keys
    .map((k) => ({ k, r: exact[k] - Math.floor(exact[k]) }))
    .sort((a, b) => (b.r - a.r) || (a.k < b.k ? -1 : a.k > b.k ? 1 : 0));

  let i = 0;
  while (assigned < seats && i < rest.length) {
    result[rest[i].k] += 1;
    assigned += 1;
    i += 1;
  }
  return result;
}

/**
 * Wendet die Sperrklausel an und verteilt die Sitze nach dem konfigurierten Verfahren.
 * Gibt null zurueck, wenn die Parlamentskonfiguration nicht verifiziert ist.
 * Das ist Absicht: lieber keine Zahl als eine erfundene.
 *
 * FEHLERKORREKTUR 2026-08-16: Sammelkategorien wie "Sonstige" wurden zuvor wie
 * eine Partei behandelt und konnten Sitze erhalten, sobald ihr Wert die
 * Sperrklausel erreichte. Das ist falsch. "Sonstige" ist die Summe mehrerer
 * Parteien, von denen einzeln in aller Regel keine die Huerde nimmt. Ein
 * Sammelposten von sechs Prozent bedeutet gerade nicht, dass eine Partei mit
 * sechs Prozent in den Landtag einzieht. Solche Kategorien werden jetzt vor der
 * Zuteilung entfernt, unabhaengig von ihrem Wert.
 */
export function distribute(shares, parliamentConfig, options = {}) {
  if (!parliamentConfig || parliamentConfig.verified !== true) return null;
  const { seats, method, thresholdPercent } = parliamentConfig;
  if (!seats || !method) return null;

  const aggregates = new Set((options.aggregateCategories ?? ['Sonstige']).map((s) => s.toLowerCase()));
  const threshold = Number(thresholdPercent) || 0;

  const eligible = {};
  const excluded = [];
  const removedAggregates = [];

  for (const [party, value] of Object.entries(shares)) {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(`Ungueltiger Umfragewert fuer ${party}: ${value}`);
    }
    if (aggregates.has(party.toLowerCase())) {
      removedAggregates.push(party);
      continue;
    }
    // Die Sperrklausel lautet in den Wahlgesetzen "mindestens 5 vom Hundert".
    // Der Vergleich ist deshalb bewusst >= und nicht >. Bei exakt 5,0 Prozent
    // ist eine Partei beteiligt.
    if (threshold === 0 || value >= threshold) eligible[party] = value;
    else excluded.push(party);
  }

  if (Object.keys(eligible).length === 0) return null;

  let seatMap;
  if (method === 'sainte-lague') seatMap = sainteLague(eligible, seats);
  else if (method === 'hare-niemeyer') seatMap = hareNiemeyer(eligible, seats);
  else if (method === 'dhondt') seatMap = dHondt(eligible, seats);
  else return null;

  // Invariante: Es muessen genau so viele Sitze vergeben sein wie vorgesehen,
  // und keine negative Sitzzahl. Ein Verstoss ist ein Rechenfehler und darf
  // nicht stillschweigend auf die Seite gelangen.
  const assigned = Object.values(seatMap).reduce((a, b) => a + b, 0);
  if (assigned !== seats) {
    throw new Error(`Sitzzuteilung fehlerhaft: ${assigned} statt ${seats} Sitze vergeben.`);
  }
  if (Object.values(seatMap).some((v) => v < 0 || !Number.isInteger(v))) {
    throw new Error('Sitzzuteilung fehlerhaft: negative oder gebrochene Sitzzahl.');
  }

  return {
    seats: seatMap,
    totalSeats: seats,
    majority: Math.floor(seats / 2) + 1,
    method,
    thresholdPercent: threshold,
    excludedParties: excluded,
    removedAggregates,
    ties: detectTies(eligible, seats, method),
  };
}

/**
 * Erkennt Gleichstaende, bei denen der letzte Sitz nur durch die willkuerliche
 * Tiebreak-Regel des Programms vergeben wurde. Im echten Wahlrecht entscheidet
 * in diesen Faellen das Los. Wo das auftritt, muss es auf der Seite stehen,
 * statt eine Scheingenauigkeit vorzutaeuschen.
 */
export function detectTies(shares, seats, method) {
  const keys = Object.keys(shares);
  if (method === 'hare-niemeyer') {
    const total = keys.reduce((acc, k) => acc + shares[k], 0);
    if (total <= 0) return [];
    const rests = keys.map((k) => {
      const exact = (shares[k] / total) * seats;
      return { k, rest: exact - Math.floor(exact) };
    });
    const assignedFloor = rests.length ? keys.reduce((acc, k) => acc + Math.floor((shares[k] / total) * seats), 0) : 0;
    const open = seats - assignedFloor;
    if (open <= 0 || open >= rests.length) return [];
    const sorted = [...rests].sort((a, b) => b.rest - a.rest);
    const cutoff = sorted[open - 1].rest;
    const contenders = sorted.filter((r) => Math.abs(r.rest - cutoff) < 1e-9);
    // Ein geteilter Rest ist nur dann ein Gleichstand, wenn er auch umkaempft
    // ist. Teilen sich drei Parteien denselben Rest und sind noch drei Sitze
    // frei, bekommen alle drei einen; die Reihenfolge ist folgenlos. Gemeldet
    // wird deshalb nur, wenn mehr Parteien auf dem Cutoff-Rest liegen als dort
    // noch Sitze zu vergeben sind.
    const strictlyAbove = sorted.filter((r) => r.rest > cutoff + 1e-9).length;
    const seatsForContenders = open - strictlyAbove;
    return contenders.length > seatsForContenders ? contenders.map((c) => c.k) : [];
  }

  // Bei Divisorverfahren entsteht der relevante Gleichstand in der Runde, in
  // der der letzte Sitz vergeben wird. Teilen sich dort zwei oder mehr
  // Parteien die hoechste Quote, entscheidet im Programm die alphabetische
  // Reihenfolge, im Wahlrecht dagegen das Los. Genau dieser Fall muss auf der
  // Seite ausgewiesen werden.
  //
  // Vorherige Fassung war fehlerhaft: Sie verglich die Quoten NACH der Vergabe
  // mit der Gewinnquote. Da sich der Divisor der Siegerpartei durch den
  // erhaltenen Sitz bereits erhoeht hat, konnte dieser Vergleich einen echten
  // Gleichstand nie finden.
  const divisor = method === 'dhondt' ? (s) => s + 1 : (s) => 2 * s + 1;
  const result = Object.fromEntries(keys.map((k) => [k, 0]));
  let lastRoundContenders = [];

  for (let i = 0; i < seats; i += 1) {
    const quots = keys.map((k) => ({ k, q: shares[k] / divisor(result[k]) }));
    const best = Math.max(...quots.map((x) => x.q));
    const tied = quots.filter((x) => Math.abs(x.q - best) < 1e-9).map((x) => x.k);
    const winner = [...tied].sort()[0];
    result[winner] += 1;
    if (i === seats - 1) lastRoundContenders = tied;
  }

  return lastRoundContenders.length > 1 ? lastRoundContenders : [];
}
