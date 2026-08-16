# Rechtliches

Dies ist keine Rechtsberatung. Es ist eine Zusammenstellung der Punkte, die bei diesem Projekttyp regelmäßig relevant werden, damit sie nicht übersehen werden. Im Zweifel anwaltlich prüfen lassen.

## 1. Die Impressumsfrage

Das Projekt lässt sich so konfigurieren, dass keine Impressumsseite erzeugt wird: `legal.renderImpressum` in `config/site.json` auf `false`. Bevor jemand das tut, hier die Ausgangslage.

**§ 5 DDG** verlangt eine Anbieterkennzeichnung für geschäftsmäßige, in der Regel gegen Entgelt angebotene Telemedien. Der Begriff „geschäftsmäßig" wird weit ausgelegt: er meint eine nachhaltige, auf Dauer angelegte Tätigkeit und setzt keine Gewinnerzielungsabsicht voraus. Ein dauerhaft betriebenes Datenportal mit regelmäßigen Aktualisierungen fällt nach verbreiteter Auffassung darunter, auch wenn es kostenlos ist. Ausgenommen sind ausschließlich persönliche oder familiäre Angebote, was hier ersichtlich nicht zutrifft.

**§ 18 Abs. 2 MStV** verlangt zusätzlich einen inhaltlich Verantwortlichen mit Namen und Anschrift, sofern das Angebot journalistisch-redaktionell gestaltete Inhalte enthält. Reine Datenwiedergabe spricht dagegen, eigene Einordnungen, Analysen und Auswahlentscheidungen sprechen dafür. Die Methodikseite dieses Projekts ist bereits eine redaktionelle Leistung.

**Art. 13 DSGVO** verlangt unabhängig davon, dass Name und Kontaktdaten des Verantwortlichen in der Datenschutzerklärung stehen. Das ist der entscheidende Punkt: Wer das Impressum weglässt, muss dieselben Daten trotzdem an anderer Stelle veröffentlichen. Es wird also nichts geschützt, es entsteht nur eine zusätzliche Angriffsfläche.

**Praktische Folge.** Fehlende Anbieterkennzeichnung ist ein klassischer Abmahngrund und leicht automatisiert auffindbar. Der Aufwand für ein Impressum beträgt zehn Minuten.

**Wenn die Anschrift das eigentliche Problem ist**, gibt es legale Wege, die geprüft werden können, statt die Pflicht zu ignorieren:

- Betrieb über eine Gesellschaft, deren Geschäftsanschrift veröffentlicht wird
- ladungsfähige Anschrift über einen Dienstleister, sofern tatsächlich zustellbar
- Betrieb als Verein mit Vereinsanschrift

Ein Postfach genügt nicht, weil die Anschrift ladungsfähig sein muss.

## 2. Datenlizenz

Die Umfragedaten stammen von dawum.de und stehen unter der ODC Open Database License (ODbL) 1.0. Daraus folgen drei Pflichten:

1. **Attribution.** Nennung und Verlinkung von dawum.de sowie der Lizenz. Umgesetzt im Footer jeder Seite, im JSON-Export, in den JSON-LD-Blöcken und auf der Quellenseite.
2. **Share-alike für abgeleitete Datenbanken.** Der veröffentlichte Datenexport ist eine abgeleitete Datenbank und steht deshalb ebenfalls unter ODbL. Umgesetzt in `dist/daten/wahlwerk.json` und auf der Datenseite.
3. **Lizenztext beilegen oder verlinken.** Umgesetzt über den Verweis auf opendatacommons.org.

Wer die Attribution entfernt, verliert das Nutzungsrecht an den Daten. Das ist kein Formfehler, sondern der Wegfall der Rechtsgrundlage.

Wichtig für kommerzielle Pläne: ODbL verbietet kommerzielle Nutzung nicht. Sie verlangt aber, dass eine veröffentlichte abgeleitete Datenbank ebenfalls offen bleibt. Wer daraus ein geschlossenes Produkt bauen will, braucht eine andere Datengrundlage oder eine gesonderte Vereinbarung mit dem Betreiber.

## 3. Urheberrecht an den Umfragen

Die Umfragen selbst sind Leistungen der Meinungsforschungsinstitute. Einzelne Zahlen sind als Tatsachen nicht urheberrechtlich geschützt, die systematische Übernahme fremder Datenbanken kann aber das Datenbankherstellerrecht nach §§ 87a ff. UrhG berühren. Genau deshalb bezieht dieses Projekt die Daten über eine ausdrücklich zur Weiterverwendung freigegebene Quelle und nicht durch Auslesen von Presseseiten.

## 4. Datenschutz im Betrieb

Der Generator erzeugt eine Website ohne Cookies, ohne Tracking und ohne Requests an Dritte. Damit greift § 25 TDDDG nicht, eine Einwilligungsabfrage ist nicht erforderlich. Diese Eigenschaft ist im Testlauf abgesichert: `npm run check` schlägt fehl, sobald eine Seite eine externe Ressource einbindet.

Verbleibende Verarbeitung: Server-Protokolldaten beim Hoster. Rechtsgrundlage Art. 6 Abs. 1 lit. f DSGVO. Die Speicherdauer in `config/site.json` muss mit der tatsächlichen Konfiguration des Servers übereinstimmen.

Beim Einsatz eines CDN ist zu prüfen, ob ein Drittlandtransfer stattfindet und ob ein Auftragsverarbeitungsvertrag vorliegt.

## 5. Neutralität

Das Projekt trifft bewusst keine politischen Wertungen:

- Der Koalitionsrechner gibt alle arithmetisch möglichen Mehrheiten aus, auch politisch ausgeschlossene. Welche Kombination als ausgeschlossen gilt, wäre eine redaktionelle Wertung.
- Institute werden nicht bewertet, sondern nur mit ihren veröffentlichten Werten wiedergegeben.
- Parteifarben sind als konventionelle Darstellungszuordnung gekennzeichnet und ausdrücklich keine Aussage über die Parteien.

Das ist nicht nur eine Haltungsfrage. Bewertungen über Parteien und Institute erhöhen die Angriffsfläche für äußerungsrechtliche Auseinandersetzungen erheblich.

## 6. Haftung für Zahlen

Falsche Zahlen sind das Hauptrisiko eines solchen Projekts. Gegenmaßnahmen im Code:

- Der Import bricht ab, wenn keine verwertbaren Umfragen vorliegen, statt eine leere Seite zu veröffentlichen.
- Unbekannte Parteien- und Parlaments-IDs führen zu protokollierten Fehlern, nicht zu stillen Ersatzwerten.
- Fehlende Werte bleiben leer und werden nie als null Prozent behandelt.
- Sitzverteilungen erscheinen nur bei verifizierter Konfiguration.
- Die Rohdatei jeder Quelle wird mitgespeichert, sodass jede Zahl rückverfolgbar ist.

Der Haftungsausschluss im Impressum ersetzt keine dieser Maßnahmen, er ergänzt sie.
