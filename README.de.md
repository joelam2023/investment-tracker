# Investment Tracker — Private Portfolioverwaltung für Obsidian

[English](https://github.com/joelam2023/investment-tracker/blob/main/README.md) | [简体中文](https://github.com/joelam2023/investment-tracker/blob/main/README.zh-CN.md) | [繁體中文](https://github.com/joelam2023/investment-tracker/blob/main/README.zh-TW.md) | [日本語](https://github.com/joelam2023/investment-tracker/blob/main/README.ja.md) | [한국어](https://github.com/joelam2023/investment-tracker/blob/main/README.ko.md) | [Español](https://github.com/joelam2023/investment-tracker/blob/main/README.es.md) | Deutsch | [Français](https://github.com/joelam2023/investment-tracker/blob/main/README.fr.md) | [Português (Brasil)](https://github.com/joelam2023/investment-tracker/blob/main/README.pt-BR.md)

**Ihr Portfolio. Ihr Vault. Verschlüsselt.**

Investment Tracker ist ein privater, lokal orientierter Portfolio-Tracker für Obsidian. Erfassen Sie Zahlungsflüsse, Bewertungen, Renditen und die Entwicklung einer Benchmark, während Ihre verschlüsselten Anlagedaten in Ihrem Vault bleiben — ohne Konto, Telemetrie oder ein vom Entwickler betriebenes Backend.

Das Plugin arbeitet auf Kontoebene. So können Sie die Anlageperformance berechnen, ohne eine Transaktionshistorie für einzelne Positionen führen zu müssen.

## Die wichtigsten Fakten

| Thema | Funktionsweise von Investment Tracker |
| --- | --- |
| Anlagedaten | Werden verschlüsselt im Obsidian-Vault des Benutzers gespeichert |
| Vom Entwickler betriebenes Backend | Nicht vorhanden |
| Konto oder Anmeldung | Nicht erforderlich |
| Telemetrie und Analysen | Nicht vorhanden |
| Verschlüsselung | AES-256-GCM; der Schlüssel des Anlagebuchs wird durch PBKDF2-SHA256 und einen separaten Wiederherstellungsschlüssel geschützt |
| Optionaler Netzwerkzugriff | Der automatische Benchmarkmodus ruft öffentliche Benchmark- und Wechselkursdaten von FRED ab |
| Vault-Synchronisierung | Ein vom Benutzer gewählter Dienst wie Obsidian Sync oder iCloud kann das verschlüsselte Anlagebuch synchronisieren |
| Exporte | Vom Benutzer erstellte JSON- und CSV-Exporte liegen im Klartext vor |

## Funktionen

- Mehrere Anlagekonten in USD, GBP, SGD, CNY, TWD, JPY, KRW, EUR oder BRL.
- Unveränderliche, ereignisbasierte Buchführung für Einzahlungen, Entnahmen und Bewertungen.
- XIRR, kumulierter Gewinn, Jahresrenditen und Monatsrenditen nach Modified Dietz.
- Vergleich mit dem S&P 500 Price Index unter Verwendung identischer Zahlungsflüsse.
- Währungsabhängige Umrechnung von FRED-Benchmarkdaten mit ausdrücklicher Prüfung der Kursnotierung.
- Passwortsperre, separater Wiederherstellungsschlüssel, ausgeblendete Finanzwerte und konfigurierbare automatische Sperre.
- Verschlüsselte JSON-Datensätze im Vault des Benutzers.
- Ausdrücklicher lokaler JSON- und CSV-Export; in den Einstellungen ist dafür eine erneute Passwortauthentifizierung erforderlich.
- Automatische Auswahl der Oberflächensprache mit manueller Überschreibung und Englisch als Ausweichsprache.
- Englisch, vereinfachtes Chinesisch, traditionelles Chinesisch, Japanisch, Koreanisch, Spanisch, Deutsch, Französisch und brasilianisches Portugiesisch.

## Geeignet für

- Datenschutzbewusste Anleger, die ihre Portfoliodaten im eigenen Obsidian-Vault aufbewahren möchten.
- Personen, die Einzahlungen, Entnahmen und Bewertungen auf Kontoebene manuell erfassen.
- Anleger, die XIRR, Monats- und Jahresrenditen sowie einen Vergleich mit dem S&P 500 wünschen.
- Benutzer, die einen lokal orientierten Arbeitsablauf bevorzugen, ohne ein weiteres Finanzkonto anzulegen.

## Nicht ausgelegt für

- Die Synchronisierung mit Depots oder Brokerkonten.
- Live-Bestände, Kursfeeds, die Verwaltung steuerlicher Anschaffungsposten oder automatisierten Handel.
- Den Ersatz von Depotauszügen, Steuerunterlagen oder professioneller Finanzberatung.
- Den Schutz eines entsperrten Vaults vor einem kompromittierten Gerät oder einem anderen bösartigen Plugin.

## Installation und Updates

Installieren Sie **Investment Tracker** über **Obsidian → Einstellungen → Community-Erweiterungen → Durchsuchen**. Suchen Sie nach „Investment Tracker“, wählen Sie das Plugin aus und klicken Sie auf **Installieren** und anschließend auf **Aktivieren**.

Updates werden über den Update-Mechanismus für Community-Erweiterungen von Obsidian bereitgestellt.

Für eine manuelle Installation oder zum Testen legen Sie `main.js`, `manifest.json` und `styles.css` in folgendem Ordner ab:

```text
<Vault>/.obsidian/plugins/investment-tracker/
```

## Grundlegende Verwendung

1. Öffnen Sie Investment Tracker über die Seitenleiste.
2. Legen Sie ein Passwort fest und speichern Sie den erzeugten Wiederherstellungsschlüssel außerhalb des Vaults.
3. Erstellen Sie ein Konto und erfassen Sie dessen Anfangsbewertung.
4. Erfassen Sie externe Einzahlungen, Entnahmen und aktualisierte Gesamtbewertungen des Kontos.
5. Blenden Sie Finanzwerte über die Schaltfläche mit dem Auge ein oder aus.
6. Prüfen Sie Monats- und Jahresrenditen und vergleichen Sie sie mit der ausgewählten Benchmark.
7. Wählen Sie die Regeln für die automatische Sperre unter **Einstellungen → Investment Tracker → Datenschutz und Verschlüsselung**.

Das Ändern der Oberflächensprache ändert niemals die Währung eines bestehenden Kontos. Bei einer Neuinstallation werden Gebietsschemainformationen lediglich dazu verwendet, eine anfängliche Währung vorzuschlagen. Benutzer können diese vor dem Erstellen eines Kontos ändern.

## Datenschutz und Sicherheit

Investment Tracker verfügt weder über eine vom Entwickler betriebene Cloud noch über ein Kontosystem, Telemetrie, Analysen, Werbung oder einen Mechanismus zum automatischen Hochladen. Kontonamen, Daten, Beträge, Notizen und Ereignisdaten werden verschlüsselt und im Obsidian-Vault des Benutzers gespeichert. Neuinstallationen verwenden den Ordner `Investment Tracker Data`; vorhandene sichere Datenpfade bleiben bei Updates erhalten.

Ereignisdaten werden mit AES-256-GCM verschlüsselt. Der Schlüssel des Anlagebuchs wird mit einem aus dem Passwort abgeleiteten PBKDF2-SHA256-Schlüssel und einem separaten Wiederherstellungsschlüssel geschützt. Das Passwort und der entschlüsselte Schlüssel des Anlagebuchs werden nicht in den Plugin-Einstellungen gespeichert.

Die automatische Sperre besitzt zwei voneinander unabhängige Regeln: sofortige Sperre beim Verlassen von Investment Tracker oder wenn Obsidian den Fokus verliert sowie Sperre nach 1, 5, 15 oder 30 Minuten ohne Aktivität in Investment Tracker. Mindestens eine Regel bleibt aktiviert. Ist die sofortige Sperre beim Verlassen deaktiviert, werden beim Verlassen dennoch die Finanzwerte ausgeblendet, aufgeklappte Verlaufsbereiche geschlossen und sensible Dialoge beendet. Die Inaktivitätsregel oder eine manuelle Sperre bestimmt, wann der Schlüssel des Anlagebuchs aus dem Arbeitsspeicher gelöscht wird.

Ein neu erzeugter Wiederherstellungsschlüssel wird nach dem Verlassen ausgeblendet und erst nach dem Entsperren des Anlagebuchs wieder angezeigt. Bewahren Sie den Wiederherstellungsschlüssel außerhalb des Vaults auf und verwenden Sie ein starkes, einzigartiges Passwort.

Die Verschlüsselung schützt gespeicherte Anlagebuchdateien vor beiläufiger Offenlegung. Sie kann Daten nicht schützen, während das Plugin entsperrt ist, und schützt nicht vor einem kompromittierten Gerät, der Preisgabe durch Screenshots oder die Zwischenablage oder einem anderen bösartigen Plugin mit Zugriff auf denselben Vault.

### Synchronisierung und Exporte

Investment Tracker betreibt keinen Synchronisierungsdienst. Wenn ein Benutzer Obsidian Sync, iCloud oder einen anderen Dienst zur Vault-Synchronisierung aktiviert, kann dieser vom Benutzer gewählte Dienst die verschlüsselten Anlagebuchdateien zwischen Geräten synchronisieren.

JSON- und CSV-Exporte sind Klartextdateien und werden nur erstellt, wenn der Benutzer sie ausdrücklich exportiert. Behandeln Sie exportierte Dateien als sensible Finanzdaten und bewahren oder löschen Sie sie entsprechend.

Lesen Sie die vollständige [Datenschutzerklärung](https://github.com/joelam2023/investment-tracker/blob/main/PRIVACY.md) und die [Sicherheitsrichtlinie](https://github.com/joelam2023/investment-tracker/blob/main/SECURITY.md).

## Netzwerkoffenlegung

Für die grundlegende Buchführung und Renditeberechnung ist kein vom Entwickler betriebener Dienst erforderlich. Der automatische Benchmarkmodus sendet HTTPS-GET-Anfragen an den Dienst Federal Reserve Economic Data unter `fred.stlouisfed.org`, um Daten zum S&P 500 und zur Währungsumrechnung abzurufen.

Diese Anfragen enthalten ausschließlich öffentliche Serienkennungen, die zur Auswahl einer Wechselkursserie benötigten Währungen und Datumsbereiche. Sie enthalten keine Kontonamen, Kontostände, Zahlungsflussbeträge, Bewertungen, Notizen, Passwörter, Wiederherstellungsschlüssel oder Inhalte des Anlagebuchs.

Benutzer können den manuellen Benchmarkmodus wählen, um automatische FRED-Anfragen zu vermeiden. Automatische Benchmarkupdates benötigen eine Internetverbindung. Bei der vom Plugin verwendeten S&P-500-Serie handelt es sich um einen Preisindex ohne Dividenden.

## Häufig gestellte Fragen

### Lädt Investment Tracker meine Portfoliodaten hoch?

Es wird kein Portfolio-Anlagebuch an ein vom Entwickler betriebenes Backend gesendet. Das Plugin verfügt weder über ein Entwickler-Kontosystem noch über Telemetrie, Analysen oder einen automatischen Portfolio-Upload. Der automatische Benchmarkmodus stellt lediglich die begrenzten FRED-Anfragen, die im Abschnitt „Netzwerkoffenlegung“ beschrieben sind.

### Wo werden meine Anlagedaten gespeichert?

Das verschlüsselte Anlagebuch wird im Obsidian-Vault des Benutzers gespeichert. Neuinstallationen verwenden `Investment Tracker Data`. Wird der Vault über einen vom Benutzer ausgewählten Dienst synchronisiert, kann auch dieser Dienst das verschlüsselte Anlagebuch speichern oder übertragen.

### Sind meine Anlagedaten verschlüsselt?

Gespeicherte Ereignisdaten werden mit AES-256-GCM verschlüsselt. Ein aus dem Passwort abgeleiteter PBKDF2-SHA256-Schlüssel und ein separater Wiederherstellungsschlüssel schützen den Schlüssel des Anlagebuchs. Die Daten sind sichtbar, während das Plugin entsperrt ist; vom Benutzer erstellte JSON- oder CSV-Exporte sind nicht verschlüsselt.

### Kann ich Investment Tracker offline verwenden?

Lokale Datensätze und Renditeberechnungen können ohne einen vom Entwickler betriebenen Dienst verwendet werden. Automatische FRED-Updates für Benchmark und Währungen benötigen einen Internetzugang; im manuellen Benchmarkmodus werden diese Anfragen vermieden.

### Stellt das Plugin eine Verbindung zu meinem Brokerkonto her?

Nein. Investment Tracker stellt keine Verbindung zu Brokerkonten her. Benutzer erfassen externe Einzahlungen, Entnahmen und Gesamtbewertungen des Kontos manuell.

### Erfasst das Plugin einzelne Positionen oder Transaktionen?

Eine Transaktionshistorie auf Positionsebene ist nicht erforderlich. Das Plugin ist für Zahlungsflüsse und Bewertungen auf Kontoebene ausgelegt, nicht für Live-Bestände oder die Verwaltung steuerlicher Anschaffungsposten.

### Welche Informationen werden an FRED gesendet?

Automatische Benchmarkanfragen enthalten ausschließlich öffentliche Serienkennungen, die zur Auswahl der Wechselkursserie benötigten Währungen und Datumsbereiche. Portfoliodaten und Zugangsdaten sind darin nicht enthalten.

### Was geschieht, wenn ich mein Passwort verliere?

Verwenden Sie den separat aufbewahrten Wiederherstellungsschlüssel, um über den Wiederherstellungsablauf des Plugins erneut Zugriff zu erhalten. Wenn sowohl das Passwort als auch der Wiederherstellungsschlüssel verloren gehen, ist das verschlüsselte Anlagebuch möglicherweise nicht mehr zugänglich.

### Sind JSON- und CSV-Exporte verschlüsselt?

Nein. JSON- und CSV-Exporte liegen im Klartext vor und sollten als sensible Finanzdaten behandelt werden.

## Hilfe und Feedback

Öffnen Sie **Einstellungen → Investment Tracker → Hilfe und Feedback**, um einen Fehler zu melden, eine Funktion vorzuschlagen oder nicht sensible Diagnoseinformationen zu kopieren. Berichte können in jeder Sprache verfasst werden.

Feedbacklinks öffnen GitHub erst, nachdem der Benutzer auf eine Schaltfläche geklickt hat. Das Plugin erstellt niemals automatisch einen Bericht und sendet weder Daten des Anlagebuchs, Kontonamen, Kontostände, Transaktionen, Passwörter, Wiederherstellungsschlüssel, Vault-Namen, Vault-Pfade noch Diagnoseinformationen an den Entwickler. Prüfen Sie kopierte Diagnoseinformationen und entfernen oder schwärzen Sie sensible Inhalte in Screenshots, bevor Sie sie übermitteln.

Melden Sie Sicherheits- oder Datenschutzlücken über die [private Schwachstellenmeldung von GitHub](https://github.com/joelam2023/investment-tracker/security/advisories/new), nicht über ein öffentliches Issue.

## Entwicklung

```bash
npm ci
npm run check
npm run build:release
npm run privacy:check
```

Übersetzungen verwenden englische Ausgangstexte als Ausweichlösung. Pull Requests, die sichtbare Oberflächentexte ändern, müssen alle Sprachdateien aktualisieren und Interpolationsplatzhalter unverändert lassen.

Release-Tags müssen exakt der semantischen Version in `manifest.json` entsprechen und dürfen kein Präfix `v` enthalten. Der Release-Workflow erstellt einen Entwurf für ein GitHub Release, der ausschließlich `main.js`, `manifest.json` und `styles.css` enthält und vor der Veröffentlichung manuell geprüft wird.

Anweisungen für Maintainer finden Sie im vollständigen [Release-Leitfaden](https://github.com/joelam2023/investment-tracker/blob/main/RELEASING.md).

## Finanzhinweis

Dieses Plugin ist ein Werkzeug zur Aufzeichnung und Berechnung und stellt keine Finanz-, Steuer-, Rechts- oder Anlageberatung dar. Überprüfen Sie wichtige Berechnungen unabhängig, bevor Sie Entscheidungen treffen.

## Lizenz

[MIT-Lizenz](https://github.com/joelam2023/investment-tracker/blob/main/LICENSE)
