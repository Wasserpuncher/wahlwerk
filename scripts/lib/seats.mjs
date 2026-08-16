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
 */
export function distribute(shares, parliamentConfig) {
  if (!parliamentConfig || parliamentConfig.verified !== true) return null;
  const { seats, method, thresholdPercent } = parliamentConfig;
  if (!seats || !method) return null;

  const threshold = Number(thresholdPercent) || 0;
  const eligible = {};
  const excluded = [];
  for (const [party, value] of Object.entries(shares)) {
    if (value >= threshold && threshold > 0) eligible[party] = value;
    else if (threshold === 0) eligible[party] = value;
    else excluded.push(party);
  }
  if (Object.keys(eligible).length === 0) return null;

  let seatMap;
  if (method === 'sainte-lague') seatMap = sainteLague(eligible, seats);
  else if (method === 'hare-niemeyer') seatMap = hareNiemeyer(eligible, seats);
  else if (method === 'dhondt') seatMap = dHondt(eligible, seats);
  else return null;

  return {
    seats: seatMap,
    totalSeats: seats,
    majority: Math.floor(seats / 2) + 1,
    method,
    thresholdPercent: threshold,
    excludedParties: excluded,
  };
}
