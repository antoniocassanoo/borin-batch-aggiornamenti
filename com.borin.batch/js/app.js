/* BORIN Batch 8 · logica del pannello.
   Stato in S; impostazioni in <cartella dati>/impostazioni.json (con la memoria accesa); preset personali sempre;
   batch interrotto in stato-batch.json (per riprendere); storico in sessioni.json. */
(function () {
  "use strict";
  const VERSIONE = "8.0";
  const RIF = 5120;
  const P = window.BORIN_PRESET, D = window.BORIN_DISCO, Ponte = window.Ponte;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const numero = (n, dec) => Number(n).toLocaleString("it-IT", { useGrouping: false, maximumFractionDigits: dec == null ? 0 : dec, minimumFractionDigits: dec || 0 });

  const S = {
    cfg: P.dalPreset("auto"), presetId: "auto", memoria: true, presetMiei: [],
    sorgente: "CARTELLA", ingresso: "", uscita: "", file: [], scelto: 0,
    info: null, collegato: false, inCorso: false, ferma: false, sessione: null, fondoBianco: false
  };
  const FASI = {
    apertura: "apro il file", analisi: "analizzo livelli e trasparenza", scontorno: "scontorno AI",
    sagoma: "sagoma per l'ombra", residui: "cerco i residui staccati", composizione: "tela e posizione",
    ombra: "ombra", colore: "livelli colore BORIN", salvataggio: "salvo il PSD", export: "JPG, PNG e WebP"
  };

  // ------------------------------------------------------------------ errori del pannello: sempre visibili
  function mostraErrore(testo) {
    const box = $("#erroreJS");
    $("span", box).textContent = testo;
    box.hidden = false;
    if (D) D.aggiungiTesto(D.unisci(D.cartellaDati(), "errori.log"), new Date().toISOString() + " " + testo + "\n");
  }
  window.addEventListener("error", e => mostraErrore("Errore del pannello: " + e.message + (e.lineno ? " (riga " + e.lineno + ")" : "")));
  window.addEventListener("unhandledrejection", e => mostraErrore("Errore: " + (e.reason && e.reason.message || e.reason)));
  $("#erroreJS button").addEventListener("click", () => { $("#erroreJS").hidden = true; });

  // ------------------------------------------------------------------ intro con il logo, a ogni apertura
  (function intro() {
    const el = $("#intro");
    if (!el) return;
    if (window.BORIN_SENZA_INTRO || /senza-intro/.test(location.search) || document.hidden) { el.remove(); return; }
    const via = () => { if (el.isConnected) el.remove(); };
    el.addEventListener("animationend", e => { if (e.target === el) via(); });
    const salta = () => el.classList.add("salta");
    el.addEventListener("click", salta);
    window.addEventListener("keydown", salta, { once: true });
    setTimeout(via, 3200);
  })();

  // ------------------------------------------------------------------ aspetto: tema e colore d'accento (tavolozza BORIN)
  const ACCENTI = [
    { id: "acciaio", nome: "Acciaio Blu", hex: "#3578A3" },
    { id: "azzurro", nome: "Azzurro Digitale", hex: "#01A8D3" },
    { id: "ametista", nome: "Ametista Tech", hex: "#414D9C" },
    { id: "bss", nome: "Verde acqua BSS", hex: "#00A19A" },
    { id: "bt", nome: "Arancio BT", hex: "#F49831" }
  ];
  const OSSIDIANA = "#1F2121", INOX = "#EAE8E9";
  S.aspetto = { tema: "auto", colore: "acciaio" };
  const rgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const esa = c => "#" + c.map(x => Math.round(x).toString(16).padStart(2, "0")).join("");
  const mescola = (a, b, t) => { const A = rgb(a), B = rgb(b); return esa(A.map((x, i) => x + (B[i] - x) * t)); };
  const luce = h => rgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); })
    .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const contrasto = (a, b) => { const x = luce(a), y = luce(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  function temaChiaro() {
    if (S.aspetto.tema === "chiaro") return true;
    if (S.aspetto.tema === "scuro") return false;
    if (window.BORIN_TEMA) return window.BORIN_TEMA === "chiaro";
    const c = Ponte.sfondoPhotoshop();                     // automatico: come i pannelli di Photoshop
    return c ? (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255 > 0.5 : false;
  }
  function applicaAspetto() {
    const chiaro = temaChiaro(), radice = document.documentElement, st = radice.style;
    radice.dataset.tema = chiaro ? "chiaro" : "scuro";
    const a = (ACCENTI.find(x => x.id === S.aspetto.colore) || ACCENTI[0]).hex;
    const piano = chiaro ? "#f6f5f5" : "#282b2b", verso = chiaro ? OSSIDIANA : INOX;
    let testo = a;                                          // testo d'accento leggibile sul piano (contrasto 4,5:1)
    for (let t = 0.1; contrasto(testo, piano) < 4.5 && t <= 1.01; t += 0.1) testo = mescola(a, verso, t);
    const [R, G, B] = rgb(a);
    st.setProperty("--accento", a);
    st.setProperty("--accento-forte", mescola(a, verso, 0.14));
    st.setProperty("--accento-testo", testo);
    st.setProperty("--accento-tenue", `rgba(${R}, ${G}, ${B}, ${chiaro ? 0.13 : 0.22})`);
    st.setProperty("--su-accento", contrasto("#ffffff", a) >= 3.6 ? "#ffffff" : OSSIDIANA);
    const sc = document.getElementById("sceltaColore");
    if (sc && !sc.children.length) sc.innerHTML = ACCENTI.map(x => `<button data-colore="${x.id}" style="--c:${x.hex}"><i></i>${x.nome}</button>`).join("");
    $$("#sceltaTema button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === S.aspetto.tema)));
    $$("#sceltaColore button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.colore === S.aspetto.colore)));
    const ra = document.getElementById("r-aspetto");
    if (ra) ra.textContent = { auto: "come Photoshop", chiaro: "chiaro Inox", scuro: "scuro Ossidiana" }[S.aspetto.tema] + ", " + (ACCENTI.find(x => x.id === S.aspetto.colore) || ACCENTI[0]).nome;
  }
  applicaAspetto();
  Ponte.quandoCambiaTema(applicaAspetto);
  $("#sceltaTema").addEventListener("click", e => {
    const b = e.target.closest("button[data-v]");
    if (!b) return;
    S.aspetto.tema = b.dataset.v;
    applicaAspetto(); if (typeof salva === "function") salva();
  });
  $("#sceltaColore").addEventListener("click", e => {
    const b = e.target.closest("button[data-colore]");
    if (!b) return;
    S.aspetto.colore = b.dataset.colore;
    applicaAspetto(); if (typeof salva === "function") salva();
  });

  if (!D) {
    mostraErrore("Node non è attivo nel pannello: reinstalla BORIN Batch (manca --enable-nodejs).");
    return;
  }
  const FILE_IMPOSTAZIONI = D.unisci(D.cartellaDati(), "impostazioni.json");
  const FILE_STATO = D.unisci(D.cartellaDati(), "stato-batch.json");
  const FILE_SESSIONI = D.unisci(D.cartellaDati(), "sessioni.json");
  // versione completa letta dal manifest (8.0.1, 8.0.2…): l'intestazione deve cambiare a ogni aggiornamento
  const VERSIONE_PIENA = (window.BORIN_AGGIORNA && Ponte.estensione) ? window.BORIN_AGGIORNA.versioneInstallata(Ponte.estensione) : VERSIONE;
  $("#versione").textContent = VERSIONE_PIENA;

  // ------------------------------------------------------------------ memoria
  function carica() {
    const s = D.leggiJSON(FILE_IMPOSTAZIONI, {});
    S.memoria = s.memoria !== false;
    S.presetMiei = Array.isArray(s.presetMiei) ? s.presetMiei : [];
    if (s.aspetto) { S.aspetto = Object.assign({ tema: "auto", colore: "acciaio" }, s.aspetto); applicaAspetto(); }
    S.ultimoControllo = (s.aggiornamenti && s.aggiornamenti.ultimo) || 0;
    if (S.memoria && s.cfg) {
      S.cfg = P.completa(s.cfg);
      S.presetId = s.presetId || "personalizzato";
      S.ingresso = s.ingresso || "";
      S.uscita = s.uscita || "";
      S.sorgente = s.sorgente === "DOCUMENTI" ? "DOCUMENTI" : "CARTELLA";
      if (S.ingresso && !D.esiste(S.ingresso)) S.ingresso = "";
      if (S.uscita && !D.esiste(S.uscita)) S.uscita = "";
    }
  }
  let timerSalva = null;
  function salva() {
    clearTimeout(timerSalva);
    timerSalva = setTimeout(() => {
      const dati = { versione: VERSIONE, memoria: S.memoria, presetMiei: S.presetMiei, aspetto: S.aspetto, aggiornamenti: { ultimo: S.ultimoControllo || 0 } };
      if (S.memoria) Object.assign(dati, { cfg: S.cfg, presetId: S.presetId, ingresso: S.ingresso, uscita: S.uscita, sorgente: S.sorgente });
      try { D.scriviJSON(FILE_IMPOSTAZIONI, dati); } catch (e) { mostraErrore("Impostazioni non salvate: " + e.message); }
    }, 250);
  }

  // ------------------------------------------------------------------ legami tra campi e impostazioni
  const leggiK = k => k.split(".").reduce((o, x) => (o == null ? o : o[x]), S.cfg);
  function scriviK(k, v) {
    const p = k.split(".");
    let o = S.cfg;
    for (let i = 0; i < p.length - 1; i++) o = o[p[i]];
    o[p[p.length - 1]] = v;
  }
  function presetCorrispondente() {
    const ora = JSON.stringify(S.cfg);
    for (const p of P.PRESET) if (JSON.stringify(P.dalPreset(p.id)) === ora) return p.id;
    for (const p of S.presetMiei) if (JSON.stringify(P.completa(p.cfg)) === ora) return "mio:" + p.id;
    return "personalizzato";
  }
  function cambiato() {
    S.presetId = presetCorrispondente();
    aggiorna();
    salva();
  }
  function valoreCampo(el) {
    if (el.type === "checkbox") return el.checked;
    if (el.type === "number" || el.type === "range") {
      let v = parseFloat(String(el.value).replace(",", "."));
      if (!isFinite(v)) return null;
      if (el.min !== "" && v < +el.min) v = +el.min;
      if (el.max !== "" && v > +el.max) v = +el.max;
      return v;
    }
    return el.value;
  }
  document.addEventListener("input", e => {
    const el = e.target;
    if (!el.dataset || !el.dataset.k) return;
    if (el.type === "number" && el.value === "") return;
    const v = valoreCampo(el);
    if (v === null) return;
    scriviK(el.dataset.k, v);
    cambiato();
  });
  document.addEventListener("change", e => {                     // a fine modifica i numeri tornano nei limiti
    const el = e.target;
    if (el.dataset && el.dataset.k && el.type === "number") el.value = leggiK(el.dataset.k);
  });
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-k] > button[data-v], .ombre > button[data-v]");
    if (!b) return;
    const k = b.parentElement.dataset.k;
    scriviK(k, b.dataset.v);
    cambiato();
  });

  // ------------------------------------------------------------------ disegni: schema della tela e stili d'ombra
  function prodottoSVG(x, y, w, h) {                       // dispenser visto di fronte: corpo, piedini, finestrella
    const piede = h * 0.06;
    return `<g fill="#3578A3"><rect x="${x}" y="${y}" width="${w}" height="${h - piede}" rx="${w * 0.03}"/>` +
      `<rect x="${x + w * 0.08}" y="${y + h - piede - 0.5}" width="${w * 0.12}" height="${piede + 0.5}"/>` +
      `<rect x="${x + w * 0.80}" y="${y + h - piede - 0.5}" width="${w * 0.12}" height="${piede + 0.5}"/></g>` +
      `<rect fill="#EAE8E9" x="${x + w * 0.2}" y="${y + h * 0.2}" width="${w * 0.6}" height="${h * 0.25}" rx="${w * 0.02}"/>`;
  }
  const STILI = {
    STANDARD: { nome: "Standard", nota: "quella di sempre", d: 18, c: 34, bd: 1, bc: 1 },
    DELICATA: { nome: "Delicata", nota: "più leggera", d: 12, c: 24, bd: 1.25, bc: 1.2 },
    PREMIUM: { nome: "Premium", nota: "più larga e morbida", d: 16, c: 30, bd: 1.3, bc: 1.05 },
    CONTATTO: { nome: "Contatto marcato", nota: "scura alla base", d: 11, c: 48, bd: 0.9, bc: 0.7 }
  };
  function ombraSVG(id, cx, base, w, scala, stile, intensita) {
    const s = STILI[stile] || STILI.STANDARD, f = intensita / 100;
    return `<filter id="${id}d" x="-50%" y="-200%" width="200%" height="500%"><feGaussianBlur stdDeviation="${2.4 * scala * s.bd}"/></filter>` +
      `<filter id="${id}c" x="-50%" y="-200%" width="200%" height="500%"><feGaussianBlur stdDeviation="${0.9 * scala * s.bc}"/></filter>` +
      `<ellipse cx="${cx}" cy="${base + 0.6 * scala}" rx="${w * 0.54}" ry="${2.2 * scala}" fill="#000" opacity="${Math.min(1, s.d * 2.6 * f / 100)}" filter="url(#${id}d)"/>` +
      `<ellipse cx="${cx}" cy="${base}" rx="${w * 0.47}" ry="${0.9 * scala}" fill="#000" opacity="${Math.min(1, s.c * 1.9 * f / 100)}" filter="url(#${id}c)"/>`;
  }
  function disegnaSchema() {
    const c = S.cfg, W = c.tela.larghezza, H = c.tela.altezza, pos = c.posizione;
    const max = 150, sc = max / Math.max(W, H), cw = W * sc, ch = H * sc, x0 = 34 + (max - cw) / 2, y0 = 26 + (max - ch) / 2;
    const asp = 0.72;
    // La tela si disegna come la trasparenza di Photoshop (scacchi chiari) in tutti e due i temi: l'ombra si vede.
    let svg = `<defs><pattern id="scacchi" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#ffffff"/><rect width="4" height="4" fill="#EAE8E9"/><rect x="4" y="4" width="4" height="4" fill="#EAE8E9"/></pattern>` +
      `<marker id="fr" viewBox="0 0 6 6" refX="3" refY="3" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L6 3 L0 6 z" fill="var(--fioco)"/></marker></defs>`;
    const sfondoBianco = c.export.sfondoBiancoPNG || c.export.sfondoBiancoWebP;
    svg += `<rect class="tela ${sfondoBianco ? "" : "scacchi"}" x="${x0}" y="${y0}" width="${cw}" height="${ch}" ${sfondoBianco ? 'style="fill:#fff"' : ""}/>`;
    // quote della tela
    svg += `<line class="quotatura" x1="${x0}" y1="${y0 - 10}" x2="${x0 + cw}" y2="${y0 - 10}" marker-start="url(#fr)" marker-end="url(#fr)"/>` +
      `<text class="quota-testo" x="${x0 + cw / 2}" y="${y0 - 14}" text-anchor="middle">${numero(W)} px</text>` +
      `<line class="quotatura" x1="${x0 - 10}" y1="${y0}" x2="${x0 - 10}" y2="${y0 + ch}" marker-start="url(#fr)" marker-end="url(#fr)"/>` +
      `<text class="quota-testo" transform="translate(${x0 - 14} ${y0 + ch / 2}) rotate(-90)" text-anchor="middle">${numero(H)} px</text>`;
    let bx, by, bw, bh, etichetta = "";
    if (pos.modo === "CENTRA") {
      const f = (pos.ridimensiona ? pos.riempimento : 60) / 100;
      bh = Math.min(ch * f, (cw * f) / asp); bw = bh * asp;
      const yc = pos.centraY ? (pos.correzioneY || 0) * ch / RIF : 0;
      bx = pos.centraX ? x0 + (cw - bw) / 2 : x0 + cw * 0.18;
      by = pos.centraY ? y0 + (ch - bh) / 2 + yc : y0 + ch * 0.1;
      svg += `<line class="asse" x1="${x0 + cw / 2}" y1="${y0}" x2="${x0 + cw / 2}" y2="${y0 + ch}"/><line class="asse" x1="${x0}" y1="${y0 + ch / 2}" x2="${x0 + cw}" y2="${y0 + ch / 2}"/>`;
      etichetta = pos.ridimensiona ? numero(pos.riempimento) + " %" : "originale";
    } else {
      const fa = pos.modo === "COMPOSIZIONE" ? (pos.adatta || 100) / 100 : 0.72;
      const iw = cw * fa, ih = iw * 0.75, ix = x0 + (cw - iw) / 2, iy = y0 + (ch - ih) / 2;
      svg += `<rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" fill="none" stroke="var(--fioco)" stroke-dasharray="4 3"/>` +
        `<text class="quota-testo" x="${ix + 3}" y="${iy + 10}">foto intera</text>`;
      bh = ih * 0.7; bw = bh * asp; bx = ix + iw * 0.18; by = iy + ih * 0.22;
      etichetta = pos.modo === "COMPOSIZIONE" ? numero(pos.adatta || 100) + " % foto" : "nessuna scala";
    }
    if (c.ombra.attiva) svg += ombraSVG("os", bx + bw / 2, by + bh, bw, 1.2, c.ombra.stile, c.ombra.intensita);
    svg += prodottoSVG(bx, by, bw, bh);
    svg += `<rect class="bordo-oggetto" x="${bx}" y="${by}" width="${bw}" height="${bh}"/>`;
    // quota dell'oggetto, a destra della tela
    const qx = x0 + cw + 9;
    svg += `<line class="quotatura" x1="${qx}" y1="${by}" x2="${qx}" y2="${by + bh}" marker-start="url(#fr)" marker-end="url(#fr)"/>` +
      `<line class="quotatura" x1="${bx + bw}" y1="${by}" x2="${qx + 3}" y2="${by}" stroke-dasharray="1 2"/>` +
      `<line class="quotatura" x1="${bx + bw}" y1="${by + bh}" x2="${qx + 3}" y2="${by + bh}" stroke-dasharray="1 2"/>` +
      `<text class="quota-testo" transform="translate(${qx + 11} ${by + bh / 2}) rotate(-90)" text-anchor="middle">${esc(etichetta)}</text>`;
    if (pos.modo === "CENTRA" && pos.centraY && pos.correzioneY) {
      svg += `<text class="quota-testo" x="${x0 + cw / 2}" y="${y0 + ch + 13}" text-anchor="middle">correzione Y ${pos.correzioneY > 0 ? "+" : ""}${numero(pos.correzioneY)} px</text>`;
    }
    $("#schema").innerHTML = svg;
  }
  function disegnaStiliOmbra() {
    const box = $("#stiliOmbra");
    box.innerHTML = Object.keys(STILI).map(k => {
      const svg = `<svg viewBox="0 0 60 46"><rect width="60" height="46" rx="3" fill="#f6f5f5"/>${ombraSVG("st" + k, 30, 38, 26, 1, k, 100)}${prodottoSVG(17, 6, 26, 32)}</svg>`;
      return `<button data-v="${k}" title="${STILI[k].nota}">${svg}${STILI[k].nome}<small>${STILI[k].nota}</small></button>`;
    }).join("");
  }

  // ------------------------------------------------------------------ riepilogo in parole
  function testoFormati(c) {
    const E = c.export, f = [];
    if (E.psd) f.push("PSD" + (E.sfondoBiancoPSD ? " con sfondo bianco" : ""));
    if (E.jpg) f.push("JPG q" + E.jpgQualita + (E.jpgLato ? " " + E.jpgLato + " px" : ""));
    if (E.png) f.push("PNG " + (E.sfondoBiancoPNG ? "su bianco" : "trasparente") + (E.pngLato ? " " + E.pngLato + " px" : ""));
    if (E.webp) f.push("WebP " + (E.webpLossless ? "senza perdita" : "q" + E.webpQualita) + " " + (E.sfondoBiancoWebP ? "su bianco" : "trasparente") + (E.webpLato ? " " + E.webpLato + " px" : ""));
    return f.length ? f.join(", ") : "nessun formato";
  }
  function testoPreparazione(c) {
    return { AUTO: "Automatico per ogni file", CUTOUT: "Scontorno AI su ogni file", PRECUT: "Già scontornate", PSD: "PSD multilivello" }[c.preparazione.modo];
  }
  function testoPosizione(c) {
    const p = c.posizione;
    if (p.modo === "COMPOSIZIONE") return "foto intera al " + numero(p.adatta || 100) + " %, composizione tenuta";
    if (p.modo === "NESSUNA") return "nessuna scala, solo tela";
    return (p.ridimensiona ? numero(p.riempimento) + " % del lato lungo" : "dimensione originale") + (p.centraX && p.centraY ? ", centrato" : p.centraX ? ", centrato in orizzontale" : p.centraY ? ", centrato in verticale" : "");
  }
  function testoColore(c) {
    const C = c.colore, f = [];
    if (C.mappa) f.push("mappa BORIN 26 al " + numero(C.mappaOpacita) + " %");
    if (C.tonalita) f.push("ciani e blu " + (C.cianiSat >= 0 ? "+" : "") + C.cianiSat + "/" + (C.cianiLum >= 0 ? "+" : "") + C.cianiLum);
    if (C.curva) f.push("curva Imm Sito");
    return f.length ? f.join(", ") : "nessuna correzione";
  }
  function disegnaDati() {
    const c = S.cfg, righe = [
      ["Tela", numero(c.tela.larghezza) + " × " + numero(c.tela.altezza) + " px a " + numero(c.tela.dpi) + " DPI"],
      ["Preparazione", testoPreparazione(c)],
      ["Oggetto", testoPosizione(c)],
      ["Ombra", c.ombra.attiva ? STILI[c.ombra.stile].nome + " al " + numero(c.ombra.intensita) + " %" + (c.ombra.appoggioReale ? ", appoggio reale" : "") : "nessuna"],
      ["Colore", testoColore(c)],
      ["Formati", testoFormati(c)]
    ];
    $("#dati").innerHTML = righe.map(r => `<dt>${esc(r[0])}</dt><dd>${esc(r[1])}</dd>`).join("");
  }

  // ------------------------------------------------------------------ aggiornamento dell'interfaccia
  function sincronizzaCampi() {
    $$("[data-k]").forEach(el => {
      const k = el.dataset.k, v = leggiK(k);
      if (el.matches(".seg, .ombre")) { $$("button[data-v]", el).forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === v))); return; }
      if (el.type === "checkbox") el.checked = !!v;
      else if (document.activeElement !== el) el.value = v == null ? "" : v;
    });
  }
  function spegni(sel, sì) { const el = $(sel); if (el) el.classList.toggle("spento", !!sì); }
  function aggiorna() {
    const c = S.cfg;
    sincronizzaCampi();
    spegni("#g-scontorno", !["AUTO", "CUTOUT"].includes(c.preparazione.modo));
    spegni("#g-livelli", !["CUTOUT", "PRECUT"].includes(c.preparazione.modo));
    $("#notaLivelli").textContent = c.preparazione.modo === "AUTO" ? "In automatico si decide file per file: con un livello solo si usa quello, con più livelli restano separati in un gruppo."
      : c.preparazione.modo === "PSD" ? "PSD multilivello: sempre separati in un gruppo «Soggetto»." : "";
    $("#g-centra").hidden = c.posizione.modo !== "CENTRA";
    $("#g-composizione").hidden = c.posizione.modo !== "COMPOSIZIONE";
    $$("#g-centra [data-k='posizione.riempimento']").forEach(el => el.disabled = !c.posizione.ridimensiona);
    spegni("#g-ombra", !c.ombra.attiva);
    $$(".formato").forEach(f => f.classList.toggle("spento-formato", !c.export[f.dataset.formato]));
    $("#rigaCwebp").hidden = c.export.webpMotore !== "CWEBP";
    $("#spuntaRaccolta").hidden = c.export.struttura !== "PRODOTTO";
    // dimensione della tela tra quelle pronte
    const t = P.TELE.find(x => x.larghezza === c.tela.larghezza && x.altezza === c.tela.altezza);
    $("#selTela").value = t ? t.id : "personale";
    // riassunti delle sezioni
    $("#r-preparazione").textContent = testoPreparazione(c);
    $("#r-tela").textContent = numero(c.tela.larghezza) + " × " + numero(c.tela.altezza) + (c.posizione.modo === "CENTRA" && c.posizione.ridimensiona ? " · " + numero(c.posizione.riempimento) + " %" : "");
    $("#r-ombra").textContent = c.ombra.attiva ? STILI[c.ombra.stile].nome + " " + numero(c.ombra.intensita) + " %" : "spenta";
    $("#r-colore").textContent = [c.colore.mappa && "mappa", c.colore.tonalita && "tonalità", c.colore.curva && "curva"].filter(Boolean).join(", ") || "nessuno";
    $("#r-export").textContent = ["psd", "jpg", "png", "webp"].filter(k => c.export[k]).map(k => k === "webp" ? "WebP" : k.toUpperCase()).join(", ") || "nessuno";
    $("#r-memoria").textContent = "memoria " + (S.memoria ? "accesa" : "spenta");
    $("#memoria").checked = S.memoria;
    disegnaPreset();
    disegnaSchema();
    disegnaDati();
    aggiornaPulsanti();
    aggiornaPrevisioni();
  }

  // ------------------------------------------------------------------ preset
  function nomePreset() {
    if (S.presetId.startsWith("mio:")) { const p = S.presetMiei.find(x => "mio:" + x.id === S.presetId); return p ? p.nome : "personale"; }
    const p = P.PRESET.find(x => x.id === S.presetId);
    return p ? p.nome : "Personalizzato";
  }
  function disegnaPreset() {
    const box = $("#listaPreset");
    let h = P.PRESET.map(p => `<button data-preset="${p.id}" aria-pressed="${S.presetId === p.id}" title="${esc(p.nota)}">${esc(p.nome)}</button>`).join("");
    h += S.presetMiei.map(p => `<button class="mio" data-preset="mio:${esc(p.id)}" aria-pressed="${S.presetId === "mio:" + p.id}">${esc(p.nome)}</button>`).join("");
    if (S.presetId === "personalizzato") h += `<button class="personalizzato" disabled>Personalizzato</button>`;
    box.innerHTML = h;
    const p = P.PRESET.find(x => x.id === S.presetId);
    $("#notaPreset").textContent = p ? p.nota : S.presetId.startsWith("mio:") ? "Preset salvato da te." : "Hai cambiato qualcosa nelle Impostazioni: salvalo come preset se ti serve ancora.";
    $("#presetMiei").innerHTML = S.presetMiei.length ? S.presetMiei.map(p =>
      `<li><b>${esc(p.nome)}</b><span style="margin-left:auto;display:flex;gap:4px"><button class="pulsante leggero" data-usa="${esc(p.id)}">Usa</button>` +
      `<button class="pulsante leggero" data-esporta="${esc(p.id)}">Esporta</button><button class="pulsante leggero pericolo" data-elimina="${esc(p.id)}">Elimina</button></span></li>`).join("")
      : `<li><span class="nota piccola" style="margin:0">Ancora nessun preset tuo.</span></li>`;
  }
  $("#listaPreset").addEventListener("click", e => {
    const b = e.target.closest("button[data-preset]");
    if (!b || S.inCorso) return;
    usaPreset(b.dataset.preset);
  });
  function usaPreset(id) {
    if (id.startsWith("mio:")) {
      const p = S.presetMiei.find(x => "mio:" + x.id === id);
      if (!p) return;
      S.cfg = P.completa(p.cfg);
    } else S.cfg = P.dalPreset(id);
    S.presetId = id;
    aggiorna();
    salva();
  }
  $("#bSalvaPreset").addEventListener("click", () => {
    const nome = $("#nomePreset").value.trim();
    if (!nome) { $("#nomePreset").focus(); return; }
    const id = nome.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || String(Date.now());
    S.presetMiei = S.presetMiei.filter(p => p.id !== id).concat([{ id, nome, cfg: P.copia(S.cfg), creato: new Date().toISOString() }]);
    S.presetId = "mio:" + id;
    $("#nomePreset").value = "";
    aggiorna(); salva();
  });
  $("#presetMiei").addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.usa) usaPreset("mio:" + b.dataset.usa);
    if (b.dataset.elimina) {
      S.presetMiei = S.presetMiei.filter(p => p.id !== b.dataset.elimina);
      if (S.presetId === "mio:" + b.dataset.elimina) S.presetId = presetCorrispondente();
      aggiorna(); salva();
    }
    if (b.dataset.esporta) {
      const p = S.presetMiei.find(x => x.id === b.dataset.esporta);
      const dest = Ponte.salvaFile("Esporta il preset", S.uscita || "", "BORIN preset - " + p.nome + ".json");
      if (dest) D.scriviJSON(/\.json$/i.test(dest) ? dest : dest + ".json", { tipo: "BORIN Batch preset", versione: VERSIONE, nome: p.nome, cfg: p.cfg });
    }
  });
  $("#bImportaPreset").addEventListener("click", () => {
    const f = Ponte.scegliFile("Scegli un preset BORIN (.json)", "", ["json"]);
    if (!f) return;
    const d = D.leggiJSON(f, null);
    if (!d || !d.cfg) { mostraErrore("Questo file non è un preset BORIN Batch."); return; }
    const nome = d.nome || D.nomeDi(f).replace(/\.json$/i, "");
    const id = nome.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || String(Date.now());
    S.presetMiei = S.presetMiei.filter(p => p.id !== id).concat([{ id, nome, cfg: P.completa(d.cfg), creato: new Date().toISOString() }]);
    usaPreset("mio:" + id);
  });
  $("#bRipristina").addEventListener("click", () => usaPreset("auto"));
  $("#memoria").addEventListener("change", e => { S.memoria = e.target.checked; aggiorna(); salva(); });
  $("#bDimentica").addEventListener("click", () => {
    S.cfg = P.dalPreset("auto"); S.presetId = "auto"; S.ingresso = ""; S.uscita = ""; S.file = [];
    D.scriviJSON(FILE_IMPOSTAZIONI, { versione: VERSIONE, memoria: S.memoria, presetMiei: S.presetMiei, aspetto: S.aspetto });
    mostraCartelle(); disegnaFile(); aggiorna();
  });

  // tele pronte
  $("#selTela").innerHTML = P.TELE.map(t => `<option value="${t.id}">${esc(t.nome)}${t.nota ? " · " + esc(t.nota) : ""}</option>`).join("") +
    `<option value="personale">Personalizzata</option>`;
  $("#selTela").addEventListener("change", e => {
    const t = P.TELE.find(x => x.id === e.target.value);
    if (t) { S.cfg.tela.larghezza = t.larghezza; S.cfg.tela.altezza = t.altezza; cambiato(); }
  });

  // ------------------------------------------------------------------ cartelle e file
  function mostraVia(el, p) {                              // nome della cartella in chiaro, il resto abbreviato
    el.classList.toggle("vuota", !p);
    el.title = p || "";
    if (!p) { el.textContent = "Nessuna cartella scelta"; return; }
    const parti = String(p).split(/[\\/]/).filter(Boolean), nome = parti.pop() || p;
    const sopra = parti.length > 2 ? "…/" + parti.slice(-2).join("/") : (D.WIN ? "" : "/") + parti.join("/");
    el.innerHTML = `<b>${esc(nome)}</b><span class="sopra">${esc(sopra)}</span>`;
  }
  function mostraCartelle() {
    mostraVia($("#viaIngresso"), S.ingresso);
    mostraVia($("#viaUscita"), S.uscita);
    $("#bApriUscita").hidden = !S.uscita;
    $$("#sorgente button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === S.sorgente)));
    $("#perCartella").hidden = S.sorgente !== "CARTELLA";
    $("#perDocumenti").hidden = S.sorgente !== "DOCUMENTI";
    let nota = "";
    if (S.sorgente === "CARTELLA" && S.ingresso && S.uscita && D.stessoPercorso(S.ingresso, S.uscita)) nota = "Ingresso e uscita sono la stessa cartella: scegline un'altra per l'uscita.";
    else if (S.sorgente === "CARTELLA" && S.ingresso && S.uscita && D.dentro(S.uscita, S.ingresso)) nota = "L'uscita è dentro la cartella delle immagini: non verrà rielaborata.";
    $("#notaCartelle").textContent = nota;
  }
  function leggiFile() {
    S.file = [];
    if (S.sorgente === "CARTELLA" && S.ingresso) {
      S.file = D.elencaImmagini(S.ingresso, { sottocartelle: S.cfg.avvio.sottocartelle, escludi: S.uscita ? [S.uscita] : [] });
      S.file.forEach(f => { f.intest = D.intestazione(f.percorso); });
    }
    S.scelto = 0;
    disegnaFile();
  }
  async function leggiDocumenti() {
    S.file = [];
    try {
      const docs = await Ponte.chiama("documentiAperti", {});
      S.file = docs.map(d => ({ percorso: d.percorso || null, documento: d.nome, nome: d.nome, rel: "",
        ext: (d.nome.match(/\.([^.]+)$/) || [, "psd"])[1].toLowerCase(), byte: 0,
        intest: { formato: "aperto", larghezza: d.larghezza, altezza: d.altezza, livelli: d.livelli } }));
    } catch (e) { mostraErrore("Documenti aperti non letti: " + e.message); }
    S.scelto = 0;
    disegnaFile();
  }
  $("#sorgente").addEventListener("click", e => {
    const b = e.target.closest("button[data-v]");
    if (!b || S.inCorso) return;
    S.sorgente = b.dataset.v;
    mostraCartelle();
    if (S.sorgente === "DOCUMENTI") leggiDocumenti(); else leggiFile();
    salva();
  });
  $("#bDocumenti").addEventListener("click", leggiDocumenti);
  $("#bIngresso").addEventListener("click", () => {
    const c = Ponte.scegliCartella("Scegli la cartella delle immagini da elaborare", S.ingresso);
    if (!c) return;
    S.ingresso = c;
    if (!S.uscita) S.uscita = D.unisci(D.cartellaDi(c), D.nomeDi(c) + " - BORIN");
    mostraCartelle(); leggiFile(); aggiorna(); salva();
  });
  $("#bUscita").addEventListener("click", () => {
    const c = Ponte.scegliCartella("Scegli dove salvare le immagini pronte", S.uscita || S.ingresso);
    if (!c) return;
    S.uscita = c;
    mostraCartelle(); if (S.sorgente === "CARTELLA") leggiFile(); aggiorna(); salva();
  });
  $("#bApriUscita").addEventListener("click", () => { D.creaCartella(S.uscita); D.mostra(S.uscita); });
  document.addEventListener("change", e => {
    if (e.target.dataset && e.target.dataset.k === "avvio.sottocartelle" && S.sorgente === "CARTELLA") leggiFile();
  });

  function riassuntoFile() {
    const per = {};
    S.file.forEach(f => { const k = (f.intest && f.intest.formato) || f.ext.toUpperCase(); per[k] = (per[k] || 0) + 1; });
    return S.file.length + " file: " + Object.keys(per).map(k => per[k] + " " + k).join(", ");
  }
  function miniaturaIngresso(f) {
    if (f.risultato && f.risultato.miniatura) return `<span class="mini" style="background-image:url('${D.urlFile(f.risultato.miniatura)}')"></span>`;
    if (f.percorso && ["jpg", "png", "webp"].includes(f.ext)) return `<span class="mini"><img loading="lazy" decoding="async" src="${D.urlFile(f.percorso)}" alt="" style="max-width:100%;max-height:100%"></span>`;
    return `<span class="mini">${esc((f.ext || "").toUpperCase())}</span>`;
  }
  function statoFile(f) {
    if (f.corrente) return { cl: "st-corrente", t: FASI[f.fase] || "in corso…" };
    const r = f.risultato;
    if (!r) {
      if (S.cfg.preparazione.modo !== "AUTO") return { cl: "", t: "" };
      return { cl: "previsione", t: D.previsione(f.intest).testo };
    }
    if (r.saltato) return { cl: "", t: "saltato" };
    if (!r.ok) return { cl: "st-errore", t: "errore" };
    return r.avvisi && r.avvisi.length ? { cl: "st-avviso", t: "fatto, con avviso" } : { cl: "st-ok", t: "fatto" };
  }
  function rigaFile(f, i) {
    const int = f.intest || {}, st = statoFile(f);
    const misure = int.larghezza ? numero(int.larghezza) + " × " + numero(int.altezza) + " px" : "";
    const extra = [int.formato && int.formato !== "?" ? `<span class="etic">${esc(int.formato)}</span>` : "", misure ? `<span>${misure}</span>` : "",
      f.rel ? `<span>${esc(f.rel)}</span>` : "", int.modo && int.modo !== "RGB" ? `<span>${esc(int.modo)}</span>` : ""].join("");
    return `<li data-i="${i}" class="${i === S.scelto ? "scelto" : ""}" title="${esc(f.percorso || f.documento)}">${miniaturaIngresso(f)}` +
      `<span class="nomefile">${esc(f.nome)}</span><span class="stato ${st.cl}">${esc(st.t)}</span><span class="sotto">${extra}</span></li>`;
  }
  function disegnaFile() {
    const ol = $("#elencoFile");
    if (!S.file.length) {
      const t = S.sorgente === "DOCUMENTI" ? "Nessun documento aperto in Photoshop." : S.ingresso ? "Nessuna immagine supportata (JPG, PNG, TIFF, PSD, PSB, WebP)." : "Scegli la cartella delle immagini.";
      ol.innerHTML = `<li class="vuoto" style="display:block;cursor:default">${t}</li>`;
      $("#contaFile").textContent = "";
    } else {
      ol.innerHTML = S.file.map(rigaFile).join("");
      $("#contaFile").textContent = riassuntoFile();
    }
    aggiornaPulsanti();
  }
  function aggiornaRiga(i) {
    const li = $(`#elencoFile li[data-i="${i}"]`);
    if (li) li.outerHTML = rigaFile(S.file[i], i);
  }
  function aggiornaPrevisioni() { if (!S.inCorso && S.file.length) $$("#elencoFile li[data-i]").forEach(li => aggiornaRiga(+li.dataset.i)); }
  $("#elencoFile").addEventListener("click", e => {
    const li = e.target.closest("li[data-i]");
    if (!li || S.inCorso) return;
    const prima = S.scelto;
    S.scelto = +li.dataset.i;
    aggiornaRiga(prima); aggiornaRiga(S.scelto);
    $("#bProva").textContent = S.scelto ? "Prova su questo file" : "Prova sul primo file";
  });

  // ------------------------------------------------------------------ pulsanti e stato di Photoshop
  function pronto() {
    if (!S.collegato) return "Photoshop non risponde.";
    if (!S.file.length) return "Nessun file da elaborare.";
    if (!S.uscita) return "Scegli dove salvare.";
    if (S.sorgente === "CARTELLA" && S.ingresso && D.stessoPercorso(S.ingresso, S.uscita)) return "L'uscita deve essere diversa dall'ingresso.";
    const E = S.cfg.export;
    if (!E.psd && !E.jpg && !E.png && !E.webp) return "Scegli almeno un formato in Impostazioni › Export.";
    return "";
  }
  function aggiornaPulsanti() {
    const motivo = pronto();
    $("#bProva").disabled = !!motivo || S.inCorso;
    $("#bAvvia").disabled = !!motivo || S.inCorso;
    $("#bAvvia").title = $("#bProva").title = motivo;
    if (S.ripresa && !S.inCorso) {
      $("#bAvvia").disabled = !S.collegato;
      $("#bAvvia").title = "";
      $("#bAvvia").textContent = "Riprendi (" + (S.ripresa.file.length - S.ripresa.fatti) + " file)";
    } else $("#bAvvia").textContent = S.file.length > 1 ? "Avvia il batch (" + S.file.length + ")" : "Avvia il batch";
  }
  async function collega() {
    const box = $("#statoPs");
    try {
      if (Ponte.inPhotoshop) await Ponte.caricaMotore(false);
      S.info = await Ponte.chiama("info", {});
      S.collegato = true;
      box.className = "statoPs vivo";
      $("span", box).textContent = "Photoshop " + S.info.photoshop.split(".").slice(0, 2).join(".");
      if (!S.info.webpNativo && S.cfg.export.webp && S.cfg.export.webpMotore === "PHOTOSHOP") mostraErrore("Questo Photoshop non salva WebP da solo: usa il motore cwebp in Impostazioni › Export.");
    } catch (e) {
      S.collegato = false;
      box.className = "statoPs morto";
      $("span", box).textContent = "Photoshop non risponde";
      box.title = e.message;
    }
    aggiornaPulsanti();
  }

  // ------------------------------------------------------------------ esecuzione
  Ponte.ascolta("com.borin.batch.fase", d => {
    if (!S.inCorso || !d) return;
    $("#avFase").textContent = (FASI[d.fase] || d.fase) + "…";
    const f = S.file.find(x => x.corrente);
    if (f) { f.fase = d.fase; aggiornaRiga(S.file.indexOf(f)); }
  });
  function durata(ms) {
    const s = Math.max(0, Math.round(ms / 1000)), m = Math.floor(s / 60), h = Math.floor(m / 60);
    return h ? h + " h " + (m % 60) + " min" : m ? m + " min " + (s % 60) + " s" : s + " s";
  }
  function modoCorsa(sì) {
    S.inCorso = sì;
    $("#avanzamento").hidden = !sì;
    $("#pulsanti").hidden = sì;
    $("#pulsantiCorsa").hidden = !sì;
    $("#bFerma").disabled = false;
    $("#bFerma").textContent = "Ferma dopo questo file";
    document.body.classList.toggle("in-corso", sì);
    aggiornaPulsanti();
  }
  $("#bFerma").addEventListener("click", () => {
    S.ferma = true;
    $("#bFerma").disabled = true;
    $("#bFerma").textContent = "Mi fermo dopo questo file…";
  });
  function salvaStato(sess, elenco, fatti, completato) {
    if (sess.prova) return;
    try {
      D.scriviJSON(FILE_STATO, { id: sess.id, inizio: sess.inizio, ingresso: S.ingresso, uscita: S.uscita, sorgente: S.sorgente,
        presetId: S.presetId, cfg: sess.cfg, file: elenco.map(f => f.percorso), fatti, completato: !!completato });
    } catch (e) {}
  }
  function registraSessione(sess, fileRegistro) {
    const conta = { ok: 0, avvisi: 0, errori: 0, saltati: 0 };
    sess.risultati.forEach(r => { if (r.saltato) conta.saltati++; else if (!r.ok) conta.errori++; else if (r.avvisi && r.avvisi.length) conta.avvisi++; else conta.ok++; });
    if (sess.prova) return conta;                       // le prove non affollano l'elenco: il loro registro resta nella cartella LOG
    const storia = D.leggiJSON(FILE_SESSIONI, []);
    storia.unshift({ id: sess.id, inizio: sess.inizio, fine: Date.now(), prova: sess.prova, preset: sess.preset, ingresso: sess.ingresso,
      uscita: sess.uscita, totale: sess.totale, conta, interrotto: !!sess.interrotto, registro: fileRegistro,
      risultati: sess.risultati.map(r => ({ nome: r.nome, ok: r.ok, saltato: r.saltato, errore: r.errore, avvisi: r.avvisi, durata: r.durata })) });
    D.scriviJSON(FILE_SESSIONI, storia.slice(0, 30));
    return conta;
  }
  function suono() {
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)(), t = ac.currentTime;
      [[880, 0], [660, 0.12]].forEach(([f, d]) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = "sine"; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.18, t + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.35);
        o.connect(g).connect(ac.destination); o.start(t + d); o.stop(t + d + 0.4);
      });
    } catch (e) {}
  }

  async function esegui(opz) {
    opz = opz || {};
    const motivo = pronto();
    if (motivo) { mostraErrore(motivo); return; }
    const prova = !!opz.prova;
    const elenco = opz.elenco || (prova ? [S.file[S.scelto] || S.file[0]] : S.file.slice());
    const da = opz.da || 0;
    const id = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
    const temp = D.cartellaTemp(id);
    D.creaCartella(S.uscita);
    const piano = D.pianifica(elenco, S.cfg, S.uscita);
    const sess = { id, versione: VERSIONE, inizio: Date.now(), prova, totale: piano.length,
      ingresso: S.sorgente === "CARTELLA" ? S.ingresso : "Documenti aperti in Photoshop", uscita: S.uscita, preset: nomePreset(),
      cfg: P.copia(S.cfg), risultati: [], photoshop: S.info && S.info.photoshop, sistema: S.info && S.info.sistema };
    S.sessione = sess; S.ferma = false;
    $("#bloccoEsito").hidden = true;
    if (prova) $("#bloccoProva").hidden = true;
    elenco.forEach(f => { delete f.risultato; f.corrente = false; });
    disegnaFile();
    modoCorsa(true);
    Ponte.restaAttivo();
    salvaStato(sess, elenco, da, false);
    const t0 = Date.now();
    let fatti = 0;
    for (let i = da; i < piano.length; i++) {
      await new Promise(r => setTimeout(r, 60));        // lascia passare i clic in coda (es. «Ferma») prima del file dopo
      if (S.ferma) { sess.interrotto = true; break; }
      const job = piano[i], f = elenco[i], idx = S.file.indexOf(f);
      f.corrente = true; f.fase = "apertura";
      if (idx >= 0) aggiornaRiga(idx);
      $("#avTesto").textContent = (prova ? "Prova · " : "File " + (i + 1) + " di " + piano.length + " · ") + f.nome;
      $("#avBarra").style.width = Math.round(100 * (i - da) / Math.max(1, piano.length - da)) + "%";
      let r;
      if (job.salta) r = { saltato: true, ok: true, avvisi: [] };
      else {
        ["psd", "jpg", "png", "webp"].forEach(k => { if (job.uscite[k]) D.creaCartella(D.cartellaDi(job.uscite[k])); });
        const uscite = Object.assign({}, job.uscite);
        delete uscite.webpCopie;
        let cwebp = null;
        if (S.cfg.export.webp && S.cfg.export.webpMotore === "CWEBP") {
          cwebp = D.trovaCwebp(S.cfg.export.cwebp, Ponte.estensione);
          if (cwebp) { uscite.pngPerCwebp = D.unisci(temp, i + "_cwebp.png"); delete uscite.webp; }
        }
        const arg = { file: f.percorso, documento: f.percorso ? null : f.documento, cfg: S.cfg, uscite, miniatura: D.unisci(temp, i + "_mini.png") };
        if (prova) Object.assign(arg, { anteprimaPrima: D.unisci(temp, "prima.png"), anteprimaDopo: D.unisci(temp, "dopo.png"), latoAnteprima: 1400 });
        try { r = await Ponte.chiama("elabora", arg); }
        catch (e) { r = { ok: false, errore: e.message, avvisi: [] }; }
        r.avvisi = r.avvisi || [];
        if (S.cfg.export.webp && S.cfg.export.webpMotore === "CWEBP" && !cwebp) r.avvisi.push("cwebp non trovato: WebP salvato da Photoshop.");
        if (r.ok && cwebp) {
          try { await D.eseguiCwebp(cwebp, uscite.pngPerCwebp, job.uscite.webp, S.cfg.export); }
          catch (e) { r.avvisi.push("WebP non creato con cwebp: " + e.message); }
          D.elimina(uscite.pngPerCwebp);
        }
        if (r.ok && job.uscite.webp && job.uscite.webpCopie && D.esiste(job.uscite.webp)) {
          for (const c of job.uscite.webpCopie) { try { D.copiaFile(job.uscite.webp, c); } catch (e) { r.avvisi.push("Copia WebP non riuscita: " + e.message); } }
        }
        if (r.ok) D.verificaUscite(job, S.cfg, r).forEach(p => r.avvisi.push("Controllo: " + p));
        if (job.versione) r.avvisi.push("Esisteva già: salvato come " + job.versione + ".");
        if (job.rinominato) r.avvisi.push("Nome di uscita «" + job.base + "» (un altro file aveva lo stesso nome).");
      }
      r.nome = f.nome; r.uscite_previste = job.uscite;
      f.risultato = r; f.corrente = false;
      sess.risultati.push(r);
      fatti = i + 1;
      if (idx >= 0) aggiornaRiga(idx);
      salvaStato(sess, elenco, fatti, false);
      const fattiOra = i + 1 - da, mancano = piano.length - i - 1, medio = (Date.now() - t0) / fattiOra;
      $("#avTempo").textContent = mancano ? "circa " + durata(medio * mancano) : durata(Date.now() - t0);
      if (fattiOra % 10 === 0) Ponte.chiama("pulisciMemoria", {}).catch(() => {});
    }
    $("#avBarra").style.width = "100%";
    let fileRegistro = "";
    try { fileRegistro = D.scriviRegistro(S.uscita, sess); } catch (e) { mostraErrore("Registro non scritto: " + e.message); }
    const conta = registraSessione(sess, fileRegistro);
    salvaStato(sess, elenco, fatti, !sess.interrotto);
    modoCorsa(false);
    if (prova) mostraProva(sess.risultati[0], elenco[0], piano[0]);
    else mostraEsito(sess, conta, fileRegistro, Date.now() - t0);
    disegnaSessioni();
    if (!prova) {
      if (S.cfg.avvio.suono) suono();
      D.avvisoSistema("BORIN Batch", (sess.interrotto ? "Fermato: " : "Finito: ") + conta.ok + " ok, " + conta.avvisi + " con avvisi, " + conta.errori + " errori");
      if (S.cfg.avvio.apriCartellaFine) D.mostra(S.uscita);
    }
  }
  $("#bProva").addEventListener("click", () => esegui({ prova: true }));
  $("#bAvvia").addEventListener("click", () => (S.ripresa ? riprendi() : esegui({})));

  // ------------------------------------------------------------------ prova: prima e dopo
  function fraseProva(r) {
    const fl = r.flusso || {}, p = [];
    p.push(fl.preparazione === "CUTOUT" ? "Scontornata con l'AI" : "Usata la trasparenza che aveva già");
    if (fl.livelli === "PRESERVE") p.push("livelli tenuti separati");
    if (r.scala > 1.05) p.push("ingrandita " + numero(r.scala, 1) + " volte" + (r.scala > 2 ? " (controlla la nitidezza)" : ""));
    else if (r.scala < 0.95) p.push("ridotta");
    if (r.ombra) p.push(r.ombra.pianoReale ? "ombra sotto la base, senza contare cavi e leve" : "ombra sotto la base dell'oggetto");
    const n = (r.uscite || []).length;
    return p.join(", ") + ". Salvata in " + n + (n === 1 ? " formato" : " formati") + " in " + numero((r.durata || 0) / 1000, 0) + " secondi.";
  }
  function mostraProva(r, f, job) {
    const b = $("#bloccoProva");
    b.hidden = false;
    $("#provaNome").textContent = f.nome;
    const img = (p, el) => { el.innerHTML = p && D.esiste(p) ? `<img src="${D.urlFile(p)}?t=${Date.now()}" alt="">` : `<span class="nota piccola">nessuna anteprima</span>`; };
    img(r.anteprimaPrima, $("#imgPrima"));
    img(r.anteprimaDopo, $("#imgDopo"));
    $("#imgDopo").classList.toggle("bianco", S.fondoBianco);
    const righe = [];
    if (r.ok) {
      const fl = r.flusso || {};
      const lav = { CUTOUT: "scontorno AI", PRECUT: "già scontornata" }[fl.preparazione] + " · " + { ACTIVE: "un livello", MERGE: "livelli uniti", PRESERVE: "livelli separati" }[fl.livelli];
      righe.push(["Lavorazione", lav + (r.scontorno ? " (" + r.scontorno + ")" : "") + (fl.motivo ? " — " + fl.motivo : "")]);
      if (r.originale) righe.push(["Originale", numero(r.originale.larghezza) + " × " + numero(r.originale.altezza) + " px · " + r.originale.modo + " · " + r.originale.bit.replace("EIGHT", "8 bit").replace("SIXTEEN", "16 bit").replace("THIRTYTWO", "32 bit")]);
      if (r.scala) righe.push(["Scala", "×" + numero(r.scala, 2) + (r.scala > 1 ? " (ingrandita)" : r.scala < 1 ? " (ridotta)" : "")]);
      if (r.soggettoFinale) righe.push(["Oggetto", numero(r.soggettoFinale.r - r.soggettoFinale.l) + " × " + numero(r.soggettoFinale.b - r.soggettoFinale.t) + " px sulla tela"]);
      if (r.ombra) righe.push(["Ombra", "appoggio a " + numero(r.ombra.suolo) + " px" + (r.ombra.pianoReale ? " (piano reale, " + r.ombra.correzione + " px sopra il punto più basso)" : ", la base dell'oggetto")]);
      righe.push(["Tempo", numero((r.durata || 0) / 1000, 1) + " s"]);
      righe.push(["Salvati", (r.uscite || []).map(u => u.formato).join(", ")]);
    }
    $("#provaRighe").innerHTML = righe.map(x => `<li><b>${esc(x[0])}</b><span>${esc(x[1])}</span></li>`).join("");
    $("#provaFrase").textContent = r.ok ? fraseProva(r) : "";
    const av = $("#provaAvvisi");
    if (!r.ok) av.innerHTML = `<div class="errore-box"><b>Non riuscito</b> nella fase «${esc(FASI[r.faseErrore] || r.faseErrore || "?")}»: ${esc(r.errore)}</div>`;
    else if (r.avvisi.length) av.innerHTML = `<div class="avviso"><b>Da guardare</b><ul>${r.avvisi.map(a => `<li>${esc(a)}</li>`).join("")}</ul></div>`;
    else av.innerHTML = `<div class="ok-box">Tutto a posto: se ti piace, avvia il batch.</div>`;
    const psd = (r.uscite || []).find(u => u.formato === "PSD");
    $("#bApriPSD").hidden = !psd;
    $("#bApriPSD").onclick = () => Ponte.chiama("apriFile", { percorso: psd.percorso }).catch(e => mostraErrore(e.message));
    const primo = (r.uscite || [])[0];
    $("#bMostraUscite").hidden = !primo;
    $("#bMostraUscite").onclick = () => D.mostra(primo.percorso, true);
    b.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  $("#bFondo").addEventListener("click", () => {
    S.fondoBianco = !S.fondoBianco;
    $("#imgDopo").classList.toggle("bianco", S.fondoBianco);
    $("#bFondo").textContent = S.fondoBianco ? "Mostra su scacchi" : "Mostra su bianco";
  });
  document.addEventListener("click", e => {
    const im = e.target.closest(".immagine img");
    if (im) { $("#lente img").src = im.src; $("#lente").hidden = false; return; }
    if (e.target.closest("#lente")) $("#lente").hidden = true;
  });
  window.addEventListener("keydown", e => { if (e.key === "Escape") $("#lente").hidden = true; });

  // ------------------------------------------------------------------ esito del batch
  function mostraEsito(sess, conta, fileRegistro, ms) {
    const b = $("#bloccoEsito");
    b.hidden = false;
    $("#esitoDurata").textContent = durata(ms);
    $("#esitoTitolo").textContent = sess.interrotto ? "Fermato a " + sess.risultati.length + " su " + sess.totale : "Fatto";
    const errori = sess.risultati.filter(r => !r.ok && !r.saltato);
    let h = `<ul class="esito-righe"><li><b>Pronti</b><span class="num">${conta.ok + conta.avvisi} su ${sess.totale}</span></li>` +
      (conta.avvisi ? `<li><b>Con avvisi</b><span class="num">${conta.avvisi}</span></li>` : "") +
      (conta.errori ? `<li><b>Con errori</b><span class="num">${conta.errori}</span></li>` : "") +
      (conta.saltati ? `<li><b>Saltati</b><span class="num">${conta.saltati} (già fatti)</span></li>` : "") + `</ul>`;
    if (sess.interrotto) h += `<div class="avviso">Con «Riprendi», in basso, si continua dal file dopo l'ultimo fatto.</div>`;
    if (errori.length) h += `<div class="errore-box"><b>Errori</b><ul>${errori.slice(0, 8).map(r => `<li>${esc(r.nome)}: ${esc(r.errore)}</li>`).join("")}</ul></div>`;
    $("#esitoTesto").innerHTML = h;
    $("#bEsitoCartella").onclick = () => D.mostra(S.uscita);
    $("#bEsitoRegistro").onclick = () => fileRegistro && D.mostra(fileRegistro);
    $("#bRiprovaErrori").hidden = !errori.length;
    $("#bRiprovaErrori").onclick = () => esegui({ elenco: S.file.filter(f => f.risultato && !f.risultato.ok && !f.risultato.saltato) });
    mostraRipresa();
    b.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ------------------------------------------------------------------ batch interrotto: riprendere
  function mostraRipresa() {
    const st = D.leggiJSON(FILE_STATO, null), box = $("#ripresa");
    S.ripresa = null;
    if (!st || st.completato || !Array.isArray(st.file) || st.fatti >= st.file.length) { box.hidden = true; aggiornaPulsanti(); return; }
    const vecchio = Date.now() - st.inizio > 7 * 24 * 3600 * 1000;
    const restanti = st.file.slice(st.fatti).filter(p => p && D.esiste(p)).length;
    if (vecchio || !restanti) {                          // non si propone più: troppo vecchio o file spariti
      st.completato = true;
      try { D.scriviJSON(FILE_STATO, st); } catch (e) {}
      box.hidden = true; aggiornaPulsanti(); return;
    }
    S.ripresa = st;
    const quando = new Date(st.inizio);
    box.innerHTML = `<b>Il batch del ${quando.toLocaleDateString("it-IT")} alle ${quando.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })} si è fermato a ${st.fatti} file su ${st.file.length}.</b>` +
      ` Con «Riprendi», in basso, continua dal file dopo l'ultimo fatto.` +
      `<div class="riga" style="margin-bottom:0"><button class="pulsante" id="bIgnoraRipresa">Ricomincia da capo</button></div>`;
    box.hidden = false;
    aggiornaPulsanti();
    $("#bIgnoraRipresa").onclick = () => { st.completato = true; D.scriviJSON(FILE_STATO, st); mostraRipresa(); };
  }
  function riprendi() {
    const st = S.ripresa;
    if (!st) return;
    {
      S.cfg = P.completa(st.cfg); S.presetId = st.presetId || presetCorrispondente();
      S.uscita = st.uscita; S.ingresso = st.ingresso || S.ingresso; S.sorgente = "CARTELLA";
      const elenco = st.file.filter(Boolean).map(p => ({ percorso: p, nome: D.nomeDi(p), rel: "", ext: (p.match(/\.([^.]+)$/) || [, ""])[1].toLowerCase().replace("jpeg", "jpg").replace("tiff", "tif"), byte: 0 }));
      elenco.forEach(f => { f.intest = D.esiste(f.percorso) ? D.intestazione(f.percorso) : { formato: "?", errore: "non trovato" }; });
      S.file = elenco;
      S.ripresa = null;
      $("#ripresa").hidden = true;
      mostraCartelle(); disegnaFile(); aggiorna();
      esegui({ elenco, da: st.fatti });
    }
  }

  // ------------------------------------------------------------------ registro
  function disegnaSessioni() {
    const storia = D.leggiJSON(FILE_SESSIONI, []), box = $("#sessioni");
    $("#bSvuotaSessioni").hidden = !storia.length;
    if (!storia.length) { box.innerHTML = `<p class="vuoto">Nessun batch nell'elenco.</p>`; $("#bloccoDettaglio").hidden = true; return; }
    box.innerHTML = `<table class="tabella"><tr><th>Quando</th><th>File</th><th>Esito</th><th></th></tr>` + storia.map((s, i) => {
      const d = new Date(s.inizio), c = s.conta || {};
      const esito = [c.ok ? c.ok + " ok" : "", c.avvisi ? c.avvisi + " avvisi" : "", c.errori ? c.errori + " errori" : "", c.saltati ? c.saltati + " saltati" : ""].filter(Boolean).join(", ");
      return `<tr data-s="${i}"><td>${d.toLocaleDateString("it-IT")} ${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}${s.prova ? " · prova" : ""}</td>` +
        `<td>${s.totale}${s.interrotto ? " (fermato)" : ""}</td><td>${esc(esito)}</td><td style="white-space:nowrap"><button class="pulsante leggero" data-dettaglio="${i}">Dettaglio</button>` +
        `<button class="pulsante leggero pericolo" data-elimina-sessione="${esc(s.id)}" title="Toglie il batch dall'elenco: immagini e registro restano nella cartella di uscita.">Elimina</button></td></tr>`;
    }).join("") + `</table>`;
  }
  // Toglie un batch dall'elenco (id) o tutti (null). Se era quello da riprendere, non lo propone più.
  function eliminaSessioni(id) {
    const storia = D.leggiJSON(FILE_SESSIONI, []);
    D.scriviJSON(FILE_SESSIONI, id ? storia.filter(s => s.id !== id) : []);
    if (S.ripresa && (!id || S.ripresa.id === id)) { S.ripresa.completato = true; D.scriviJSON(FILE_STATO, S.ripresa); mostraRipresa(); }
    if (!id || $("#bloccoDettaglio").dataset.id === id) $("#bloccoDettaglio").hidden = true;
    disegnaSessioni();
  }
  let timerSvuota = null;
  $("#bSvuotaSessioni").addEventListener("click", e => {
    const b = e.currentTarget;
    clearTimeout(timerSvuota);
    if (b.dataset.conferma) { delete b.dataset.conferma; b.textContent = "Svuota l'elenco"; eliminaSessioni(null); return; }
    b.dataset.conferma = "1";
    b.textContent = "Sicuro? Clic di nuovo per svuotare";
    timerSvuota = setTimeout(() => { delete b.dataset.conferma; b.textContent = "Svuota l'elenco"; }, 4000);
  });
  $("#sessioni").addEventListener("click", e => {
    const el = e.target.closest("[data-elimina-sessione]");
    if (el) { eliminaSessioni(el.dataset.eliminaSessione); return; }
    const b = e.target.closest("[data-dettaglio]");
    if (!b) return;
    const s = D.leggiJSON(FILE_SESSIONI, [])[+b.dataset.dettaglio];
    if (!s) return;
    $("#bloccoDettaglio").hidden = false;
    $("#bloccoDettaglio").dataset.id = s.id;
    $("#dettaglioData").textContent = new Date(s.inizio).toLocaleString("it-IT");
    $("#dettaglio").innerHTML = `<p class="nota" style="margin-top:0">Preset «${esc(s.preset)}» · da ${esc(s.ingresso)} a ${esc(s.uscita)}</p>` +
      `<ul class="esito-righe">${s.risultati.map(r => `<li><b>${r.saltato ? "saltato" : r.ok ? (r.avvisi && r.avvisi.length ? "avviso" : "ok") : "errore"}</b><span>${esc(r.nome)}${r.errore ? " — " + esc(r.errore) : ""}${(r.avvisi || []).map(a => "<br><small>· " + esc(a) + "</small>").join("")}</span></li>`).join("")}</ul>` +
      (s.registro ? `<div class="riga"><button class="pulsante" id="bApriRegistro">Apri il file del registro</button><button class="pulsante" id="bApriUscitaS">Apri la cartella</button></div>` : "");
    if (s.registro) { $("#bApriRegistro").onclick = () => D.mostra(s.registro); $("#bApriUscitaS").onclick = () => D.mostra(s.uscita); }
  });

  // ------------------------------------------------------------------ aggiornamenti da GitHub (js/aggiorna.js)
  const A = window.BORIN_AGGIORNA || null;
  async function controllaAggiornamenti(forza) {
    const st = $("#statoAggiornamenti");
    if (!A || !Ponte.estensione) { st.textContent = "Aggiornamenti non disponibili qui."; return; }
    const cfg = A.leggiConfig(Ponte.estensione), attuale = A.versioneInstallata(Ponte.estensione);
    if (A.eSviluppo(Ponte.estensione)) { st.textContent = "Versione " + attuale + " di sviluppo: si aggiorna con git."; return; }
    if (!cfg.repo) { st.textContent = "Versione " + attuale + ". Aggiornamenti automatici non ancora collegati a GitHub."; return; }
    if (!forza && Date.now() - (S.ultimoControllo || 0) < 6 * 3600 * 1000 && !S.aggiornamento) {
      st.textContent = "Versione " + attuale + ". Ultimo controllo " + new Date(S.ultimoControllo).toLocaleString("it-IT") + ".";
      return;
    }
    st.textContent = "Cerco aggiornamenti…";
    try {
      const t = await A.cerca(Ponte.estensione);
      S.ultimoControllo = Date.now(); salva();
      if (t.nuova) {
        S.aggiornamento = t;
        st.textContent = "È disponibile la versione " + t.versione + ": hai la " + attuale + ".";
        mostraNovita(t);
      } else st.textContent = "Hai l'ultima versione (" + attuale + "). Controllato adesso su github.com/" + cfg.repo + ".";
    } catch (e) { st.textContent = "Controllo non riuscito: " + e.message + "."; }
  }
  function mostraNovita(t) {
    const box = $("#novita");
    box.className = "ok-box";
    box.innerHTML = `<b>È uscita BORIN Batch ${esc(t.versione)}</b> (hai la ${esc(t.attuale)}).` +
      (t.novita ? `<details class="dettagli"><summary>Che cosa cambia</summary><div style="white-space:pre-wrap">${esc(t.novita)}</div></details>` : "") +
      `<div class="riga" style="margin-bottom:0"><button class="pulsante primario" id="bAggiorna">Aggiorna adesso</button>` +
      `<button class="pulsante leggero" id="bDopo">Più tardi</button></div><p class="nota piccola" id="statoAggiorna"></p>`;
    box.hidden = false;
    $("#bDopo").onclick = () => { box.hidden = true; };
    $("#bAggiorna").onclick = async () => {
      if (S.inCorso) { $("#statoAggiorna").textContent = "Aspetta la fine del batch."; return; }
      $("#bAggiorna").disabled = true;
      try {
        const v = await A.installa(Ponte.estensione, t, D.cartellaTemp("aggiornamento-" + Date.now()), x => { $("#statoAggiorna").textContent = x; });
        S.aggiornamento = null;
        box.innerHTML = `<b>Aggiornato alla versione ${esc(v)}.</b> Chiudi e riapri il pannello (Finestra › Estensioni (precedenti) › BORIN Batch) per usarla.`;
        $("#statoAggiornamenti").textContent = "Installata la versione " + v + ": chiudi e riapri il pannello.";
      } catch (e) {
        $("#statoAggiorna").textContent = e.message;
        $("#bAggiorna").disabled = false;
      }
    };
  }
  $("#bCercaAggiornamenti").addEventListener("click", () => controllaAggiornamenti(true));

  // ------------------------------------------------------------------ info e diagnostica
  function gothamCaricato() { try { return document.fonts.check("500 12px 'Gotham BORIN'"); } catch (e) { return false; } }
  function righeDiagnostica() {
    const sis = D.sistema(), i = S.info || {};
    const cw = D.trovaCwebp(S.cfg.export.cwebp, Ponte.estensione);
    return [
      ["Pannello", "BORIN Batch " + VERSIONE_PIENA], ["Motore", i.motore || "—"], ["Photoshop", i.photoshop || "non collegato"],
      ["Sistema", (i.sistema || sis.piattaforma) + " · " + sis.arch + " · " + sis.memoriaGB + " GB"], ["Lingua di Photoshop", i.lingua || "—"],
      ["WebP da Photoshop", i.webpNativo ? "sì" : "no (serve cwebp)"], ["cwebp", cw || "non trovato (non serve con Photoshop 23.2+)"],
      ["Righello ora", i.righello || "—"], ["Gotham", gothamCaricato() ? "caricato" : "non caricato"],
      ["Aggiornamenti da", (window.BORIN_AGGIORNA && Ponte.estensione && window.BORIN_AGGIORNA.leggiConfig(Ponte.estensione).repo) || "non collegati"],
      ["Node / Chromium", sis.node + " / " + (sis.chrome || navigator.userAgent.match(/Chrome\/([\d.]+)/) && navigator.userAgent.match(/Chrome\/([\d.]+)/)[1] || "?")],
      ["Estensione", Ponte.estensione || "—"], ["Impostazioni", D.cartellaDati()]
    ];
  }
  function disegnaDiagnostica() {
    $("#diagnostica").innerHTML = righeDiagnostica().map(r => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`).join("");
  }
  $("#bCopiaDiagnostica").addEventListener("click", () => {
    const t = ["BORIN Batch · diagnostica " + new Date().toLocaleString("it-IT")].concat(righeDiagnostica().map(r => r[0] + ": " + r[1]),
      ["Impostazioni: " + JSON.stringify(S.cfg)]).join("\n");
    const ta = document.createElement("textarea");
    ta.value = t; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); $("#bCopiaDiagnostica").textContent = "Copiata"; setTimeout(() => { $("#bCopiaDiagnostica").textContent = "Copia per l'assistenza"; }, 1600); } catch (e) {}
    ta.remove();
  });
  $("#bRicarica").addEventListener("click", async () => {
    if (Ponte.inPhotoshop) await Ponte.caricaMotore(true);
    await collega(); disegnaDiagnostica();
  });
  $("#bCartellaDati").addEventListener("click", () => D.mostra(D.cartellaDati()));
  $("#bCwebp").addEventListener("click", () => {
    const f = Ponte.scegliFile("Scegli il programma cwebp", "", []);
    if (f) { S.cfg.export.cwebp = f; cambiato(); }
  });

  // ------------------------------------------------------------------ schede
  $$(".schede button").forEach(b => b.addEventListener("click", () => {
    $$(".schede button").forEach(x => x.setAttribute("aria-selected", String(x === b)));
    $$(".scheda").forEach(s => s.classList.toggle("attiva", s.id === "s-" + b.dataset.scheda));
    if (b.dataset.scheda === "info") disegnaDiagnostica();
    if (b.dataset.scheda === "registro") disegnaSessioni();
    $("#contenuto").scrollTop = 0;
  }));

  // ------------------------------------------------------------------ avvio
  carica();
  disegnaStiliOmbra();
  mostraCartelle();
  if (S.sorgente === "CARTELLA") leggiFile();
  aggiorna();
  mostraRipresa();
  disegnaSessioni();
  collega().then(() => {
    if (S.sorgente === "DOCUMENTI") leggiDocumenti();
    controllaAggiornamenti(false);
    // agganci per i collaudi fuori da Photoshop
    if (window.BORIN_SCHEDA) { const b = $(`.schede [data-scheda="${window.BORIN_SCHEDA}"]`); if (b) b.click(); }
    if (window.BORIN_AZIONE === "prova") esegui({ prova: true });
    if (window.BORIN_AZIONE === "batch") esegui({});
  });
  window.BORIN_PANNELLO = { S, aggiorna, esegui, usaPreset, leggiFile, mostraCartelle };
})();
