# Roadmap

Diese Liste sagt, was fehlt. Sie ist bewusst konkret, damit erkennbar bleibt, was das Projekt heute kann und was nicht.

## v0.2 Amtliche Ergebnisse

- Import der Bundestagswahlergebnisse von der Bundeswahlleiterin als CSV
- Ableitung der Institutsabweichung: letzte Umfrage je Institut innerhalb von 30 Tagen vor der Wahl gegen das amtliche Ergebnis, mittlere absolute Abweichung je Partei
- Damit wird aus einer behaupteten Zuverlässigkeit eine belegte
- Neue Seiten: Wahl, Institutsgenauigkeit

Offene Frage: Für Landtagswahlen müssen 16 Landeswahlleitungen einzeln erschlossen werden. Uneinheitliche Formate, hoher Aufwand.

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

- abgeordnetenwatch-API für Abgeordnete, Wahlkreise und Kandidaturen, Fair Use mit 30 Anfragen pro Minute beachten
- Bundestag Open Data für Abstimmungen und Drucksachen
- Strukturdaten der Wahlkreise für Korrelationen, die es sonst nirgends gibt

## Offene Grundsatzfragen

**Zeitreihen vor 2017.** Die genutzte Quelle beginnt 2017. Für längere Reihen bräuchte es eine zweite Quelle mit klarer Lizenz. Das Auslesen fremder Tabellenseiten ist lizenzrechtlich nicht sauber und deshalb keine Option.

**Seitenanzahl.** Bei starkem Wachstum können tausende Einzelumfrageseiten als minderwertiger Inhalt eingestuft werden. Dann `build.generateSurveyPages` abschalten und Einzelumfragen nur in Tabellen führen. Die Belege bleiben über den Datenexport erhalten.

**Hauseffekte.** Eine Korrektur systematischer Institutsabweichungen wäre statistisch interessant, würde aber aus der Wiedergabe eine Modellrechnung machen. Falls sie kommt, dann nur als klar getrennte, zusätzliche Ansicht, niemals als Ersatz für die veröffentlichten Werte.
