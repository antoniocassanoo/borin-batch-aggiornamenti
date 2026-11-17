/* BORIN Batch 8 · ponte tra il pannello e Photoshop (CEP).
   Fuori da Photoshop (anteprima nel browser, collaudi) usa window.BORIN_FINTO se c'è. */
(function () {
  "use strict";
  const cep = window.__adobe_cep__ || null;
  const finto = window.BORIN_FINTO || null;
  const ID = "com.borin.batch.pannello";

  function percorsoDaURL(u) {
    let p = decodeURIComponent(String(u || ""));
    p = p.replace(/^file:\/\/\//, navigator.platform.indexOf("Win") === 0 ? "" : "/").replace(/^file:\/\//, "");
    return p;
  }

  function eval_(script) {
    return new Promise((ok) => {
      if (!cep) return ok(null);
      cep.evalScript(script, r => ok(r));
    });
  }

  const Ponte = {
    inPhotoshop: !!cep,
    conNode: typeof require === "function",
    estensione: "",

    // Chiama una funzione del motore: BORIN.chiama(nome, argomenti codificati) → {ok, dati|errore}
    async chiama(nome, arg) {
      if (!cep) {
        if (finto) return finto.chiama(nome, arg);
        throw new Error("Il pannello non è dentro Photoshop.");
      }
      const s = "(typeof BORIN === 'undefined') ? 'NOMOTORE' : BORIN.chiama(" + JSON.stringify(nome) + "," +
        JSON.stringify(encodeURIComponent(JSON.stringify(arg || {}))) + ")";
      const r = await eval_(s);
      if (r === "NOMOTORE") { await this.caricaMotore(true); return this.chiama(nome, arg); }
      if (r === null || r === undefined || r === "EvalScript error.") throw new Error("Photoshop non ha risposto (EvalScript error). Prova «Ricarica il motore» in Info.");
      let o;
      try { o = JSON.parse(decodeURIComponent(r)); } catch (e) { throw new Error("Risposta non valida dal motore: " + String(r).slice(0, 200)); }
      if (!o.ok) throw new Error(o.errore);
      return o.dati;
    },

    async caricaMotore(forza) {
      if (!cep) return finto ? "finto" : null;
      const file = (this.estensione + "/jsx/borin_motore.jsx").replace(/\\/g, "/");
      const s = (forza ? "" : "if (typeof BORIN === 'undefined' || BORIN.versione !== '" + VERSIONE_MOTORE + "') ") +
        "$.evalFile(new File(" + JSON.stringify(file) + ")); (typeof BORIN === 'undefined') ? 'no' : BORIN.versione";
      return eval_(s);
    },

    ascolta(tipo, fn) {
      if (finto && finto.ascolta) finto.ascolta(tipo, fn);
      if (!cep) return;
      cep.addEventListener(tipo, ev => {
        let d = ev && ev.data;
        try { if (typeof d === "string") d = JSON.parse(decodeURIComponent(d)); } catch (e) {}
        fn(d);
      });
    },

    ambiente() {
      if (!cep) return finto && finto.ambiente ? finto.ambiente() : { appVersion: "", appSkinInfo: null };
      try { return JSON.parse(cep.getHostEnvironment()); } catch (e) { return {}; }
    },

    // Colore del pannello di Photoshop: per scegliere il tema chiaro o scuro.
    sfondoPhotoshop() {
      const a = this.ambiente(), c = a && a.appSkinInfo && a.appSkinInfo.panelBackgroundColor && a.appSkinInfo.panelBackgroundColor.color;
      return c ? { r: c.red, g: c.green, b: c.blue } : null;
    },
    quandoCambiaTema(fn) { this.ascolta("com.adobe.csxs.events.ThemeColorChanged", fn); },

    // Il pannello resta vivo anche se lo si chiude o lo si riduce: il batch non si ferma.
    restaAttivo() {
      if (!cep) return;
      try {
        cep.dispatchEvent({ type: "com.adobe.PhotoshopPersistent", scope: "APPLICATION", appId: "", extensionId: ID, data: "" });
      } catch (e) {}
    },

    scegliCartella(titolo, iniziale) {
      if (window.cep && window.cep.fs) {
        const f = window.cep.fs.showOpenDialogEx || window.cep.fs.showOpenDialog;
        const r = f.call(window.cep.fs, false, true, titolo, iniziale || "");
        return r && r.data && r.data.length ? percorsoDaURL(r.data[0]) : null;
      }
      return finto && finto.scegliCartella ? finto.scegliCartella(titolo) : null;
    },
    scegliFiles(titolo, iniziale, tipi) {                 // più file insieme («Alcuni file › Aggiungi…»)
      if (window.cep && window.cep.fs) {
        const r = window.cep.fs.showOpenDialogEx(true, false, titolo, iniziale || "", tipi || []);
        return r && r.data && r.data.length ? r.data.map(percorsoDaURL) : [];
      }
      return finto && finto.scegliFiles ? finto.scegliFiles(titolo) : [];
    },
    percorsoDaURL,
    scegliFile(titolo, iniziale, tipi) {
      if (window.cep && window.cep.fs) {
        const r = window.cep.fs.showOpenDialogEx(false, false, titolo, iniziale || "", tipi || []);
        return r && r.data && r.data.length ? percorsoDaURL(r.data[0]) : null;
      }
      return finto && finto.scegliFile ? finto.scegliFile(titolo) : null;
    },
    salvaFile(titolo, iniziale, nome) {
      if (window.cep && window.cep.fs && window.cep.fs.showSaveDialogEx) {
        const r = window.cep.fs.showSaveDialogEx(titolo, iniziale || "", ["json"], nome || "");
        return r && r.data ? percorsoDaURL(r.data) : null;
      }
      return finto && finto.salvaFile ? finto.salvaFile(titolo, nome) : null;
    },
    apriURL(u) {
      if (window.cep && window.cep.util) window.cep.util.openURLInDefaultBrowser(u);
      else window.open(u, "_blank");
    }
  };

  const VERSIONE_MOTORE = "8.1.0";
  if (cep) {
    try { Ponte.estensione = percorsoDaURL(cep.getSystemPath("extension")); } catch (e) {}
  } else if (finto && finto.estensione) Ponte.estensione = finto.estensione;
  Ponte.VERSIONE_MOTORE = VERSIONE_MOTORE;
  window.Ponte = Ponte;
})();
