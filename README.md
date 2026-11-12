# Vardagsmaten

Familjens receptsamling. En webbapp för iPhone (funkar även på Mac), på svenska, gratis att driva.

## Hur appen är byggd

| Fil | Vad den gör |
|---|---|
| `index.html` | Själva sidan. Nästan tom, app.js fyller i innehållet. |
| `stil.css` | Färger, typsnitt och layout. Mörkt läge följer telefonen. |
| `app.js` | All logik: receptlista, sök, receptvy, portioner, matlagningsläge, röst, inköpslista. Kommenterad på svenska. |
| `recept/index.json` | Listan över vilka recept som finns. |
| `recept/<id>.json` | Ett recept per fil. |
| `bilder/` | Receptbilder (t.ex. reelens omslagsbild). |
| `manifest.webmanifest`, `ikon-*.png` | Gör att appen kan läggas på hemskärmen. |

Inga ramverk, ingen byggprocess och ingen server. Det gör appen gratis och lätt att förstå.

## Receptformat

```json
{
  "id": "palak-paneer",                // filnamnet utan .json, bara a-z, 0-9 och bindestreck
  "titel": "Palak paneer med tomat och halloumi",
  "portioner": 4,                      // alltid 4 om originalet inte säger annat (räkna om)
  "tid": "30 min",
  "bild": "bilder/palak-paneer.jpg",   // tom sträng om bild saknas
  "kalla": { "namn": "ICA.se", "url": "https://..." },
  "taggar": ["Vegetarisk"],
  "ingredienser": [
    { "mangd": 50, "enhet": "g", "namn": "smör" },
    { "mangd": 1, "enhet": "krm", "namn": "chili", "gissning": true }
  ],
  "steg": [ { "text": "Fräs löken.", "tid": "3 min" } ],
  "tips": "",
  "gissningar": "Mängden chili stod inte i videon.",  // valfri förklaring
  "tillagd": "2026-11-12"
}
```

Enheter som räknas om automatiskt: `krm`, `tsk`, `msk`, `dl`, `g`, `kg`. Andra enheter (`st`, `port`, `burk`, tom) skalas bara som tal.

### Regler för Claude när ett recept sparas

1. Allt på svenska, även om originalet är på engelska.
2. Svenska mått: dl för det mesta (mjöl, socker, vätska, ris), gram för smör, ost, kött, fisk, krossade tomater och liknande. msk/tsk/krm för kryddor och små mängder. Cups: 1 US cup ≈ 2,4 dl. oz ≈ 28 g, lb ≈ 450 g.
3. Räkna om till 4 portioner.
4. Saknas en mängd eller ett steg: gissa rimligt och sätt `"gissning": true`.
5. Skriv av receptet troget. Hitta inte på ingredienser.
6. Bild: spara omslagsbilden som fil i `bilder/` (Instagram-länkar slutar fungera efter några dagar).
7. Lägg till id:t först i `recept/index.json`.

## Instagram-flödet (manuellt, gratis)

1. På iPhone: Dela reelen → genvägen **Till Vardagsmaten**. Länken hamnar i anteckningen *Vardagsmaten inkorg*.
2. På Macen: be Claude (med Claude in Chrome) "gå igenom Vardagsmaten-inkorgen". Claude läser bildtexten, gör ett svenskt recept enligt reglerna ovan och visar det för dig innan det sparas.
3. Du väljer vilka som sparas.
