# Testfälle, von Hand nachgerechnet

Die Rechenverfahren in `scripts/lib/seats.mjs` werden gegen Beispiele geprüft, die hier vollständig nachvollziehbar aufgeschrieben sind. Wer dem Code nicht traut, kann mit Papier gegenrechnen.

Ausgangslage in allen Beispielen: drei Parteien mit den Stimmanteilen A = 53, B = 24, C = 23. Zu vergeben sind 10 Sitze.

## Sainte-Laguë / Schepers

Höchstzahlverfahren mit den Divisoren 1, 3, 5, 7, 9, 11 und so weiter. In jeder Runde erhält die Partei mit der höchsten Quote den nächsten Sitz.

| Runde | A | B | C | Sitz an |
|---|---|---|---|---|
| 1 | 53,00 | 24,00 | 23,00 | A |
| 2 | 17,67 | 24,00 | 23,00 | B |
| 3 | 17,67 | 8,00 | 23,00 | C |
| 4 | 17,67 | 8,00 | 7,67 | A |
| 5 | 10,60 | 8,00 | 7,67 | A |
| 6 | 7,57 | 8,00 | 7,67 | B |
| 7 | 7,57 | 4,80 | 7,67 | C |
| 8 | 7,57 | 4,80 | 4,60 | A |
| 9 | 5,89 | 4,80 | 4,60 | A |
| 10 | 4,82 | 4,80 | 4,60 | A |

Ergebnis: A = 6, B = 2, C = 2.

## Hare / Niemeyer

Quotenverfahren mit größtem Rest. Summe der Anteile 100, also ist die exakte Quote der Anteil geteilt durch 10.

| Partei | exakt | abgerundet | Rest |
|---|---|---|---|
| A | 5,30 | 5 | 0,30 |
| B | 2,40 | 2 | 0,40 |
| C | 2,30 | 2 | 0,30 |

Nach dem Abrunden sind 9 Sitze vergeben. Der verbleibende Sitz geht an den größten Rest, also an B.

Ergebnis: A = 5, B = 3, C = 2.

Der Unterschied zu Sainte-Laguë ist kein Fehler, sondern die Eigenart der Verfahren. Deshalb muss je Parlament das gesetzlich vorgeschriebene Verfahren hinterlegt sein.

## d'Hondt

Höchstzahlverfahren mit den Divisoren 1, 2, 3 und so weiter. Die zehn größten Quoten:

53,00 (A) · 26,50 (A) · 24,00 (B) · 23,00 (C) · 17,67 (A) · 13,25 (A) · 12,00 (B) · 11,50 (C) · 10,60 (A) · 8,83 (A)

Ergebnis: A = 6, B = 2, C = 2.

## Koalitionen

Bei der Sitzverteilung A = 6, B = 2, C = 2 und 10 Sitzen liegt die Mehrheit bei 6 Sitzen.

- {A} erreicht 6 Sitze. Ohne A bleiben 0. Minimale Mehrheit.
- {A, B} erreicht 8 Sitze, aber A allein hat bereits die Mehrheit. B ist entbehrlich, also keine minimale Mehrheit.
- {B, C} erreicht 4 Sitze. Keine Mehrheit.

Ausgegeben wird deshalb genau eine Kombination: A allein.

Zweites Beispiel, A = 5 und B = 5 bei 10 Sitzen, Mehrheit 6: nur {A, B} erreicht die Mehrheit, und beide Partner sind unentbehrlich.

## Gleichstände

Treffen in einer Runde zwei identische Quoten aufeinander, entscheidet die alphabetische Reihenfolge des Parteikürzels. Das ist willkürlich, aber deterministisch. Die Alternative, ein Losentscheid, wäre in einem reproduzierbaren Build unbrauchbar, weil zwei Builds derselben Daten unterschiedliche Ergebnisse liefern würden. Bei einer echten Sitzzuteilung entscheidet in solchen Fällen das Gesetz, meist durch Los.

## Regressionstest mit echten Daten: Sachsen-Anhalt

Zusätzlich zu den Lehrbuchbeispielen läuft ein Test gegen einen realen Fall, dessen Ergebnis unabhängig veröffentlicht ist.

Grundlage sind die Wahltrendwerte zur Landtagswahl Sachsen-Anhalt vom 12. August 2026: AfD 42,1, CDU 22,9, Linke 13,0, SPD 6,6. Grüne (4,6), BSW (4,4) und FDP (2,9) scheitern an der Fünfprozenthürde und werden vor der Zuteilung entfernt.

Summe der berücksichtigten Anteile: 84,6. Zu verteilen sind 83 Sitze.

| Partei | exakt | abgerundet | Rest | Restsitz |
|---|---|---|---|---|
| AfD | 41,30 | 41 | 0,30 | |
| CDU | 22,47 | 22 | 0,47 | |
| Linke | 12,75 | 12 | 0,75 | + 1 |
| SPD | 6,48 | 6 | 0,48 | + 1 |

Nach dem Abrunden sind 81 Sitze vergeben. Die zwei verbleibenden gehen an die größten Reste, also an Linke und SPD.

Ergebnis: AfD 41, CDU 22, Linke 13, SPD 7. Summe 83.

Mehrheit ab 42 Sitzen. Minimale Mehrheiten: AfD + CDU (63), AfD + Linke (54), AfD + SPD (48), CDU + Linke + SPD (42).

Dieselbe Verteilung und dieselben vier Kombinationen veröffentlicht dawum.de mit einer unabhängigen Implementierung. Der Test schlägt an, sobald eine Änderung am Rechenkern dieses Ergebnis verschiebt.
