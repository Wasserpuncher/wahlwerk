// Wahlwerk - Koalitionsrechner
// Lizenz: AGPL-3.0-or-later
//
// Rein arithmetisch. Es wird jede Parteienkombination geprueft, die eine
// Mehrheit der Sitze erreicht. Es findet keine Bewertung statt, welche
// Koalition politisch denkbar, wahrscheinlich oder wuenschenswert waere.
// Ausschluesse aufgrund von Parteitagsbeschluessen werden bewusst nicht
// modelliert, weil sie sich aendern und weil ihre Auswahl eine redaktionelle
// Wertung waere. Ausgegeben werden nur MINIMALE Mehrheiten, also solche, bei
// denen keine Partei entfernt werden kann, ohne die Mehrheit zu verlieren.

export function findCoalitions(seatMap, majority, maxPartners = 4) {
  const parties = Object.entries(seatMap)
    .filter(([, s]) => s > 0)
    .map(([p, s]) => ({ party: p, seats: s }))
    .sort((a, b) => b.seats - a.seats);

  const results = [];
  const n = parties.length;

  for (let mask = 1; mask < 1 << n; mask += 1) {
    const members = [];
    let seats = 0;
    for (let i = 0; i < n; i += 1) {
      if (mask & (1 << i)) {
        members.push(parties[i]);
        seats += parties[i].seats;
      }
    }
    if (members.length > maxPartners) continue;
    if (seats < majority) continue;

    // Minimalitaet pruefen: keine Partei darf entbehrlich sein.
    const minimal = members.every((m) => seats - m.seats < majority);
    if (!minimal) continue;

    results.push({
      parties: members.map((m) => m.party),
      seats,
      majority,
      surplus: seats - majority,
      partnerCount: members.length,
    });
  }

  return results.sort(
    (a, b) => a.partnerCount - b.partnerCount || b.seats - a.seats || a.parties.join().localeCompare(b.parties.join()),
  );
}

/**
 * Prueft, ob es ohne eine bestimmte Partei ueberhaupt eine Mehrheit gibt, und
 * zwar UNABHAENGIG von der Partnerzahl.
 *
 * Diese Funktion gibt es, weil die Obergrenze maxPartners in findCoalitions
 * sonst eine inhaltliche Aussage verfaelschen kann. Realer Fall: Im Landtag
 * von Sachsen-Anhalt der 9. Wahlperiode enthalten alle minimalen Mehrheiten
 * mit bis zu vier Partnern die staerkste Partei. Eine Mehrheit ohne sie
 * existiert aber sehr wohl, sie braucht nur fuenf Partner. Wer nur die Liste
 * der Viererbuendnisse sieht, zieht daraus einen falschen Schluss.
 *
 * Zurueckgegeben wird die kleinste solche Mehrheit, gemessen an der Zahl der
 * Partner, bei Gleichstand an der Sitzzahl.
 */
export function mehrheitOhne(seatMap, majority, ausgeschlossen) {
  const uebrige = Object.entries(seatMap).filter(([p, s]) => s > 0 && p !== ausgeschlossen);
  const summe = uebrige.reduce((a, [, s]) => a + s, 0);
  if (summe < majority) return null;

  const n = uebrige.length;
  let beste = null;
  for (let mask = 1; mask < 1 << n; mask += 1) {
    const members = [];
    let seats = 0;
    for (let i = 0; i < n; i += 1) {
      if (mask & (1 << i)) {
        members.push(uebrige[i]);
        seats += uebrige[i][1];
      }
    }
    if (seats < majority) continue;
    if (!members.every(([, s]) => seats - s < majority)) continue; // nur minimale
    const kandidat = {
      parties: members.map(([p]) => p),
      seats,
      majority,
      surplus: seats - majority,
      partnerCount: members.length,
    };
    if (!beste || kandidat.partnerCount < beste.partnerCount || (kandidat.partnerCount === beste.partnerCount && kandidat.seats > beste.seats)) {
      beste = kandidat;
    }
  }
  return beste;
}
