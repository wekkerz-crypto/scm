/*
 * Sprachsteuerung im Sägemodus: feste Befehle mit vielen Wendungen („weiter“, „okay“, „passt“, „zurück“, „drucken“,
 * „nächster Streifen“, „Streifen drei“, „Platte 2“, „Schritt 5“, „von vorn“, „wie weit“, „Ansage aus“ …).
 *   parseCmd(text) → { cmd, n?, arg? } oder null (Liste bei RULES), parse(text) → nur cmd
 *   create({ onCommand(cmd, text, c), onFree(text), onState, onHeard, voskBase, free() }) → { start(), stop(), restart(), on, engine }
 *   onFree bekommt Sätze, die kein Befehl sind (z. B. für die KI); free() = true → Vosk ohne Grammatik (ganzer Wortschatz).
 * Erkennung: im Browser (Web Speech API – Chrome/Edge, braucht Internet) oder offline mit Vosk, wenn unter voskBase
 * vosk.js und model-de.tar.gz liegen (tools/sprache_holen.sh, Raspberry Pi: einrichten.sh --sprache). Vosk erkennt nur die
 * Befehlswörter (Grammatik) – das ist an der lauten Säge deutlich sicherer.
 * Ansage: say(text) liest Maß/Schritt vor (Sprachausgabe des Browsers); solange gesprochen wird, zählt nichts als Befehl.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Voice = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const norm = (t) => String(t || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

  // Zahlen als Wort (1 … 39), auch Ordnungszahlen („dritter“) und „zwo“
  const UNITS = ['', 'eins', 'zwei', 'drei', 'vier', 'fuenf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwoelf', 'dreizehn', 'vierzehn',
    'fuenfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn', 'zwanzig'];
  const NUMS = new Map();
  UNITS.forEach((w, i) => { if (w) NUMS.set(w, i); });
  NUMS.set('ein', 1); NUMS.set('eine', 1); NUMS.set('einen', 1); NUMS.set('zwo', 2);
  const PRE = ['', 'ein', 'zwei', 'drei', 'vier', 'fuenf', 'sechs', 'sieben', 'acht', 'neun'];
  for (let i = 1; i <= 9; i++) { NUMS.set(PRE[i] + 'undzwanzig', 20 + i); NUMS.set(PRE[i] + 'unddreissig', 30 + i); }
  NUMS.set('dreissig', 30);
  const ORD = ['', 'erst', 'zweit', 'dritt', 'viert', 'fuenft', 'sechst', 'siebt', 'acht', 'neunt', 'zehnt', 'elft', 'zwoelft'];
  function numOf(w) {
    if (!w) return 0;
    if (/^\d{1,3}$/.test(w)) return +w;
    if (NUMS.has(w)) return NUMS.get(w);
    const o = w.replace(/(e[nrsm]?)$/, '');
    const k = ORD.indexOf(o);
    return k > 0 ? k : 0;
  }
  // „Streifen 3“, „Streifen Nummer drei“, „dritter Streifen“, „zu Streifen 3“
  function numAfter(t, word) {
    let m = new RegExp('\\b' + word + ' (?:nummer |nr |no )?([a-z0-9]+)\\b').exec(t);
    if (m && numOf(m[1])) return numOf(m[1]);
    m = new RegExp('\\b([a-z0-9]+) ' + word + '\\b').exec(t);
    if (m && numOf(m[1]) && !/^(ein|eine|einen)$/.test(m[1])) return numOf(m[1]);
    return 0;
  }

  /*
   * Befehle (Reihenfolge = Vorrang: längere/genauere Wendungen vor kurzen Wörtern). Ergebnis { cmd, n?, arg? }:
   *   next, prev, strip, prevstrip, sheet, prevsheet, gostrip n, gosheet n, gostep n, reset, print, printstrip,
   *   lmode arg (off|popup|auto), sayon, sayoff, say, status, preview, help, fullon, fulloff, off
   */
  const RULES = [
    ['off', /\b(mikro(fon)? (aus|ausschalten|stopp)|sprache (aus|ausschalten)|(nicht mehr|aufhoeren (zu|mit)) zuhoeren|zuhoeren (aus|beenden)|hoer auf zuzuhoeren)\b/],
    ['help', /\b(hilfe|was kann ich sagen|welche befehle|befehle)\b/],
    ['lmode', /\b(etikett(en)?|label|aufkleber) (aus|ausschalten|ab|abschalten|weg|keine)\b|\bkeine etiketten\b/, 'off'],
    ['lmode', /\b(etikett(en)?|label) (automatisch|auto|sofort)\b|\bautomatisch drucken\b|\bautomatik\b/, 'auto'],
    ['lmode', /\b(etikett(en)?|label) (an|ein|einschalten|fenster|anzeigen)\b/, 'popup'],
    ['sayoff', /\b(ansagen?|vorlesen|sprachausgabe) (aus|ausschalten|ab)\b|\b(ruhe|sei still|still|leise|klappe)\b/],
    ['sayon', /\b(ansagen?|vorlesen|sprachausgabe) (an|ein|einschalten)\b|\b(lies vor|ansagen bitte)\b/],
    ['fulloff', /\bvollbild (aus|beenden|zu|schliessen|weg)\b|\b(kleines bild|normale ansicht)\b/],
    ['fullon', /\b(vollbild|ganzer bildschirm|gross machen|groesser)\b/],
    ['reset', /\b(von vorn(e)?|von anfang an|(ganz )?zum anfang|neu anfangen|nochmal von vorn(e)?|alles zurueck)\b/],
    ['printstrip', /\b(streifen ?etikett|etikett (fuer )?(den |diesen )?streifen|streifen drucken)\b/],
    ['prevstrip', /\b((vorherige[nrs]?|letzte[nrs]?|voriger?|vorigen) streifen|streifen zurueck)\b/],
    ['prevsheet', /\b((vorherige[nrs]?|letzte[nrs]?|vorige[nr]?) platte|platte zurueck)\b/],
    ['strip', /\b((naechste[nrs]?|neue[nrs]?|andere[nrs]?|folgende[nrs]?) streifen|streifen (weiter|fertig))\b/],
    ['sheet', /\b((naechste[nrs]?|neue[nrs]?|andere[nrs]?|folgende[nrs]?) platte|platte (weiter|fertig|wechseln))\b/],
    ['print', /\b(drucken?|drucke|druck|ausdrucken|etikett(en)?|label|aufkleber|zettel)\b/],
    ['status', /\b(wie weit|wie viele (noch|teile|fehlen)|wieviel(e)? (noch|fehlen)|status|fortschritt|wo (bin ich|sind wir|stehen wir))\b/],
    ['preview', /\b(was kommt (danach|dann|als naechstes|jetzt)|als naechstes|danach)\b/],
    ['prev', /\b(zurueck|zuruck|vorherige[nrs]?|vorher|einen zurueck|schritt zurueck|back)\b/],
    ['say', /\b(wiederhol(en|e)?|nochmal|noch mal|noch einmal|ansage|wie viel|welches mass|mass|wie bitte|was jetzt|was muss ich|sag (mal|nochmal|an)|hae)\b/],
    ['next', /\b(weiter|naechste[rns]?|ok(ay|e)?|o k|fertig|geschnitten|abgeschnitten|los|ja|jawohl|passt|gut|erledigt|done|next|schnitt fertig|und weiter|geht s weiter)\b/],
  ];
  // einfache Wörter („weiter“, „ja“, „fertig“, „zurück“, „drucken“, „nochmal“) zählen nur in kurzen Äußerungen – sonst löst
  // ein Gespräch neben der Säge („ja, die Seiten sind schon geschnitten …“) einen Schritt aus
  const SHORT_ONLY = new Set(['next', 'prev', 'print', 'say']);
  const MAX_SHORT = 4;
  function parseCmd(text) {
    const t = norm(text);
    if (!t) return null;
    const c = parseAny(t);
    if (c && SHORT_ONLY.has(c.cmd) && t.split(' ').length > MAX_SHORT) return null;
    return c;
  }
  function parseAny(t) {
    // mit Nummer: „Streifen 3“, „Platte zwei“, „Schritt 5“ (vor den übrigen Regeln)
    for (const [cmd, word] of [['gostrip', 'streifen'], ['gosheet', 'platte'], ['gostep', 'schritt']]) {
      const n = numAfter(t, word);
      if (n) return { cmd: cmd, n: n };
    }
    for (const [cmd, re, arg] of RULES) if (re.test(t)) return arg ? { cmd: cmd, arg: arg } : { cmd: cmd };
    return null;
  }
  const parse = (text) => { const c = parseCmd(text); return c ? c.cmd : null; };

  // Grammatik für Vosk (offline): nur diese Wörter/Wendungen, Rest = [unk]
  const NUMW = ['eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf', 'dreizehn', 'vierzehn', 'fünfzehn',
    'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn', 'zwanzig'];
  const GRAMMAR = ['weiter', 'nächster', 'nächste', 'nächster schritt', 'okay', 'ok', 'fertig', 'geschnitten', 'los', 'ja', 'passt', 'erledigt', 'zurück',
    'einen zurück', 'drucken', 'etikett', 'etiketten', 'etikett drucken', 'streifen etikett', 'nächster streifen', 'nächsten streifen', 'vorheriger streifen',
    'nächste platte', 'vorherige platte', 'von vorne', 'von vorn', 'wiederholen', 'nochmal', 'noch einmal', 'ansage', 'ansage an', 'ansage aus', 'ruhe',
    'etiketten aus', 'etiketten an', 'etiketten automatisch', 'vollbild', 'vollbild aus', 'wie weit', 'wie viele noch', 'was kommt danach', 'hilfe',
    'mikrofon aus', 'sprache aus']
    .concat(...['streifen', 'platte', 'schritt'].map((w) => NUMW.map((n) => w + ' ' + n)), ['[unk]']);

  const g = typeof window !== 'undefined' ? window : {};
  const webSpeech = () => g.SpeechRecognition || g.webkitSpeechRecognition || null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('nicht gefunden: ' + src));
      document.head.appendChild(s);
    });
  }
  // Vosk-Dateien vorhanden? (nur über http/https – aus einer Datei geladen kann der Browser sie nicht lesen)
  async function voskAvailable(base) {
    if (!/^https?:/.test(g.location ? g.location.protocol : '')) return false;
    try { const r = await fetch(base + 'model-de.tar.gz', { method: 'HEAD', cache: 'no-store' }); return r.ok; } catch (e) { return false; }
  }

  let speaking = 0; // Zeitpunkt, bis wann eine Ansage läuft (Befehle währenddessen ignorieren)
  function say(text) {
    const ss = g.speechSynthesis;
    if (!ss || !g.SpeechSynthesisUtterance || !text) return false;
    ss.cancel();
    const u = new g.SpeechSynthesisUtterance(String(text));
    u.lang = 'de-DE';
    u.rate = 1.05;
    const de = ss.getVoices().find((v) => /^de/i.test(v.lang));
    if (de) u.voice = de;
    speaking = Date.now() + 8000;
    u.onend = u.onerror = () => { speaking = Date.now() + 400; };
    ss.speak(u);
    return true;
  }
  const busy = () => Date.now() < speaking;

  function create(o) {
    const st = { on: false, engine: null, rec: null, vosk: null, audio: null, stream: null, timer: null, err: '' };
    const state = (msg) => { if (o.onState) o.onState({ on: st.on, engine: st.engine, msg: msg || '' }); };
    const heard = (text) => {
      const t = String(text || '').trim();
      if (!t || busy()) return;
      const c = parseCmd(t);
      if (o.onHeard) o.onHeard(t, c ? c.cmd : null);
      if (!c) { if (o.onFree) o.onFree(t); return; } // kein Befehl: freier Satz (z. B. an die KI)
      if (c.cmd === 'off') { stop(); return; }
      o.onCommand(c.cmd, t, c);
    };

    function startWeb() {
      const R = webSpeech();
      const rec = new R();
      rec.lang = 'de-DE';
      rec.continuous = true;
      rec.interimResults = false;
      rec.maxAlternatives = 3;
      rec.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (!e.results[i].isFinal) continue;
          // erste Alternative, die ein Befehl ist (sonst die erste)
          const alts = Array.from(e.results[i]).map((a) => a.transcript);
          heard(alts.find((a) => parseCmd(a)) || alts[0]);
        }
      };
      rec.onerror = (e) => {
        if (e.error === 'no-speech' || e.error === 'aborted') return;
        st.err = e.error;
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { st.on = false; state('Mikrofon nicht erlaubt – im Browser freigeben.'); }
        else if (e.error === 'network') { st.on = false; state('Spracherkennung des Browsers braucht Internet (auf dem Pi: Offline-Erkennung einrichten, siehe Anleitung).'); }
        else if (e.error === 'audio-capture') { st.on = false; state('Kein Mikrofon gefunden.'); }
      };
      // Chrome beendet nach Pausen von selbst – solange an, neu starten
      rec.onend = () => { if (st.on && st.engine === 'web') { clearTimeout(st.timer); st.timer = setTimeout(() => { try { rec.start(); } catch (e) { /* läuft schon */ } }, 250); } };
      st.rec = rec;
      rec.start();
    }

    async function startVosk() {
      const base = o.voskBase;
      if (!g.Vosk) await loadScript(base + 'vosk.js');
      if (!st.vosk) {
        // Modell laden (beim ersten Mal einige Sekunden); ein defektes Modell meldet sich über load/error – nie ewig warten
        st.vosk = await new Promise((resolve, reject) => {
          const m = new g.Vosk.Model(base + 'model-de.tar.gz');
          const fail = (msg) => { clearTimeout(t); reject(new Error(msg)); }; // terminate() stürzt bei defektem Modell im Worker ab
          const t = setTimeout(() => fail('Sprachmodell lädt nicht (Zeit abgelaufen).'), 180000);
          m.on('load', (x) => { if (x && x.result) { clearTimeout(t); resolve(m); } else fail('Sprachmodell ungültig (model-de.tar.gz).'); });
          m.on('error', (x) => fail('Sprachmodell nicht lesbar' + (x && typeof x.error === 'string' ? ' (' + x.error + ')' : '') + ' – model-de.tar.gz neu holen.'));
        });
      }
      if (!st.on) return; // inzwischen ausgeschaltet
      const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
      const ctx = new (g.AudioContext || g.webkitAudioContext)();
      // freie Sätze (KI) brauchen den ganzen Wortschatz, sonst nur die Befehle (sicherer im Lärm)
      const rec = o.free && o.free() ? new st.vosk.KaldiRecognizer(ctx.sampleRate) : new st.vosk.KaldiRecognizer(ctx.sampleRate, JSON.stringify(GRAMMAR));
      rec.on('result', (m) => heard(m && m.result ? m.result.text : ''));
      const src = ctx.createMediaStreamSource(stream);
      const node = ctx.createScriptProcessor(4096, 1, 1);
      node.onaudioprocess = (e) => { try { rec.acceptWaveform(e.inputBuffer); } catch (err) { /* einzelner Block */ } };
      const mute = ctx.createGain();
      mute.gain.value = 0;
      src.connect(node); node.connect(mute); mute.connect(ctx.destination);
      st.audio = { ctx: ctx, node: node, src: src, rec: rec };
      st.stream = stream;
    }

    async function start() {
      if (st.on) return;
      st.on = true;
      st.err = '';
      try {
        if (o.voskBase && await voskAvailable(o.voskBase)) { st.engine = 'vosk'; state('Lade Offline-Erkennung …'); await startVosk(); }
        else if (webSpeech()) { st.engine = 'web'; startWeb(); }
        else { st.on = false; state('Dieser Browser kann keine Sprache erkennen (Chrome oder Edge nehmen, oder Offline-Erkennung einrichten).'); return; }
        if (st.on) state('');
      } catch (e) {
        st.on = false;
        stop(true);
        state(/Permission|NotAllowed/i.test(String(e && (e.name || e.message))) ? 'Mikrofon nicht erlaubt – im Browser freigeben.' : 'Spracherkennung startet nicht: ' + (e && e.message ? e.message : e));
      }
    }
    function stop(quiet) {
      st.on = false;
      clearTimeout(st.timer);
      if (st.rec) { try { st.rec.onend = null; st.rec.abort(); } catch (e) { /* schon aus */ } st.rec = null; }
      if (st.audio) {
        try { st.audio.src.disconnect(); st.audio.node.disconnect(); st.audio.rec.remove(); st.audio.ctx.close(); } catch (e) { /* schon aus */ }
        st.audio = null;
      }
      if (st.stream) { st.stream.getTracks().forEach((t) => t.stop()); st.stream = null; }
      if (!quiet) state('');
    }
    // neu starten (z. B. nach Umschalten auf freie Sätze – Vosk-Grammatik ändert sich)
    async function restart() { if (!st.on) return; stop(true); await start(); }
    return { start, stop, restart, get on() { return st.on; }, get engine() { return st.engine; } };
  }

  const supported = () => !!webSpeech() || (typeof navigator !== 'undefined' && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia));
  return { parse, parseCmd, norm, numOf, GRAMMAR, create, say, supported };
});
