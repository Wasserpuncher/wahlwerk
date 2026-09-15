// Wahlwerk - Normalisierung der Daten von abgeordnetenwatch.de
// Lizenz: AGPL-3.0-or-later
//
// Die API liefert reichlich verschachtelte Objekte. Hier wird daraus eine
// flache, stabile Struktur, die der Generator ohne Kenntnis der API-Details
// verwenden kann. Auffaelligkeiten werden protokolliert, nicht stillschweigend
// geglaettet.

/**
 * Die Parteibezeichnungen bei abgeordnetenwatch weichen von denen der
 * Umfragedatenbank ab. Die Zuordnung ist bewusst explizit. Was hier fehlt,
 * bleibt unter der Originalbezeichnung stehen und wird als Auffaelligkeit
 * vermerkt, statt still zu verschwinden.
 */
const PARTEI_ZUORDNUNG = {
  CDU: 'CDU',
  CSU: 'CSU',
  AfD: 'AfD',
  SPD: 'SPD',
  FDP: 'FDP',
  'DIE LINKE': 'Linke',
  'Die Linke': 'Linke',
  LINKE: 'Linke',
  'BÜNDNIS 90/DIE GRÜNEN': 'Grüne',
  'GRÜNE': 'Grüne',
  BSW: 'BSW',
  'FREIE WÄHLER': 'FW',
  'Freie Wähler': 'FW',
};

/**
 * Parteien, die in der Umfragedatenbank bewusst keine eigene Entsprechung
 * haben. Sie werden dort unter "Sonstige" gefuehrt. Sie hier aufzulisten
 * trennt den Normalfall von einer echten Luecke in der Zuordnung.
 */
const OHNE_ENTSPRECHUNG = new Set([
  'Die Heimat',
  'Die PARTEI',
  'Einzelbewerbung',
  'Gartenpartei',
  'PdF',
  'Tierschutzallianz',
  'Tierschutzpartei',
  'Volt',
  'dieBasis',
]);

/**
 * Entfernt unsichtbare Zeichen aus einer Parteibezeichnung.
 *
 * Notwendig, weil abgeordnetenwatch die Gruenen als "BÜNDNIS 90/[U+00AD]DIE
 * GRÜNEN" fuehrt, mit einem weichen Trennzeichen hinter dem Schraegstrich. Ohne
 * diese Bereinigung schlaegt jeder Zeichenkettenvergleich fehl, und zwar
 * unsichtbar: die Bezeichnung sieht im Protokoll voellig normal aus.
 * Behandelt werden weiches Trennzeichen, Breitenull, geschuetzte Leerzeichen
 * und Steuerzeichen fuer die Schreibrichtung.
 */
export function bereinigeBezeichnung(label) {
  if (!label) return label;
  return String(label)
    // U+00AD weiches Trennzeichen, U+200B bis U+200F Breitenull und
    // Richtungsmarken, U+2060 Wortverbinder, U+FEFF Byte-Order-Mark.
    .replace(/[\u00AD\u200B-\u200F\u2060\uFEFF]/g, '')
    // U+00A0 geschuetztes und U+202F schmales geschuetztes Leerzeichen
    // auf ein normales Leerzeichen bringen.
    .replace(/[\u00A0\u202F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function zuordnePartei(label) {
  if (!label) return null;
  const sauber = bereinigeBezeichnung(label);
  return PARTEI_ZUORDNUNG[sauber] ?? sauber;
}

/** True, wenn die Partei in der Umfragedatenbank keine eigene Entsprechung hat. */
export function hatEntsprechung(label) {
  const sauber = bereinigeBezeichnung(label);
  return sauber in PARTEI_ZUORDNUNG;
}

/**
 * Zieht die Wahlkreisnummer aus einem Wahlkreisobjekt. Die API fuehrt sie im
 * Feld number; ist es leer, steht sie als Praefix im Label ("13 - Magdeburg IV").
 */
function wahlkreisNummer(wk) {
  if (Number.isFinite(wk?.number)) return wk.number;
  const m = String(wk?.label ?? '').match(/^\s*(\d+)\s*-/);
  return m ? Number(m[1]) : null;
}

/** Entfernt den Wahlperiodenzusatz aus einem Label: "13 - Magdeburg IV (Sachsen-Anhalt Wahl 2026)". */
function wahlkreisName(label) {
  if (!label) return null;
  return String(label)
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/^\s*\d+\s*-\s*/, '')
    .trim();
}

export function normalisiere({ periode, wahlkreise, kandidaturen, mandate }) {
  const probleme = [];

  const wahlkreisListe = wahlkreise
    .map((wk) => ({
      id: wk.id,
      nummer: wahlkreisNummer(wk),
      name: wahlkreisName(wk.label),
      url: wk.abgeordnetenwatch_url ?? null,
    }))
    .sort((a, b) => (a.nummer ?? 0) - (b.nummer ?? 0));

  for (const wk of wahlkreisListe) {
    if (wk.nummer === null) probleme.push(`Wahlkreis ohne erkennbare Nummer: ${wk.name ?? wk.id}`);
  }

  const kandidaturListe = kandidaturen.map((k) => {
    const ed = k.electoral_data ?? {};
    const wk = ed.constituency ?? null;
    return {
      id: k.id,
      politikerId: k.politician?.id ?? null,
      name: k.politician?.label ?? null,
      profil: k.politician?.abgeordnetenwatch_url ?? null,
      parteiOriginal: k.party?.label ?? null,
      partei: zuordnePartei(k.party?.label),
      wahlkreisId: wk?.id ?? null,
      wahlkreisNummer: wk ? wahlkreisNummer(wk) : null,
      wahlkreisName: wk ? wahlkreisName(wk.label) : null,
      listenplatz: ed.list_position ?? null,
      liste: ed.electoral_list?.label ?? null,
      // Diese drei Felder fuellt abgeordnetenwatch erst nach der Wahl. Solange
      // sie null sind, ist dort nichts erfasst, und das ist keine Aussage
      // darueber, dass jemand kein Mandat gewonnen hat.
      mandatGewonnen: ed.mandate_won ?? null,
      wahlkreisErgebnis: ed.constituency_result ?? null,
      wahlkreisStimmen: ed.constituency_result_count ?? null,
    };
  });

  const mandatListe = mandate.map((m) => ({
    id: m.id,
    politikerId: m.politician?.id ?? null,
    name: m.politician?.label ?? null,
    profil: m.politician?.abgeordnetenwatch_url ?? null,
    parteiOriginal: m.party?.label ?? null,
    partei: zuordnePartei(m.party?.label),
    wahlkreisNummer: m.electoral_data?.constituency ? wahlkreisNummer(m.electoral_data.constituency) : null,
    listenplatz: m.electoral_data?.list_position ?? null,
    beginn: m.start_date ?? null,
    ende: m.end_date ?? null,
  }));

  // Direktkandidaturen je Wahlkreis und Partei. Grundlage fuer die Zuordnung
  // eines Namens zu einem amtlich gewonnenen Wahlkreis.
  const direktkandidaten = new Map();
  for (const k of kandidaturListe) {
    if (k.wahlkreisNummer === null || !k.partei) continue;
    const schluessel = `${k.wahlkreisNummer}|${k.partei}`;
    if (!direktkandidaten.has(schluessel)) direktkandidaten.set(schluessel, []);
    direktkandidaten.get(schluessel).push(k);
  }

  const mehrfach = [...direktkandidaten.entries()].filter(([, v]) => v.length > 1);
  for (const [schluessel, v] of mehrfach) {
    probleme.push(
      `Mehr als eine Direktkandidatur fuer ${schluessel.replace('|', ', Partei ')}: ${v.map((x) => x.name).join(', ')}. Eine Zuordnung unterbleibt.`,
    );
  }

  // Parteien ohne Entsprechung in der Umfragedatenbank sind der Normalfall:
  // Kleinparteien tauchen in Sonntagsfragen nur als Sammelposten auf. Gemeldet
  // wird deshalb nur, was weder zugeordnet noch ausdruecklich als
  // entsprechungslos bekannt ist. Genau dort steckt eine echte Luecke, etwa
  // eine neue Schreibweise oder ein unsichtbares Zeichen im Namen.
  const unbekannt = [
    ...new Set(
      kandidaturListe
        .map((k) => bereinigeBezeichnung(k.parteiOriginal))
        .filter((name) => name && !(name in PARTEI_ZUORDNUNG) && !OHNE_ENTSPRECHUNG.has(name)),
    ),
  ];
  if (unbekannt.length > 0) {
    probleme.push(
      `Parteibezeichnung weder zugeordnet noch als entsprechungslos bekannt: ${unbekannt.join(', ')}. Bitte in scripts/lib/abgeordnetenwatch.mjs pruefen.`,
    );
  }

  return {
    periode: {
      id: periode.id,
      label: periode.label,
      typ: periode.type,
      wahltag: periode.election_date ?? null,
      beginn: periode.start_date_period ?? null,
      ende: periode.end_date_period ?? null,
      url: periode.abgeordnetenwatch_url ?? null,
    },
    wahlkreise: wahlkreisListe,
    kandidaturen: kandidaturListe,
    mandate: mandatListe,
    probleme,
  };
}

/**
 * Verknuepft das amtliche Wahlkreisergebnis mit den Direktkandidaturen und
 * benennt, wer einen Wahlkreis direkt gewonnen hat.
 *
 * Die Ableitung lautet: Steht amtlich fest, dass Partei X den Wahlkreis Y
 * gewonnen hat, und hat Partei X in Wahlkreis Y genau eine Direktkandidatur,
 * dann ist diese Person die oder der direkt Gewaehlte. Das ist zulaessig, weil
 * jede Partei je Wahlkreis nur einen Kreiswahlvorschlag einreichen kann.
 *
 * Trotzdem ist das eine ABLEITUNG und keine amtliche Feststellung. Sie wird
 * deshalb als solche gekennzeichnet und unterbleibt, sobald etwas nicht
 * eindeutig ist. Sobald abgeordnetenwatch die Mandate erfasst hat, tritt die
 * dort hinterlegte Angabe an ihre Stelle; sie ist die bessere Quelle.
 */
export function verknuepfeWahlkreise(amtlicheWahlkreise, awDaten) {
  if (!awDaten) return null;

  const nachNummer = new Map();
  for (const k of awDaten.kandidaturen) {
    if (k.wahlkreisNummer === null || !k.partei) continue;
    const s = `${k.wahlkreisNummer}|${k.partei}`;
    if (!nachNummer.has(s)) nachNummer.set(s, []);
    nachNummer.get(s).push(k);
  }

  // Erfasste Mandate haben Vorrang vor jeder Ableitung.
  const mandatNachWahlkreis = new Map();
  for (const m of awDaten.mandate ?? []) {
    if (m.wahlkreisNummer !== null) mandatNachWahlkreis.set(m.wahlkreisNummer, m);
  }

  // Wahlkreisnamen der Gegenseite, um die Verknuepfung ueber die Nummer
  // gegenzupruefen. Die amtliche Quelle fuehrt die Nummer dreistellig als
  // Zeichenkette ("041"), abgeordnetenwatch als Zahl (41).
  const nameNachNummer = new Map();
  for (const wk of awDaten.wahlkreise ?? []) {
    if (wk.nummer !== null) nameNachNummer.set(wk.nummer, wk.name);
  }
  const vergleichbar = (a, b) =>
    bereinigeBezeichnung(a ?? '').toLowerCase().replace(/[^a-zäöüß]/g, '') ===
    bereinigeBezeichnung(b ?? '').toLowerCase().replace(/[^a-zäöüß]/g, '');

  let zugeordnet = 0;
  let ausMandat = 0;
  const namensabweichungen = [];

  const zeilen = amtlicheWahlkreise.map((wk) => {
    const nummer = Number(wk.nummer);
    if (!Number.isInteger(nummer)) {
      return { ...wk, gewaehltName: null, gewaehltProfil: null, herkunft: 'keine-nummer' };
    }

    // Stimmen die Namen zu derselben Nummer nicht ueberein, ist die Zuordnung
    // nicht vertrauenswuerdig. Dann wird kein Name ausgewiesen.
    const gegenName = nameNachNummer.get(nummer);
    if (gegenName && !vergleichbar(gegenName, wk.name)) {
      namensabweichungen.push(`Wahlkreis ${nummer}: amtlich "${wk.name}", abgeordnetenwatch "${gegenName}"`);
      return { ...wk, gewaehltName: null, gewaehltProfil: null, herkunft: 'namensabweichung' };
    }

    const mandat = mandatNachWahlkreis.get(nummer);

    if (mandat) {
      ausMandat += 1;
      zugeordnet += 1;
      return {
        ...wk,
        gewaehltName: mandat.name,
        gewaehltProfil: mandat.profil,
        herkunft: 'mandat',
      };
    }

    const treffer = nachNummer.get(`${nummer}|${wk.sieger}`) ?? [];
    if (treffer.length === 1) {
      zugeordnet += 1;
      return {
        ...wk,
        gewaehltName: treffer[0].name,
        gewaehltProfil: treffer[0].profil,
        herkunft: 'abgeleitet',
      };
    }

    return {
      ...wk,
      gewaehltName: null,
      gewaehltProfil: null,
      herkunft: treffer.length > 1 ? 'mehrdeutig' : 'nicht-erfasst',
    };
  });

  return {
    zeilen,
    zugeordnet,
    ausMandat,
    abgeleitet: zugeordnet - ausMandat,
    gesamt: amtlicheWahlkreise.length,
    namensabweichungen,
  };
}
