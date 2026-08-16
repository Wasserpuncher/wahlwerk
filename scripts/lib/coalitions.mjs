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
