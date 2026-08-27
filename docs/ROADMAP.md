# Roadmap

Diese Liste sagt, was fehlt. Sie ist bewusst konkret, damit erkennbar bleibt, was das Projekt heute kann und was nicht.

## v0.2 Amtliche Ergebnisse

- Import der Bundestagswahlergebnisse von der Bundeswahlleiterin als CSV
- Ableitung der Institutsabweichung: letzte Umfrage je Institut innerhalb von 30 Tagen vor der Wahl gegen das amtliche Ergebnis, mittlere absolute Abweichung je Partei
- Damit wird aus einer behaupteten Zuverlässigkeit eine belegte
- Neue Seiten: Wahl, Institutsgenauigkeit

Offene Frage: Für Landtagswahlen müssen 16 Landeswahlleitungen einzeln erschlossen werden. Uneinheitliche Formate, hoher Aufwand.

## v0.3 Verifizierte Sitzverteilungen — am 27.08.2026 erledigt

- `config/parliaments.json` Zeile für Zeile gegen die Landeswahlgesetze geprüft ✔
- Je Eintrag Sitzzahl, Verfahren, Sperrklausel, Fundstelle und Prüfdatum ✔
- Sonderfälle behandelt oder ausdrücklich ausgeschlossen ✔
  - Bayern mit Gesamtstimmen und sieben getrennten Zuteilungen: **ausgeschlossen**, mit Begründung auf der Seite
  - Bremen mit getrennten Wahlbereichen: **ausgeschlossen**, mit Begründung auf der Seite
  - Schleswig-Holstein mit der SSW-Befreiung: **umgesetzt** über `exemptFromThreshold`
  - Grundmandatsklauseln: durchgehend **nicht modelliert** und je Eintrag als solche benannt, weil sie sich aus einer Zweitstimmenumfrage nicht ableiten lassen

15 Parlamente sind freigeschaltet, zwei bewusst gesperrt. Zwei Verfahrensangaben, bei denen verbreitete Quellen veraltet sind: Sachsen rechnet seit 2023 nach Sainte-Laguë statt d'Hondt, Niedersachsen seit März 2026. Das Saarland ist das letzte Land mit d'Hondt.

## v0.4 Was an der Unsicherheitsrechnung noch fehlt

Der ausgewiesene effektive Stichprobenumfang nach Kish entspricht bei annähernd gleichen Gewichten fast der Summe der Befragten. Die Varianz **zwischen** den Instituten geht nicht ein; gerechnet wird, als wären alle Befragten eine einzige Zufallsstichprobe. Das ist auf der Seite als untere Schranke gekennzeichnet, aber es bleibt eine Untertreibung der wahren Unsicherheit.

- `trend.designEffect` steht auf 1,0 und damit auf der unteren Schranke. Ein höherer Wert braucht einen **belegten** Quellennachweis, sonst ist er geraten.
- Eine saubere Alternative wäre eine Varianzzerlegung: Stichprobenfehler plus gemessene Streuung zwischen den Instituten im selben Fenster. Die Streuung wird bereits erhoben und angezeigt, geht aber nicht in das Intervall ein.
- Solange beides offen ist, gilt: Die Fehlerbalken sind zu schmal. Wer sie zitiert, muss das mitzitieren.

## v0.5 Zeitreihen und Verlauf

- Verlaufsdiagramm je Partei und Parlament als serverseitig gerendertes SVG, weiterhin ohne JavaScript
- LOESS oder gleitender gewichteter Mittelwert, Verfahren offengelegt und getestet
- Vergleich zweier Institute im selben Zeitraum

## v0.6 Abdeckung erweitern

- abgeordnetenwatch-API für Abgeordnete, Wahlkreise und Kandidaturen, Fair Use mit 30 Anfragen pro Minute beachten
- Bundestag Open Data für Abstimmungen und Drucksachen
- Strukturdaten der Wahlkreise für Korrelationen, die es sonst nirgends gibt

## Offene Grundsatzfragen

**Zeitreihen vor 2017.** Die genutzte Quelle beginnt 2017. Für längere Reihen bräuchte es eine zweite Quelle mit klarer Lizenz. Das Auslesen fremder Tabellenseiten ist lizenzrechtlich nicht sauber und deshalb keine Option.

**Seitenanzahl.** Bei starkem Wachstum können tausende Einzelumfrageseiten als minderwertiger Inhalt eingestuft werden. Dann `build.generateSurveyPages` abschalten und Einzelumfragen nur in Tabellen führen. Die Belege bleiben über den Datenexport erhalten.

**Hauseffekte.** Eine Korrektur systematischer Institutsabweichungen wäre statistisch interessant, würde aber aus der Wiedergabe eine Modellrechnung machen. Falls sie kommt, dann nur als klar getrennte, zusätzliche Ansicht, niemals als Ersatz für die veröffentlichten Werte.
