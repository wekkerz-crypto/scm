/*
 * Step2Maestro – Grundlagen (01-grundlagen.js)
 * Hilfsfunktionen, Einstellungen (Felder, Laden/Speichern), Zustand `state`, Werkzeugliste und Favoriten, Hell/Dunkel.
 * Teil des Programms in web/index.html: alle Dateien unter js/app/ teilen sich die obersten Namen (state, lst, $, render …)
 * und werden dort der Reihenfolge nach (01 … 12) geladen. Beim Laden ausgeführter Code darf nur Namen aus dieser oder
 * früheren Dateien benutzen – Funktionen aus späteren Dateien nur in Ereignissen (Klick …), die erst danach kommen.
 */
'use strict';

const $ = (id) => document.getElementById(id);
const fmt = (v) => { const r = Math.round(v * 100) / 100; return String(Object.is(r, -0) ? 0 : r).replace('.', ','); };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const FACE = { Top: 'oben', Left: 'links', Right: 'rechts', Front: 'vorne', Back: 'hinten' };

// ------------------------------------------------ Einstellungen
// Einstellungen in Gruppen je Bearbeitungsart (Farbe wie in Ansicht und Liste)
const GROUPS = [
  { title: 'Bohren', c: '--drill', fields: [
    ['drillsVertical', 'Bohrer vertikal Ø', 'list', 'Liste der vorhandenen Bohrer in mm'],
    ['drillsHorizontal', 'Bohrer horizontal Ø', 'list', 'für Kantenbohrungen'],
    ['throughExtra', 'Durchgangsbohrung: Dicke +', 'number', 'mm'],
    ['usePatterns', 'Lochreihen als Muster (CreatePattern)', 'bool'],
    ['drillStepFrom', 'In Stufen bohren ab Tiefe', 'number', 'mm · 0 = aus'],
    ['drillStep', 'Tiefe je Stufe', 'number', 'mm']] },
  { title: 'Taschen', c: '--pocket', fields: [
    ['pocketTool', 'Fräser', 'mill'],
    ['pocketStepDown', 'Zustelltiefe je Durchgang', 'number', 'mm · 0 = wie Fräsen'],
    ['pocketOverlap', 'Überdeckung', 'number', '%']] },
  { title: 'Formatfräsen & Konturen', c: '--mill', fields: [
    ['formatTable', 'Formatfräsen', 'formatTable'],
    ['contourExtra', 'Formatfräsen: Dicke +', 'number', 'mm'],
    ['retractOverlap', 'Formatfräsen: Überlappung beim Verlassen', 'number', 'mm'],
    ['dxfThickness', 'DXF: Plattendicke (Vorgabe)', 'number', 'mm · je Teil änderbar'],
    ['contourMode', 'Sonderkontur', 'choice', [['whole', 'Außenkontur am Stück'], ['rect', 'Rechteck + Ausschnitte einzeln']]],
    ['cutoutTool', 'Fräser Ausschnitte', 'mill'],
    ['cutoutExtra', 'Ausschnitte: Dicke +', 'number', 'mm'],
    ['rebateTool', 'Fräser Falz', 'mill'],
    ['rebateStopReturn', 'Abgesetzter Falz: nochmal zurück (Mitte auf der Kante) – aus: einfach ein-, durch-, austauchen', 'bool'],
    ['leadLength', 'An-/Auslauf', 'number', 'mm'],
    ['tabsMode', 'Haltestege bei Durchbrüchen', 'choice', [['off', 'aus'], ['small', 'bei kleinen Innenstücken'], ['all', 'bei allen Durchbrüchen']]],
    ['tabsMaxSize', 'Haltestege: Innenstück bis', 'number', 'mm (größte Seite)'],
    ['tabsCount', 'Haltestege je Durchbruch', 'number', 'Stück'],
    ['tabLength', 'Haltesteg: Länge', 'number', 'mm'],
    ['tabHeight', 'Haltesteg: Höhe', 'number', 'mm Material'],
    ['helixOn', 'Durchbrüche/Rundlöcher spiralförmig eintauchen', 'bool'],
    ['helixStep', 'Spirale: Zustellung je Umlauf', 'number', 'mm'],
    ['stepDown', 'Zustelltiefe je Durchgang', 'number', 'mm · 0 = ein Durchgang'],
    ['finishDepth', 'Letzte Zustellung', 'number', 'mm · 0 = aus (auch Taschen)']] },
  { title: 'Oszillieren & Schleifen', c: '--mill', fields: [
    ['oscMill', 'Formatfräsen oszillierend (Tiefe pendelt)', 'bool'],
    ['oscMillMin', 'Fräser: mindestens unter der Platte', 'number', 'mm'],
    ['oscMillMax', 'Fräser: höchstens unter der Platte', 'number', 'mm'],
    ['oscWave', 'Weg je Schwingung (runter und hoch)', 'number', 'mm'],
    ['sandOn', 'Nach dem Formatfräsen schleifen (Außenkontur)', 'bool'],
    ['sandTool', 'Schleifwalze', 'sand'],
    ['sandMin', 'Schleifwalze: mindestens unter der Platte', 'number', 'mm'],
    ['sandMax', 'Schleifwalze: höchstens unter der Platte', 'number', 'mm'],
    ['sandPasses', 'Schleifen: Umläufe', 'number', 'Stück'],
    ['sandAllowance', 'Schleifzugabe (Formatfräsen bleibt größer)', 'number', 'mm'],
    ['sandLead', 'An-/Abfahrt im Bogen: Faktor', 'number', '× Radius'],
    ['sandOverlap', 'Schleifen: Überlappung am Ende', 'number', 'mm']] },
  { title: 'Clamex (Lamello P-System)', c: '--saw', wide: true, fields: [
    ['clamexMode', 'Clamex-Nuten', 'choice', [['macro', 'über SCM-Makro (nur Position)'], ['direct', 'direkt mit dem Scheibenfräser']]],
    ['clamexMacro', 'Makro-Name', 'text'],
    ['clamexTplEdge', 'Makro-Vorlage Kante (90°)', 'text', '{sx} {sy} {ex} {ey} {angle} {angleZ} {T} {n} {h} {type} {saw} werden eingesetzt'],
    ['clamexTplMiter', 'Makro-Vorlage Gehrung', 'text', 'wie Kante'],
    ['clamexTplFace', 'Makro-Vorlage Fläche (0°)', 'text', 'wie Kante'],
    ['clamexTool', 'Scheibenfräser (nur direkt)', 'mill'],
    ['clamexClear', 'Anfahrt: Abstand vor der Oberfläche', 'number', 'mm'],
    ['clamexMaxReach', 'Hinweis ab Abstand zur Kante', 'number', 'mm']] },
  { title: 'Säge', c: '--saw', fields: [
    ['slantCut', 'Schräge Kanten von Kante zu Kante', 'choice', [['saw', 'mit der Säge schneiden'], ['mill', 'fräsen (5-Achs)']]],
    ['bladeTool', 'Säge für Sägeschnitte', 'saw'],
    ['bladeExtra', 'Sägeschnitt: Extra-Tiefe', 'number', 'mm unter der Platte'],
    ['bladeOverrun', 'Sägeschnitt: Überlauf', 'number', 'mm · 0 = von Kante zu Kante (Werkstatt)'],
    ['scoreCut', 'Sägeschnitt vorritzen', 'bool'],
    ['scoreDepth', 'Vorritzen: Tiefe', 'number', 'mm erster Schnitt'],
    ['scoreOut', 'Vorritzen: Abstand außen', 'number', 'mm'],
    ['sawTool', 'Säge für Nuten', 'saw'],
    ['sawOverrun', 'Nuten: Überlauf', 'number', 'mm'],
    ['maxGrooveWidth', 'Max. Nutbreite', 'number', 'mm']] },
  { title: 'Fasen, Rundungen & schräge Kanten', c: '--chamfer', fields: [
    ['chamferTool', 'Fräser Fasen', 'mill'],
    ['slantTool', 'Fräser schräge Kanten', 'mill'],
    ['slantExtra', 'Schräge Kanten: Dicke +', 'number', 'mm'],
    ['tenonPrecut', 'Zapfen auf Schräge: Vorschnitt', 'choice', [['saw', 'mit der Säge'], ['mill', 'fräsen (5-Achs)']]],
    ['tenonTool', 'Zapfen auf Schräge: Fräser für die Fläche', 'mill'],
    ['tenonAllowance', 'Zapfen: Vorschnitt weiter außen', 'number', 'mm · > 0: Zapfenoberseite wird plan gefräst'],
    ['roundRadius', 'Kantenrundung: Radius des Radiusfräsers', 'number', 'mm'],
    ['roundTopTool', 'Radiusfräser oben', 'mill'],
    ['roundTopDepth', 'Radiusfräser oben: Tiefe (Z)', 'number', 'mm ab Oberseite'],
    ['roundBottomTool', 'Radiusfräser unten', 'mill'],
    ['roundBottomDz', 'Radiusfräser unten: dz ab Unterkante', 'number', 'mm · Tiefe = Dicke + dz']] },
  { title: 'Gekrümmte Flächen', c: '--pocket', fields: [
    ['ballTool', 'Kugelfräser (gewölbte Flächen)', 'mill'],
    ['ballToolDia', 'Kugelfräser Ø, falls nicht in der Liste', 'number', 'mm'],
    ['surfStepover', 'Zeilenabstand', 'number', 'mm'],
    ['surfLayer', 'Zustellung beim Vorfräsen', 'number', 'mm · 0 = nur Schlichten'],
    ['surfRes', 'Punktabstand längs der Zeile', 'number', 'mm'],
    ['surfTol', 'Toleranz', 'number', 'mm'],
    ['surfSafe', 'Abheben zwischen den Zeilen', 'number', 'mm über der Oberseite'],
    ['cyl4Tool', '4-Achs: Schaftfräser (Zylinderflächen)', 'mill'],
    ['cyl4Step', '4-Achs: Zeilenabstand Schlichten', 'number', 'mm auf der Fläche'],
    ['cyl4RoughStep', '4-Achs: Zeilenabstand Vorfräsen', 'number', 'mm (kleiner als Ø)'],
    ['cyl4Layer', '4-Achs: Schichtdicke Vorfräsen', 'number', 'mm senkrecht zur Fläche'],
    ['cyl4MaxTilt', '4-Achs: größte Neigung des Fräsers', 'number', '° · darüber Kugelfräser']] },
  { title: 'Sauger & Konsolen', c: '--muted', fields: [
    ['suctionOn', 'Sauger-Vorschlag ins Programm schreiben', 'bool'],
    ['cupBigCode', 'Sauger groß: Code in Maestro', 'text'],
    ['cupBigX', 'Sauger groß: Länge', 'number', 'mm'],
    ['cupBigY', 'Sauger groß: Breite', 'number', 'mm'],
    ['cupSmallCode', 'Sauger schmal: Code in Maestro', 'text'],
    ['cupSmallX', 'Sauger schmal: Länge', 'number', 'mm'],
    ['cupSmallY', 'Sauger schmal: Breite', 'number', 'mm'],
    ['cupSmallEcc', 'Sauger schmal: Versatz zur Drehachse', 'number', 'mm · exzentrisch, 0 = mittig'],
    ['cupNarrowCode', 'Sauger sehr schmal: Code in Maestro', 'text', 'leer = nicht verwenden'],
    ['cupNarrowX', 'Sauger sehr schmal: Länge', 'number', 'mm'],
    ['cupNarrowY', 'Sauger sehr schmal: Breite', 'number', 'mm'],
    ['cupNarrowEcc', 'Sauger sehr schmal: Versatz zur Drehachse', 'number', 'mm · 0 = mittig'],
    ['cupAngleCw', 'Saugerwinkel im Uhrzeigersinn zählen', 'bool'],
    ['barCount', 'Konsolen an der Maschine', 'number', 'Stück'],
    ['barMinGap', 'Konsolen: kleinster Abstand', 'number', 'mm'],
    ['barSpacing', 'Konsolen: angestrebter Abstand', 'number', 'mm'],
    ['cupsPerBar', 'Sauger je Konsole höchstens', 'number', 'Stück'],
    ['cupEdgeMargin', 'Abstand zur Plattenkante', 'number', 'mm'],
    ['cupHoleMargin', 'Abstand zu Durchbrüchen/Bohrungen', 'number', 'mm']] },
  { title: 'Zeitschätzung', c: '--muted', fields: [
    ['estRapid', 'Eilgang', 'number', 'm/min'],
    ['estChange', 'Werkzeugwechsel', 'number', 's'],
    ['estPerRapid', 'je Anfahrt (heben, senken)', 'number', 's'],
    ['estPerDrill', 'je Bohrung zusätzlich', 'number', 's'],
    ['estLoad', 'Auflegen und Abnehmen je Teil', 'number', 's'],
    ['estFactor', 'Korrekturfaktor (gemessen ÷ geschätzt)', 'number', '× · 1 = ohne']] },
  { title: 'Programmkopf', c: '--muted', fields: [
    ['commentOn', 'Kommentar und Beschreibung (Teil, Maße)', 'bool'],
    ['optimizeOn', 'Maestro optimiert beim Laden (SetOptimization)', 'bool'],
    ['autoSetupOn', 'Tisch beim Laden einrichten (SetAutoSetup)', 'bool'],
    ['workpieceShape', 'Werkstück in Maestro', 'choice', [['box', 'Quader (L × B × D)'], ['contour', 'echte Außenkontur bei Sonderteilen']]]] },
  { title: 'Arbeitsfeld & Rohteil', c: '--muted', fields: [
    ['profileRule', 'Profile (Rahmenholz, Leisten)', 'choice', [['saw', 'Stufen als Falze, Stirnseiten sägen, volle Kante vorne'], ['off', 'wie Platte (Formatfräsen)']]],
    ['orientRule', 'Lage auf der Maschine', 'choice', [['model', 'wie im Korpus-Modell (X = Breite, sonst Höhe)'], ['long', 'lange Seite in X']]],
    ['fieldShort', 'Feld kurze Teile', 'text'],
    ['fieldLong', 'Feld lange Teile', 'text'],
    ['fieldThreshold', 'kurz bis Länge X', 'number', 'mm'],
    ['fieldWideShort', 'Feld breite Teile', 'text'],
    ['fieldWideLong', 'Feld breite, lange Teile', 'text'],
    ['fieldWidth', 'breit ab Breite Y über', 'number', 'mm'],
    ['rawOversize', 'Rohteil-Aufmaß je Seite', 'number', 'mm'],
    ['parkOffset', 'Parkposition: Länge +', 'number', 'mm']] },
  { title: '3D-Ansicht', c: '--muted', fields: [
    ['boardMaterial', 'Plattenfarbe', 'board', 'für alle Teile; je Bauteil änderbar in „Möbel 3D“'],
    ['boardFromName', 'Material aus dem Bauteilnamen (z. B. „Seite (U708 ST9)“) – Farbe aus der STEP', 'bool']] },
  { title: 'Etiketten (Druck über den Browser)', c: '--muted', fields: [
    ['labelWidth', 'Etikett: Breite', 'number', 'mm'],
    ['labelHeight', 'Etikett: Höhe', 'number', 'mm'],
    ['labelRotate', 'Inhalt um 90° drehen (Etikett läuft quer ein)', 'bool'],
    ['labelSketch', 'Draufsicht mit Bemaßung', 'bool'],
    ['labelSketchDims', 'Bemaßung der Draufsicht', 'choice', [['fertig', 'Fertigmaß'], ['zuschnitt', 'Zuschnittmaß (wie im Zuschnittplan)']]],
    ['labelExtra', 'Zusatzzeile (Auftrag, Kunde …)', 'text', 'leer = ohne'],
    ['labelLayout', 'Etikett gestalten', 'labeldesign']] },
  { title: 'X-Konverter (konvertieren.bat)', c: '--muted', wide: true, fields: [
    ['xconverterPath', 'X-Konverter (XConverter.exe)', 'path'],
    ['toolsFile', 'Werkzeugdatei (.tlgx)', 'path'],
    ['pgmxDir', 'Zielordner .pgmx', 'path', 'leer = Unterordner „pgmx“']] },
];
const KEY = 'step2xcs.settings.v1';
function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { s = {}; }
  if (s.fieldThreshold === 1500) s.fieldThreshold = XcsWriter.DEFAULTS.fieldThreshold; // alte Voreinstellung
  delete s.formatLast; // ersetzt durch die Reihenfolge-Regel
  delete s.clamexTemplate; // ersetzt durch je eine Vorlage für Kante, Gehrung und Fläche (Werkstatt-Programme)
  delete s.attrPlacement; // Tiefen-Attribut immer nach dem Element (in Maestro bestätigt)
  delete s.oscSplit; // Oszillieren: Zerteilen der Kontur entfernt (brach die Korrektur)
  // früherer Vorgabe-Sauger 145×50 → in Maestro heißt er H75-M-145x55
  if (s.cupSmallCode === 'H75-M-145x50') { delete s.cupSmallCode; if (s.cupSmallY === 50) delete s.cupSmallY; }
  // frühere Standardpfade (aus dem Handbuch) auf den Pfad in der Werkstatt umstellen
  if (s.xconverterPath === 'C:\\Program Files (x86)\\Scm Group\\Maestro\\XConverter.exe') delete s.xconverterPath;
  if (s.toolsFile === 'C:\\Program Files (x86)\\Scm Group\\Maestro\\Tlgx\\def.tlgx' ||
    s.toolsFile === 'C:\\Program Files\\SCM Group\\Maestro\\Tlgx\\def.tlgx') delete s.toolsFile;
  // Profile immer als eigene Kopie (die Vorgabe darf nicht verändert werden), fehlende auffüllen
  const def = JSON.parse(JSON.stringify(XcsWriter.DEFAULTS.profiles));
  s.profiles = def.map((d, i) => (s.profiles && s.profiles[i] ? { name: s.profiles[i].name || d.name, values: Object.assign({}, s.profiles[i].values) } : d));
  return Object.assign({}, XcsWriter.DEFAULTS, s);
}
// Einstellungen und Regel wirken sofort und werden sofort im Browser gespeichert (bleiben nach dem Neuladen).
// Nur wenn der Browser keinen Speicher erlaubt, bleibt „nicht gespeichert“ stehen (Knopf zum erneuten Versuch).
let settingsDirty = false;
function saveSettings() {
  persistSettings(true);
}
function persistSettings(quiet) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state.settings));
  } catch (e) {
    settingsDirty = true;
    showSaveState();
    if (!quiet) toast('Speichern nicht möglich – der Browser erlaubt hier keinen Speicher.');
    return;
  }
  settingsDirty = false;
  showSaveState();
  if (!quiet) toast('Einstellungen gespeichert.');
}
function showSaveState() {
  // alle Speicher-Leisten (Werkzeuge & Regeln, Reihenfolge-Regel, Werkstück-Profile)
  document.querySelectorAll('.savebar').forEach((bar) => {
    bar.classList.toggle('dirty', settingsDirty);
    bar.querySelector('.state').textContent = settingsDirty ? '● Nicht gespeichert – Browser erlaubt keinen Speicher' : 'Automatisch gespeichert';
  });
}
// Knopf sitzt in der Kopfzeile: Klick speichert, ohne den Bereich auf- oder zuzuklappen
document.querySelectorAll('#savesettings, [data-save]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); persistSettings(); }));

// ------------------------------------------------ Werkzeuge und Favoriten
const TOOLS_KEY = 'step2xcs.tools.v1';
const FAV_KEY = 'step2xcs.favorites.v1';
function loadJson(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v || fallback; } catch (e) { return fallback; }
}
function storeJson(key, v) {
  try { if (v === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* ohne Speicher */ }
}
const customTools = loadJson(TOOLS_KEY, null);
// früher gespeicherte Werkzeuglisten ohne Schnittwerte: Vorschub/Drehzahl gleichnamiger Werkzeuge aus der Standardliste
function withTech(tools) {
  const def = new Map((window.DEFAULT_TOOLS || []).map((t) => [t.name, t]));
  return (tools || []).map((t) => (t.tech !== undefined || !def.has(t.name) ? t : Object.assign({}, t, { tech: def.get(t.name).tech || null })));
}

// ------------------------------------------------ Hell / Dunkel
const THEME_KEY = 'step2xcs.theme.v1';
const systemDark = () => !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
function applyTheme(t) {
  const root = document.documentElement;
  // ohne eigene Wahl: Vorgabe der Umgebung bzw. des Systems anzeigen
  if (t === 'dark' || t === 'light') root.setAttribute('data-theme', t);
  const cur = root.getAttribute('data-theme');
  const theme = cur === 'dark' || cur === 'light' ? cur : (systemDark() ? 'dark' : 'light');
  document.querySelectorAll('[data-theme-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeSet === theme)));
}
applyTheme(loadJson(THEME_KEY, null));
// 3D-Ansichten und Leinwand in den neuen Farben
function themeChanged() {
  if (v3.viewer) v3.viewer.setTheme(isDarkTheme());
  if (typeof mdl !== 'undefined' && mdl.viewer) mdl.viewer.setTheme(isDarkTheme());
  if (typeof drawAnim === 'function') drawAnim();
}
document.querySelectorAll('[data-theme-set]').forEach((b) => b.addEventListener('click', () => {
  storeJson(THEME_KEY, b.dataset.themeSet);
  applyTheme(b.dataset.themeSet);
  themeChanged();
}));
// System wechselt hell/dunkel (ohne eigene Wahl): mitziehen
if (window.matchMedia) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const onSys = () => { applyTheme(null); themeChanged(); };
  if (mq.addEventListener) mq.addEventListener('change', onSys); else if (mq.addListener) mq.addListener(onSys);
}

const state = { parts: [], sel: 0, settings: loadSettings(),
  tools: customTools ? withTech(customTools.tools) : (window.DEFAULT_TOOLS || []),
  toolSource: customTools ? customTools.source : 'def.tlgx (Standard)',
  favorites: loadJson(FAV_KEY, []), mode3d: !!loadJson('step2xcs.view3d.v1', false),
  showCode: !!loadJson('step2xcs.showcode.v1', false), techOpen: new Set(),
  newProfile: (loadJson('step2xcs.profile.v1', null) || { i: null }).i ?? null }; // Profil für neue Teile

const usableTools = (kind) => state.tools.filter((t) => t.kind === kind && !t.disabled);

// Auswahlliste: Favoriten oben, dann alle Werkzeuge der Art
function toolSelect(attrs, kind, value) {
  // Schleifwalzen (SandMill) eigene Liste
  const list = kind === 'sand' ? state.tools.filter((t) => t.body === 'SandMill' && !t.disabled) : usableTools(kind);
  const favs = list.filter((t) => state.favorites.includes(t.name));
  const opt = (t) => '<option value="' + esc(t.name) + '"' + (t.name === value ? ' selected' : '') + '>' + esc(ToolLibrary.label(t)) + '</option>';
  let html = '<select ' + attrs + '>';
  if (value && !list.some((t) => t.name === value)) html += '<option value="' + esc(value) + '" selected>' + esc(value) + ' (nicht in der Werkzeugliste)</option>';
  if (favs.length) html += '<optgroup label="★ Favoriten">' + favs.map(opt).join('') + '</optgroup>';
  html += '<optgroup label="' + (kind === 'saw' ? 'Alle Sägen' : kind === 'sand' ? 'Schleifwalzen' : 'Alle Fräser') + '">' + list.map(opt).join('') + '</optgroup></select>';
  return html;
}

function renderRule() {
  const rule = state.settings.orderRule || XcsWriter.DEFAULTS.orderRule;
  const seq = XcsWriter.ruleSequence(rule);
  $('ruleon').checked = !!rule.on;
  const ol = $('rulelist');
  ol.classList.toggle('off', !rule.on);
  ol.innerHTML = '<li class="dropline" id="ruledrop" hidden aria-hidden="true"></li>' + seq.map((c, i) => '<li class="rrow" data-cat="' + c + '">' +
    '<span class="grip" data-rgrip="' + c + '" title="Gedrückt halten und ziehen, um die Reihenfolge zu ändern" aria-hidden="true">⠿</span><span class="num">' + (i + 1) + '</span><span class="nm">' + esc(XcsWriter.CATEGORIES[c]) + '</span>' +
    '<button type="button" class="mvb" data-rule="' + c + '" data-dir="-1"' + (i === 0 ? ' disabled' : '') + ' aria-label="' +
    esc(XcsWriter.CATEGORIES[c]) + ' nach oben">↑</button><button type="button" class="mvb" data-rule="' + c + '" data-dir="1"' +
    (i === seq.length - 1 ? ' disabled' : '') + ' aria-label="' + esc(XcsWriter.CATEGORIES[c]) + ' nach unten">↓</button></li>').join('');
}

function setRule(rule) {
  state.settings.orderRule = rule;
  saveSettings();
  state.parts.forEach(compute);
  renderRule();
  render();
}

function renderToolLib() {
  $('toolsrc').textContent = state.tools.length + ' Werkzeuge aus ' + state.toolSource;
  const g = $('toolgrid');
  const list = usableTools('mill').concat(usableTools('saw'));
  g.innerHTML = list.map((t) => {
    const on = state.favorites.includes(t.name);
    return '<div class="tool"><button type="button" class="star' + (on ? ' on' : '') + '" data-fav="' + esc(t.name) + '" aria-pressed="' + on +
      '" aria-label="Favorit ' + esc(t.name) + '">' + (on ? '★' : '☆') + '</button><span class="nm" title="' + esc(ToolLibrary.label(t)) + '">' +
      esc(ToolLibrary.label(t)).replace(esc(t.name), '<b>' + esc(t.name) + '</b>') + '</span></div>';
  }).join('');
}

// Formatfräsen: ein Werkzeug oder zwei (vorfräsen mit Aufmaß, nachfräsen auf Endmaß) als kleine Tabelle
function formatTable() {
  const st = state.settings;
  const box = document.createElement('div');
  box.className = 'fmtbox';
  box.innerHTML = '<div class="row"><span class="cap">Formatfräsen</span><span class="seg" role="group" aria-label="Formatfräsen">' +
    '<button type="button" data-fmt="0" aria-pressed="' + !st.formatTwoStep + '">Normal</button>' +
    '<button type="button" data-fmt="1" aria-pressed="' + !!st.formatTwoStep + '">Zweistufig</button></span></div>' +
    '<table class="fmt' + (st.formatTwoStep ? '' : ' one') + '"><thead><tr><th></th><th>Werkzeug</th><th>Aufmaß</th></tr></thead><tbody>' +
    '<tr class="r1"><th>1 Vorfräsen</th><td>' + toolSelect('id="set-formatRoughTool" aria-label="Werkzeug 1 Vorfräsen"', 'mill', st.formatRoughTool) + '</td>' +
    '<td><span class="num"><input id="set-formatAllowance" type="number" min="0" step="0.1" value="' + esc(st.formatAllowance) + '" aria-label="Aufmaß Vorfräsen"><small>mm</small></span></td></tr>' +
    '<tr><th><span class="two">2 Nachfräsen</span><span class="onet">Formatfräser</span></th><td>' + toolSelect('id="set-contourTool" aria-label="Formatfräser"', 'mill', st.contourTool) + '</td>' +
    '<td class="end">Endmaß</td></tr></tbody></table>';
  const apply = (k, v) => {
    if (JSON.stringify(st[k]) === JSON.stringify(v)) return;
    st[k] = v;
    saveSettings();
    state.parts.forEach(compute);
    renderSoon();
  };
  box.querySelectorAll('[data-fmt]').forEach((b) => b.addEventListener('click', () => {
    const on = b.dataset.fmt === '1';
    box.querySelectorAll('[data-fmt]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    box.querySelector('table').classList.toggle('one', !on);
    apply('formatTwoStep', on);
  }));
  box.querySelector('#set-formatRoughTool').addEventListener('change', (e) => apply('formatRoughTool', e.target.value));
  box.querySelector('#set-contourTool').addEventListener('change', (e) => apply('contourTool', e.target.value));
  const al = box.querySelector('#set-formatAllowance');
  let timer;
  const setAl = () => { clearTimeout(timer); const v = parseFloat(String(al.value).replace(',', '.')); if (!isNaN(v) && v >= 0) apply('formatAllowance', v); };
  al.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(setAl, 400); });
  al.addEventListener('change', setAl);
  return box;
}

// Felder, die nur gelten, wenn ein Schalter an ist: ausgegraut zeigen
const DEPENDENT = { scoreCut: ['scoreDepth', 'scoreOut'], tabsMode: ['tabsMaxSize', 'tabsCount', 'tabLength', 'tabHeight'],
  helixOn: ['helixStep'], drillStepFrom: ['drillStep'], suctionOn: ['cupBigCode', 'cupSmallCode', 'cupNarrowCode'] };
function dimmed(k) {
  const st = state.settings;
  if (k === 'scoreDepth' || k === 'scoreOut') return !st.scoreCut;
  if (k === 'tabsMaxSize') return st.tabsMode !== 'small';
  if (/^tab(sCount|Length|Height)$/.test(k)) return st.tabsMode === 'off';
  if (k === 'helixStep') return !st.helixOn;
  if (k === 'drillStep') return !(st.drillStepFrom > 0);
  if (k === 'cupBigCode' || k === 'cupSmallCode' || k === 'cupNarrowCode') return !st.suctionOn;
  return false;
}

function renderSettings() {
  const root = $('setgrid');
  root.innerHTML = '';
  for (const grp of GROUPS) {
  const sec = document.createElement('section');
  sec.className = 'setgroup' + (grp.wide ? ' wide' : '');
  sec.style.setProperty('--c', 'var(' + grp.c + ')');
  sec.innerHTML = '<h4><i></i>' + esc(grp.title) + '</h4>';
  const g = document.createElement('div');
  g.className = 'setrows';
  sec.appendChild(g);
  root.appendChild(sec);
  for (const [k, label, type, extra] of grp.fields) {
    if (type === 'formatTable') { g.appendChild(formatTable()); continue; }
    const choices = extra;
    const unit = typeof extra === 'string' ? extra : '';
    const l = document.createElement('label');
    l.className = 'row' + (type === 'list' || type === 'path' ? ' stack' : '') + (type === 'bool' ? ' check' : '') +
      (dimmed(k) ? ' dim' : '');
    const id = 'set-' + k;
    l.htmlFor = id;
    const v = state.settings[k];
    const cap = '<span class="cap">' + esc(label) + (unit && type !== 'number' ? '<small>' + esc(unit) + '</small>' : '') + '</span>';
    if (type === 'choice') {
      l.innerHTML = cap + '<select id="' + id + '">' + choices.map(([v, t]) => '<option value="' + v + '"' + (v === state.settings[k] ? ' selected' : '') +
        '>' + esc(t) + '</option>').join('') + '</select>';
      g.appendChild(l);
      l.querySelector('select').addEventListener('change', (ev) => {
        state.settings[k] = ev.target.value;
        for (const x of DEPENDENT[k] || []) { const e = $('set-' + x); if (e) e.closest('label').classList.toggle('dim', dimmed(x)); }
        saveSettings();
        state.parts.forEach(compute);
        render();
      });
      continue;
    }
    if (type === 'labeldesign') {
      l.innerHTML = cap + '<span><small id="ldstate">' + (v && v.items ? 'eigenes Layout' : 'automatisch') + '</small> <button type="button" class="btn small" id="' + id + '">✎ Etikett gestalten …</button></span>';
      g.appendChild(l);
      l.querySelector('button').addEventListener('click', (ev) => { ev.preventDefault(); openLabelDesigner(); });
      continue;
    }
    if (type === 'board') {
      l.innerHTML = cap + '<button type="button" class="btn small boardbtn" id="' + id + '">' + boardChip(v) + '</button>';
      g.appendChild(l);
      l.querySelector('button').addEventListener('click', (ev) => {
        ev.preventDefault();
        boardPicker(ev.currentTarget, state.settings.boardMaterial, null, (key) => setBoardDefault(key));
      });
      continue;
    }
    if (type === 'mill' || type === 'saw' || type === 'sand') {
      l.innerHTML = cap + toolSelect('id="' + id + '"', type, v);
      g.appendChild(l);
      l.querySelector('select').addEventListener('change', (ev) => {
        state.settings[k] = ev.target.value;
        saveSettings();
        state.parts.forEach(compute);
        render();
      });
      continue;
    }
    if (type === 'bool') {
      l.innerHTML = '<input type="checkbox" id="' + id + '"' + (v ? ' checked' : '') + '> <span class="cap">' + esc(label) + '</span>';
    } else if (type === 'number') {
      l.innerHTML = cap + '<span class="num"><input id="' + id + '" type="number" step="any" value="' + esc(v) + '">' +
        (unit ? '<small>' + esc(unit) + '</small>' : '') + '</span>';
    } else {
      l.innerHTML = cap + '<input id="' + id + '" type="text" value="' + esc(type === 'list' ? v.join(', ') : v) + '">';
    }
    g.appendChild(l);
    // Schon während der Eingabe übernehmen (verzögert). Sonst baut das „change“ beim Verlassen des Feldes
    // die Liste neu auf, während der Benutzer gerade einen Knopf klickt, und der Klick geht verloren.
    const input = l.querySelector('input');
    let timer;
    const apply = () => {
      clearTimeout(timer);
      let val;
      if (type === 'bool') val = input.checked;
      else if (type === 'number') val = parseFloat(String(input.value).replace(',', '.'));
      else if (type === 'list') val = input.value.split(/[;,\s]+/).map((x) => parseFloat(x.replace(',', '.'))).filter((x) => !isNaN(x));
      else val = input.value.trim();
      if (type === 'number' && isNaN(val)) return;
      if (JSON.stringify(val) === JSON.stringify(state.settings[k])) return;
      state.settings[k] = val;
      for (const x of DEPENDENT[k] || []) { const e = $('set-' + x); if (e) e.closest('label').classList.toggle('dim', dimmed(x)); }
      saveSettings();
      state.parts.forEach(compute);
      renderSoon();
    };
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(apply, 400); });
    input.addEventListener('change', apply);
  }
  }
}
