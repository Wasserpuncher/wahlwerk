# Das Archiv

Quellen im Netz verschwinden. Betreiber geben auf, Seiten werden umgebaut, Datenbanken werden aufgeräumt, Institute nehmen alte Umfragen vom Netz. Dieses Archiv legt jede abgerufene Quelldatei unverändert und dauerhaft ab, damit später noch nachweisbar ist, was zu welchem Zeitpunkt veröffentlicht war, auch wenn das Original nicht mehr existiert.

## Wie es funktioniert

```
archive/objects/<ab>/<sha256>.json.gz   unveränderte Quelldatei, gzip
archive/manifest.jsonl                  append-only Protokoll, eine Zeile je Aufnahme
archive/index.json                      abgeleitete Übersicht, jederzeit neu berechenbar
```

**Inhaltsadressiert.** Der Dateiname ist der SHA-256 des Inhalts. Daraus folgt zweierlei: Eine unveränderte Quelle wird nicht doppelt gespeichert, ein täglicher Abruf kostet also nur dann Platz, wenn sich wirklich etwas geändert hat. Und jede Manipulation an einem Objekt ist sofort erkennbar, weil der Hash nicht mehr zum Dateinamen passt.

**Manipulationssichere Kette.** Jeder Manifest-Eintrag enthält den Hash des vorherigen Eintrags. Das funktioniert wie ein Logbuch mit fortlaufender Seitennummer: Wer einen alten Eintrag nachträglich ändert oder entfernt, bricht die Kette an dieser Stelle, und `verify` meldet genau die Zeile.

Das schützt nicht gegen jemanden, der das gesamte Archiv neu schreibt. Dagegen hilft die zweite Ebene: Jeder Snapshot wird als eigener Commit ins Git-Repository geschrieben und liegt damit mit Zeitstempel bei einem Dritten. Zusätzlich protokolliert der Workflow den Kettenkopf in die GitHub-Zusammenfassung, also außerhalb des Repositories. Wer fälschen will, müsste beides fälschen.

## Bedienung

```bash
npm run archive              # alle freigeschalteten Quellen abrufen und aufnehmen
npm run archive:verify       # Kette und alle Objekte prüfen
npm run archive:list         # Aufnahmen auflisten
node scripts/archive.mjs restore 42     # Aufnahme 42 nach data/ zurückspielen
node scripts/archive.mjs diff 41 42     # zwei Aufnahmen vergleichen
node scripts/archive.mjs export 42      # Aufnahme im Original auf stdout
```

Nach `restore` erzeugt `npm run build` die Seite im damaligen Stand, samt Hinweis im Kopf, dass ein Archivstand angezeigt wird und nicht der aktuelle. Das ist die Zeitmaschine: Man kann nachträglich rekonstruieren, wie die Lage an einem bestimmten Tag aussah.

## Was `diff` zeigt

Der Vergleich zweier Aufnahmen listet drei Dinge:

- **Neu**: Umfragen, die hinzugekommen sind. Der Normalfall.
- **Verschwunden**: Umfragen, die es vorher gab und jetzt nicht mehr. Genau dafür existiert dieses Archiv. Diese Datensätze sind ab dann nur noch hier vorhanden.
- **Nachträglich geändert**: Umfragen mit derselben Kennung, aber anderen Werten. Das kann eine Korrektur sein oder ein stiller Eingriff. Beides ist relevant und wäre ohne Archiv unsichtbar.

## Die Lizenzschranke

`config/sources.json` führt jede Quelle mit ihrem Lizenzstatus. Nur Quellen mit `enabled: true` werden abgerufen. Die Schranke ist bewusst restriktiv, denn ein Archiv, das rechtswidrig entstanden ist, müsste im Zweifel gelöscht werden und wäre damit wertlos.

| Status | Bedeutung | Archivierung |
|---|---|---|
| `frei-odbl` | Offene Datenbanklizenz mit Attributionspflicht | erlaubt |
| `amtlich` | Amtliches Werk nach § 5 UrhG, gemeinfrei | erlaubt |
| `unklar` | Keine ausdrückliche Lizenz | gesperrt |
| `verboten` | Untersagt oder durch robots.txt ausgeschlossen | gesperrt |

Aktuell freigeschaltet: die dawum-API und ihre Zeitstempeldatei, beide unter ODbL.

**Der bittere Punkt.** Die inhaltlich wertvollste Ergänzung wäre wahlrecht.de, weil dort Umfragen bis in die 1990er Jahre stehen und damit genau die Lücke vor 2017 gefüllt wäre, in der die dawum-Datenbank beginnt. Diese Quelle ist aber die rechtlich heikelste: Die Zusammenstellung ist eine Datenbank im Sinne der §§ 87a ff. UrhG, und ihre vollständige Übernahme wäre die Übernahme eines wesentlichen Teils. Sie bleibt deshalb gesperrt, bis eine schriftliche Erlaubnis der Betreiber vorliegt. Das ist die ehrliche Antwort, auch wenn sie unbequem ist: Der Wunsch, alles zu haben, rechtfertigt nicht jeden Weg dorthin.

Der richtige nächste Schritt ist deshalb kein Skript, sondern eine E-Mail an Wilko Zicht und Matthias Cantow mit der Bitte um Archivierungserlaubnis.

## Plausibilitätsprüfung vor der Aufnahme

Ein Archiv, das stillschweigend eine Fehlerseite speichert, ist schlimmer als keins. Vor jeder Aufnahme wird geprüft:

- Mindestgröße der Antwort, gegen Fehler- und Wartungsseiten
- Pflichtbestandteile im Inhalt, etwa die Blöcke `Surveys`, `Parliaments`, `Parties`
- bei bekannten Formaten: die Antwort wird geparst, und eine Datei ohne verwertbare Umfragen wird abgelehnt
- leerer Inhalt wird immer abgelehnt

Schlägt eine Prüfung fehl, wird nichts gespeichert und der Lauf endet mit einem Fehler. Der letzte gute Stand bleibt unangetastet.

## Historische Wahlergebnisse

Amtliche Wahlergebnisse sind nach § 5 UrhG gemeinfrei und dürfen dauerhaft gespeichert und wiedergegeben werden. Erfasst sind bisher die Landtagswahlen in Sachsen-Anhalt von 1998 bis 2021, in `config/elections.json`.

Jeder Eintrag trägt eine Beleglage. Nur die Wahl 2021 ist als geprüft markiert, weil dafür zwei unabhängige Quellen übereinstimmen. Die übrigen stützen sich bisher auf eine Quelle. Sie werden auf der Seite wiedergegeben und ausdrücklich als ungeprüft gekennzeichnet, gehen aber in **keine Berechnung** ein: weder in den Wahlvergleich noch in eine Institutsabweichung. Wiedergeben und Rechnen sind zwei verschiedene Dinge.

Die Wahlen 1990 und 1994 fehlen. Sie stehen beim Statistischen Landesamt Sachsen-Anhalt und müssen von dort übernommen werden. Sie werden bewusst nicht aus dem Gedächtnis ergänzt.

Der Build prüft für jede erfasste Wahl, ob die Summe der Anteile im Bereich von 100 Prozent liegt. Eine grob abweichende Summe deutet auf einen Tippfehler oder eine fehlende Partei hin und bricht den Lauf ab.

## Grenzen

- Das Archiv beginnt an dem Tag, an dem es eingerichtet wird. Was vorher verschwunden ist, ist verschwunden. Ein Archiv kann nur nach vorn wirken.
- Die dawum-Datenbank enthält Umfragen ab 2017. Ältere Werte fehlen und lassen sich über diese Quelle nicht nachholen.
- Gespeichert wird die Quelldatei, nicht die Website drumherum. Wer auch die Darstellung erhalten will, braucht zusätzlich einen Seitenmitschnitt, etwa über die Wayback Machine.
- Ein einzelnes Git-Repository ist ein einzelner Aufbewahrungsort. Für ernsthafte Langzeitsicherung gehört mindestens eine Kopie auf ein anderes Medium bei einem anderen Anbieter. Die Kettenhashes machen dann überprüfbar, dass beide Kopien denselben Bestand haben.
