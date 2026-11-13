/* BORIN Batch 8 · disco: cartelle, intestazioni delle immagini, piano delle uscite, registro, cwebp.
   Gira con Node: dentro il pannello CEP (Node attivo) e nei collaudi da terminale. */
(function () {
  "use strict";
  const fs = require("fs"), path = require("path"), os = require("os"), cp = require("child_process");

  const ESTENSIONI = ["jpg", "jpeg", "png", "tif", "tiff", "psd", "psb", "webp"];
  const WIN = process.platform === "win32";

  // ------------------------------------------------------------ cartelle e JSON
  function cartellaDati() {
    const base = WIN ? (process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"))
                     : path.join(os.homedir(), "Library", "Application Support");
    const c = path.join(base, "BORIN", "Batch Photoshop");
    fs.mkdirSync(c, { recursive: true });
    return c;
  }
  function cartellaTemp(id) {
    const c = path.join(os.tmpdir(), "borin-batch", id || "comune");
    fs.mkdirSync(c, { recursive: true });
    return c;
  }
  function leggiJSON(file, predefinito) {
    try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { return predefinito; }
  }
  function scriviJSON(file, dati) {                  // scrittura sicura: prima un file temporaneo, poi lo scambio
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + ".tmp-" + process.pid;
    fs.writeFileSync(tmp, JSON.stringify(dati, null, 2), "utf8");
    fs.renameSync(tmp, file);
  }
  function esiste(p) { try { fs.accessSync(p); return true; } catch (e) { return false; } }
  function creaCartella(p) { fs.mkdirSync(p, { recursive: true }); }
  function stessoPercorso(a, b) {
    const x = path.resolve(a), y = path.resolve(b);
    return WIN ? x.toLowerCase() === y.toLowerCase() : x === y;
  }
  function dentro(figlio, padre) {
    const rel = path.relative(path.resolve(padre), path.resolve(figlio));
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
  }

  // ------------------------------------------------------------ elenco delle immagini
  function elencaImmagini(cartella, opz) {
    opz = opz || {};
    const out = [], escludi = (opz.escludi || []).filter(Boolean);
    (function giu(dir, rel) {
      let voci;
      try { voci = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
      voci.sort((a, b) => a.name.localeCompare(b.name, "it", { numeric: true, sensitivity: "base" }));
      for (const v of voci) {
        if (v.name.startsWith(".") || v.name.startsWith("~borin_")) continue;
        const p = path.join(dir, v.name);
        if (v.isDirectory()) {
          if (opz.sottocartelle && !escludi.some(e => dentro(p, e))) giu(p, rel ? path.join(rel, v.name) : v.name);
          continue;
        }
        const ext = path.extname(v.name).slice(1).toLowerCase();
        if (!ESTENSIONI.includes(ext)) continue;
        let st;
        try { st = fs.statSync(p); } catch (e) { continue; }
        out.push({ percorso: p, nome: v.name, rel: rel, ext: ext === "jpeg" ? "jpg" : ext === "tiff" ? "tif" : ext, byte: st.size });
      }
    })(cartella, "");
    return out;
  }

  // ------------------------------------------------------------ intestazioni (misure, alpha, livelli) senza aprire Photoshop
  function leggi(fd, pos, n) {
    const b = Buffer.alloc(n);
    const letti = fs.readSync(fd, b, 0, n, pos);
    return letti < n ? b.subarray(0, letti) : b;
  }
  function intestazione(percorso) {
    let fd;
    try {
      fd = fs.openSync(percorso, "r");
      const dim = fs.fstatSync(fd).size, t = leggi(fd, 0, 32);
      if (t.length >= 8 && t.readUInt32BE(0) === 0x89504e47) return png(fd, t, dim);
      if (t.length >= 3 && t[0] === 0xff && t[1] === 0xd8) return jpg(fd, dim);
      if (t.length >= 12 && t.toString("ascii", 0, 4) === "RIFF" && t.toString("ascii", 8, 12) === "WEBP") return webp(fd, dim);
      if (t.length >= 26 && t.toString("ascii", 0, 4) === "8BPS") return psd(fd, t);
      if (t.length >= 8 && (t.toString("ascii", 0, 2) === "II" || t.toString("ascii", 0, 2) === "MM")) return tiff(fd, t, dim);
      return { formato: "?", errore: "formato non riconosciuto" };
    } catch (e) {
      return { formato: "?", errore: e.message };
    } finally {
      if (fd !== undefined) try { fs.closeSync(fd); } catch (e) {}
    }
  }
  function png(fd, t, dim) {
    const r = { formato: "PNG", larghezza: t.readUInt32BE(16), altezza: t.readUInt32BE(20), bit: t[24], alpha: t[25] === 4 || t[25] === 6 };
    let pos = 8;
    while (!r.alpha && pos + 8 <= dim) {               // tRNS = trasparenza anche senza canale alpha
      const c = leggi(fd, pos, 8), lung = c.readUInt32BE(0), tipo = c.toString("ascii", 4, 8);
      if (tipo === "tRNS") r.alpha = true;
      if (tipo === "IDAT" || tipo === "IEND") break;
      pos += 12 + lung;
    }
    return r;
  }
  function jpg(fd, dim) {
    let pos = 2;
    while (pos + 4 <= dim) {
      const m = leggi(fd, pos, 4);
      if (m[0] !== 0xff) { pos++; continue; }
      const tipo = m[1];
      if (tipo === 0xd8 || (tipo >= 0xd0 && tipo <= 0xd7) || tipo === 0x01 || tipo === 0xff) { pos += tipo === 0xff ? 1 : 2; continue; }
      const lung = m.readUInt16BE(2);
      if (tipo >= 0xc0 && tipo <= 0xcf && tipo !== 0xc4 && tipo !== 0xc8 && tipo !== 0xcc) {
        const s = leggi(fd, pos + 4, 6);
        return { formato: "JPG", altezza: s.readUInt16BE(1), larghezza: s.readUInt16BE(3), alpha: false,
                 modo: s[5] === 4 ? "CMYK" : s[5] === 1 ? "Grigio" : "RGB" };
      }
      pos += 2 + lung;
    }
    return { formato: "JPG", alpha: false, errore: "misure non trovate" };
  }
  function webp(fd, dim) {
    const r = { formato: "WEBP", alpha: false, animato: false };
    let pos = 12;
    while (pos + 8 <= dim) {
      const c = leggi(fd, pos, 8), tipo = c.toString("ascii", 0, 4), lung = c.readUInt32LE(4), d = leggi(fd, pos + 8, Math.min(lung, 10));
      if (tipo === "VP8X") {
        r.alpha = r.alpha || !!(d[0] & 0x10); r.animato = !!(d[0] & 0x02);
        r.larghezza = 1 + d.readUIntLE(4, 3); r.altezza = 1 + d.readUIntLE(7, 3);
      } else if (tipo === "VP8 " && d.length >= 10) {
        if (!r.larghezza) { r.larghezza = d.readUInt16LE(6) & 0x3fff; r.altezza = d.readUInt16LE(8) & 0x3fff; }
      } else if (tipo === "VP8L" && d.length >= 5) {
        const v = d.readUInt32LE(1);
        if (!r.larghezza) { r.larghezza = 1 + (v & 0x3fff); r.altezza = 1 + ((v >>> 14) & 0x3fff); }
        r.alpha = r.alpha || !!((v >>> 28) & 1);
      } else if (tipo === "ALPH") r.alpha = true;
      else if (tipo === "ANIM" || tipo === "ANMF") r.animato = true;
      pos += 8 + lung + (lung % 2);
    }
    return r;
  }
  function psd(fd, t) {
    const psb = t.readUInt16BE(4) === 2, MODI = { 0: "Bitmap", 1: "Grigio", 2: "Indicizzato", 3: "RGB", 4: "CMYK", 7: "Multicanale", 8: "Duotono", 9: "Lab" };
    const r = { formato: psb ? "PSB" : "PSD", altezza: t.readUInt32BE(14), larghezza: t.readUInt32BE(18), bit: t.readUInt16BE(22),
                modo: MODI[t.readUInt16BE(24)] || "?", livelli: null, alpha: null };
    try {
      let pos = 26;
      pos += 4 + leggi(fd, pos, 4).readUInt32BE(0);      // dati del modo colore
      pos += 4 + leggi(fd, pos, 4).readUInt32BE(0);      // risorse dell'immagine
      const L = psb ? 8 : 4, totale = leggi(fd, pos, L);
      const lungTot = psb ? Number(totale.readBigUInt64BE(0)) : totale.readUInt32BE(0);
      if (lungTot === 0) { r.livelli = 0; return r; }
      const info = leggi(fd, pos + L, L), lungInfo = psb ? Number(info.readBigUInt64BE(0)) : info.readUInt32BE(0);
      if (lungInfo === 0) { r.livelli = 0; return r; }
      const n = leggi(fd, pos + 2 * L, 2).readInt16BE(0);
      r.livelli = Math.abs(n);
      r.alpha = n < 0 ? true : null;
    } catch (e) {}
    return r;
  }
  function tiff(fd, t, dim) {
    const le = t.toString("ascii", 0, 2) === "II";
    const u16 = (b, o) => le ? b.readUInt16LE(o) : b.readUInt16BE(o), u32 = (b, o) => le ? b.readUInt32LE(o) : b.readUInt32BE(o);
    const r = { formato: "TIFF", alpha: false, livelli: null };
    if (u16(t, 2) !== 42) return { formato: "TIFF", errore: "BigTIFF non letto" };
    const ifd = u32(t, 4), n = u16(leggi(fd, ifd, 2), 0), e = leggi(fd, ifd + 2, n * 12);
    let campioni = 3, foto = 2;
    for (let i = 0; i < n; i++) {
      const o = i * 12, tag = u16(e, o), tipo = u16(e, o + 2), val = tipo === 3 ? u16(e, o + 8) : u32(e, o + 8);
      if (tag === 256) r.larghezza = val;
      else if (tag === 257) r.altezza = val;
      else if (tag === 277) campioni = val;
      else if (tag === 262) foto = val;
      else if (tag === 338) r.alpha = true;
      else if (tag === 37724) r.livelli = "sì";
    }
    r.modo = foto === 5 ? "CMYK" : foto <= 1 ? "Grigio" : "RGB";
    if (!r.alpha && ((foto === 2 && campioni > 3) || (foto === 5 && campioni > 4))) r.alpha = true;
    return r;
  }

  // Che cosa farà il modo automatico con questo file (previsione: il motore decide aprendo il file).
  function previsione(int) {
    if (!int || int.errore) return { codice: "?", testo: "da analizzare" };
    if (int.formato === "WEBP" && int.animato) return { codice: "NO", testo: "WebP animato: non si elabora" };
    if ((int.formato === "PSD" || int.formato === "PSB") && int.livelli > 1) return { codice: "LIV", testo: "a livelli (" + int.livelli + ")" };
    if (int.formato === "TIFF" && int.livelli) return { codice: "LIV", testo: "TIFF a livelli" };
    if (int.alpha) return { codice: "PRECUT", testo: "forse già scontornata" };
    if (int.alpha === false) return { codice: "CUTOUT", testo: "da scontornare" };
    return { codice: "?", testo: "deciso all'apertura" };
  }

  // ------------------------------------------------------------ piano delle uscite
  const RISERVATI = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
  function nomeSicuro(s) {
    let n = String(s).replace(/[<>:"\/\\|?*\x00-\x1f]/g, "_").replace(/[. ]+$/, "").trim();
    if (!n) n = "Immagine";
    if (RISERVATI.test(n)) n = "_" + n;
    return n;
  }
  function percorsiUscita(cfg, radice, rel, base, nome) {
    const E = cfg.export, P = {};
    if (E.struttura === "FORMATO") {
      const sotto = rel || "";
      if (E.psd) P.psd = path.join(radice, "PSD", sotto, nome + ".psd");
      if (E.jpg) P.jpg = path.join(radice, "JPG", sotto, nome + ".jpg");
      if (E.png) P.png = path.join(radice, "PNG", sotto, nome + ".png");
      if (E.webp) P.webp = path.join(radice, "WEBP", sotto, nome + ".webp");
    } else {
      const c = path.join(radice, "Immagini singole cartelle", base);
      if (E.psd) P.psd = path.join(c, "PSD", nome + ".psd");
      if (E.jpg) P.jpg = path.join(c, "JPG", nome + ".jpg");
      if (E.png) P.png = path.join(c, "PNG", nome + ".png");
      if (E.webp) {
        P.webp = path.join(c, "WEB", nome + ".webp");
        if (E.raccoltaWebP) P.webpCopie = [path.join(radice, "Immagini WEBP", nome + ".webp")];
      }
    }
    return P;
  }
  function tuttiIPercorsi(P) {
    const l = [];
    ["psd", "jpg", "png", "webp"].forEach(k => { if (P[k]) l.push(P[k]); });
    (P.webpCopie || []).forEach(x => l.push(x));
    return l;
  }
  // Un lavoro per file: nome di base unico (foto.jpg e foto.png non si sovrascrivono), percorsi, salto o versione.
  function pianifica(file, cfg, radice) {
    const E = cfg.export, conta = {}, usati = {}, lavori = [];
    const chiave = f => ((E.struttura === "FORMATO" ? f.rel + "/" : "") + nomeSicuro(path.parse(f.nome).name)).toLowerCase();
    file.forEach(f => { const k = chiave(f); conta[k] = (conta[k] || 0) + 1; });
    for (const f of file) {
      let base = nomeSicuro(path.parse(f.nome).name);
      if (conta[chiave(f)] > 1) base += "_" + f.ext.toUpperCase();
      let prova = base, n = 2;
      while (usati[((E.struttura === "FORMATO" ? f.rel + "/" : "") + prova).toLowerCase()]) prova = base + "_" + n++;
      base = prova;
      usati[((E.struttura === "FORMATO" ? f.rel + "/" : "") + base).toLowerCase()] = true;
      const suff = E.suffisso ? nomeSicuro(E.suffisso) : "";
      let nome = base + suff, P = percorsiUscita(cfg, radice, f.rel, base, nome);
      const tutti = tuttiIPercorsi(P), esistenti = tutti.filter(esiste);
      let salta = false, versione = null;
      if (E.esistenti === "SALTA" && tutti.length && esistenti.length === tutti.length) salta = true;
      else if (E.esistenti === "VERSIONE" && esistenti.length) {
        let v = 2;
        do { nome = base + suff + "_" + String(v).padStart(2, "0"); P = percorsiUscita(cfg, radice, f.rel, base, nome); v++; }
        while (tuttiIPercorsi(P).some(esiste) && v < 1000);
        versione = nome;
      }
      lavori.push({ file: f, base, nome, uscite: P, salta, versione, rinominato: base !== nomeSicuro(path.parse(f.nome).name) });
    }
    return lavori;
  }

  // Controlla le uscite scritte: esistono, misure giuste, trasparenza dove serve.
  function verificaUscite(lavoro, cfg, risultato) {
    const E = cfg.export, W = cfg.tela.larghezza, H = cfg.tela.altezza, problemi = [];
    const atteso = lato => {
      if (!lato || lato >= Math.max(W, H)) return [W, H];
      const s = lato / Math.max(W, H);
      return [Math.max(1, Math.round(W * s)), Math.max(1, Math.round(H * s))];
    };
    const controlli = [["jpg", E.jpgLato, false], ["png", E.pngLato, !E.sfondoBiancoPNG], ["webp", E.webpLato, !E.sfondoBiancoWebP]];
    // La trasparenza si pretende solo se il soggetto è stato scontornato o lo era già.
    const conAlpha = !!(risultato && risultato.ok && risultato.flusso &&
      (risultato.flusso.preparazione === "CUTOUT" || (risultato.analisi && risultato.analisi.trasparente)));
    if (lavoro.uscite.psd && !esiste(lavoro.uscite.psd)) problemi.push("PSD mancante");
    for (const [k, lato, vuoleAlpha] of controlli) {
      const p = lavoro.uscite[k];
      if (!p) continue;
      if (!esiste(p)) { problemi.push(k.toUpperCase() + " mancante"); continue; }
      const int = intestazione(p), [w, h] = atteso(lato);
      if (int.errore) { problemi.push(k.toUpperCase() + ": " + int.errore); continue; }
      if (Math.abs(int.larghezza - w) > 1 || Math.abs(int.altezza - h) > 1) problemi.push(k.toUpperCase() + " " + int.larghezza + "×" + int.altezza + " invece di " + w + "×" + h);
      if (vuoleAlpha && conAlpha && int.alpha === false) problemi.push(k.toUpperCase() + " senza trasparenza");
    }
    return problemi;
  }

  // ------------------------------------------------------------ cwebp (facoltativo)
  function trovaCwebp(personale, cartellaEstensione) {
    const nome = WIN ? "cwebp.exe" : "cwebp", candidati = [];
    if (personale) candidati.push(personale);
    if (cartellaEstensione) candidati.push(path.join(cartellaEstensione, "bin", nome));
    if (WIN) candidati.push("C:\\Program Files\\libwebp\\bin\\cwebp.exe", "C:\\Program Files\\WebP\\bin\\cwebp.exe", "C:\\webp\\bin\\cwebp.exe");
    else candidati.push("/opt/homebrew/bin/cwebp", "/usr/local/bin/cwebp", "/opt/local/bin/cwebp", "/usr/bin/cwebp");
    return candidati.find(esiste) || null;
  }
  function eseguiCwebp(exe, png, webp, E) {
    return new Promise((ok, ko) => {
      const arg = ["-quiet", "-m", "6", "-metadata", "icc"];
      if (E.webpLossless) arg.push("-lossless"); else arg.push("-q", String(E.webpQualita), "-alpha_q", "100");
      arg.push(png, "-o", webp);
      cp.execFile(exe, arg, { windowsHide: true, timeout: 120000 }, (err, so, se) => {
        if (err) return ko(new Error("cwebp: " + (se || err.message).toString().trim()));
        if (!esiste(webp)) return ko(new Error("cwebp non ha scritto il file"));
        ok(webp);
      });
    });
  }

  // ------------------------------------------------------------ registro della sessione
  function dataOra(d) {
    const z = n => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate()) + "_" + z(d.getHours()) + "-" + z(d.getMinutes());
  }
  function scriviRegistro(radice, sessione) {
    const c = path.join(radice, "LOG");
    creaCartella(c);
    const nome = "BORIN_Batch_" + dataOra(new Date(sessione.inizio)) + (sessione.prova ? "_prova" : "");
    const righe = [
      "BORIN Batch " + sessione.versione + " · " + new Date(sessione.inizio).toLocaleString("it-IT"),
      "Photoshop " + (sessione.photoshop || "?") + " · " + (sessione.sistema || process.platform),
      "Ingresso: " + sessione.ingresso, "Uscita: " + radice,
      "Preset: " + sessione.preset, "Impostazioni: " + JSON.stringify(sessione.cfg), ""
    ];
    const csv = ["file;esito;lavorazione;scala;ombra_suolo_px;avvisi;errore;secondi"];
    for (const r of sessione.risultati) {
      const esito = r.saltato ? "SALTATO" : r.ok ? (r.avvisi && r.avvisi.length ? "AVVISO" : "OK") : "ERRORE";
      righe.push("[" + esito + "] " + r.nome + (r.errore ? " → " + r.errore : ""));
      (r.avvisi || []).forEach(a => righe.push("    · " + a));
      const lav = r.flusso ? r.flusso.preparazione + "/" + r.flusso.livelli : "";
      csv.push([r.nome, esito, lav, r.scala || "", r.ombra ? r.ombra.suolo : "", (r.avvisi || []).join(" | "), r.errore || "",
        r.durata ? (r.durata / 1000).toFixed(1) : ""].map(x => '"' + String(x).replace(/"/g, '""') + '"').join(";"));
    }
    righe.push("", "Fine: " + new Date().toLocaleString("it-IT") + (sessione.interrotto ? " · interrotto dall'utente" : ""));
    const txt = path.join(c, nome + ".txt");
    fs.writeFileSync(txt, righe.join(os.EOL), "utf8");
    fs.writeFileSync(path.join(c, nome + ".csv"), "\ufeff" + csv.join("\r\n"), "utf8");
    return txt;
  }

  // ------------------------------------------------------------ Finder / Esplora risorse
  function mostra(percorso, seleziona) {
    try {
      if (WIN) cp.spawn("explorer.exe", seleziona ? ["/select,", percorso] : [percorso], { detached: true });
      else cp.spawn("open", seleziona ? ["-R", percorso] : [percorso], { detached: true });
    } catch (e) {}
  }
  function avvisoSistema(titolo, testo) {
    if (WIN) return;
    try { cp.execFile("osascript", ["-e", "display notification " + JSON.stringify(testo) + " with title " + JSON.stringify(titolo)]); } catch (e) {}
  }
  function urlFile(p) {
    const s = path.resolve(p).replace(/\\/g, "/");
    return "file://" + (s.startsWith("/") ? "" : "/") + s.split("/").map(encodeURIComponent).join("/").replace(/^\/([A-Za-z])%3A/, "/$1:");
  }

  function copiaFile(da, a) { creaCartella(path.dirname(a)); fs.copyFileSync(da, a); }
  function elimina(p) { try { fs.unlinkSync(p); } catch (e) {} }
  function aggiungiTesto(file, testo) { try { creaCartella(path.dirname(file)); fs.appendFileSync(file, testo, "utf8"); } catch (e) {} }
  function sistema() {
    return { piattaforma: process.platform, arch: process.arch, node: process.versions.node, chrome: process.versions.chrome || "",
             utente: os.userInfo().username, cpu: os.cpus().length, memoriaGB: Math.round(os.totalmem() / 1073741824) };
  }

  const API = {
    unisci: (...p) => path.join(...p), cartellaDi: p => path.dirname(p), nomeDi: p => path.basename(p),
    copiaFile, elimina, aggiungiTesto, sistema,
    ESTENSIONI, WIN, cartellaDati, cartellaTemp, leggiJSON, scriviJSON, esiste, creaCartella, stessoPercorso, dentro,
    elencaImmagini, intestazione, previsione, nomeSicuro, pianifica, tuttiIPercorsi, verificaUscite,
    trovaCwebp, eseguiCwebp, scriviRegistro, mostra, avvisoSistema, urlFile, dataOra
  };
  if (typeof window !== "undefined") window.BORIN_DISCO = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
