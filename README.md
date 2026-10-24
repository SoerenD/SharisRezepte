# Sharis Rezepte

Rezeptsammlung mit automatischer Einkaufsliste. Auf der Seite wählst du aus, welche Rezepte du
kochen willst und für wie viele Portionen – daraus entsteht eine zusammengerechnete, nach
Supermarkt-Bereichen sortierte Einkaufsliste zum Abhaken und Teilen.

**Website:** https://soerend.github.io/SharisRezepte/

Tipp fürs Handy: Seite in Chrome öffnen → Menü ⋮ → „Zum Startbildschirm hinzufügen“.

## Neues Rezept hinzufügen

1. `rezepte.json` öffnen und im Array `"rezepte"` ein neues Objekt anhängen (Komma davor nicht vergessen).
2. Mengen beziehen sich immer auf `portionen` (die Basis-Portionen).
3. In den Schritten Zutaten als Platzhalter `{zutat-id}` einsetzen. **Jeder Schritt braucht mindestens
   einen Platzhalter**, damit überall eine Mengenangabe steht.
4. Wird eine Zutat mehrfach verwendet, bekommt sie mehrere Einträge mit gleichem `name`
   (unterschieden über `id` und `hinweis`) – in der Einkaufsliste werden sie addiert.
5. Prüfen: `node scripts/validate.mjs`, dann committen und pushen.

Vorlage zum Kopieren:

```json
{
  "id": "mein-rezept",
  "titel": "Mein Rezept",
  "beschreibung": "Ein kurzer Satz, worum es geht.",
  "portionen": 2,
  "zeit": "30 Min.",
  "tags": ["vegetarisch"],
  "zutaten": [
    { "id": "nudeln", "name": "Nudeln", "menge": 250, "einheit": "g", "kategorie": "Vorrat" },
    { "id": "zwiebel", "name": "Zwiebel", "mehrzahl": "Zwiebeln", "menge": 1, "kategorie": "Obst & Gemüse" },
    { "id": "oel", "name": "Olivenöl", "menge": 1, "einheit": "EL", "kategorie": "Vorrat", "hinweis": "zum Braten" }
  ],
  "schritte": [
    { "titel": "Nudeln kochen", "minuten": 10, "text": "{nudeln} in Salzwasser bissfest kochen." },
    { "titel": "Zwiebel braten", "text": "{zwiebel} würfeln und in {oel} glasig braten." }
  ],
  "tipps": ["Ein Tipp zum Gelingen."]
}
```

Felder:

| Feld | Bedeutung |
| --- | --- |
| `id` | eindeutig, URL-tauglich (a–z, 0–9, Bindestriche) |
| `einheit` | `g`, `ml`, `EL`, `TL`, `Prise`, `Scheibe`, `Packung`, `Dose`, `Zehe` – bei Stückzahlen weglassen |
| `kategorie` | `Obst & Gemüse`, `Fleisch & Fisch`, `Kühlregal`, `Brot & Backwaren`, `Tiefkühl`, `Vorrat` |
| `mehrzahl` | optional, Pluralform des Namens (z. B. „Zwiebeln“) |
| `hinweis` | optional, erscheint in Klammern (z. B. „für das Dressing“) |
| `minuten` | optional, Dauer eines Schritts |

## Validierung

```bash
node scripts/validate.mjs
```

Fehler (ungültiges JSON, fehlende Pflichtfelder, doppelte IDs, Platzhalter ohne Zutat, Schritt ohne
Platzhalter) beenden das Skript mit Exit-Code 1. Warnungen gibt es für unbenutzte Zutaten sowie
unbekannte Kategorien oder Einheiten. Die GitHub Action führt die Prüfung bei jedem Push und
Pull Request automatisch aus.

## Lokal testen

`fetch` funktioniert nicht über `file://`, daher einen kleinen Webserver starten:

```bash
python3 -m http.server
```

Dann http://localhost:8000 öffnen.
