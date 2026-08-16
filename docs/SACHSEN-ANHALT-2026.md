# Sachsen-Anhalt, Landtagswahl am 6. September 2026

Stand dieses Dokuments: 16. August 2026. Alle Zahlen mit Quelle. Was hier nicht belegt ist, steht nicht drin.

## Rechtsrahmen, verifiziert

| Angabe | Wert | Quelle |
|---|---|---|
| Wahltag | 6. September 2026 | Beschluss des Landtags vom 13. Mai 2025 |
| Sitze, gesetzliche Mindestzahl | 83 | Landeswahlleitung Sachsen-Anhalt, Wahlsystem |
| davon Direktmandate | 41 aus 41 Wahlkreisen | § 10 LWG LSA |
| davon Listenmandate | mindestens 42 | Landeswahlleitung |
| Zuteilungsverfahren | Hare/Niemeyer | Landeswahlleitung |
| Sperrklausel | 5 Prozent der gültigen Zweitstimmen | Landeswahlleitung |
| Mehrheit im Modell | 42 Sitze | 83 / 2 aufgerundet |
| Wahlberechtigte | rund 1,7 Millionen | Landeszentrale für politische Bildung |

Quelle für die Systemangaben: <https://wahlen.sachsen-anhalt.de/zu-den-wahlen/allgemeine-informationen-zur-landtagswahl/wahlsystem>

Damit ist Sachsen-Anhalt in `config/parliaments.json` auf `verified: true` gesetzt und die Sitzrechnung im Generator freigeschaltet.

## Die entscheidende Einschränkung

Der Landtag hat **mindestens** 83 Sitze. Überhang- und Ausgleichsmandate können ihn vergrößern, in der laufenden 8. Wahlperiode auf 97. Eine Sonntagsfrage erhebt die Zweitstimmenabsicht und sagt nichts über gewonnene Wahlkreise. Überhangmandate lassen sich daraus grundsätzlich nicht ableiten.

Jede Sitzrechnung auf Umfragebasis, auch die hier, unterstellt also 83 Sitze und keine Direktmandatsverzerrung. Bei einer Partei, die nach Umfragen rund 42 Prozent der Zweitstimmen erreicht und damit einen Großteil der 41 Wahlkreise gewinnen dürfte, ist genau das die kritische Annahme. Wer die Zahl ohne diesen Vorbehalt zitiert, zitiert sie falsch.

Zweiter, im Modell ebenfalls nicht abgebildeter Fall: Wahlkreissitze von Bewerbern ohne zugelassene Landesliste oder von Parteien unterhalb der Sperrklausel werden nach dem Gesetz von den 83 Sitzen abgezogen, bevor verteilt wird.

## Datenlage: drei Umfragen im Trendfenster

Veröffentlicht zwischen dem 30. Juli und dem 12. August 2026, zusammen 4753 Befragte.

| Institut | Feldzeit | Veröffentlicht | AfD | CDU | Linke | SPD | Grüne | BSW | FDP | Sonstige |
|---|---|---|---|---|---|---|---|---|---|---|
| pollytix | 3. bis 8.8. | 12.8.2026 | 43,0 | 23,0 | 13,0 | 7,0 | 5,0 | 4,0 | 2,0 | 3,0 |
| INSA | 31.7. bis 6.8. | 10.8.2026 | 42,0 | 22,0 | 13,0 | 6,0 | 4,0 | 5,0 | 4,0 | 4,0 |
| Infratest dimap | 23. bis 28.7. | 30.7.2026 | 41,0 | 24,0 | 13,0 | 7,0 | 5,0 | 4,0 | n.a. | 6,0 |
| **Trend 12.8.** | | | **42,1** | **22,9** | **13,0** | **6,6** | **4,6** | **4,4** | **2,9** | **3,5** |

Quelle: dawum.de, Wahltrend Sachsen-Anhalt vom 12.8.2026, ODbL. Der Auftraggeber der pollytix-Erhebung ist Campact, jener der INSA-Erhebung BILD, jener der Infratest-dimap-Erhebung sind MDR, WDR, Mitteldeutsche Zeitung und Volksstimme.

Zum Vergleich das amtliche Ergebnis vom 6. Juni 2021: CDU 37,1, AfD 20,8, Linke 11,0, SPD 8,4, FDP 6,4, Grüne 5,9.

**Streuung.** AfD 41,0 bis 43,0. CDU 22,0 bis 24,0. Linke bei allen drei exakt 13,0. Grüne 4,0 bis 5,0. BSW 4,0 bis 5,0. Die Spanne bei Grünen und BSW ist genau die Spanne, die über den Einzug entscheidet.

**Warum das mehr als eine Fußnote ist.** Bei der Landtagswahl 2021 lag die mittlere Abweichung der Institute vom amtlichen Ergebnis in Sachsen-Anhalt bei 2,86 Prozentpunkten, im Einzelfall bei bis zu 10,1 Prozentpunkten. Der Abstand zwischen 4,6 und 5,0 Prozent ist kleiner als die typische Fehlertoleranz. Aus einer Umfrage lässt sich deshalb nicht ablesen, ob Grüne oder BSW im Landtag sitzen werden.

## Vier Szenarien, gerechnet mit dem Projektcode

Alle Rechnungen: Hare/Niemeyer, 83 Sitze, Mehrheit ab 42. Reproduzierbar über `scripts/lib/seats.mjs` und `scripts/lib/coalitions.mjs`. Aufgeführt sind nur minimale Mehrheiten, also solche, aus denen kein Partner entfernt werden kann.

### A. Basis: nur AfD, CDU, Linke, SPD über der Hürde

AfD 41, CDU 22, Linke 13, SPD 7

| Kombination | Sitze | über der Mehrheit |
|---|---|---|
| AfD + CDU | 63 | 21 |
| AfD + Linke | 54 | 12 |
| AfD + SPD | 48 | 6 |
| CDU + Linke + SPD | 42 | 0 |

Diese Verteilung stimmt exakt mit der unabhängig gerechneten Veröffentlichung von dawum.de überein. Der Abgleich läuft als Regressionstest in `npm run check` mit.

Bemerkenswert ist die letzte Zeile: Ohne die AfD bleibt in diesem Szenario genau eine Mehrheit, und die hat null Sitze Reserve. Ein einziger abweichender Sitz kippt sie.

### B. Grüne schaffen die Hürde

AfD 39, CDU 22, Linke 12, SPD 6, Grüne 4

Minimale Mehrheiten: AfD + CDU (61), AfD + Linke (51), AfD + SPD (45), AfD + Grüne (43), CDU + Linke + SPD + Grüne (44).

### C. BSW schafft die Hürde

AfD 39, CDU 22, Linke 12, SPD 6, BSW 4

Minimale Mehrheiten: AfD + CDU (61), AfD + Linke (51), AfD + SPD (45), AfD + BSW (43), CDU + Linke + SPD + BSW (44).

### D. Grüne und BSW schaffen die Hürde

AfD 37, CDU 20, Linke 12, SPD 6, Grüne 4, BSW 4

Minimale Mehrheiten: AfD + CDU (57), AfD + Linke (49), AfD + SPD (43), AfD + Grüne + BSW (45), CDU + Linke + SPD + BSW (42), CDU + Linke + SPD + Grüne (42).

### Was der Vergleich zeigt

Der Sitzanteil der AfD schwankt zwischen den Szenarien um vier Sitze, ohne dass sich ihr Stimmenanteil ändert. Grund ist allein, wie viele Stimmen an der Sperrklausel verfallen. Genau deshalb ist die Frage, ob Grüne und BSW über fünf Prozent kommen, für die Mehrheitsverhältnisse wichtiger als die Frage, ob die AfD bei 41 oder 43 Prozent landet.

Konstant über alle vier Szenarien: Eine Mehrheit ohne die AfD erfordert mindestens CDU, Linke und SPD gemeinsam, und sie liegt in drei von vier Szenarien bei null bis zwei Sitzen Reserve.

## Was hier bewusst fehlt

- **Eine Prognose.** Die Zahlen sind Momentaufnahmen der Stimmung im Feldzeitraum, teils drei Wochen vor dem Wahltag.
- **Eine Bewertung der Koalitionen.** Die Liste ist Arithmetik. Ob eine Kombination politisch in Betracht kommt, sagt sie nicht.
- **Ergebnisse auf Wahlkreisebene.** Dafür braucht es die Daten der Landeswahlleitung, die im Projekt noch nicht angebunden sind.
- **Die Ministerpräsidentenwahl.** Die Landesverfassung regelt eigene Mehrheitserfordernisse in mehreren Wahlgängen. Das ist nicht modelliert.

## Grafische Umsetzung im Generator

Seit Version 0.2 erzeugt der Build für jede Parlamentsseite fünf Diagramme, alle als statisches SVG ohne JavaScript und ohne Zeichenbibliothek:

1. **Kennzahlenband** mit Umfragezahl, jüngstem Feldende, Vorsprung im Trend und Gesamtzahl der Befragten.
2. **Verlaufsdiagramm** aller Umfragen mit eingezeichneter Sperrklausel. Fehlende Werte erzeugen Lücken statt Nulllinien.
3. **Vergleich mit der letzten Wahl** als Paarbalken mit Differenz in Prozentpunkten.
4. **Sitzbogen**, ein Punkt je Sitz, mit Mehrheitslinie.
5. **Koalitionsbalken** und **Szenariovergleich** zur Sperrklausel.

Der Szenariovergleich entsteht automatisch: Der Build sucht Parteien, die im Trend weniger als zwei Prozentpunkte unter der Sperrklausel liegen, und rechnet für jede davon eine eigene Sitzverteilung. In Sachsen-Anhalt trifft das auf Grüne und BSW zu, weshalb dort vier Szenarien erscheinen.

Alle Diagramme tragen `title`-Elemente für Screenreader, laufen im hellen und dunklen Modus und funktionieren im Ausdruck.
