/*
 * Sprachsteuerung im Sägemodus: wenige feste Befehle („weiter“, „zurück“, „drucken“, „nächster Streifen“ …).
 *   parse(text) → Befehl ('next' | 'prev' | 'print' | 'strip' | 'sheet' | 'say' | 'full' | 'off') oder null
 *   create({ onCommand, onState, onHeard, voskBase }) → { start(), stop(), on, engine }
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
  // längere Wendungen zuerst („nächster Streifen“ vor „nächster“)
  const RULES = [
    ['off', /\b(mikro(fon)? aus|sprache aus|zuhoeren aus|stopp? (mikro(fon)?|sprache))\b/],
    ['strip', /\b(naechste[nrs]? streifen|streifen weiter|neuer streifen)\b/],
    ['sheet', /\b(naechste[nr]? platte|neue platte|platte weiter)\b/],
    ['print', /\b(drucken?|drucke|etikett(en)?|ausdrucken)\b/],
    ['prev', /\b(zurueck|vorher(ige[nr]?)?)\b/],
    ['say', /\b(wiederholen|nochmal|noch ?mal|ansage|wie viel|welches mass)\b/],
    ['full', /\b(vollbild)\b/],
    ['next', /\b(weiter|naechste[rns]?|ok(ay)?|fertig|geschnitten|los)\b/],
  ];
  function parse(text) {
    const t = norm(text);
    if (!t) return null;
    for (const [cmd, re] of RULES) if (re.test(t)) return cmd;
    return null;
  }
  // Grammatik für Vosk: nur diese Wörter/Wendungen (Rest = [unk])
  const GRAMMAR = ['weiter', 'nächster', 'nächste', 'okay', 'fertig', 'geschnitten', 'zurück', 'drucken', 'etikett', 'etiketten',
    'nächster streifen', 'nächsten streifen', 'nächste platte', 'wiederholen', 'nochmal', 'ansage', 'vollbild', 'mikrofon aus', 'sprache aus', '[unk]'];

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
      const cmd = parse(t);
      if (o.onHeard) o.onHeard(t, cmd);
      if (!cmd) return;
      if (cmd === 'off') { stop(); return; }
      o.onCommand(cmd, t);
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
          heard(alts.find((a) => parse(a)) || alts[0]);
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
      const rec = new st.vosk.KaldiRecognizer(ctx.sampleRate, JSON.stringify(GRAMMAR));
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
    return { start, stop, get on() { return st.on; }, get engine() { return st.engine; } };
  }

  const supported = () => !!webSpeech() || (typeof navigator !== 'undefined' && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia));
  return { parse, norm, GRAMMAR, create, say, supported };
});
