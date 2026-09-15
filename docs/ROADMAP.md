# Roadmap

Diese Liste sagt, was fehlt. Sie ist bewusst konkret, damit erkennbar bleibt, was das Projekt heute kann und was nicht.

## v0.2 Amtliche Ergebnisse — teilweise erledigt

**Erledigt am 15.09.2026 für Sachsen-Anhalt:**

- Import amtlicher Ergebnisse aus den Dateien der Landeswahlleitung (`scripts/import-wahlergebnis.mjs`), mit vier erzwungenen Kontrollsummen
- Institutsabweichung: letzte Umfrage je Institut im Fenster vor der Wahl gegen das amtliche Ergebnis, mittlere absolute Abweichung je Partei und je Institut (`scripts/lib/accuracy.mjs`)
- Die Auswertung verweigert sich bei synthetischen Daten. Eine Genauigkeitsangabe aus erfundenen Umfragen wäre die schädlichste Zahl, die dieses Projekt ausgeben könnte
- Wahlkreise und Direktmandate, verknüpft mit Kandidaturen von abgeordnetenwatch.de
- Der Abschnitt zur Institutsgenauigkeit sitzt auf der Parlamentsseite, ein eigener Seitentyp war dafür nicht nötig

**Was aus v0.2 offen bleibt:**

- Import der Bundestagswahlergebnisse von der Bundeswahlleiterin als CSV
- Die übrigen fünfzehn Landeswahlleitungen. Der Importer ist auf das Format des Statistischen Landesamtes Sachsen-Anhalt zugeschnitten; jedes weitere Land braucht eine eigene Zuordnung der Spalten und Parteibezeichnungen
- Institutsabweichung über **mehrere** Wahlen. Erst dann wird aus einer Momentaufnahme eine belastbare Aussage. Die jetzige Auswertung sagt das auf der Seite auch ausdrücklich

**Eine Lehre aus der ersten Umsetzung.** Das Fenster vor der Wahl war ursprünglich mit 30 Tagen geplant. Bei der Landtagswahl Sachsen-Anhalt 2026 endete die letzte Umfrage von Infratest dimap 40 Tage vor dem Wahltag. Ein Fenster von 30 Tagen hätte dieses Institut vollständig ausgeschlossen, ohne dass das auf der Seite sichtbar geworden wäre. Der Wert ist deshalb in `config/site.json` konfigurierbar und steht auf 45 Tagen, wie das Trendfenster. Wer ihn verkleinert, sollte prüfen, welche Institute dabei verschwinden.

## v0.3 Verifizierte Sitzverteilungen

- `config/parliaments.json` Zeile für Zeile gegen die Landeswahlgesetze prüfen
- Je Eintrag Sitzzahl, Verfahren, Sperrklausel, Fundstelle und Prüfdatum
- Sonderfälle sauber behandeln oder ausdrücklich ausschließen: Bayern mit Gesamtstimmen, Bremen mit getrennten Wahlbereichen, Schleswig-Holstein mit der SSW-Befreiung, Grundmandatsklauseln

Bis dahin bleibt der Abschnitt außer beim Bundestag leer. Das ist Absicht.

## v0.4 Zeitreihen und Verlauf

- Verlaufsdiagramm je Partei und Parlament als serverseitig gerendertes SVG, weiterhin ohne JavaScript
- LOESS oder gleitender gewichteter Mittelwert, Verfahren offengelegt und getestet
- Vergleich zweier Institute im selben Zeitraum

## v0.5 Abdeckung erweitern

- ~~abgeordnetenwatch-API für Abgeordnete, Wahlkreise und Kandidaturen, Fair Use mit 30 Anfragen pro Minute beachten~~ — **erledigt am 15.09.2026**, siehe `scripts/fetch-abgeordnetenwatch.mjs`. Angebunden sind Wahlperioden, Wahlkreise, Kandidaturen und Mandate. Der Abruf hält 2,5 Sekunden Abstand je Anfrage und damit rund 24 statt 30 je Minute
- Weitere Entitäten derselben API: Ausschüsse, Abstimmungsverhalten, Politikerprofile
- Mandate der 9. Wahlperiode Sachsen-Anhalt nachziehen, sobald abgeordnetenwatch.de sie erfasst hat. Bis dahin sind die Namen der direkt Gewählten abgeleitet und als solche gekennzeichnet. Ein erneutes `npm run fetch:aw` genügt, der Vorrang der erfassten Mandate ist im Code angelegt
- Bundestag Open Data für Abstimmungen und Drucksachen
- Strukturdaten der Wahlkreise für Korrelationen, die es sonst nirgends gibt

## Offene Grundsatzfragen

**Zeitreihen vor 2017.** Die genutzte Quelle beginnt 2017. Für längere Reihen bräuchte es eine zweite Quelle mit klarer Lizenz. Das Auslesen fremder Tabellenseiten ist lizenzrechtlich nicht sauber und deshalb keine Option.

**Seitenanzahl.** Bei starkem Wachstum können tausende Einzelumfrageseiten als minderwertiger Inhalt eingestuft werden. Dann `build.generateSurveyPages` abschalten und Einzelumfragen nur in Tabellen führen. Die Belege bleiben über den Datenexport erhalten.

**Hauseffekte.** Eine Korrektur systematischer Institutsabweichungen wäre statistisch interessant, würde aber aus der Wiedergabe eine Modellrechnung machen. Falls sie kommt, dann nur als klar getrennte, zusätzliche Ansicht, niemals als Ersatz für die veröffentlichten Werte.
