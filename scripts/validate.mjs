#!/usr/bin/env node
// Prüft rezepte.json auf Fehler und Warnungen. Ohne Abhängigkeiten.
// Aufruf: node scripts/validate.mjs [pfad/zur/rezepte.json]
// Exit-Code 1, sobald mindestens ein Fehler gefunden wurde.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const KATEGORIEN = ["Obst & Gemüse", "Fleisch & Fisch", "Kühlregal", "Brot & Backwaren", "Tiefkühl", "Vorrat"];
const EINHEITEN = ["g", "ml", "EL", "TL", "Prise", "Scheibe", "Packung", "Dose", "Zehe"];
const ID_MUSTER = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PLATZHALTER = /\{([^{}]+)\}/g;

const wurzel = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const datei = resolve(process.argv[2] || resolve(wurzel, "rezepte.json"));

const fehler = [];
const warnungen = [];

function istText(wert) {
  return typeof wert === "string" && wert.trim() !== "";
}

function istZahl(wert) {
  return typeof wert === "number" && Number.isFinite(wert);
}

function pruefeTextliste(wert, ort, feld) {
  if (!Array.isArray(wert)) {
    fehler.push(`${ort}: Pflichtfeld "${feld}" fehlt oder ist keine Liste.`);
    return;
  }
  wert.forEach((eintrag, i) => {
    if (!istText(eintrag)) fehler.push(`${ort}: "${feld}[${i}]" muss ein nicht-leerer Text sein.`);
  });
}

function pruefeRezept(rezept, index, rezeptIds) {
  const name = rezept && istText(rezept.id) ? `Rezept "${rezept.id}"` : `Rezept Nr. ${index + 1}`;

  if (!rezept || typeof rezept !== "object" || Array.isArray(rezept)) {
    fehler.push(`${name}: muss ein Objekt sein.`);
    return;
  }

  // Pflichtfelder
  if (!istText(rezept.id)) {
    fehler.push(`${name}: Pflichtfeld "id" fehlt oder ist leer.`);
  } else {
    if (!ID_MUSTER.test(rezept.id)) {
      fehler.push(`${name}: "id" ist nicht URL-tauglich (nur a–z, 0–9 und Bindestriche, z. B. "ofen-lachs").`);
    }
    if (rezeptIds.has(rezept.id)) fehler.push(`${name}: Die Rezept-ID ist doppelt vergeben.`);
    rezeptIds.add(rezept.id);
  }
  for (const feld of ["titel", "beschreibung", "zeit"]) {
    if (!istText(rezept[feld])) fehler.push(`${name}: Pflichtfeld "${feld}" fehlt oder ist leer.`);
  }
  if (!istZahl(rezept.portionen) || rezept.portionen <= 0) {
    fehler.push(`${name}: Pflichtfeld "portionen" fehlt oder ist keine positive Zahl.`);
  }
  pruefeTextliste(rezept.tags, name, "tags");
  pruefeTextliste(rezept.tipps, name, "tipps");

  // Zutaten
  const zutatIds = new Map();
  if (!Array.isArray(rezept.zutaten) || rezept.zutaten.length === 0) {
    fehler.push(`${name}: Pflichtfeld "zutaten" fehlt oder ist leer.`);
  } else {
    rezept.zutaten.forEach((zutat, i) => {
      const ort = `${name}, Zutat ${zutat && istText(zutat.id) ? `"${zutat.id}"` : `Nr. ${i + 1}`}`;
      if (!zutat || typeof zutat !== "object" || Array.isArray(zutat)) {
        fehler.push(`${ort}: muss ein Objekt sein.`);
        return;
      }
      if (!istText(zutat.id)) {
        fehler.push(`${ort}: Pflichtfeld "id" fehlt oder ist leer.`);
      } else if (zutatIds.has(zutat.id)) {
        fehler.push(`${ort}: Die Zutaten-ID ist in diesem Rezept doppelt vergeben.`);
      } else {
        zutatIds.set(zutat.id, zutat);
      }
      if (!istText(zutat.name)) fehler.push(`${ort}: Pflichtfeld "name" fehlt oder ist leer.`);
      if (!istZahl(zutat.menge) || zutat.menge <= 0) {
        fehler.push(`${ort}: Pflichtfeld "menge" fehlt oder ist keine positive Zahl.`);
      }
      if (!istText(zutat.kategorie)) {
        fehler.push(`${ort}: Pflichtfeld "kategorie" fehlt oder ist leer.`);
      } else if (!KATEGORIEN.includes(zutat.kategorie)) {
        warnungen.push(`${ort}: Unbekannte Kategorie "${zutat.kategorie}" (bekannt: ${KATEGORIEN.join(", ")}).`);
      }
      if (zutat.einheit !== undefined) {
        if (!istText(zutat.einheit)) {
          fehler.push(`${ort}: "einheit" muss ein nicht-leerer Text sein oder ganz fehlen (bei Stückzahlen).`);
        } else if (!EINHEITEN.includes(zutat.einheit)) {
          warnungen.push(`${ort}: Unbekannte Einheit "${zutat.einheit}" (bekannt: ${EINHEITEN.join(", ")}).`);
        }
      }
      for (const feld of ["mehrzahl", "hinweis"]) {
        if (zutat[feld] !== undefined && !istText(zutat[feld])) {
          fehler.push(`${ort}: "${feld}" muss ein nicht-leerer Text sein oder ganz fehlen.`);
        }
      }
    });
  }

  // Schritte
  const verwendet = new Set();
  if (!Array.isArray(rezept.schritte) || rezept.schritte.length === 0) {
    fehler.push(`${name}: Pflichtfeld "schritte" fehlt oder ist leer.`);
  } else {
    rezept.schritte.forEach((schritt, i) => {
      const ort = `${name}, Schritt ${i + 1}`;
      if (!schritt || typeof schritt !== "object" || Array.isArray(schritt)) {
        fehler.push(`${ort}: muss ein Objekt sein.`);
        return;
      }
      if (!istText(schritt.titel)) fehler.push(`${ort}: Pflichtfeld "titel" fehlt oder ist leer.`);
      if (schritt.minuten !== undefined && (!istZahl(schritt.minuten) || schritt.minuten <= 0)) {
        fehler.push(`${ort}: "minuten" muss eine positive Zahl sein oder ganz fehlen.`);
      }
      if (!istText(schritt.text)) {
        fehler.push(`${ort}: Pflichtfeld "text" fehlt oder ist leer.`);
        return;
      }
      const platzhalter = [...schritt.text.matchAll(PLATZHALTER)].map((t) => t[1]);
      if (platzhalter.length === 0) {
        fehler.push(`${ort}: Der Text enthält keinen Platzhalter wie {zutat-id} – jeder Schritt braucht eine Mengenangabe.`);
      }
      for (const id of platzhalter) {
        if (zutatIds.has(id)) verwendet.add(id);
        else fehler.push(`${ort}: Platzhalter {${id}} passt zu keiner Zutat dieses Rezepts.`);
      }
    });
  }

  for (const id of zutatIds.keys()) {
    if (!verwendet.has(id)) warnungen.push(`${name}, Zutat "${id}": wird in keinem Schritt verwendet.`);
  }
}

function main() {
  let roh;
  try {
    roh = readFileSync(datei, "utf8");
  } catch (e) {
    console.error(`✖ Datei konnte nicht gelesen werden: ${datei}\n  ${e.message}`);
    process.exit(1);
  }

  let daten;
  try {
    daten = JSON.parse(roh.replace(/^﻿/, ""));
  } catch (e) {
    console.error(`✖ Ungültiges JSON in ${datei}\n  ${e.message}`);
    process.exit(1);
  }

  if (!daten || typeof daten !== "object" || !Array.isArray(daten.rezepte)) {
    fehler.push('Die Datei muss die Form { "rezepte": [ … ] } haben.');
  } else {
    const rezeptIds = new Set();
    daten.rezepte.forEach((rezept, i) => pruefeRezept(rezept, i, rezeptIds));
  }

  for (const w of warnungen) console.warn(`⚠ Warnung: ${w}`);
  for (const f of fehler) console.error(`✖ Fehler: ${f}`);

  const anzahl = Array.isArray(daten?.rezepte) ? daten.rezepte.length : 0;
  if (fehler.length) {
    console.error(`\n${fehler.length} Fehler, ${warnungen.length} Warnung(en) in ${anzahl} Rezept(en).`);
    process.exit(1);
  }
  console.log(`✔ rezepte.json ist gültig: ${anzahl} Rezept(e), ${warnungen.length} Warnung(en).`);
}

main();
