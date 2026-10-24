"use strict";

// Sharis Rezepte – Rezeptübersicht, skalierte Detailansicht und Einkaufsliste.
// Reines Vanilla-JavaScript, Daten kommen zur Laufzeit aus rezepte.json.

const SPEICHER_SCHLUESSEL = "sharis-rezepte-v1";

const KATEGORIEN = [
  "Obst & Gemüse",
  "Fleisch & Fisch",
  "Kühlregal",
  "Brot & Backwaren",
  "Tiefkühl",
  "Vorrat",
];

const EINHEITEN_MEHRZAHL = {
  Scheibe: "Scheiben",
  Packung: "Packungen",
  Dose: "Dosen",
  Prise: "Prisen",
  Zehe: "Zehen",
};

const BRUECHE = { 0.25: "¼", 0.5: "½", 0.75: "¾" };

const MIN_PORTIONEN = 1;
const MAX_PORTIONEN = 99;

const app = document.getElementById("app");
const navBadge = document.getElementById("nav-badge");
const toastEl = document.getElementById("toast");

let rezepte = [];
let rezeptNachId = new Map();
let suchbegriff = "";
let zustand = ladeZustand();

// ---------- Hilfsfunktionen ----------

function esc(wert) {
  return String(wert ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function ladeZustand() {
  const leer = { gewaehlt: {}, portionen: {}, abgehakt: {} };
  try {
    const roh = localStorage.getItem(SPEICHER_SCHLUESSEL);
    if (!roh) return leer;
    const daten = JSON.parse(roh);
    return {
      gewaehlt: istObjekt(daten.gewaehlt) ? daten.gewaehlt : {},
      portionen: istObjekt(daten.portionen) ? daten.portionen : {},
      abgehakt: istObjekt(daten.abgehakt) ? daten.abgehakt : {},
    };
  } catch {
    return leer;
  }
}

function speichereZustand() {
  try {
    localStorage.setItem(SPEICHER_SCHLUESSEL, JSON.stringify(zustand));
  } catch {
    // Speicher nicht verfügbar (z. B. privater Modus) – die Seite funktioniert trotzdem.
  }
}

function istObjekt(wert) {
  return wert !== null && typeof wert === "object" && !Array.isArray(wert);
}

function portionenVon(rezept) {
  const gespeichert = Number(zustand.portionen[rezept.id]);
  if (Number.isInteger(gespeichert) && gespeichert >= MIN_PORTIONEN) return gespeichert;
  return Number(rezept.portionen) || 1;
}

function istGewaehlt(id) {
  return zustand.gewaehlt[id] === true && rezeptNachId.has(id);
}

function gewaehlteRezepte() {
  return rezepte.filter((r) => istGewaehlt(r.id));
}

function portionenText(n) {
  return n === 1 ? "1 Portion" : `${n} Portionen`;
}

// ---------- Mengenformatierung ----------

// Rundet eine Menge so, wie sie angezeigt wird.
function rundeMenge(menge, einheit) {
  if (einheit === "g" || einheit === "ml") {
    if (menge <= 0) return 0;
    const gerundet = menge >= 50 ? Math.round(menge / 5) * 5 : Math.round(menge);
    return Math.max(gerundet, 1);
  }
  const viertel = Math.round(menge * 4) / 4;
  return viertel === 0 && menge > 0 ? 0.25 : viertel;
}

function zahlText(wert) {
  const ganz = Math.floor(wert + 1e-9);
  const rest = Math.round((wert - ganz) * 4) / 4;
  const bruch = BRUECHE[rest] || "";
  if (ganz === 0 && bruch) return bruch;
  return `${ganz}${bruch}`;
}

// Liefert { menge, einheit, name } als fertige Texte, z. B. "1¼", "TL", "Salz".
function mengenTeile(menge, einheit, name, mehrzahl) {
  const wert = rundeMenge(menge, einheit);
  const viele = wert > 1;
  let einheitText = einheit || "";
  if (viele && EINHEITEN_MEHRZAHL[einheitText]) einheitText = EINHEITEN_MEHRZAHL[einheitText];
  return {
    menge: zahlText(wert),
    einheit: einheitText,
    name: viele && mehrzahl ? mehrzahl : name,
  };
}

function mengenText(menge, einheit, name, mehrzahl) {
  const t = mengenTeile(menge, einheit, name, mehrzahl);
  return [t.menge, t.einheit, t.name].filter(Boolean).join(" ");
}

function skaliert(zutat, faktor) {
  return Number(zutat.menge) * faktor;
}

// ---------- Einkaufsliste berechnen ----------

function berechneEinkaufsliste() {
  const posten = new Map();
  for (const rezept of gewaehlteRezepte()) {
    const faktor = portionenVon(rezept) / (Number(rezept.portionen) || 1);
    for (const zutat of rezept.zutaten || []) {
      const einheit = zutat.einheit || "";
      const schluessel = `${zutat.name}\u0000${einheit}`;
      let eintrag = posten.get(schluessel);
      if (!eintrag) {
        eintrag = {
          schluessel,
          name: zutat.name,
          mehrzahl: zutat.mehrzahl,
          einheit,
          kategorie: zutat.kategorie || "Sonstiges",
          menge: 0,
        };
        posten.set(schluessel, eintrag);
      }
      if (!eintrag.mehrzahl && zutat.mehrzahl) eintrag.mehrzahl = zutat.mehrzahl;
      eintrag.menge += skaliert(zutat, faktor);
    }
  }

  // Stückzahlen für den Einkauf aufrunden (½ Zitrone → 1 Zitrone).
  for (const eintrag of posten.values()) {
    if (!eintrag.einheit) eintrag.menge = Math.ceil(eintrag.menge - 1e-9);
  }

  const gruppen = new Map();
  for (const eintrag of posten.values()) {
    if (!gruppen.has(eintrag.kategorie)) gruppen.set(eintrag.kategorie, []);
    gruppen.get(eintrag.kategorie).push(eintrag);
  }

  const vergleich = (a, b) => a.localeCompare(b, "de", { sensitivity: "base" });
  const bekannte = KATEGORIEN.filter((k) => gruppen.has(k));
  const unbekannte = [...gruppen.keys()].filter((k) => !KATEGORIEN.includes(k)).sort(vergleich);

  return [...bekannte, ...unbekannte].map((kategorie) => ({
    kategorie,
    posten: gruppen
      .get(kategorie)
      .sort((a, b) => vergleich(a.name, b.name) || vergleich(a.einheit, b.einheit)),
  }));
}

// ---------- Bausteine ----------

function stepperHtml(rezept) {
  const n = portionenVon(rezept);
  const id = esc(rezept.id);
  return `
    <div class="stepper" role="group" aria-label="Portionen">
      <button type="button" data-aktion="minus" data-id="${id}" aria-label="Eine Portion weniger"${n <= MIN_PORTIONEN ? " disabled" : ""}>−</button>
      <output aria-live="polite">${esc(portionenText(n))}</output>
      <button type="button" data-aktion="plus" data-id="${id}" aria-label="Eine Portion mehr"${n >= MAX_PORTIONEN ? " disabled" : ""}>+</button>
    </div>`;
}

function auswahlCheckboxHtml(rezept) {
  return `
    <label class="check">
      <input type="checkbox" data-aktion="waehlen" data-id="${esc(rezept.id)}"${istGewaehlt(rezept.id) ? " checked" : ""}>
      Auf die Einkaufsliste
    </label>`;
}

function tagsHtml(rezept) {
  const tags = Array.isArray(rezept.tags) ? rezept.tags : [];
  if (!tags.length) return "";
  return `<ul class="tags" aria-label="Tags">${tags.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`;
}

function rezeptLink(rezept) {
  return `#/rezept/${encodeURIComponent(rezept.id)}`;
}

// ---------- Ansichten ----------

function zeigeUebersicht() {
  document.title = "Sharis Rezepte";
  if (!rezepte.length) {
    app.innerHTML = `<h1>Rezepte</h1><p class="leer">Noch keine Rezepte vorhanden.</p>`;
    return;
  }
  const karten = rezepte
    .map((rezept) => {
      const gewaehlt = istGewaehlt(rezept.id);
      const suchtext = [rezept.titel, ...(rezept.tags || [])].join(" ").toLowerCase();
      return `
        <li class="karte${gewaehlt ? " gewaehlt" : ""}" data-suche="${esc(suchtext)}">
          <h2><a href="${rezeptLink(rezept)}">${esc(rezept.titel)}</a></h2>
          <div class="meta">⏱ ${esc(rezept.zeit)} · Grundrezept für ${esc(portionenText(Number(rezept.portionen) || 1))}</div>
          ${tagsHtml(rezept)}
          <p>${esc(rezept.beschreibung)}</p>
          <div class="auswahl-zeile">
            ${auswahlCheckboxHtml(rezept)}
            ${gewaehlt ? stepperHtml(rezept) : ""}
          </div>
        </li>`;
    })
    .join("");

  app.innerHTML = `
    <h1>Rezepte</h1>
    <input class="suche" type="search" id="suche" placeholder="Suchen nach Titel oder Tag …"
      aria-label="Rezepte durchsuchen" value="${esc(suchbegriff)}" autocomplete="off">
    <ul class="karten${rezepte.length === 1 ? " einzeln" : ""}" id="karten">${karten}</ul>
    <p class="leer" id="keine-treffer" hidden>Kein Rezept passt zu deiner Suche.</p>`;
  wendeSucheAn();
}

function wendeSucheAn() {
  const begriff = suchbegriff.trim().toLowerCase();
  let sichtbar = 0;
  for (const karte of app.querySelectorAll(".karte")) {
    const passt = !begriff || karte.dataset.suche.includes(begriff);
    karte.hidden = !passt;
    if (passt) sichtbar++;
  }
  const hinweis = document.getElementById("keine-treffer");
  if (hinweis) hinweis.hidden = sichtbar > 0;
}

function schrittTextHtml(text, zutatNachId, faktor) {
  const teile = String(text ?? "").split(/\{([^{}]+)\}/);
  return teile
    .map((teil, i) => {
      if (i % 2 === 0) return esc(teil);
      const zutat = zutatNachId.get(teil);
      if (!zutat) return esc(`{${teil}}`);
      const t = mengenText(skaliert(zutat, faktor), zutat.einheit, zutat.name, zutat.mehrzahl);
      return `<mark class="zutat">${esc(t)}</mark>`;
    })
    .join("");
}

function zeigeDetail(id) {
  const rezept = rezeptNachId.get(id);
  if (!rezept) {
    zeigeNichtGefunden("Dieses Rezept gibt es nicht (mehr).");
    return;
  }
  document.title = `${rezept.titel} – Sharis Rezepte`;
  const faktor = portionenVon(rezept) / (Number(rezept.portionen) || 1);
  const zutaten = Array.isArray(rezept.zutaten) ? rezept.zutaten : [];
  const zutatNachId = new Map(zutaten.map((z) => [z.id, z]));

  const zutatenHtml = zutaten
    .map((z) => {
      const t = mengenTeile(skaliert(z, faktor), z.einheit, z.name, z.mehrzahl);
      const menge = [t.menge, t.einheit].filter(Boolean).join(" ");
      return `
        <li>
          <span class="menge">${esc(menge)}</span>
          <span>${esc(t.name)}${z.hinweis ? ` <span class="zusatz">(${esc(z.hinweis)})</span>` : ""}</span>
        </li>`;
    })
    .join("");

  const schritte = Array.isArray(rezept.schritte) ? rezept.schritte : [];
  const schritteHtml = schritte
    .map(
      (s) => `
        <li>
          <h3>${esc(s.titel)}${Number(s.minuten) > 0 ? ` <span class="minuten">⏱ ${esc(s.minuten)} Min.</span>` : ""}</h3>
          <p>${schrittTextHtml(s.text, zutatNachId, faktor)}</p>
        </li>`
    )
    .join("");

  const tipps = Array.isArray(rezept.tipps) ? rezept.tipps : [];

  app.innerHTML = `
    <a class="zurueck" href="#/">‹ Alle Rezepte</a>
    <section class="detail-kopf">
      <h1>${esc(rezept.titel)}</h1>
      <div class="meta">⏱ ${esc(rezept.zeit)} · Grundrezept für ${esc(portionenText(Number(rezept.portionen) || 1))}</div>
      ${tagsHtml(rezept)}
      <p>${esc(rezept.beschreibung)}</p>
      <div class="auswahl-zeile">
        ${stepperHtml(rezept)}
        ${auswahlCheckboxHtml(rezept)}
      </div>
    </section>

    <h2>Zutaten für ${esc(portionenText(portionenVon(rezept)))}</h2>
    <ul class="zutaten">${zutatenHtml}</ul>

    <h2>Zubereitung</h2>
    <ol class="schritte">${schritteHtml}</ol>

    ${tipps.length ? `<h2>Tipps</h2><ul class="tipps">${tipps.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}`;
}

function zeigeEinkauf() {
  document.title = "Einkaufsliste – Sharis Rezepte";
  const auswahl = gewaehlteRezepte();
  if (!auswahl.length) {
    app.innerHTML = `
      <h1>Einkaufsliste</h1>
      <p class="leer">Noch keine Rezepte ausgewählt.<br>
        Hake in der <a href="#/">Rezeptübersicht</a> „Auf die Einkaufsliste“ an.</p>`;
    return;
  }

  const auswahlHtml = auswahl
    .map(
      (r) => `
        <li>
          <a href="${rezeptLink(r)}">${esc(r.titel)}</a>
          ${stepperHtml(r)}
        </li>`
    )
    .join("");

  const gruppen = berechneEinkaufsliste();
  const gruppenHtml = gruppen
    .map(
      (g) => `
        <section class="kategorie">
          <h2>${esc(g.kategorie)}</h2>
          <ul class="posten">
            ${g.posten
              .map((p) => {
                const t = mengenTeile(p.menge, p.einheit, p.name, p.mehrzahl);
                const menge = [t.menge, t.einheit].filter(Boolean).join(" ");
                const erledigt = zustand.abgehakt[p.schluessel] === true;
                return `
                  <li class="${erledigt ? "abgehakt" : ""}">
                    <label>
                      <input type="checkbox" data-aktion="abhaken" data-schluessel="${esc(p.schluessel)}"${erledigt ? " checked" : ""}>
                      <span class="text"><span class="menge">${esc(menge)}</span> <span>${esc(t.name)}</span></span>
                    </label>
                  </li>`;
              })
              .join("")}
          </ul>
        </section>`
    )
    .join("");

  app.innerHTML = `
    <h1>Einkaufsliste</h1>
    <ul class="uebersicht-auswahl" aria-label="Ausgewählte Rezepte">${auswahlHtml}</ul>
    <div class="knopf-leiste">
      <button type="button" class="knopf primaer" data-aktion="teilen">Teilen</button>
      <button type="button" class="knopf" data-aktion="haken-entfernen">Haken entfernen</button>
      <button type="button" class="knopf gefahr" data-aktion="leeren">Liste leeren</button>
    </div>
    ${gruppenHtml}`;
}

function zeigeNichtGefunden(text) {
  document.title = "Nicht gefunden – Sharis Rezepte";
  app.innerHTML = `
    <div class="fehler">
      <h1>Nicht gefunden</h1>
      <p>${esc(text)}</p>
      <p><a href="#/">Zur Rezeptübersicht</a></p>
    </div>`;
}

function zeigeFehler(titel, text, details) {
  document.title = "Fehler – Sharis Rezepte";
  app.innerHTML = `
    <div class="fehler" role="alert">
      <h1>${esc(titel)}</h1>
      <p>${esc(text)}</p>
      ${details ? `<code>${esc(details)}</code>` : ""}
    </div>`;
}

// ---------- Routing ----------

function aktuelleRoute() {
  const hash = location.hash.replace(/^#/, "") || "/";
  if (hash === "/" || hash === "") return { name: "uebersicht" };
  if (hash === "/einkauf") return { name: "einkauf" };
  const treffer = hash.match(/^\/rezept\/([^/]+)$/);
  if (treffer) {
    let id = treffer[1];
    try {
      id = decodeURIComponent(id);
    } catch {
      // ungültige Kodierung – dann eben roh verwenden
    }
    return { name: "rezept", id };
  }
  return { name: "unbekannt" };
}

function render() {
  const route = aktuelleRoute();
  if (route.name === "uebersicht") zeigeUebersicht();
  else if (route.name === "rezept") zeigeDetail(route.id);
  else if (route.name === "einkauf") zeigeEinkauf();
  else zeigeNichtGefunden("Diese Seite gibt es nicht.");
  aktualisiereNavigation(route);
}

function aktualisiereNavigation(route = aktuelleRoute()) {
  for (const link of document.querySelectorAll("[data-nav]")) {
    const aktiv =
      link.dataset.nav === route.name || (link.dataset.nav === "uebersicht" && route.name === "rezept");
    link.classList.toggle("aktiv", aktiv);
    if (aktiv) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  const anzahl = gewaehlteRezepte().length;
  navBadge.textContent = String(anzahl);
  navBadge.hidden = anzahl === 0;
  navBadge.setAttribute("aria-label", `${anzahl} ${anzahl === 1 ? "Rezept" : "Rezepte"} ausgewählt`);
}

// Neu zeichnen, ohne Scrollposition und Fokus zu verlieren.
function neuZeichnen() {
  const aktiv = document.activeElement;
  const fokusSelektor = aktiv && aktiv.dataset && aktiv.dataset.aktion
    ? `[data-aktion="${aktiv.dataset.aktion}"]` +
      (aktiv.dataset.id ? `[data-id="${CSS.escape(aktiv.dataset.id)}"]` : "") +
      (aktiv.dataset.schluessel ? `[data-schluessel="${CSS.escape(aktiv.dataset.schluessel)}"]` : "")
    : null;
  const x = window.scrollX;
  const y = window.scrollY;
  render();
  window.scrollTo(x, y);
  if (fokusSelektor) {
    const ziel = app.querySelector(fokusSelektor);
    if (ziel && !ziel.disabled) ziel.focus({ preventScroll: true });
  }
}

// ---------- Aktionen ----------

function aendernPortionen(id, delta) {
  const rezept = rezeptNachId.get(id);
  if (!rezept) return;
  const neu = Math.min(MAX_PORTIONEN, Math.max(MIN_PORTIONEN, portionenVon(rezept) + delta));
  zustand.portionen[id] = neu;
  speichereZustand();
  neuZeichnen();
}

function setzeAuswahl(id, gewaehlt) {
  if (!rezeptNachId.has(id)) return;
  if (gewaehlt) zustand.gewaehlt[id] = true;
  else delete zustand.gewaehlt[id];
  speichereZustand();
  neuZeichnen();
}

function setzeHaken(schluessel, erledigt, checkbox) {
  if (erledigt) zustand.abgehakt[schluessel] = true;
  else delete zustand.abgehakt[schluessel];
  speichereZustand();
  const zeile = checkbox.closest("li");
  if (zeile) zeile.classList.toggle("abgehakt", erledigt);
}

function einkaufslisteAlsText() {
  const zeilen = ["Einkaufsliste"];
  for (const gruppe of berechneEinkaufsliste()) {
    const offen = gruppe.posten.filter((p) => zustand.abgehakt[p.schluessel] !== true);
    if (!offen.length) continue;
    zeilen.push("", gruppe.kategorie);
    for (const p of offen) zeilen.push(`☐ ${mengenText(p.menge, p.einheit, p.name, p.mehrzahl)}`);
  }
  return zeilen.length > 1 ? zeilen.join("\n") : "";
}

async function teilen() {
  const text = einkaufslisteAlsText();
  if (!text) {
    zeigeToast("Alles abgehakt – nichts mehr zu teilen.");
    return;
  }
  if (navigator.share) {
    try {
      await navigator.share({ title: "Einkaufsliste", text });
      return;
    } catch (fehler) {
      if (fehler && fehler.name === "AbortError") return;
      // sonst: auf die Zwischenablage ausweichen
    }
  }
  if (await inZwischenablage(text)) zeigeToast("Einkaufsliste in die Zwischenablage kopiert.");
  else zeigeToast("Teilen ist in diesem Browser leider nicht möglich.");
}

async function inZwischenablage(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // weiter mit dem altmodischen Weg
  }
  try {
    const feld = document.createElement("textarea");
    feld.value = text;
    feld.setAttribute("readonly", "");
    feld.style.position = "fixed";
    feld.style.opacity = "0";
    document.body.appendChild(feld);
    feld.select();
    const ok = document.execCommand("copy");
    feld.remove();
    return ok;
  } catch {
    return false;
  }
}

let toastTimer = 0;
function zeigeToast(text) {
  toastEl.textContent = text;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.hidden = true;
  }, 3000);
}

app.addEventListener("click", (ereignis) => {
  const knopf = ereignis.target.closest("button[data-aktion]");
  if (!knopf || knopf.disabled) return;
  const aktion = knopf.dataset.aktion;
  if (aktion === "minus") aendernPortionen(knopf.dataset.id, -1);
  else if (aktion === "plus") aendernPortionen(knopf.dataset.id, 1);
  else if (aktion === "teilen") teilen();
  else if (aktion === "haken-entfernen") {
    zustand.abgehakt = {};
    speichereZustand();
    neuZeichnen();
    zeigeToast("Alle Haken entfernt.");
  } else if (aktion === "leeren") {
    if (!confirm("Einkaufsliste wirklich leeren? Alle ausgewählten Rezepte und Haken werden entfernt.")) return;
    zustand.gewaehlt = {};
    zustand.abgehakt = {};
    speichereZustand();
    neuZeichnen();
    zeigeToast("Einkaufsliste geleert.");
  }
});

app.addEventListener("change", (ereignis) => {
  const feld = ereignis.target;
  if (!(feld instanceof HTMLInputElement) || !feld.dataset.aktion) return;
  if (feld.dataset.aktion === "waehlen") setzeAuswahl(feld.dataset.id, feld.checked);
  else if (feld.dataset.aktion === "abhaken") setzeHaken(feld.dataset.schluessel, feld.checked, feld);
});

app.addEventListener("input", (ereignis) => {
  if (ereignis.target.id !== "suche") return;
  suchbegriff = ereignis.target.value;
  wendeSucheAn();
});

window.addEventListener("hashchange", () => {
  render();
  window.scrollTo(0, 0);
  app.focus({ preventScroll: true });
});

// Änderungen aus einem anderen Tab übernehmen.
window.addEventListener("storage", (ereignis) => {
  if (ereignis.key !== SPEICHER_SCHLUESSEL) return;
  zustand = ladeZustand();
  neuZeichnen();
});

// ---------- Start ----------

async function start() {
  let antwort;
  try {
    antwort = await fetch("rezepte.json", { cache: "no-cache" });
  } catch (fehler) {
    const lokal = location.protocol === "file:";
    zeigeFehler(
      "Die Rezepte konnten nicht geladen werden.",
      lokal
        ? "Die Seite wurde direkt als Datei geöffnet. Bitte über einen lokalen Webserver starten, z. B. mit „python3 -m http.server“."
        : "Bitte prüfe deine Internetverbindung und lade die Seite neu.",
      String(fehler && fehler.message ? fehler.message : fehler)
    );
    return;
  }
  if (!antwort.ok) {
    zeigeFehler(
      "Die Rezepte konnten nicht geladen werden.",
      "Die Datei rezepte.json wurde nicht gefunden oder der Server hat einen Fehler gemeldet.",
      `HTTP ${antwort.status} ${antwort.statusText}`.trim()
    );
    return;
  }

  let daten;
  try {
    daten = JSON.parse(await antwort.text());
  } catch (fehler) {
    zeigeFehler(
      "Die Rezeptdatei ist fehlerhaft.",
      "rezepte.json enthält kein gültiges JSON. Bitte die Datei prüfen (z. B. mit „node scripts/validate.mjs“).",
      String(fehler && fehler.message ? fehler.message : fehler)
    );
    return;
  }

  if (!daten || !Array.isArray(daten.rezepte)) {
    zeigeFehler(
      "Die Rezeptdatei ist fehlerhaft.",
      "In rezepte.json fehlt die Liste „rezepte“.",
      'Erwartet wird: { "rezepte": [ … ] }'
    );
    return;
  }

  rezepte = daten.rezepte.filter((r) => istObjekt(r) && typeof r.id === "string" && r.id);
  rezeptNachId = new Map(rezepte.map((r) => [r.id, r]));
  render();
}

start();
