/*
 * Erzeugt Xilog-Maestro-Skript (.xcs) aus dem Ergebnis von PanelAnalyzer.
 * Format und Konventionen sind aus den Beispielen in maestro/beispiele/ abgeleitet.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.XcsWriter = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULTS = {
    fieldShort: 'IJ',          // SetMachiningParameters – Arbeitsfeld für kurze Teile
    fieldLong: 'IL',           // … für lange Teile
    fieldThreshold: 1300,      // bis zu dieser Länge (mm) fieldShort, darüber fieldLong
    fieldWideShort: 'AB',      // breite Teile (Y > fieldWidth) bis fieldThreshold lang
    fieldWideLong: 'AD',       // breite und lange Teile
    fieldWidth: 620,           // ab dieser Breite Y (mm) die Felder für breite Teile
    rawOversize: 2,            // CreateRawWorkpiece: Aufmaß je Seite
    contourTool: 'E014',       // Formatfräsen außen
    contourExtra: 3,           // Frästiefe = Dicke + …
    formatTwoStep: false,      // Formatfräsen mit zwei Werkzeugen: vorfräsen mit Aufmaß, nachfräsen auf Endmaß
    formatRoughTool: 'E014',   // Werkzeug 1 (vorfräsen); Werkzeug 2 = contourTool
    formatAllowance: 1,        // Aufmaß beim Vorfräsen in mm (overMaterial)
    retractOverlap: 2,         // Umfräsen: Überlappung beim Verlassen in mm (SetRetractStrategy overlapLength)
    // Oszillation: Tiefe pendelt entlang der Kontur zwischen min und max unter der Plattenunterseite (DEPTH-Attribut je Punkt)
    oscMill: false,            // Formatfräsen oszillierend (Schneide gleichmäßig nutzen)
    oscMillMin: 2,             // Fräser ragt mindestens … mm unter die Platte
    oscMillMax: 8,             // … höchstens (Schneidenlänge beachten: Dicke + max ≤ Schneidenlänge)
    oscWave: 300,              // Weg je Schwingung (einmal runter und wieder hoch) in mm
    // SetAttribute (DEPTH/TAB): 'after' = nach dem Element (gilt für sein Ende, wie im Handbuch-Beispiel), 'before' = davor
    // (Handbuch-Text spricht vom folgenden Element) – an der Maschine prüfen
    attrPlacement: 'after',
    // Clamex P: über das SCM-Makro (nur Position übergeben) oder direkt mit dem Scheibenfräser
    clamexMode: 'macro',       // 'macro' = SCM-Makro SawCut_Lamello (Parameter nach Position), 'direct' = eigene Bahn mit clamexTool
    clamexMacro: 'SawCut_Lamello',
    // Parameterliste wie in den Werkstatt-Programmen (33/38_SW-Schrag, 40_Mittelseite_st2), Platzhalter werden ersetzt:
    // {sx} {sy} Start, {ex} {ey} Ende (je Nut gleich = ein Verbinder), {angle} Winkel der Schnittfläche, {T} Dicke, {angleZ} Richtung
    clamexTemplate: '{sx}, {sy}, {ex}, {ey}, {angle}, 1, {T}, 1, 5, 3, 0.05, 150, 150, null, null, 3, "-1", "E071", null, "-1", "E030", null, ' +
      "'2', 0, false, -1, 0, 4, 0, false, \"-1\", \"E031\", null, null, null, 0, 0, 0, null, 2, 10, 1.4, \"10\", 0, \"-1\", \"E030\", {angleZ}, null",
    clamexTool: 'E030',        // nur direkt: Clamex-Scheibenfräser Ø 100 (auf Blattmitte vermessen)
    clamexClear: 5,            // Anfahrt: Scheibe so weit vor der Oberfläche (mm) beginnen
    clamexMaxReach: 60,        // Nut weiter als … mm von der Bezugsebene (Kante/Oberseite) → Hinweis Kollision/Reichweite
    // Zapfen auf einer schrägen Kante (z. B. Gehrung mit Feder): Vorschnitt parallel um die Zapfenhöhe versetzt,
    // dann auf der geneigten Ebene rings um den Zapfen ausräumen (Zapfen = Insel)
    tenonPrecut: 'saw',        // Vorschnitt 'saw' (Säge) oder 'mill' (schräg fräsen)
    tenonTool: 'E020',         // Fräser senkrecht zur Schräge für die Fläche um den Zapfen
    tenonAllowance: 0,         // Vorschnitt um … mm weiter außen, dann zuerst die Zapfenoberseite plan fräsen
    sandOn: false,             // Schleifen mit der Schleifwalze nach dem Formatfräsen (Außenkontur)
    sandTool: 'E091',          // Schleifwalze
    sandMin: 10,               // Walze ragt mindestens … mm unter die Platte
    sandMax: 30,               // … höchstens
    sandPasses: 1,             // Umläufe (jeder weitere um eine halbe Schwingung versetzt)
    sandAllowance: 0,          // Schleifzugabe: Formatfräsen bleibt um … mm größer, die Walze schleift auf Endmaß
    sandLead: 1,               // An- und Abfahrt im Bogen: Bogen = … × Walzenradius
    sandOverlap: 20,           // Überlappung am Ende des Umlaufs in mm
    labelWidth: 40,            // Etikett (Browser-Druck): Breite in mm
    labelHeight: 60,           // Etikett: Höhe in mm
    labelRotate: false,        // Inhalt um 90° drehen (Drucker zieht das Etikett quer ein)
    labelSketch: true,         // Draufsicht mit Bemaßung aufs Etikett
    labelExtra: '',            // Zusatzzeile (Auftrag, Kunde …)
    dxfThickness: 19,          // DXF-Import: Plattendicke, solange im Teil keine andere eingetragen ist
    cutoutTool: 'E016',        // Ausschnitte / Durchbrüche / Konturabweichungen
    cutoutExtra: 2,
    leadLength: 20,            // Ein-/Auslauf entlang der Kante bei Ausschnitten
    sawTool: '066',            // Nut mit Säge
    sawOverrun: 50,            // Säge-Überlauf an beiden Enden
    maxGrooveWidth: 12,        // breitere Nuten → Warnung
    rebateTool: 'E016',        // Falz
    rebateToolDia: 12,         // nur falls der Fräser nicht in der Werkzeugliste steht
    pocketTool: 'E016',        // Taschen (CreateContourPocket)
    pocketOverlap: 50,         // Überdeckung in %
    pocketStepDown: 0,         // Zustelltiefe je Durchgang bei Taschen in mm (0 = wie stepDown)
    chamferTool: 'E050',       // Fasen (CreateChamfer)
    // Kantenrundungen mit dem Radiusfräser (Profil R2): oben und unten je eine eigene Werkzeugnummer
    roundRadius: 2,            // Radius des Radiusfräsers; Rundungen mit diesem Radius werden damit gefräst
    roundTopTool: 'E061',      // Radiusfräser oben
    roundTopDepth: 0,          // oben: Tiefe ab Oberseite (Z 0)
    roundBottomTool: 'E060',   // Radiusfräser unten (gleicher Fräser, andere Werkzeugnummer)
    roundBottomDz: 1,          // unten: dz ab Unterkante, Tiefe = Plattendicke + dz
    slantTool: 'E016',         // schräge Kanten / Gehrung (CreateSlantedRoughFinish)
    slantExtra: 2,             // Schrägfräsen: Dicke + …
    slantCut: 'saw',           // schräge Kanten über die ganze Länge: 'saw' = Sägeschnitt (CreateBladeCut), 'mill' = fräsen
    // Gekrümmte Flächen (je Teil einschaltbar, nur wenn erkannt)
    curvedSlantOn: false,      // Schräge an Rundungen 5-achsig fräsen (CreateSlantedRoughFinish entlang der Kontur)
    curvedSurfaceOn: false,    // gewölbte Flächen bearbeiten
    curvedSurfaceMode: 'ball', // 'ball' = Kugelfräser zeilenfräsen (CreateToolpath), 'flat4' = Zylinder 4-Achs mit Schaftfräser abzeilen
    cyl4Tool: 'E020',          // Schaftfräser für 4-Achs-Abzeilen
    cyl4Step: 10,              // Zeilenabstand Schlichten (auf der Fläche) in mm
    cyl4RoughStep: 12,         // Zeilenabstand Vorfräsen in mm
    cyl4Layer: 10,             // Schichtdicke Vorfräsen (senkrecht zur Fläche) in mm
    cyl4MaxTilt: 45,           // größte Neigung des Fräsers gegen die Senkrechte in Grad (darüber: Kugelfräser)
    ballTool: 'E055',          // Kugelfräser
    ballToolDia: 12,           // nur falls der Kugelfräser nicht in der Werkzeugliste steht
    surfStepover: 1.5,         // Zeilenabstand in mm
    surfLayer: 4,              // Zustellung beim Vorfräsen in mm (0 = nur Schlichten)
    surfRes: 1,                // Punktabstand längs der Zeile in mm
    surfTol: 0.02,             // Toleranz beim Zusammenfassen von Punkten in mm
    surfSafe: 5,               // Abheben zwischen den Zeilen: über der Oberseite in mm
    bladeTool: 'E070',         // Säge für Sägeschnitte
    bladeExtra: 2,             // Sägeschnitt: Extra-Tiefe unter der Platte (extraDepth)
    scoreCut: false,           // Sägeschnitt vorritzen (CreateSectioningMillingStrategy)
    scoreDepth: 3,             // Vorritzen: Tiefe des ersten Schnitts in mm
    scoreOut: 10,              // Vorritzen: Abstand nach außen zwischen den Durchgängen in mm
    stepDown: 0,               // Zustellung je Durchgang in mm (0 = in einem Durchgang)
    finishDepth: 0,            // letzte Zustellung in mm (0 = keine eigene)
    contourMode: 'whole',      // Sonderkontur: 'whole' = Außenkontur am Stück, 'rect' = Rechteck + Ausschnitte
    // Reihenfolge-Regel: Bearbeitungsarten in dieser Folge (abschaltbar, vom Benutzer änderbar)
    orderRule: { on: true, seq: ['drillTop', 'drillSide', 'drillSlanted', 'slot', 'pocket', 'rebate', 'chamfer', 'slant',
      'blade', 'slantPlane', 'surface', 'cutout', 'notch', 'format', 'clamex', 'sand', 'edge'] },
    throughExtra: 2,           // Durchgangsbohrung: Tiefe = Dicke + …
    drillsVertical: [3, 5, 7, 8, 10, 12, 15, 20, 35],
    drillsHorizontal: [5, 8],
    parkOffset: 1000,          // CreateNullOperation X = Länge + …
    usePatterns: true,
    // X-Konverter (Batch-Datei konvertieren.bat in der ZIP)
    xconverterPath: 'C:\\Program Files\\SCM Group\\Maestro\\XConverter.exe',
    toolsFile: 'C:\\Users\\Public\\Documents\\SCM Group\\Maestro\\Tlgx\\def.tlgx',
    pgmxDir: '',               // leer = Unterordner „pgmx“ neben der .bat
    // Programmkopf
    commentOn: true,           // SetComment / SetDescription: Teil, Herkunft, Maße
    optimizeOn: false,         // SetOptimization(true): Maestro optimiert beim Laden
    autoSetupOn: false,        // SetAutoSetup(true): Tisch beim Laden automatisch einrichten
    workpieceShape: 'box',     // 'box' = Quader, 'contour' = echte Außenkontur (CreateFinishedWorkpieceFromExtrusion)
    // Durchbrüche
    tabsMode: 'off',           // Haltestege (TAB): 'off', 'small' (Innenstück bis tabsMaxSize), 'all'
    tabsMaxSize: 200,          // größte Seite des Innenstücks für 'small' in mm
    tabsCount: 2,              // Stege je Durchbruch
    tabLength: 5,              // Steglänge in mm
    tabHeight: 2,              // Steghöhe (stehen gelassenes Material) in mm
    helixOn: false,            // Durchbrüche/Rundlöcher spiralförmig eintauchen (CreateHelicMillingStrategy)
    helixStep: 5,              // Zustellung je Umlauf der Spirale in mm
    // Bohren
    drillStepFrom: 0,          // ab dieser Bohrtiefe in Stufen bohren (0 = aus)
    drillStep: 15,             // Tiefe je Stufe in mm
    // Sauger (Drehsauger auf Konsolen): automatischer Vorschlag, SetBarPosition / SetSuctionCupPosition
    suctionOn: true,           // Vorschlag ins Programm schreiben
    cupBigCode: 'H75-M-145x145', cupBigX: 145, cupBigY: 145,
    cupSmallCode: 'H75-M-145x55', cupSmallX: 145, cupSmallY: 55,
    cupSmallEcc: 45,           // exzentrisch: Saugfläche 45 mm neben der Drehachse (im Gehäuse 145 × 145 am Rand)
    cupNarrowCode: 'H75-M-145x30', cupNarrowX: 145, cupNarrowY: 30, // für sehr schmale Teile (leer = nicht verwenden)
    cupNarrowEcc: 0,           // Versatz der Saugfläche zur Drehachse in mm (0 = mittig)
    cupHousing: 145,           // Gehäuse der Drehsauger (Mindestabstand auf der Konsole)
    cupAngleCw: false,         // Saugerwinkel in Maestro im Uhrzeigersinn (false = gegen den Uhrzeigersinn)
    barCount: 6,               // Konsolen an der Maschine
    barMinGap: 150,            // kleinster Abstand der Konsolen (Mitte zu Mitte)
    barSpacing: 500,           // angestrebter Abstand der Konsolen
    cupsPerBar: 4,             // höchstens so viele Sauger je Konsole
    cupEdgeMargin: 15,         // Abstand Sauger – Plattenkante (Formatfräser, Säge)
    cupHoleMargin: 10,         // Abstand Sauger – Durchbrüche und Durchgangsbohrungen
    // Werkstück-Profile (5 Knöpfe oben): je Profil Name und abweichende Werte (nur gesetzte Werte gelten, sonst Einstellung)
    profiles: [
      { name: 'Spanplatte', values: { formatTwoStep: false } },
      { name: 'Massivholz', values: { formatTwoStep: true } },
      { name: 'Profil 3', values: {} },
      { name: 'Profil 4', values: {} },
      { name: 'Profil 5', values: {} },
    ],
  };


  // Bearbeitungsarten für die Reihenfolge-Regel
  const CATEGORIES = {
    drillTop: 'Bohrungen oben',
    drillSide: 'Bohrungen in der Kante',
    drillSlanted: 'Schräge Bohrungen',
    slot: 'Nuten (Säge)',
    pocket: 'Taschen',
    rebate: 'Falze',
    chamfer: 'Fasen',
    slant: 'Schräge Kanten (fräsen)',
    blade: 'Sägeschnitte',
    slantPlane: 'Bearbeitungen auf schrägen Ebenen',
    edge: 'Kantenrundungen (Radiusfräser)',
    surface: 'Gewölbte Flächen',
    cutout: 'Durchbrüche und Rundlöcher',
    notch: 'Konturausschnitte',
    format: 'Formatfräsen',
    sand: 'Schleifen (Schleifwalze)',
    clamex: 'Clamex-Nuten (Scheibenfräser)',
  };

  function category(op) {
    if (op.plane) return 'slantPlane';
    if (op.kind === 'drill') return op.face === 'Top' ? 'drillTop' : 'drillSide';
    if (op.kind === 'sdrill') return 'drillSlanted';
    const k = op.key || '';
    if (k === 'format') return 'format';
    if (k === 'sand') return 'sand';
    if (/^clamex-/.test(k)) return 'clamex';
    const prefix = k.split('-')[0];
    return { notch: 'notch', cutout: 'cutout', round: 'cutout', rebate: 'rebate', pocket: 'pocket', rpocket: 'pocket', spocket: 'pocket', chamfer: 'chamfer', chamferpath: 'chamfer',
      slant: 'slant', cslant: 'slant', blade: 'blade', slot: 'slot', surface: 'surface', cyl4: 'surface', edge: 'edge' }[prefix] || 'notch';
  }

  // Vollständige Regel-Reihenfolge (fehlende Arten hinten anhängen, unbekannte entfernen)
  function ruleSequence(rule) {
    const seq = ((rule && rule.seq) || []).filter((c) => CATEGORIES[c]);
    // neue Arten (aus späteren Versionen) an ihrer Standardstelle einfügen, nicht hinten anhängen
    const def = DEFAULTS.orderRule.seq.concat(Object.keys(CATEGORIES).filter((c) => !DEFAULTS.orderRule.seq.includes(c)));
    for (const c of def) {
      if (seq.includes(c)) continue;
      const before = def.slice(0, def.indexOf(c)).reverse().find((x) => seq.includes(x));
      seq.splice(before ? seq.indexOf(before) + 1 : 0, 0, c);
    }
    return seq;
  }

  // Arbeitsfeld nach Teilegröße: Länge X bis 1300 → IJ, darüber IL; Breite Y über 620 → AB bzw. AD
  function autoField(p, cfg) {
    const long = p.L > cfg.fieldThreshold + 1e-6;
    if (p.W > cfg.fieldWidth + 1e-6) return long ? cfg.fieldWideLong : cfg.fieldWideShort;
    return long ? cfg.fieldLong : cfg.fieldShort;
  }

  function fmt(v) {
    let r = Math.round(v * 1000) / 1000;
    if (Object.is(r, -0)) r = 0;
    return String(r);
  }
  const pt = (p) => fmt(p[0]) + ', ' + fmt(p[1]);

  // ---------------------------------------------------------------- Sauger-Vorschlag

  // Kontur (Segmente line/arc) als Punktliste
  function loopPts(segs) {
    const pts = [];
    for (const q of segs) {
      if (q.type === 'arc') {
        let a0 = Math.atan2(q.a[1] - q.c[1], q.a[0] - q.c[0]);
        let sw = q.full ? Math.PI * 2 : Math.atan2(q.b[1] - q.c[1], q.b[0] - q.c[0]) - a0;
        if (!q.full) { if (q.ccw) { while (sw <= 0) sw += Math.PI * 2; } else { while (sw >= 0) sw -= Math.PI * 2; } }
        if (q.full && !q.ccw) sw = -sw;
        const n = Math.max(2, Math.ceil(Math.abs(sw) / (Math.PI / 24)));
        for (let i = 0; i < n; i++) pts.push([q.c[0] + q.r * Math.cos(a0 + (sw * i) / n), q.c[1] + q.r * Math.sin(a0 + (sw * i) / n)]);
      } else pts.push(q.a);
    }
    return pts;
  }
  function inPoly(p, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i];
      const b = poly[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  }
  function distPoly(p, poly) {
    let d = Infinity;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[j];
      const b = poly[i];
      const ab = [b[0] - a[0], b[1] - a[1]];
      const l2 = ab[0] * ab[0] + ab[1] * ab[1] || 1;
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / l2));
      d = Math.min(d, Math.hypot(p[0] - a[0] - t * ab[0], p[1] - a[1] - t * ab[1]));
    }
    return d;
  }

  // Schlägt Konsolen (X) und Sauger (Y, Winkel, Typ) vor. Sauger liegen auf der Unterseite, mit Abstand zu
  // Kanten (Formatfräser, Säge) und zu allem, was durchgeht (Durchbrüche, Durchgangsbohrungen).
  function planSuction(p, cfg) {
    const warnings = [];
    const base = loopPts(p.base || p.outline || []);
    if (base.length < 3) return { bars: [], warnings: ['Sauger: Auflagefläche nicht erkannt – Sauger von Hand setzen.'] };
    const holes = (p.cutouts || []).map(loopPts);
    const circles = (p.drills || []).filter((d) => d.face === 'Top' && d.through).map((d) => ({ c: [d.x, d.y], r: d.d / 2 }));
    // offene Stellen der Auflagefläche (Taschen, Nuten, Falze, Bohrungen von der anderen Seite): dort hält kein Sauger
    for (const a of cfg.avoid || []) {
      if (a.poly) holes.push(a.poly);
      else if (a.c) circles.push({ c: a.c, r: a.r });
    }
    const em = cfg.cupEdgeMargin;
    const hm = cfg.cupHoleMargin;
    // Drehsauger: gerade (0°/90°) und parallel zu den Kanten der Auflagefläche
    const angles = [0, 90];
    for (let i = 0; i < base.length; i++) {
      const a = base[i];
      const b = base[(i + 1) % base.length];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 100) continue;
      let ang = Math.round((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI);
      ang = ((ang % 180) + 180) % 180;
      if (!angles.some((x) => Math.abs(x - ang) < 2 || Math.abs(x - ang) > 178)) angles.push(ang);
    }
    // Sauger-Arten. Exzentrische Sauger (e > 0): Saugfläche sitzt e neben der Drehachse (bei 0° in +Y) und läuft beim
    // Drehen um sie herum – je Winkel auch die Gegenrichtung (+180°) probieren. Winkel hier mathematisch (gegen den Uhrzeigersinn).
    const types = [];
    const kind = (code, sx, sy, e, ang, w) => ({ code: code, sx: sx, sy: sy, e: e || 0, angles: e > 0 ? [ang, ang + 180] : [ang], w: w });
    for (const ang of angles) if (ang < 90) types.push(kind(cfg.cupBigCode, cfg.cupBigX, cfg.cupBigY, 0, ang, 2));
    for (const ang of angles) types.push(kind(cfg.cupSmallCode, cfg.cupSmallX, cfg.cupSmallY, cfg.cupSmallEcc, ang, 1));
    if (cfg.cupNarrowCode && cfg.cupNarrowY > 0) {
      for (const ang of angles) types.push(kind(cfg.cupNarrowCode, cfg.cupNarrowX, cfg.cupNarrowY, cfg.cupNarrowEcc, ang, 0.5));
    }
    const rad = (a) => (a * Math.PI) / 180;
    // Mitte der Saugfläche zur Drehachse (bx, y) bei Winkel a
    const padAt = (bx, y, t, a) => [bx - t.e * Math.sin(rad(a)), y + t.e * Math.cos(rad(a))];
    // passt die Saugfläche (Rechteck um cx, cy, gedreht um a) auf die Fläche?
    const fits = (cx, cy, t, a) => {
      const ca = Math.cos(rad(a));
      const sa = Math.sin(rad(a));
      const P = (u, v) => [cx + u * ca - v * sa, cy + u * sa + v * ca];
      const hx = t.sx / 2;
      const hy = t.sy / 2;
      const nx = Math.max(2, Math.ceil(t.sx / 15));
      const ny = Math.max(2, Math.ceil(t.sy / 15));
      const pts = [];
      for (let i = 0; i <= nx; i++) { const u = -hx + (t.sx * i) / nx; pts.push(P(u, -hy), P(u, hy)); }
      for (let j = 1; j < ny; j++) { const v = -hy + (t.sy * j) / ny; pts.push(P(-hx, v), P(hx, v)); }
      for (const q of pts) {
        if (!inPoly(q, base) || distPoly(q, base) < em) return false;
        for (const h of holes) if (inPoly(q, h) || distPoly(q, h) < hm) return false;
        for (const c of circles) if (Math.hypot(q[0] - c.c[0], q[1] - c.c[1]) < c.r + hm) return false;
      }
      // Bohrung oder Durchbruch ganz unter dem Sauger
      const inside = (q) => {
        const dx = q[0] - cx;
        const dy = q[1] - cy;
        return Math.abs(dx * ca + dy * sa) < hx + hm && Math.abs(-dx * sa + dy * ca) < hy + hm;
      };
      if (circles.some((c) => inside(c.c)) || holes.some((h) => h.some(inside))) return false;
      return true;
    };
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const q of base) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
    // Sauger entlang einer Konsole bei x: gleichmäßig verteilt, möglichst weit außen (y = Drehachse)
    const orient = (x, y, t) => {
      // passende Winkel; bei zwei Möglichkeiten die Saugfläche näher zur Plattenmitte
      let best = null;
      for (const a of t.angles) {
        const q = padAt(x, y, t, a);
        if (!fits(q[0], q[1], t, a)) continue;
        const d = Math.abs(q[1] - (y0 + y1) / 2);
        if (!best || d < best.d - 1e-9) best = { a: a, q: q, d: d };
      }
      return best;
    };
    const cupsAt = (x, t) => {
      const ys = [];
      for (let y = y0 - t.e; y <= y1 + t.e; y += 5) if (orient(x, y, t)) ys.push(y);
      if (!ys.length) return [];
      const runs = [];
      let run = [ys[0], ys[0]];
      for (let k = 1; k < ys.length; k++) { if (ys[k] - run[1] <= 5.01) run[1] = ys[k]; else { runs.push(run); run = [ys[k], ys[k]]; } }
      runs.push(run);
      // Platzbedarf eines Saugers in Y (gedreht); exzentrische Sauger: ganzes Gehäuse
      const ca = Math.abs(Math.cos(rad(t.angles[0])));
      const sa = Math.abs(Math.sin(rad(t.angles[0])));
      const need = (t.e > 0 ? Math.max(cfg.cupHousing, t.sx * sa + t.sy * ca) : t.sx * sa + t.sy * ca) + 20;
      const size = need - 20; // Sauger dürfen sich auf der Konsole nicht berühren
      let out = [];
      if (t.e > 0) {
        // exzentrisch: die Drehachse kann auch neben der Platte stehen – die Saugflächen gleichmäßig über die möglichen
        // Lagen verteilen (Ziel nach der Lage der Saugfläche, nicht der Achse), Achsen mit Abstand zueinander
        const pads = ys.map((v) => ({ y: v, py: orient(x, v, t).q[1] }));
        // Anzahl aus der Spanne der Drehachsen (sie brauchen den Platz auf der Konsole)
        const n = Math.max(1, Math.min(cfg.cupsPerBar, 1 + Math.floor((ys[ys.length - 1] - ys[0]) / Math.max(need, 200))));
        // Ziele gleichmäßig verteilt – einmal nach der Lage der Saugfläche, einmal nach der Drehachse; mehr Sauger gewinnt,
        // bei Gleichstand die Verteilung nach der Saugfläche (sie sitzt dann mittiger)
        const spread = (key) => {
          const lo = Math.min(...pads.map((q) => q[key]));
          const hi = Math.max(...pads.map((q) => q[key]));
          const got = [];
          for (let k = 0; k < n; k++) {
            const target = n === 1 ? (lo + hi) / 2 : lo + ((hi - lo) * k) / (n - 1);
            let pick = null;
            for (const q of pads) {
              if (got.some((w) => Math.abs(w - q.y) < need - 1e-6)) continue;
              if (pick === null || Math.abs(q[key] - target) < Math.abs(pick[key] - target)) pick = q;
            }
            if (pick !== null) got.push(pick.y);
          }
          return got;
        };
        const byPad = spread('py');
        const byAxis = spread('y');
        out = byAxis.length > byPad.length ? byAxis : byPad;
      } else {
        for (const r of runs) {
          const span = r[1] - r[0];
          const n = Math.max(1, Math.min(cfg.cupsPerBar, 1 + Math.floor(span / Math.max(need, 200))));
          for (let k = 0; k < n; k++) out.push(n === 1 ? (r[0] + r[1]) / 2 : r[0] + (span * k) / (n - 1));
        }
      }
      out.sort((a, b) => a - b);
      out = out.filter((y, k) => !out.slice(0, k).some((w) => y - w < size - 1e-6));
      // gleichmäßig verteilte Stellen liegen in einem Lauf passender Stellen; Werte auf das 5-mm-Raster der Suche
      return out.slice(0, cfg.cupsPerBar).map((y) => {
        let o = orient(x, y, t);
        if (!o) { y = ys.reduce((m, v) => (Math.abs(v - y) < Math.abs(m - y) ? v : m), ys[0]); o = orient(x, y, t); }
        const a = ((o.a % 360) + 360) % 360;
        const outA = cfg.cupAngleCw ? (360 - a) % 360 : a; // Winkel so, wie Maestro ihn zählt
        return { y: y, angle: outA, rot: a, code: t.code, sx: t.sx, sy: t.sy, e: t.e, h: t.e > 0 ? cfg.cupHousing : 0, px: o.q[0], py: o.q[1], w: t.w };
      });
    };
    const memo = new Map();
    const bestAt = (x) => {
      const key = Math.round(x);
      if (memo.has(key)) return memo.get(key);
      let best = [];
      let bestScore = 0;
      for (const t of types) {
        const c = cupsAt(x, t);
        const sc = c.reduce((a, q) => a + q.w, 0);
        if (sc > bestScore) { best = c; bestScore = sc; }
        if (t.w === 2 && c.length >= 2) break; // zwei große Sauger: gut genug
      }
      memo.set(key, best);
      return best;
    };
    const score = (cups) => cups.reduce((a, q) => a + q.w, 0);
    const n = Math.max(1, Math.min(cfg.barCount, Math.round((x1 - x0) / cfg.barSpacing) + 1));
    let bars = [];
    const inner0 = x0 + em + cfg.cupBigX / 2;
    const inner1 = x1 - em - cfg.cupBigX / 2;
    for (let k = 0; k < n; k++) {
      const ideal = n === 1 || inner1 <= inner0 ? (x0 + x1) / 2 : inner0 + ((inner1 - inner0) * k) / (n - 1);
      // in der Nähe des Idealpunkts die Stelle mit den meisten Saugern suchen
      let best = null;
      for (let dx = 0; dx <= Math.max(60, cfg.barSpacing / 2); dx += 10) {
        for (const x of dx ? [ideal - dx, ideal + dx] : [ideal]) {
          if (x < x0 || x > x1) continue;
          if (bars.some((b) => Math.abs(b.x - x) < cfg.barMinGap)) continue;
          const cups = bestAt(x);
          if (cups.length && (!best || score(cups) > score(best.cups))) best = { x: x, cups: cups };
        }
        if (best && best.cups.length >= 2 && score(best.cups) >= 4) break; // zwei große Sauger: gut genug
      }
      if (best) bars.push(best);
    }
    // zu wenig Halt (weniger als zwei Sauger): bestes Konsolenpaar über die ganze Länge suchen
    if (bars.reduce((a, b) => a + b.cups.length, 0) < 2 && cfg.barCount >= 1) {
      const xs = [];
      for (let x = x0; x <= x1; x += 10) { const c = bestAt(x); if (c.length) xs.push({ x: x, cups: c }); }
      let pick = bars;
      let pickScore = bars.reduce((a, b) => a + score(b.cups), 0);
      for (const a of xs) {
        if (score(a.cups) > pickScore && a.cups.length >= 2) { pick = [a]; pickScore = score(a.cups); }
        if (cfg.barCount < 2) continue;
        for (const b of xs) {
          if (b.x - a.x < cfg.barMinGap) continue;
          const sc = score(a.cups) + score(b.cups);
          if (sc > pickScore) { pick = [a, b]; pickScore = sc; }
        }
      }
      bars = pick;
    }
    bars.sort((a, b) => a.x - b.x);
    const total = bars.reduce((a, b) => a + b.cups.length, 0);
    if (!total) warnings.push('Sauger: kein Platz für einen Sauger gefunden – Teil von Hand spannen.');
    else if (total < 2) warnings.push('Sauger: nur ein Sauger passt – Spannung prüfen.');
    return { bars: bars, warnings: warnings };
  }

  // ---------------------------------------------------------------- Planung

  function hasDrill(list, d) {
    return list.some((x) => Math.abs(x - d) < 0.05);
  }

  // Wandelt eine Bohrung in lokale Koordinaten der Bearbeitungsebene um.
  /*
   * Clamex-Nut → Bearbeitungsebene und Bahn. Werkzeugachse = Nutachse; Spindel auf der Seite mit dem kürzeren Weg
   * (Achse senkrecht: von oben, Ebene Top; Achse in X: Left/Right; in Y: Front/Back). Der Scheibenfräser ist auf die
   * Mitte des Blatts vermessen (SCM-Makrohilfe SawCut_Lamello): Tiefe ab der Bezugsebene bis zur Mittelebene der Nut. Bahn in Ebenenkoordinaten: Start mit der Scheibe ganz
   * außerhalb (Mitte r + Abstand vor der Oberfläche), bis zur Scheibenmitte und auf demselben Weg zurück.
   */
  function clamexPlan(p, g, cfg) {
    const a = g.a;
    const off = g.depth + (cfg.clamexClear > 0 ? cfg.clamexClear : 0); // Mitte r + Abstand vor der Oberfläche
    const p0 = [g.c[0] + g.n[0] * off, g.c[1] + g.n[1] * off, g.c[2] + g.n[2] * off];
    let face;
    let map;
    let depth;
    if (Math.abs(a[2]) > 0.999) {
      face = 'Top';
      map = (q) => [q[0], q[1]];
      depth = p.T - g.c[2];
      if (Math.abs(g.n[2]) > 0.01) return { error: 'Öffnung nicht senkrecht zur Achse – nicht unterstützt.' };
    } else if (Math.abs(a[0]) > 0.999) {
      const left = g.c[0];
      const right = p.L - g.c[0];
      face = left <= right ? 'Left' : 'Right';
      map = face === 'Left' ? (q) => [p.W - q[1], q[2]] : (q) => [q[1], q[2]];
      depth = Math.min(left, right);
    } else if (Math.abs(a[1]) > 0.999) {
      const front = g.c[1];
      const back = p.W - g.c[1];
      face = front <= back ? 'Front' : 'Back';
      map = face === 'Front' ? (q) => [q[0], q[2]] : (q) => [p.L - q[0], q[2]];
      depth = Math.min(front, back);
    } else {
      return { error: 'Nutachse geneigt – noch nicht unterstützt (Achse senkrecht oder parallel zu einer Plattenkante modellieren).' };
    }
    return { face: face, start: map(p0), end: map(g.c), depth: depth, reach: face === 'Top' ? 0 : depth };
  }

  // Fläche einer Kontur aus Geraden (> 0 = gegen den Uhrzeigersinn)
  function segsArea(segs) {
    let a = 0;
    for (const q of segs) a += q.a[0] * q.b[1] - q.b[0] * q.a[1];
    return a / 2;
  }

  function localDrill(p, d) {
    switch (d.face) {
      case 'Top': return { x: d.x, y: d.y };
      case 'Left': return { x: p.W - d.along, y: d.z };
      case 'Right': return { x: d.along, y: d.z };
      case 'Front': return { x: d.along, y: d.z };
      case 'Back': return { x: p.L - d.along, y: d.z };
    }
    return null;
  }

  // Fasst gleichabständige Bohrungen auf einer Linie zu Reihen zusammen.
  function makePatterns(points, enabled) {
    if (!enabled) return points.map((q) => ({ p: q, nX: 1, nY: 1, dX: 0, dY: 0 }));
    const tryOrder = (first) => {
      let rest = points.slice();
      const out = [];
      for (const axis of [first, 1 - first]) {
        const key = (q) => (axis === 0 ? q.y : q.x);
        const pos = (q) => (axis === 0 ? q.x : q.y);
        const lines = [];
        for (const q of rest) {
          let l = lines.find((l) => Math.abs(key(l[0]) - key(q)) < 0.01);
          if (!l) { l = []; lines.push(l); }
          l.push(q);
        }
        rest = [];
        for (const l of lines) {
          l.sort((a, b) => pos(a) - pos(b));
          let i = 0;
          while (i < l.length) {
            let j = i + 1;
            if (j < l.length) {
              const step = pos(l[j]) - pos(l[i]);
              while (j + 1 < l.length && Math.abs(pos(l[j + 1]) - pos(l[j]) - step) < 0.01) j++;
              if (step > 0.01) {
                const n = j - i + 1;
                out.push(axis === 0
                  ? { p: l[i], nX: n, nY: 1, dX: step, dY: 0 }
                  : { p: l[i], nX: 1, nY: n, dX: 0, dY: step });
                i = j + 1;
                continue;
              }
            }
            rest.push(l[i]);
            i++;
          }
        }
      }
      return out.concat(rest.map((q) => ({ p: q, nX: 1, nY: 1, dX: 0, dY: 0 })));
    };
    const a = tryOrder(1);
    const b = tryOrder(0);
    return b.length < a.length ? b : a;
  }

  // kurze Bezeichnung einer Bearbeitung (für die Liste der unterdrückten)
  function opText(op) {
    if (op.kind === 'drill') return 'Bohrung Ø' + fmt(op.d.d) + ' ' + ({ Top: 'oben', Left: 'links', Right: 'rechts', Front: 'vorne', Back: 'hinten' }[op.face] || 'auf Schräge');
    if (op.kind === 'sdrill') return 'Schräge Bohrung Ø' + fmt(op.d);
    return op.label || op.kind;
  }

  function plan(p, cfg) {
    const ops = [];
    const warnings = p.warnings.slice();
    const T = p.T;
    let nContour = 0;
    let nRound = 0;   // eigene Zähler: Schlüssel bleiben stabil, wenn sich davor etwas ändert (Überschreibungen je Teil)
    let nRPocket = 0;
    let nMill = 0;

    const toolD = (name, fallback) => {
      const t = cfg.toolInfo && cfg.toolInfo[name];
      return t && t.d ? t.d : fallback;
    };

    // Engste Stelle einer Tasche: Halbkreise (Langloch-Enden) geben die Breite vor
    const narrowest = (segs) => {
      let w = Infinity;
      for (const q of segs) {
        if (q.type !== 'arc' || !q.ccw) continue;
        let sw = Math.atan2(q.b[1] - q.c[1], q.b[0] - q.c[0]) - Math.atan2(q.a[1] - q.c[1], q.a[0] - q.c[0]);
        while (sw <= 1e-9) sw += Math.PI * 2;
        if (q.full || sw > Math.PI - 0.01) w = Math.min(w, 2 * q.r);
      }
      return w;
    };
    // Passt der Standardfräser nicht hinein: größten Fräser wählen, der passt (Schneide möglichst ≥ Tiefe)
    const fittingMill = (width, depth, fallback) => {
      const info = cfg.toolInfo || {};
      const fd = toolD(fallback, null);
      if (!fd || fd < width - 1e-6) return fallback;
      const cands = Object.keys(info).filter((n) => info[n].kind === 'mill' && info[n].d > 0 && info[n].d < width - 1e-6);
      cands.sort((a, b) => ((info[b].len || 0) >= depth) - ((info[a].len || 0) >= depth) || info[b].d - info[a].d);
      return cands[0] || fallback;
    };

    // 1) Formatfräsen: Rechteck L×B wie in den Beispielen, bei Sonderkontur die ganze Außenkontur am Stück
    // (Seite 2: Teil ist schon formatiert – kein Formatfräsen, keine Konturausschnitte)
    const side2 = cfg.side === 2;
    const whole = !p.outlineIsRect && cfg.contourMode !== 'rect';
    if (side2) {
      // nichts – Kontur entstand auf Seite 1
    } else if (whole) {
      const path = wholeContour(p.outline);
      ops.push({
        kind: 'contour', key: 'format', toolKind: 'mill', toolDefault: 'contourTool', contour: ++nContour, milling: ++nMill, approach: true,
        start: path.start, segs: path.segs, depth: T + cfg.contourExtra, tool: cfg.contourTool, side: 2, label: 'Formatfräsen (Sonderkontur)',
      });
    } else {
      ops.push({
        kind: 'contour', key: 'format', toolKind: 'mill', toolDefault: 'contourTool', contour: ++nContour, milling: ++nMill, approach: true,
        start: [0, p.W / 2],
        segs: [[0, 0], [p.L, 0], [p.L, p.W], [0, p.W], [0, p.W / 2]].map((q) => ({ type: 'line', to: q })),
        depth: T + cfg.contourExtra, tool: cfg.contourTool, side: 2, label: 'Formatfräsen',
      });
    }
    const fmtOp = side2 ? null : ops[ops.length - 1];
    if (cfg.formatTwoStep && fmtOp) {
      // Vorfräsen mit Werkzeug 1 und Aufmaß, danach Werkzeug 2 auf Endmaß (gleiche Geometrie)
      fmtOp.rough = { tool: cfg.formatRoughTool || cfg.contourTool, allowance: Math.max(0, cfg.formatAllowance || 0) + Math.max(0, cfg.sandOn ? +cfg.sandAllowance || 0 : 0) };
      fmtOp.label += ' zweistufig';
    }
    // Oszillation beim Formatfräsen: Tiefe pendelt zwischen Dicke + min und Dicke + max (ohne Zustellung)
    const oscRange = (a, b) => { const lo = Math.max(0, Math.min(+a || 0, +b || 0)); return { min: T + lo, max: T + Math.max(lo, +a || 0, +b || 0) }; };
    if (cfg.oscMill && fmtOp) {
      fmtOp.osc = oscRange(cfg.oscMillMin, cfg.oscMillMax);
      fmtOp.depth = fmtOp.osc.min;
      fmtOp.label += ' oszillierend';
    }
    // Schleifen mit der Schleifwalze: gleiche Außenkontur, immer oszillierend, An- und Abfahrt im Bogen
    if (cfg.sandOn && fmtOp) {
      const allow = Math.max(0, +cfg.sandAllowance || 0);
      if (allow > 0) fmtOp.finishAllowance = allow; // Formatfräsen bleibt um die Schleifzugabe größer
      const osc = oscRange(cfg.sandMin, cfg.sandMax);
      ops.push({ kind: 'contour', key: 'sand', toolKind: 'sand', toolDefault: 'sandTool', contour: ++nContour, milling: ++nMill, approach: true, sand: true,
        start: fmtOp.start, segs: fmtOp.segs, depth: osc.min, osc: osc, passes: Math.max(1, Math.min(9, Math.round(+cfg.sandPasses || 1))),
        tool: cfg.sandTool, side: 2, label: 'Schleifen oszillierend' + (allow > 0 ? ' (Zugabe ' + fmt(allow) + ')' : '') });
    }

    // 2) Nuten mit Säge
    for (const g of p.grooves) {
      const width = g.to - g.from;
      if (width > cfg.maxGrooveWidth) warnings.push('Nut ' + fmt(width) + ' mm breit – breiter als ' + cfg.maxGrooveWidth + ' mm, bitte prüfen.');
      // Segment auf der Nutflanke, Nut links der Fahrtrichtung (wie im Beispiel 32_Seitenwand_R)
      const a = g.dir === 'X' ? [-cfg.sawOverrun, g.from] : [g.to, -cfg.sawOverrun];
      const b = g.dir === 'X' ? [p.L + cfg.sawOverrun, g.from] : [g.to, p.W + cfg.sawOverrun];
      ops.push({ kind: 'slot', key: 'slot-' + p.grooves.indexOf(g), toolKind: 'saw', toolDefault: 'sawTool', a: a, b: b, depth: g.depth, width: width, tool: cfg.sawTool,
        label: 'Nut ' + fmt(width) + '×' + fmt(g.depth) });
    }

    // 3) Abweichungen der Außenkontur vom Rechteck (Ausschnitte, Rundungen, Schrägen)
    for (const [i, path] of (whole || side2 ? [] : notchPaths(p, cfg)).entries()) {
      ops.push({ kind: 'contour', key: 'notch-' + i, toolKind: 'mill', toolDefault: 'cutoutTool', contour: ++nContour, milling: ++nMill, approach: false,
        start: path.start, segs: path.segs, depth: T + cfg.cutoutExtra, tool: cfg.cutoutTool, side: 1, label: 'Kontur-Ausschnitt' });
    }

    // 4) Durchbrüche (Innenkonturen)
    for (const [i, lp] of p.cutouts.entries()) {
      ops.push({ kind: 'contour', key: 'cutout-' + i, toolKind: 'mill', toolDefault: 'cutoutTool', contour: ++nContour, milling: ++nMill, approach: false,
        // ganzer Kreis (z. B. schräges Rundloch): zwei Halbkreise, sonst wären Anfang und Ende gleich
        ...(lp.length === 1 && lp[0].full ? wholeContour(lp) : { start: lp[0].a, segs: lp.map(toPolySeg) }),
        depth: T + cfg.cutoutExtra, tool: cfg.cutoutTool, side: 2, label: 'Durchbruch' });
    }

    // 5) Falze
    for (const [ri, r] of p.rebates.entries()) {
      const key = 'rebate-' + ri;
      const rTool = (cfg.toolOverrides && cfg.toolOverrides[key]) || cfg.rebateTool;
      const dia = toolD(rTool, cfg.rebateToolDia);
      const n = Math.max(1, Math.ceil(r.width / (dia * 0.9)));
      const stopped = (r.from !== undefined && r.from !== null) || (r.to !== undefined && r.to !== null);
      if (stopped) {
        // abgesetzter Falz: Bahn = Werkzeugmitte (Korrektur 0), Einfahren/Ausfahren quer über die offene Kante,
        // an abgesetzten Enden hält die Mitte einen Radius vor dem Ende (Innenecken bleiben mit R Fräser rund)
        const rad = dia / 2;
        const ll = cfg.leadLength;
        const along = r.edge === 'Front' || r.edge === 'Back' ? p.L : p.W;
        const sgn = r.edge === 'Back' || r.edge === 'Right' ? 1 : -1; // Richtung zur offenen Kante
        const edgeV = sgn > 0 ? (r.edge === 'Back' ? p.W : p.L) : 0;
        const vOut = edgeV + sgn * (rad + ll);
        const v0 = r.flank + sgn * rad;
        // letzte Bahn mit der Mitte auf der Plattenkante: so bleibt an den Enden an der Kante nichts stehen;
        // reicht der Radius bis zur Flanke, genügt diese eine Bahn
        const v1 = edgeV;
        const m = sgn * (v1 - v0) > 0 ? Math.ceil(sgn * (v1 - v0) / (dia * 0.9)) + 1 : 1;
        const lo = r.from === null || r.from === undefined ? null : r.from + rad;
        const hi = r.to === null || r.to === undefined ? null : r.to - rad;
        const len = (hi === null ? along : hi) - (lo === null ? 0 : lo);
        const fwd = r.edge === 'Front' || r.edge === 'Right'; // Laufrichtung wie beim durchgehenden Falz
        const uS = fwd ? (lo === null ? -rad - ll : lo) : (hi === null ? along + rad + ll : hi);
        const uE = fwd ? (hi === null ? along + rad + ll : hi) : (lo === null ? -rad - ll : lo);
        const legS = fwd ? lo !== null : hi !== null;
        const legE = fwd ? hi !== null : lo !== null;
        const P = (u, v) => (r.edge === 'Front' || r.edge === 'Back' ? [u, v] : [v, u]);
        if (len < 0) warnings.push('Abgesetzter Falz ' + fmt(r.width) + ' mm: zu kurz für Fräser Ø' + fmt(dia) + '.');
        warnings.push('Abgesetzter Falz ' + fmt(r.width) + '×' + fmt(r.depth) + ': Innenecken bleiben mit R' + fmt(rad) + ' rund (Fräser Ø' + fmt(dia) + ').');
        // alle Bahnen in einem Zug (hin und zurück), ein- und ausfahren über die offene Kante
        const vs = [];
        for (let i = 0; i < m; i++) vs.push(m > 1 ? v0 + ((v1 - v0) * i) / (m - 1) : v1);
        const start = legS ? P(uS, vOut) : P(uS, vs[0]);
        const segs = [];
        if (legS) segs.push({ type: 'line', to: P(uS, vs[0]) });
        vs.forEach((v, i) => {
          const back = i % 2 === 1;
          if (i) segs.push({ type: 'line', to: P(back ? uE : uS, v) });
          segs.push({ type: 'line', to: P(back ? uS : uE, v) });
        });
        const lastAtE = vs.length % 2 === 1;
        if (lastAtE ? legE : legS) segs.push({ type: 'line', to: P(lastAtE ? uE : uS, vOut) });
        ops.push({ kind: 'contour', key: key, toolKind: 'mill', toolDefault: 'rebateTool', contour: ++nContour, milling: ++nMill, approach: false,
          start: start, segs: segs, depth: r.depth, tool: cfg.rebateTool, side: 0,
          label: 'Falz ' + fmt(r.width) + '×' + fmt(r.depth) + ' (abgesetzt)' });
        continue;
      }
      if (n > 1) warnings.push('Falz ' + fmt(r.width) + ' mm breiter als Fräser Ø' + fmt(dia) + ' – ' + n + ' Bahnen.');
      for (let i = 0; i < n; i++) {
        const off = (i * r.width) / n;
        let a;
        let b;
        const ll = cfg.leadLength;
        if (r.edge === 'Front') { const y = r.flank - off; a = [-ll, y]; b = [p.L + ll, y]; }
        if (r.edge === 'Back') { const y = r.flank + off; a = [p.L + ll, y]; b = [-ll, y]; }
        if (r.edge === 'Left') { const x = r.flank - off; a = [x, p.W + ll]; b = [x, -ll]; }
        if (r.edge === 'Right') { const x = r.flank + off; a = [x, -ll]; b = [x, p.W + ll]; }
        ops.push({ kind: 'contour', key: key, toolKind: 'mill', toolDefault: 'rebateTool', contour: ++nContour, milling: ++nMill, approach: false,
          start: a, segs: [{ type: 'line', to: b }], depth: r.depth, tool: cfg.rebateTool, side: 2,
          label: 'Falz ' + fmt(r.width) + '×' + fmt(r.depth) });
      }
    }

    // 6) Taschen (flachste zuerst)
    for (const [i, k] of p.pockets.entries()) {
      const key = 'pocket-' + i;
      const kw = Math.min(k.x1 - k.x0, k.y1 - k.y0, narrowest(k.segs));
      const auto = fittingMill(kw, k.depth, cfg.pocketTool);
      const tool = (cfg.toolOverrides && cfg.toolOverrides[key]) || auto;
      const dia = toolD(tool, null);
      const size = fmt(k.x1 - k.x0) + '×' + fmt(k.y1 - k.y0);
      if (dia && kw < dia) warnings.push('Tasche ' + size + ' ist schmaler als Fräser ' + tool + ' (Ø' + fmt(dia) + ').');
      if (dia && k.minRadius < dia / 2 - 0.01) warnings.push('Tasche ' + size + ': Eckenradius R' + fmt(k.minRadius) + ' kleiner als Fräserradius ' + fmt(dia / 2) + ' – Ecken bleiben runder.');
      if (k.open && k.open.length) warnings.push('Tasche ' + size + ' ist zur Kante offen (' + k.open.join(', ') + ') – Anfahrt in Maestro prüfen.');
      ops.push({ kind: 'pocket', key: key, toolKind: 'mill', toolDefault: 'pocketTool', pocket: i + 1, segs: k.segs, islands: k.islands,
        depth: k.depth, tool: auto, label: 'Tasche ' + size + '×' + fmt(k.depth) + (k.islands.length ? ' mit Insel' : '') });
    }

    // 6a) Clamex-Nuten: Scheibenfräser fährt auf der Mittelebene der Nut von außen bis zur Nutmitte und zurück
    for (const [i, g] of (p.clamex || []).entries()) {
      if (cfg.clamexMode !== 'direct') {
        // SCM-Makro: ein Verbinder je Nut (Start = Ende) an der Kante der Schnittfläche, Richtung gegen den Uhrzeigersinn
        const edge = Math.abs(g.n[2]) < 0.99;
        if (!edge) {
          warnings.push('Clamex-Nut in der Fläche (' + fmt(g.c[0]) + ' / ' + fmt(g.c[1]) + '): über das Makro noch nicht möglich (kein Beispielprogramm) – nicht ausgegeben.');
          continue;
        }
        const dist = g.r - g.depth;
        const s0 = [g.c[0] - g.n[0] * dist, g.c[1] - g.n[1] * dist, g.c[2] - g.n[2] * dist];
        let pt0 = s0;
        if (Math.abs(g.n[2]) > 1e-6) {
          // schräge Schnittfläche: Punkt auf der längeren (weiter außen liegenden) Kante oben bzw. unten
          const up = [-g.n[0] * g.n[2], -g.n[1] * g.n[2], 1 - g.n[2] * g.n[2]];
          const at = (z) => { const k = (z - s0[2]) / up[2]; return [s0[0] + up[0] * k, s0[1] + up[1] * k, z]; };
          const top = at(T);
          const bot = at(0);
          const out = (q) => (q[0] - s0[0]) * g.n[0] + (q[1] - s0[1]) * g.n[1];
          pt0 = out(top) >= out(bot) ? top : bot;
        }
        let angZ = Math.atan2(g.n[0], -g.n[1]) * 180 / Math.PI; // Tangente (−n_y, n_x): vorne 0, rechts 90, hinten 180, links −90
        if (Math.abs(angZ) < 0.5) angZ = 360; // 0° liest das Makro als „nicht angegeben“
        const tilt = Math.asin(Math.min(1, Math.abs(g.n[2]))) * 180 / Math.PI;
        const where = 'Kante ' + ({ '0,-1': 'vorne', '0,1': 'hinten', '-1,0': 'links', '1,0': 'rechts' }[Math.round(g.n[0]) + ',' + Math.round(g.n[1])] || 'schräg');
        // Winkel wie beim Sägeschnitt derselben Fläche: Fläche nach oben (unten breiter) 90 − Neigung, nach unten 90 + Neigung
        ops.push({ kind: 'clamex', key: 'clamex-' + i, macro: { x: pt0[0], y: pt0[1], angle: g.n[2] >= 0 ? 90 - tilt : 90 + tilt, angleZ: angZ, height: s0[2] },
          groove: g, depth: g.depth, label: 'Clamex ' + where + ' (Makro)' });
        continue;
      }
      const pl = clamexPlan(p, g, cfg);
      const where = pl.face === 'Top' ? 'Kante ' + ({ '0,-1': 'vorne', '0,1': 'hinten', '-1,0': 'links', '1,0': 'rechts' }[Math.round(g.n[0]) + ',' + Math.round(g.n[1])] || 'schräg')
        : g.n[2] > 0.99 ? 'Fläche' : 'Schräge';
      if (pl.error) { warnings.push('Clamex-Nut ' + where + ' (' + fmt(g.c[0]) + ' / ' + fmt(g.c[1]) + '): ' + pl.error); continue; }
      ops.push({ kind: 'clamex', key: 'clamex-' + i, toolKind: 'mill', toolDefault: 'clamexTool', face: pl.face, start: pl.start, end: pl.end, depth: pl.depth,
        reach: pl.reach, groove: g, tool: cfg.clamexTool, label: 'Clamex-Nut ' + where + ' ' + fmt(g.w) + '×' + fmt(g.depth) });
    }

    // 6b) Taschen in den Kanten (Stirn-/Längsseiten, eigene Bearbeitungsebene)
    const SIDE_DE = { Left: 'links', Right: 'rechts', Front: 'vorne', Back: 'hinten' };
    for (const [i, k] of (p.sidePockets || []).entries()) {
      const key = 'spocket-' + i;
      const w = Math.min(k.x1 - k.x0, k.y1 - k.y0, narrowest(k.segs));
      const auto = fittingMill(w, k.depth, cfg.pocketTool);
      const tool = (cfg.toolOverrides && cfg.toolOverrides[key]) || auto;
      const dia = toolD(tool, null);
      const r1 = (v) => fmt(Math.round(v * 10) / 10);
      const label = 'Tasche ' + SIDE_DE[k.face] + ' ' + r1(k.x1 - k.x0) + '×' + r1(k.y1 - k.y0);
      if (dia && w < dia) warnings.push(label + ' ist schmaler (' + fmt(w) + ') als Fräser ' + tool + ' (Ø' + fmt(dia) + ') – kleineren Fräser wählen.');
      else if (dia && k.minRadius < dia / 2 - 0.01) warnings.push(label + ': Eckenradius R' + fmt(k.minRadius) + ' kleiner als Fräserradius ' + fmt(dia / 2) + ' – Ecken bleiben runder.');
      if (k.holes) warnings.push(label + ': Bohrung im Taschenboden wird nicht ausgegeben.');
      ops.push({ kind: 'pocket', face: k.face, key: key, toolKind: 'mill', toolDefault: 'pocketTool', pocket: 0, segs: k.segs, islands: k.islands,
        depth: k.depth, tool: auto, autoTool: auto !== cfg.pocketTool, label: label + (k.islands.length ? ' mit Insel' : '') });
    }

    // 7) Fasen: entlang der Kontur am Stück (auch über Rundungen), sonst einzelne Kanten
    for (const [i, c] of (p.chamferPaths || []).entries()) {
      const path = c.closed ? wholeContour(c.segs) : { start: c.segs[0].a, segs: c.segs.map(toPolySeg) };
      ops.push({ kind: 'chamfer', key: 'chamferpath-' + i, toolKind: 'mill', toolDefault: 'chamferTool', start: path.start, segs: path.segs,
        width: c.width, height: c.height, toolPos: c.side === 'top' ? 2 : 3, tool: cfg.chamferTool,
        label: 'Fase ' + fmt(c.width) + '×' + fmt(c.height) + (c.side === 'top' ? ' oben' : ' unten') + (c.closed ? ' umlaufend' : ' (Kontur)') });
    }
    for (const [i, c] of p.chamfers.entries()) {
      ops.push({ kind: 'chamfer', key: 'chamfer-' + i, toolKind: 'mill', toolDefault: 'chamferTool', a: c.line.a, b: c.line.b,
        width: c.width, height: c.height, toolPos: c.side === 'top' ? 2 : 3, tool: cfg.chamferTool,
        label: 'Fase ' + fmt(c.width) + '×' + fmt(c.height) + (c.side === 'top' ? ' oben' : ' unten') });
    }

    // 7b) Gekrümmte Flächen – nur wenn beim Teil eingeschaltet, sonst Hinweis
    const atEdge = (q) => q[0] < 0.05 || q[0] > p.L - 0.05 || q[1] < 0.05 || q[1] > p.W - 0.05;
    const ovTool = (key, def) => (cfg.toolOverrides && cfg.toolOverrides[key]) || def;
    const curvedFaces = new Set(); // Schrägen, die in der 5-Achs-Bahn an der Rundung mitgefräst werden
    const cSlants = p.curvedSlants || [];
    if (cSlants.length && cfg.curvedSlantOn) {
      for (const [i, c] of cSlants.entries()) {
        const key = 'cslant-' + i;
        const tool = ovTool(key, cfg.slantTool);
        const label = 'Schräge an Rundung ' + fmt(c.tilt) + '° (5-Achs)';
        // Werkzeugmitte: um r / cos(Neigung) zur Abfallseite versetzt (wie bei geraden Schrägen)
        const dt = toolD(tool, 0);
        if (!dt) warnings.push(label + ': Durchmesser von ' + tool + ' unbekannt – Bahn liegt auf der Kante (Werkzeugmitte).');
        // Ende an der Plattenkante: Oberkante liegt bei „oben schmaler“ um T·tan(Neigung) innerhalb
        const m = 0.05 + (c.up ? T * Math.tan(c.tilt * Math.PI / 180) : 0);
        const nearEdge = (q) => q[0] < m || q[0] > p.L - m || q[1] < m || q[1] > p.W - m;
        const path = offsetRun(c.segs, c.closed, dt ? dt / 2 / Math.cos(c.tilt * Math.PI / 180) : 0, cfg.leadLength, nearEdge);
        if (path.error) { warnings.push(label + ': ' + path.error + ' – nicht bearbeitet.'); continue; }
        for (const id of c.faceIds) curvedFaces.add(id);
        ops.push({ kind: 'slantpath', key: key, toolKind: 'mill', toolDefault: 'slantTool', tool: tool, start: path.start, segs: path.segs,
          inner: !!c.inner, angle: c.tilt, approach: c.up ? 2 : 1, depth: T + cfg.slantExtra, label: label });
      }
    } else if (cSlants.length) {
      warnings.push('Schräge an einer Rundung erkannt (' + cSlants.length + '×) – die Rundungen werden nicht bearbeitet. ' +
        'Zum Fräsen beim Teil „Schräge an Rundungen: 5-Achs fräsen“ einschalten.');
    }
    const cSurf = p.curvedSurfaces || [];
    if (cSurf.length && cfg.curvedSurfaceOn) {
      for (const [i, c] of cSurf.entries()) {
        if (cfg.curvedSurfaceMode === 'flat4' && c.cyl) {
          // Zylinder nach außen gewölbt: je Zeile eine geneigte Ebene tangential an die Fläche, Schaftfräser senkrecht darauf
          const key = 'cyl4-' + i;
          const tool = ovTool(key, cfg.cyl4Tool);
          const label = 'Gewölbte Fläche (Zylinder R' + fmt(c.cyl.r) + ') 4-Achs abzeilen';
          const info = cfg.toolInfo && cfg.toolInfo[tool];
          const D = toolD(tool, 0);
          if (!D) { warnings.push(label + ': Durchmesser von ' + tool + ' unbekannt – nicht bearbeitet.'); continue; }
          if (info && info.body && info.body !== 'Endmill') warnings.push(label + ': ' + tool + ' ist kein Schaftfräser – bitte prüfen.');
          const plan4 = cyl4Plan(c.cyl, p, cfg, D);
          const tiltMax = Math.max(...plan4.passes.map((q) => Math.abs(q.phi))) * 180 / Math.PI;
          if (tiltMax > cfg.cyl4MaxTilt + 1e-6) {
            warnings.push(label + ': Neigung bis ' + fmt(Math.round(tiltMax * 10) / 10) + '° – mehr als ' + fmt(cfg.cyl4MaxTilt) + '° erlaubt, stattdessen Kugelfräser.');
          } else {
          // Schnitttiefe je Schicht: Schicht + Abstand Ebene–Fläche am Fräserrand (D² / 8R)
          const cut = (plan4.layers > 1 ? cfg.cyl4Layer : plan4.dmax) + (D * D) / (8 * c.cyl.r);
          if (info && info.len && cut > info.len + 1e-9) warnings.push(label + ': bis ' + fmt(cut) + ' mm Schnitttiefe, Schneidenlänge ' + tool + ' nur ' + fmt(info.len) + ' mm – Schichtdicke verringern.');
          const tilt = tiltMax;
          ops.push({ kind: 'cyl4', key: key, toolKind: 'mill', toolDefault: 'cyl4Tool', tool: tool, passes: plan4.passes, depth: c.depth,
            tilt: tilt, layers: plan4.layers, label: label + ' (' + plan4.passes.length + ' Zeilen, bis ' + fmt(Math.round(tilt * 10) / 10) + '°)' });
          if (D && cfg.cyl4RoughStep >= D && plan4.layers > 1) warnings.push(label + ': Zeilenabstand Vorfräsen ' + fmt(cfg.cyl4RoughStep) + ' mm ist nicht kleiner als der Fräser – es bleiben Stege stehen.');
          continue;
          }
        }
        const key = 'surface-' + i;
        const tool = ovTool(key, cfg.ballTool);
        const label = 'Gewölbte Fläche (' + c.kinds.join(', ') + ') zeilenfräsen';
        const info = cfg.toolInfo && cfg.toolInfo[tool];
        if (info && info.body && info.body !== 'BallEndmill') warnings.push(label + ': ' + tool + ' ist kein Kugelfräser – Bahn ist für einen Kugelfräser berechnet.');
        if (info && info.len && c.depth > info.len + 1e-9) warnings.push(label + ': Tiefe ' + fmt(c.depth) + ' mm, Schneidenlänge ' + tool + ' nur ' + fmt(info.len) + ' mm.');
        let passes = [];
        if (!cfg.mesh) {
          warnings.push(label + ': 3D-Netz des Teils fehlt (OpenCascade) – keine Bahn berechnet.');
        } else {
          // Öffnungen: Durchbrüche und durchgehende Bohrungen/Rundlöcher von oben (als Kreis)
          const openings = p.cutouts.concat(p.drills.filter((d) => d.face === 'Top' && d.through)
            .map((d) => [{ type: 'arc', a: [d.x + d.d / 2, d.y], b: [d.x + d.d / 2, d.y], c: [d.x, d.y], r: d.d / 2, ccw: true, full: true }]));
          const r = surfacePasses(cfg.mesh, c, toolD(tool, cfg.ballToolDia) / 2, T, cfg, openings);
          passes = r.passes;
          if (!passes.length) warnings.push(label + ': keine Bahn gefunden – Fläche ist mit ' + tool + ' nicht erreichbar.');
        }
        ops.push({ kind: 'surface', key: key, toolKind: 'mill', toolDefault: 'ballTool', tool: tool, rects: c.rects,
          x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1, depth: c.depth, passes: passes, safe: cfg.surfSafe, label: label });
      }
    } else if (cSurf.length) {
      warnings.push('Gewölbte Fläche erkannt (' + cSurf.map((c) => c.kinds.join('/')).join(', ') + ') – nicht bearbeitet. ' +
        'Beim Teil „Gewölbte Flächen“ „Kugelfräser“' + (cSurf.some((c) => c.cyl) ? ' oder „4-Achs Schaftfräser“' : '') + ' wählen.');
    }

    // 7c) Kantenrundungen (oben/unten) mit dem Radiusfräser entlang der Kontur – nach dem Formatfräsen (Regel)
    for (const [i, e] of (p.edgeRounds || []).entries()) {
      const where = (e.side === 'top' ? 'oben' : 'unten') + (e.loop === 'outer' ? '' : ' am Durchbruch') + (e.closed ? ' umlaufend' : '');
      const label = 'Kantenrundung R' + fmt(e.r) + ' ' + where;
      if (Math.abs(e.r - cfg.roundRadius) > 0.1) {
        warnings.push(label + ': kein passender Radiusfräser (eingestellt R' + fmt(cfg.roundRadius) + ') – nicht bearbeitet.');
        continue;
      }
      const top = e.side === 'top';
      const key = 'edge-' + i;
      const tool = ovTool(key, top ? cfg.roundTopTool : cfg.roundBottomTool);
      if (!tool) { warnings.push(label + ': Radiusfräser ' + (top ? 'oben' : 'unten') + ' ist nicht eingestellt – nicht bearbeitet.'); continue; }
      let path;
      if (e.closed) path = wholeContour(e.segs);
      else {
        // offene Kante: tangential an Außenecken um den An-/Auslauf verlängern
        const ll = cfg.leadLength;
        const first = e.segs[0];
        const last = e.segs[e.segs.length - 1];
        const tanAt = (q, end) => {
          if (q.type === 'line') { const d = lineDir(q); return d; }
          const pnt = end ? q.b : q.a;
          const rr = Math.hypot(pnt[0] - q.c[0], pnt[1] - q.c[1]) || 1;
          const u = [(pnt[0] - q.c[0]) / rr, (pnt[1] - q.c[1]) / rr];
          return q.ccw ? [-u[1], u[0]] : [u[1], -u[0]];
        };
        const t0 = tanAt(first, false);
        const t1 = tanAt(last, true);
        const start = e.extendStart ? [first.a[0] - t0[0] * ll, first.a[1] - t0[1] * ll] : first.a;
        const segs = (e.extendStart ? [{ type: 'line', to: first.a }] : []).concat(e.segs.map(toPolySeg));
        if (e.extendEnd) segs.push({ type: 'line', to: [last.b[0] + t1[0] * ll, last.b[1] + t1[1] * ll] });
        path = { start: start, segs: segs };
        if (!e.extendStart || !e.extendEnd) {
          warnings.push(label + ': Rundung endet ' + (!e.extendStart && !e.extendEnd ? 'an beiden Enden' : 'an einem Ende') +
            ' an einer Innenecke oder mitten in der Kante – dort ohne Auslauf, Ein-/Austritt in der Simulation prüfen.');
        }
      }
      ops.push({ kind: 'contour', key: key, toolKind: 'mill', toolDefault: top ? 'roundTopTool' : 'roundBottomTool', contour: ++nContour, milling: ++nMill,
        approach: e.closed, profile: true, start: path.start, segs: path.segs, depth: top ? cfg.roundTopDepth : T + cfg.roundBottomDz,
        tool: tool, side: 2, label: label });
    }

    // Haltestege und Rundung unten am Durchbruch: der Radiusfräser unten schneidet die Stege durch
    if (cfg.tabsMode !== 'off' && (p.edgeRounds || []).some((e) => e.loop === 'cutout' && e.side === 'bottom' && Math.abs(e.r - cfg.roundRadius) <= 0.1)) {
      warnings.push('Haltestege: der Radiusfräser unten am Durchbruch schneidet die Stege durch – Innenstück wird lose.');
    }

    // 8) Schräge Kanten über die ganze Dicke (5-Achs)
    for (const [i, w] of p.slantWalls.entries()) {
      if (curvedFaces.has(w.faceId)) continue; // in der Bahn an der Rundung enthalten
      let ww = w; // Kante, an der gesägt/gefräst wird
      if (w.boss && (w.boss.unsupported || !w.boss.bosses.length)) {
        warnings.push('Schräge Kante ' + fmt(w.angle) + '° mit Feder/Zapfen bis an den Rand – nicht automatisch bearbeitbar, nichts ausgegeben (in Maestro von Hand).');
        continue;
      }
      if (w.boss && w.boss.plane.n[2] < 0) continue; // Zapfen zeigt nach unten: Hinweis kommt über „Bearbeitung von unten“ (Seite 2 / wenden)
      if (w.boss) {
        // Zapfen auf der Schräge: Vorschnitt parallel, um die größte Zapfenhöhe (+ Zugabe) nach außen versetzt – an der
        // Oberkante verschoben: Punkt + n·h, dann in der Ebene zurück auf z = T
        const pl = w.boss.plane;
        const hc = w.boss.height + Math.max(0, +cfg.tenonAllowance || 0);
        const n = pl.n;
        const up = [-n[0] * n[2], -n[1] * n[2], 1 - n[2] * n[2]];
        const k = Math.abs(up[2]) > 1e-9 ? (n[2] * hc) / up[2] : 0;
        const sh = [n[0] * hc - up[0] * k, n[1] * hc - up[1] * k];
        ww = Object.assign({}, w, { top: { a: [w.top.a[0] + sh[0], w.top.a[1] + sh[1]], b: [w.top.b[0] + sh[0], w.top.b[1] + sh[1]] } });
        // Taschen auf der Ebene der höchsten Zapfenoberseite (+ Zugabe): Fläche der Schräge plus Rand; der Rand reicht so weit,
        // dass der Fräser zwischen Zapfen und Tasche durchpasst (mindestens Fräserradius + 1)
        const tool = cfg.tenonTool;
        const r = (toolD(tool, 18) || 18) / 2;
        const isl = w.boss.bosses.map((b) => ({ height: b.height,
          loops: b.islands.map((lp) => (segsArea(lp) > 0 ? lp.slice().reverse().map((q) => ({ type: 'line', a: q.b, b: q.a })) : lp)) }));
        const pts = isl.flatMap((b) => b.loops.flatMap((lp) => lp.map((q) => q.a)));
        const gap = { x0: Math.min(...pts.map((q) => q[0])), y0: Math.min(...pts.map((q) => q[1])),
          x1: pl.L - Math.max(...pts.map((q) => q[0])), y1: pl.W - Math.max(...pts.map((q) => q[1])) };
        const m = (g) => Math.max(r + 1, 2 * r + 1 - g); // Rand je Seite
        const ex = [m(gap.x0), m(gap.y0), m(gap.x1), m(gap.y1)];
        const plane = { name: 'Zapfen_' + (i + 1), o: [pl.o[0] + n[0] * hc, pl.o[1] + n[1] * hc, pl.o[2] + n[2] * hc],
          zRot: pl.zRot, xRot: pl.xRot, X: pl.X, Y: pl.Y, n: n };
        const rect = [[-ex[0], -ex[1]], [pl.L + ex[2], -ex[1]], [pl.L + ex[2], pl.W + ex[3]], [-ex[0], pl.W + ex[3]]]
          .map((q, j, all) => ({ type: 'line', a: q, b: all[(j + 1) % all.length] }));
        const where = 'Zapfen ' + fmt(Math.round(w.boss.height * 10) / 10) + ' mm auf Schräge ' + fmt(Math.round(w.angle * 10) / 10) + '°';
        // Stufen von oben nach unten: bis zur nächstniedrigeren Zapfenhöhe; Inseln = Zapfen, die höher sind als die Stufe
        const levels = [...new Set(isl.map((b) => Math.round(b.height * 1000) / 1000))].sort((a, b) => b - a);
        const steps = [];
        if (hc > levels[0] + 1e-6) steps.push({ to: levels[0], label: where + ': Oberseite plan' });
        levels.forEach((h, j) => steps.push({ to: j + 1 < levels.length ? levels[j + 1] : 0,
          label: where + (j + 1 < levels.length ? ': bis ' + fmt(levels[j + 1]) + ' mm' : ': ringsum ausräumen') }));
        steps.forEach((st, j) => {
          const keep = isl.filter((b) => b.height > st.to + 1e-6); // Zapfen, die über diese Stufe hinausragen
          ops.push({ kind: 'pocket', plane: plane, key: 'tenon-' + i + '-' + j, toolKind: 'mill', toolDefault: 'tenonTool', pocket: 0, segs: rect,
            islands: keep.flatMap((b) => b.loops), depth: hc - st.to, tool: tool, label: st.label });
        });
        if (w.boss.bottomZ < 0.05) {
          warnings.push(where + ': der Fräser taucht an der Unterkante der Schräge bis ≈' + fmt(Math.round(ex[1] * Math.hypot(n[0], n[1]) * 10) / 10) +
            ' mm unter die Platte – dort dürfen Sauger/Gehäuse nicht über die Kante stehen.');
        }
      }
      const ll = cfg.leadLength;
      const d = [ww.top.b[0] - ww.top.a[0], ww.top.b[1] - ww.top.a[1]];
      const l = Math.hypot(d[0], d[1]) || 1;
      const u = [d[0] / l, d[1] / l];
      // Gerader Schnitt von Kante zu Kante: mit der Säge (Schnittfläche wird zur neuen schrägen Ebene)
      if (w.boss ? cfg.tenonPrecut !== 'mill' && atEdge(w.top.a) && atEdge(w.top.b) : cfg.slantCut === 'saw' && (w.sawable || (atEdge(ww.top.a) && atEdge(ww.top.b)))) {
        const so = cfg.sawOverrun;
        ops.push({ kind: 'blade', key: 'blade-' + i, toolKind: 'saw', toolDefault: 'bladeTool',
          a: [ww.top.a[0] - u[0] * so, ww.top.a[1] - u[1] * so], b: [ww.top.b[0] + u[0] * so, ww.top.b[1] + u[1] * so],
          a0: ww.top.a, b0: ww.top.b, tilt: w.angle, leanOut: w.leanOut, depth: T, extra: cfg.bladeExtra, tool: cfg.bladeTool,
          score: cfg.scoreCut ? { depth: cfg.scoreDepth, out: cfg.scoreOut } : null,
          label: (w.boss ? 'Vorschnitt (Zapfen) ' : 'Sägeschnitt ') + fmt(w.angle) + '°' + (cfg.scoreCut ? ' vorgeritzt' : '') });
        continue;
      }
      ops.push({ kind: 'slant', key: 'slant-' + i, toolKind: 'mill', toolDefault: 'slantTool',
        a: [ww.top.a[0] - u[0] * ll, ww.top.a[1] - u[1] * ll], b: [ww.top.b[0] + u[0] * ll, ww.top.b[1] + u[1] * ll],
        angle: w.angle, approach: w.leanOut ? 2 : 1, depth: T + cfg.slantExtra, tool: cfg.slantTool,
        scrap: [u[1], -u[0]], // Abfallseite (rechts der Bahn)
        label: (w.boss ? 'Vorschnitt (Zapfen) gefräst ' : 'Schräge Kante ') + fmt(w.angle) + '°' });
    }

    // 8b) Taschen und Bohrungen auf schrägen Ebenen (eigene Bearbeitungsebene, z. B. Schnittfläche der Säge)
    for (const [j, sp] of (p.slantPlanes || []).entries()) {
      const plane = { name: 'Slanted_' + (j + 1), o: sp.o, zRot: sp.zRot, xRot: sp.xRot, X: sp.X, Y: sp.Y, n: sp.n };
      const where = 'auf Schräge ' + fmt(Math.round(sp.xRot * 10) / 10) + '°';
      for (const [i, k] of sp.pockets.entries()) {
        const key = 'ppocket-' + j + '-' + i;
        const w = Math.min(k.x1 - k.x0, k.y1 - k.y0, narrowest(k.segs));
        const auto = fittingMill(w, k.depth, cfg.pocketTool);
        const tool = (cfg.toolOverrides && cfg.toolOverrides[key]) || auto;
        const dia = toolD(tool, null);
        const r1 = (v) => fmt(Math.round(v * 10) / 10);
        const label = 'Tasche ' + where + ' ' + r1(k.x1 - k.x0) + '×' + r1(k.y1 - k.y0);
        if (dia && w < dia) warnings.push(label + ' ist schmaler (' + fmt(w) + ') als Fräser ' + tool + ' (Ø' + fmt(dia) + ') – kleineren Fräser wählen.');
        else if (dia && k.minRadius < dia / 2 - 0.01) warnings.push(label + ': Eckenradius R' + fmt(k.minRadius) + ' kleiner als Fräserradius ' + fmt(dia / 2) + ' – Ecken bleiben runder.');
        ops.push({ kind: 'pocket', plane: plane, key: key, toolKind: 'mill', toolDefault: 'pocketTool', pocket: 0, segs: k.segs, islands: k.islands,
          depth: k.depth, tool: auto, label: label });
      }
      const byD = new Map();
      for (const d of sp.drills) {
        const k = fmt(d.d) + '|' + fmt(d.depth);
        if (!byD.has(k)) byD.set(k, []);
        byD.get(k).push(d);
      }
      for (const list of byD.values()) {
        for (const d of list) {
          if (!hasDrill(cfg.drillsVertical, d.d)) warnings.push('Kein Bohrer Ø' + fmt(d.d) + ' für die Bohrung ' + where + ' in der Werkzeugliste – Bohrung trotzdem ausgegeben.');
          ops.push({ kind: 'drill', face: plane.name, plane: plane, pattern: { nX: 1, nY: 1, dX: 0, dY: 0 },
            d: { x: d.x, y: d.y, d: d.d, depth: d.depth, tip: 'P' } });
        }
      }
    }

    // 9) Bohrungen
    const drillOps = [];
    for (const d of p.drills) {
      const vertical = d.face === 'Top';
      const list = vertical ? cfg.drillsVertical : cfg.drillsHorizontal;
      if (!hasDrill(list, d.d)) {
        if (vertical && d.through) {
          const r = d.d / 2;
          ops.push({ kind: 'contour', key: 'round-' + (nRound++), toolKind: 'mill', toolDefault: 'cutoutTool', contour: ++nContour, milling: ++nMill, approach: false,
            start: [d.x + r, d.y],
            segs: [
              { type: 'arc', to: [d.x - r, d.y], c: [d.x, d.y], cw: false },
              { type: 'arc', to: [d.x + r, d.y], c: [d.x, d.y], cw: false },
            ],
            depth: T + cfg.cutoutExtra, tool: cfg.cutoutTool, side: 1, label: 'Rundloch Ø' + fmt(d.d) });
          continue;
        }
        if (vertical && !d.through) {
          // Runde Vertiefung ohne passenden Bohrer → als Kreistasche fräsen
          const key = 'rpocket-' + (nRPocket++);
          const r = d.d / 2;
          ops.push({ kind: 'pocket', key: key, toolKind: 'mill', toolDefault: 'pocketTool', pocket: 0,
            segs: [{ type: 'arc', a: [d.x + r, d.y], b: [d.x + r, d.y], c: [d.x, d.y], r: r, ccw: true, full: true }],
            islands: [], depth: d.depth, tool: cfg.pocketTool, round: true,
            label: 'Rundtasche Ø' + fmt(d.d) + '×' + fmt(d.depth) });
          continue;
        }
        warnings.push('Kein Bohrer Ø' + fmt(d.d) + (vertical ? ' (vertikal)' : ' (horizontal)') + ' in der Werkzeugliste – Bohrung trotzdem ausgegeben.');
      }
      const loc = localDrill(p, d);
      drillOps.push({
        face: d.face, x: loc.x, y: loc.y, d: d.d,
        depth: d.through ? T + cfg.throughExtra : d.depth,
        tip: d.through ? 'L' : 'P',
      });
    }
    const faceOrder = ['Top', 'Left', 'Right', 'Front', 'Back'];
    for (const face of faceOrder) {
      const onFace = drillOps.filter((d) => d.face === face);
      const groups = new Map();
      for (const d of onFace) {
        const key = [fmt(d.d), fmt(d.depth), d.tip].join('|');
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(d);
      }
      const patterns = [];
      for (const list of groups.values()) {
        for (const pat of makePatterns(list, cfg.usePatterns)) patterns.push(pat);
      }
      patterns.sort((a, b) => a.p.x - b.p.x || a.p.y - b.p.y);
      for (const pat of patterns) ops.push({ kind: 'drill', face: face, pattern: pat, d: pat.p });
    }

    // 10) Schräge Bohrungen (5-Achs). Winkel A = Richtung der Werkzeugachse in XY zu X, B = Neigung zu Z.
    for (const sd of p.slantDrills) {
      const v = [-sd.dir[0], -sd.dir[1], -sd.dir[2]];
      const angleB = Math.acos(Math.max(-1, Math.min(1, v[2]))) * 180 / Math.PI;
      let angleA = Math.abs(v[0]) + Math.abs(v[1]) < 1e-9 ? 0 : Math.atan2(v[1], v[0]) * 180 / Math.PI;
      if (angleA < 0) angleA += 360;
      ops.push({ kind: 'sdrill', entry: sd.entry, angleA: angleA, angleB: angleB, d: sd.d,
        depth: sd.through ? sd.depth + cfg.throughExtra : sd.depth, tip: sd.through ? 'L' : 'P' });
    }

    // Reihenfolge: Gruppen (eine Fräsung, ein Falz mit allen Bahnen, gleiche Bohrungen) verschieben
    for (const op of ops) {
      if (op.key) op.group = op.key;
      else if (op.kind === 'drill') op.group = 'drill:' + op.face + '|' + fmt(op.d.d) + '|' + fmt(op.d.depth) + '|' + op.d.tip;
      else if (op.kind === 'sdrill') op.group = 'sdrill:' + fmt(op.d) + '|' + fmt(op.depth) + '|' + fmt(op.angleA) + '|' + fmt(op.angleB);
    }
    const defaultGroups = [];
    for (const op of ops) if (!defaultGroups.includes(op.group)) defaultGroups.push(op.group);
    let order = defaultGroups.slice();
    if (cfg.orderRule && cfg.orderRule.on) {
      const seq = ruleSequence(cfg.orderRule);
      const catOf = new Map(ops.map((op) => [op.group, category(op)]));
      order = order.map((g, i) => ({ g: g, i: i, r: seq.indexOf(catOf.get(g)) }))
        .sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.g);
    }
    const ruleGroups = order.slice();
    if (cfg.order && cfg.order.length) {
      // eigene Reihenfolge; Gruppen, die darin fehlen (z. B. wiederhergestellt), an ihren Platz nach der Regel – hinter ihren Vorgänger
      const res = cfg.order.filter((g, i, all) => defaultGroups.includes(g) && all.indexOf(g) === i);
      ruleGroups.forEach((g, i) => {
        if (res.includes(g)) return;
        let at = 0;
        for (let j = i - 1; j >= 0; j--) { const k = res.indexOf(ruleGroups[j]); if (k >= 0) { at = k + 1; break; } }
        res.splice(at, 0, g);
      });
      order = res;
    }
    // Bearbeitungen auf schrägen Ebenen erst nach dem Sägeschnitt, der die Fläche erzeugt (sonst Anfahrt ins Material)
    const catOfG = new Map(ops.map((op) => [op.group, category(op)]));
    const lastBlade = order.reduce((m, g, i) => (catOfG.get(g) === 'blade' ? i : m), -1);
    if (lastBlade >= 0) {
      const early = order.filter((g, i) => i < lastBlade && catOfG.get(g) === 'slantPlane');
      if (early.length) {
        order = order.filter((g) => !early.includes(g));
        const at = order.reduce((m, g, i) => (catOfG.get(g) === 'blade' ? i : m), -1);
        order.splice(at + 1, 0, ...early);
        warnings.push('Bearbeitungen auf der schrägen Ebene wurden hinter den Sägeschnitt gesetzt – die Fläche entsteht erst durch den Schnitt.');
      }
    }
    // Schräge an der Rundung eines Ausschnitts erst nach dem Durchbruch (der Butzen ist dann schon heraus)
    const lastCut = order.reduce((m, g, i) => (catOfG.get(g) === 'cutout' ? i : m), -1);
    // ebenso gewölbte Flächen: über einem Durchbruch steht sonst noch der Butzen
    const hasCut = ops.some((op) => category(op) === 'cutout');
    const innerSlant = new Set(ops.filter((op) => (op.kind === 'slantpath' && op.inner) || (op.kind === 'surface' && hasCut)).map((op) => op.group));
    const earlySlant = order.filter((g, i) => i < lastCut && innerSlant.has(g));
    if (earlySlant.length) {
      order = order.filter((g) => !earlySlant.includes(g));
      const at = order.reduce((m, g, i) => (catOfG.get(g) === 'cutout' ? i : m), -1);
      order.splice(at + 1, 0, ...earlySlant);
    }
    const rank = new Map(order.map((g, i) => [g, i]));
    const sorted = ops.map((op, i) => ({ op: op, i: i })).sort((a, b) => rank.get(a.op.group) - rank.get(b.op.group) || a.i - b.i)
      .map((x) => x.op);
    ops.length = 0;
    // je Teil unterdrückte Bearbeitungen (ganze Gruppe) kommen nicht ins Programm
    const sup = new Set(cfg.suppress || []);
    const suppressed = [];
    for (const op of sorted) {
      if (!sup.has(op.group)) { ops.push(op); continue; }
      let g = suppressed.find((x) => x.group === op.group);
      if (!g) { g = { group: op.group, label: opText(op), n: 0, ops: [] }; suppressed.push(g); }
      g.ops.push(op); // für die Anzeige (rot, wo die Bearbeitung wäre)
      g.n += op.kind === 'drill' ? op.pattern.nX * op.pattern.nY : 1;
    }
    for (const g of suppressed) if (g.n > 1 && /Bohrung/.test(g.label)) g.label = g.n + ' × ' + g.label;
    order = order.filter((g) => !sup.has(g));
    // Namen in Programmreihenfolge durchnummerieren
    let nc = 0;
    let np = 0;
    for (const op of ops) {
      if (op.kind === 'contour') { op.contour = ++nc; op.milling = nc; }
      if (op.kind === 'pocket') op.pocket = ++np;
    }

    const missingWarned = new Set();
    const techWarned = new Set();
    const clamexWarned = new Set();
    const stepDownWarn = (op) => op.key === 'format' && ((cfg.stepOverrides && cfg.stepOverrides[op.key] > 0) || cfg.stepDown > 0);
    // Werkzeug, Tiefe (durchgehende Fräsungen) und Zustellungen je Bearbeitung
    const throughKey = (k) => k === 'format' || /^(notch|cutout|round)-/.test(k);
    const depthWarned = new Set();
    for (const op of ops) {
      // eigene Schnittwerte außerhalb des Bereichs aus der Werkzeugdatei → Hinweis (Bohrungen: Bohrer mit passendem Ø)
      const own = cfg.techOverrides && cfg.techOverrides[op.group];
      const drillD = op.kind === 'drill' ? op.d.d : op.kind === 'sdrill' ? op.d : null;
      const drillEntry = own && drillD && cfg.toolInfo ? Object.entries(cfg.toolInfo).find(([, t]) => t.kind === 'drill' && t.d && Math.abs(t.d - drillD) < 0.05) : null;
      const toolName = drillEntry ? drillEntry[0] : (cfg.toolOverrides && op.key && cfg.toolOverrides[op.key]) || op.tool;
      const db = drillEntry ? drillEntry[1].tech : own && cfg.toolInfo && cfg.toolInfo[toolName] && cfg.toolInfo[toolName].tech;
      if (db && !techWarned.has(op.group)) {
        techWarned.add(op.group);
        for (const [k, name, unit] of [['feed', 'Vorschub', 'm/min'], ['rot', 'Drehzahl', 'U/min'], ['descent', 'Eintauchen', 'm/min']]) {
          const r = db[k];
          if (own[k] > 0 && r && r[1] !== null && r[2] !== null && (own[k] < r[1] - 1e-9 || own[k] > r[2] + 1e-9)) {
            warnings.push((op.label || ('Bohrung Ø' + fmt(drillD || 0))) + ': ' + name + ' ' + fmt(own[k]) + ' ' + unit + ' außerhalb ' + fmt(r[1]) + '–' + fmt(r[2]) + ' (Werkzeugdatei ' + toolName + ').');
          }
        }
      }
    }
    for (const op of ops) {
      if (!op.key) continue;
      if (cfg.toolOverrides && cfg.toolOverrides[op.key]) op.tool = cfg.toolOverrides[op.key];
      op.depthAdjustable = op.kind === 'contour' && throughKey(op.key) && !op.osc;
      // Werkzeug fehlt in der geladenen Werkzeugdatei (z. B. nach dem Laden einer anderen .tlgx) → Hinweis
      const lib = cfg.toolInfo && Object.keys(cfg.toolInfo).length ? cfg.toolInfo : null;
      for (const t of [op.tool, op.rough && op.rough.tool]) {
        if (lib && t && t !== '-1' && !lib[t] && !missingWarned.has(t)) {
          missingWarned.add(t);
          warnings.push('Werkzeug ' + t + ' steht nicht in der Werkzeugdatei – in Maestro wird es nicht gefunden. Anderes Werkzeug wählen oder die Einstellung anpassen.');
        }
      }
      const dz = cfg.depthOverrides && cfg.depthOverrides[op.key];
      if (op.depthAdjustable && dz > 0) {
        op.depth = dz;
        if (dz < T - 1e-9 && !depthWarned.has(op.key)) {
          depthWarned.add(op.key);
          warnings.push(op.label + ': Tiefe ' + fmt(dz) + ' mm ist kleiner als die Plattendicke ' + fmt(T) + ' mm – es wird nicht durchgefräst.');
        }
      }
      if (/^round-/.test(op.key)) {
        const dt = toolD(op.tool, null);
        const dh = op.segs[0] ? 2 * Math.hypot(op.start[0] - op.segs[0].c[0], op.start[1] - op.segs[0].c[1]) : 0;
        if (dt && dh && dt >= dh - 1e-6) warnings.push(op.label + ': Fräser ' + op.tool + ' (Ø' + fmt(dt) + ') ist nicht kleiner als das Loch – kleineren Fräser wählen.');
      }
      if (op.kind === 'slot') {
        const bt = cfg.toolInfo && cfg.toolInfo[op.tool] && cfg.toolInfo[op.tool].blade;
        op.single = false;
        if (bt) {
          if (Math.abs(op.width - bt) < 0.05) op.single = true;
          else if (op.width < bt) warnings.push(op.label + ': Nut schmaler als das Sägeblatt ' + op.tool + ' (' + fmt(bt) + ' mm) – andere Säge wählen.');
          else if (op.width > 2 * bt + 1e-6) warnings.push(op.label + ': breiter als zwei Schnitte mit ' + op.tool + ' (2 × ' + fmt(bt) + ' mm) – in der Mitte bleibt ein Steg stehen.');
        }
      }
      if (op.round) {
        const info = cfg.toolInfo && cfg.toolInfo[op.tool];
        const dRound = op.segs[0].r * 2;
        if (info && info.d && info.d >= dRound - 1e-6) {
          warnings.push(op.label + ': Fräser ' + op.tool + ' (Ø' + fmt(info.d) + ') passt nicht hinein – kleineren Fräser wählen.');
        }
      }
      if (op.kind === 'contour' && /^(cutout|round)-/.test(op.key)) {
        // Haltestege: Innenstück bleibt hängen (klein oder alle Durchbrüche)
        let lo = [Infinity, Infinity];
        let hi = [-Infinity, -Infinity];
        let prev = op.start;
        for (const q of op.segs) {
          for (const c of q.type === 'arc' ? [q.to, [q.c[0] + Math.hypot(prev[0] - q.c[0], prev[1] - q.c[1]), q.c[1]], [q.c[0] - Math.hypot(prev[0] - q.c[0], prev[1] - q.c[1]), q.c[1]]] : [q.to]) {
            lo = [Math.min(lo[0], c[0]), Math.min(lo[1], c[1])];
            hi = [Math.max(hi[0], c[0]), Math.max(hi[1], c[1])];
          }
          prev = q.to;
        }
        const size = Math.max(hi[0] - lo[0], hi[1] - lo[1]);
        op.tabs = cfg.tabsMode === 'all' || (cfg.tabsMode === 'small' && size <= cfg.tabsMaxSize);
        if (op.tabs && !/Haltestege/.test(op.label)) op.label += ' mit Haltestegen';
        op.helix = !!cfg.helixOn;
      }
      if (op.kind === 'clamex' && op.macro) {
        op.step = 0;
      } else if (op.kind === 'clamex') {
        // Scheibe passt zur Nut? Radius wie die Nut (Makrohilfe: mindestens 49 mm); Reichweite von der Kante
        const info = cfg.toolInfo && cfg.toolInfo[op.tool];
        const g = op.groove;
        if (info && info.d && Math.abs(info.d / 2 - g.r) > 0.5 && !clamexWarned.has(op.tool + '|r' + g.r)) clamexWarned.add(op.tool + '|r' + g.r) && warnings.push('Clamex-Nuten: R' + fmt(g.r) + ', Werkzeug ' + op.tool + ' Ø' + fmt(info.d) + ' – Nutlänge weicht ab.');
        if (info && info.d && info.d / 2 < 49 - 1e-6 && !clamexWarned.has(op.tool + '|min')) {
          clamexWarned.add(op.tool + '|min');
          warnings.push('Clamex-Nuten: ' + op.tool + ' hat nur R' + fmt(info.d / 2) + ' – Clamex-Scheibe braucht mindestens R49 (Lamello).');
        }
        if (op.reach > (cfg.clamexMaxReach > 0 ? cfg.clamexMaxReach : 60)) {
          warnings.push(op.label + ': ' + fmt(op.reach) + ' mm von der Kante – Werkzeug liegt waagerecht über der Platte, Reichweite und Kollision in der Simulation prüfen.');
        }
        op.step = 0;
      } else if (op.osc) {
        // oszillierend: ein Durchgang ohne Zustellung; Schneide/Walze muss bis zur größten Tiefe reichen
        op.step = 0;
        const info = cfg.toolInfo && cfg.toolInfo[op.tool];
        const r = info && info.d ? info.d / 2 : 0;
        if (info && info.len && op.osc.max > info.len + 1e-9) {
          warnings.push(op.label + ': bis ' + fmt(op.osc.max) + ' mm tief (Dicke + ' + fmt(op.osc.max - T) + '), Schneidenlänge ' + op.tool + ' nur ' + fmt(info.len) + ' mm – ' +
            (info.len > T ? 'Höchstwert verringern (höchstens ' + fmt(info.len - T) + ' mm unter der Platte).' : 'kürzer als die Plattendicke, anderes Werkzeug wählen.'));
        }
        if (op.osc.max - op.osc.min < 1e-6) warnings.push(op.label + ': min = max – die Tiefe pendelt nicht.');
        if (op.sand && r) {
          // Walze kommt nicht in Innenecken mit kleinerem Radius (Außenkontur gegen den Uhrzeigersinn: Innenrundung = Bogen im Uhrzeigersinn)
          const tight = op.segs.filter((q) => q.type === 'arc' && q.cw === true && Math.hypot(q.to[0] - q.c[0], q.to[1] - q.c[1]) < r - 1e-6);
          const corners = op.segs.some((q, i2) => {
            const a = i2 === 0 ? op.start : op.segs[i2 - 1].to;
            const b = q.to;
            const c = op.segs[(i2 + 1) % op.segs.length].to;
            const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
            return q.type === 'line' && op.segs[(i2 + 1) % op.segs.length].type === 'line' && cross < -1e-6 && i2 < op.segs.length - 1; // Kontur gegen den Uhrzeigersinn: Rechtsknick = Innenecke
          });
          if (tight.length || corners) warnings.push(op.label + ': Innenecken bzw. Rundungen kleiner als R' + fmt(r) + ' erreicht die Walze nicht ganz.');
        }
        if (stepDownWarn(op)) warnings.push(op.label + ': Zustellung wird beim Oszillieren nicht verwendet (ein Durchgang).');
      } else if ((op.kind === 'contour' && !op.profile) || op.kind === 'pocket') { // Radiusfräser: ein Durchgang, keine Zustellung
        const glob = op.kind === 'pocket' && cfg.pocketStepDown > 0 ? cfg.pocketStepDown : cfg.stepDown;
        const st = cfg.stepOverrides && cfg.stepOverrides[op.key] !== undefined ? cfg.stepOverrides[op.key] : glob;
        op.step = st > 0 && op.depth > st + 1e-9 ? st : 0;
        const info = cfg.toolInfo && cfg.toolInfo[op.tool];
        const pass = op.step || op.depth;
        if (info && info.len && pass > info.len + 1e-9) {
          warnings.push(op.label + ': ' + fmt(pass) + ' mm je Durchgang, Schneidenlänge ' + op.tool + ' nur ' + fmt(info.len) + ' mm – Zustellung verringern.');
        }
        const rinfo = op.rough && cfg.toolInfo && cfg.toolInfo[op.rough.tool];
        if (rinfo && rinfo.len && pass > rinfo.len + 1e-9 && op.rough.tool !== op.tool) {
          warnings.push(op.label + ': ' + fmt(pass) + ' mm je Durchgang, Schneidenlänge Vorfräser ' + op.rough.tool + ' nur ' + fmt(rinfo.len) + ' mm – Zustellung verringern.');
        }
      }
    }

    if (!side2) {
      for (const b of p.bottom) {
        // Clamex in der Fläche geht über das Makro noch nicht – auch nicht auf Seite 2
        const viaMacro = b.kind === 'Clamex' && cfg.clamexMode !== 'direct';
        warnings.push(b.text + (viaMacro ? ' – über das Makro noch nicht möglich, nicht ausgegeben.'
          : cfg.twoSided ? ' – wird auf Seite 2 bearbeitet.' : ' – nicht von oben bearbeitbar (Zweiseitig einschalten oder Platte wenden).'));
      }
    }
    // Schleifzugabe: Radiusfräser erst nach dem Schleifen (sonst sitzt die Rundung um die Zugabe versetzt)
    const iSand = ops.findIndex((op) => op.sand);
    if (iSand >= 0 && cfg.sandAllowance > 0 && ops.some((op, j) => j < iSand && /^edge-/.test(op.key || ''))) {
      warnings.push('Kantenrundung vor dem Schleifen mit Schleifzugabe ' + fmt(cfg.sandAllowance) + ' mm – Rundung sitzt versetzt; Schleifen vor die Kantenrundungen legen.');
    }
    return { ops: ops, warnings: warnings, groups: order.filter((g) => ops.some((op) => op.group === g)),
      defaultGroups: ruleGroups.filter((g) => !sup.has(g)), suppressed: suppressed };
  }

  // Bahn einer Schräge an Rundungen (Material links, Abfall rechts) um off zur Abfallseite versetzen.
  // Gerade → parallel verschoben, Bogen → Radius ± off; Außenecken mit Bogen um die Ecke, Innenecken (Geraden) geschnitten.
  // Offene Bahnen laufen an der Plattenkante um ll tangential aus. Ergebnis { start, segs } (Polylinie) oder { error }.
  function offsetRun(segs, closed, off, ll, atEdge) {
    const unit2 = (v) => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
    const tan = (q, atEnd) => {
      if (q.type === 'line') return unit2([q.b[0] - q.a[0], q.b[1] - q.a[1]]);
      const r = unit2([(atEnd ? q.b : q.a)[0] - q.c[0], (atEnd ? q.b : q.a)[1] - q.c[1]]);
      return q.ccw ? [-r[1], r[0]] : [r[1], -r[0]];
    };
    const out = [];
    for (const q of segs) {
      if (q.type === 'line') {
        const t = tan(q, false);
        const n = [t[1], -t[0]];
        out.push({ type: 'line', a: [q.a[0] + n[0] * off, q.a[1] + n[1] * off], b: [q.b[0] + n[0] * off, q.b[1] + n[1] * off] });
      } else {
        const r = Math.hypot(q.a[0] - q.c[0], q.a[1] - q.c[1]);
        const r2 = q.ccw ? r + off : r - off; // rechts der Bahn: außen bei Linksbogen, innen bei Rechtsbogen
        if (r2 < 0.05) return { error: 'Innenrundung R' + fmt(r) + ' ist enger als der Fräser' };
        const k = r2 / r;
        const sc = (p) => [q.c[0] + (p[0] - q.c[0]) * k, q.c[1] + (p[1] - q.c[1]) * k];
        out.push({ type: 'arc', a: sc(q.a), b: sc(q.b), c: q.c, ccw: q.ccw, full: !!q.full });
      }
    }
    const res = [];
    const n = out.length;
    for (let i = 0; i < n; i++) {
      res.push(out[i]);
      if (i === n - 1 && !closed) break;
      const A = out[i];
      const B = out[(i + 1) % n];
      if (Math.hypot(A.b[0] - B.a[0], A.b[1] - B.a[1]) < 0.01) continue; // tangential
      const t1 = tan(segs[i], true);
      const t2 = tan(segs[(i + 1) % n], false);
      const cr = t1[0] * t2[1] - t1[1] * t2[0];
      if (cr > 1e-9) {
        res.push({ type: 'arc', a: A.b, b: B.a, c: segs[i].b, ccw: true }); // Außenecke: um die Ecke herum
      } else if (cr < -1e-9 && A.type === 'line' && B.type === 'line') {
        // Innenecke: beide Geraden bis zum Schnittpunkt
        const d1 = [A.b[0] - A.a[0], A.b[1] - A.a[1]];
        const d2 = [B.b[0] - B.a[0], B.b[1] - B.a[1]];
        const den = d1[0] * d2[1] - d1[1] * d2[0];
        const s1 = ((B.a[0] - A.a[0]) * d2[1] - (B.a[1] - A.a[1]) * d2[0]) / den;
        const s2 = ((B.a[0] - A.a[0]) * d1[1] - (B.a[1] - A.a[1]) * d1[0]) / den;
        if (!(s1 > 0 && s1 <= 1 + 1e-9 && s2 >= -1e-9 && s2 < 1)) return { error: 'Innenecke zu eng für den Fräser' };
        const X = [A.a[0] + d1[0] * s1, A.a[1] + d1[1] * s1];
        A.b = X;
        B.a = X;
      } else {
        return { error: 'Innenecke an einer Rundung – Bahn nicht eindeutig' };
      }
    }
    const poly = (q) => (q.type === 'line' ? { type: 'line', to: q.b } : { type: 'arc', to: q.b, c: q.c, cw: !q.ccw });
    if (closed) {
      // Start in der Mitte der längsten Geraden; reiner Kreis: zwei Halbkreise
      let k = -1;
      let best = -1;
      res.forEach((q, i) => {
        if (q.type !== 'line') return;
        const l = Math.hypot(q.b[0] - q.a[0], q.b[1] - q.a[1]);
        if (l > best) { best = l; k = i; }
      });
      if (k < 0) {
        if (res.length === 1 && res[0].full) {
          const q = res[0];
          const opp = [2 * q.c[0] - q.a[0], 2 * q.c[1] - q.a[1]];
          return { start: q.a, segs: [{ type: 'arc', to: opp, c: q.c, cw: !q.ccw }, { type: 'arc', to: q.a, c: q.c, cw: !q.ccw }] };
        }
        return { start: res[0].a, segs: res.map(poly) };
      }
      const q = res[k];
      const m = [(q.a[0] + q.b[0]) / 2, (q.a[1] + q.b[1]) / 2];
      const segsOut = [{ type: 'line', to: q.b }];
      for (let j = 1; j < res.length; j++) segsOut.push(poly(res[(k + j) % res.length]));
      segsOut.push({ type: 'line', to: m });
      return { start: m, segs: segsOut };
    }
    const segsOut = res.map(poly);
    let start = res[0].a;
    if (atEdge(segs[0].a)) {
      const t = tan(segs[0], false);
      segsOut.unshift({ type: 'line', to: start });
      start = [start[0] - t[0] * ll, start[1] - t[1] * ll];
    }
    if (atEdge(segs[segs.length - 1].b)) {
      const t = tan(segs[segs.length - 1], true);
      const e = res[res.length - 1].b;
      segsOut.push({ type: 'line', to: [e[0] + t[0] * ll, e[1] + t[1] * ll] });
    }
    return { start: start, segs: segsOut };
  }

  /*
   * 4-Achs-Abzeilen eines nach außen gewölbten Zylinders (Achse liegend, parallel zu X oder Y) mit dem Schaftfräser.
   * Je Zeile steht der Fräser senkrecht auf der Fläche (Neigung φ quer zur Achse), fährt gerade längs der Achse und
   * schneidet mit der Stirn: Ebene tangential an den Zylinder. Vorfräsen in Schichten auf größerem Radius (R + d), nur wo
   * dort noch Rohteil ist; Schlichten auf R über die Breite der Fläche. Ergebnis: Zeilen { d, phi, a, b (Start/Ende 3D),
   * n (Werkzeugachse) }, Anzahl Schichten, größter Überstand dmax.
   */
  function cyl4Plan(c, p, cfg, D) {
    const ax3 = [c.a[0], c.a[1], 0];
    const u3 = [-c.a[1], c.a[0], 0];
    const o = c.o;
    // Rohteil (fertiges Teil, Quader) im Schnitt quer zur Achse: s = Abstand quer, z
    const corners = [[0, 0], [p.L, 0], [p.L, p.W], [0, p.W]];
    const sv = corners.map((q) => (q[0] - o[0]) * u3[0] + (q[1] - o[1]) * u3[1]);
    const tv = corners.map((q) => (q[0] - o[0]) * ax3[0] + (q[1] - o[1]) * ax3[1]);
    const s0 = Math.min(...sv);
    const s1 = Math.max(...sv);
    const over = D / 2 + (cfg.rawOversize || 0) + 5; // Ein-/Auslauf längs der Achse: Fräser ganz außerhalb
    const t0 = Math.min(...tv) - over;
    const t1 = Math.max(...tv) + over;
    const dmax = Math.max(0, Math.hypot(s0, p.T - o[2]) - c.r, Math.hypot(s1, p.T - o[2]) - c.r);
    const a = Math.max(0.5, cfg.cyl4Layer);
    const K = Math.max(1, Math.ceil(dmax / a - 1e-9));
    const passes = [];
    const point = (rad, phi, t) => [o[0] + ax3[0] * t + u3[0] * rad * Math.sin(phi), o[1] + ax3[1] * t + u3[1] * rad * Math.sin(phi), o[2] + rad * Math.cos(phi)];
    let flip = false;
    const add = (d, phi) => {
      const rad = c.r + d;
      const n = [u3[0] * Math.sin(phi), u3[1] * Math.sin(phi), Math.cos(phi)];
      const A = point(rad, phi, flip ? t1 : t0);
      const B = point(rad, phi, flip ? t0 : t1);
      passes.push({ d: d, phi: phi, a: A, b: B, n: n });
      flip = !flip;
    };
    // Bereiche auf dem Kreis R + d, die im Rohteil liegen (darüber steht noch Material)
    const inside = (rad, phi) => {
      const sx = rad * Math.sin(phi);
      const z = o[2] + rad * Math.cos(phi);
      return sx >= s0 - 1e-9 && sx <= s1 + 1e-9 && z <= p.T + 1e-9 && z >= 0;
    };
    for (let k = K - 1; k >= 1; k--) {
      const d = k * a;
      const rad = c.r + d;
      const lim = Math.min(Math.PI / 2, Math.max(Math.abs(c.phi0), Math.abs(c.phi1)) + 0.5);
      const N = 2000;
      let run = null;
      const runs = [];
      for (let i = 0; i <= N; i++) {
        const phi = -lim + (2 * lim * i) / N;
        if (inside(rad, phi)) { if (!run) run = [phi, phi]; else run[1] = phi; } else if (run) { runs.push(run); run = null; }
      }
      if (run) runs.push(run);
      for (const [p0, p1] of runs) {
        const m = Math.max(1, Math.ceil(((p1 - p0) * rad) / Math.max(1, cfg.cyl4RoughStep)));
        for (let j = 0; j <= m; j++) add(d, p0 + ((p1 - p0) * j) / m);
      }
    }
    // Schlichten über die ganze Fläche
    const m = Math.max(1, Math.ceil(((c.phi1 - c.phi0) * c.r) / Math.max(0.5, cfg.cyl4Step)));
    for (let j = 0; j <= m; j++) add(0, c.phi0 + ((c.phi1 - c.phi0) * j) / m);
    return { passes: passes, layers: K, dmax: dmax };
  }

  // Zeilenfräsen einer gewölbten Fläche (Bahnen je Netz und Einstellung zwischengespeichert)
  const surfCache = typeof WeakMap === 'function' ? new WeakMap() : null;
  function surfacePasses(mesh, c, R, T, cfg, cutouts) {
    const SP = typeof SurfacePath !== 'undefined' ? SurfacePath : require('./surface.js');
    // Durchbrüche: dort fehlt der Butzen im Netz – Kugelmitte nicht über der Öffnung (Abstand zum Rand > R)
    const holes = (cutouts || []).map((lp) => { const pts = []; for (const q of lp) for (const t of segPointsLocal(q)) pts.push(t); return pts; });
    const key = JSON.stringify([c.rects, c.depth, R, cfg.surfStepover, cfg.surfRes, cfg.surfLayer, cfg.surfTol, holes.length]);
    let m = surfCache && surfCache.get(mesh);
    if (!m) { m = new Map(); if (surfCache) surfCache.set(mesh, m); }
    if (!m.has(key)) {
      m.set(key, SP.compute(mesh, { rects: c.rects, zmin: T - c.depth, holes: holes },
        { R: R, stepover: cfg.surfStepover, res: cfg.surfRes, top: T, layer: cfg.surfLayer, tol: cfg.surfTol }));
    }
    return m.get(key);
  }

  // Punkte eines Segments (Bogen fein abgetastet)
  function segPointsLocal(s) {
    if (s.type !== 'arc') return [s.a];
    const a0 = Math.atan2(s.a[1] - s.c[1], s.a[0] - s.c[0]);
    let sw = Math.atan2(s.b[1] - s.c[1], s.b[0] - s.c[0]) - a0;
    if (s.full) sw = s.ccw ? Math.PI * 2 : -Math.PI * 2;
    else if (s.ccw) { while (sw <= 0) sw += Math.PI * 2; } else { while (sw >= 0) sw -= Math.PI * 2; }
    const n = Math.max(2, Math.ceil(Math.abs(sw) / (Math.PI / 36)));
    const out = [];
    for (let i = 0; i < n; i++) out.push([s.c[0] + s.r * Math.cos(a0 + (sw * i) / n), s.c[1] + s.r * Math.sin(a0 + (sw * i) / n)]);
    return out;
  }

  function toPolySeg(s) {
    return s.type === 'arc'
      ? { type: 'arc', to: s.b, c: s.c, cw: !s.ccw }
      : { type: 'line', to: s.b };
  }

  /*
   * Oszillation: Tiefe pendelt als Dreieck zwischen dMin und dMax entlang der Polylinie (start, segs)
   * (Weg je Schwingung ≈ wave, auf ganze Schwingungen je Umlauf angepasst; phase 0 = Beginn oben bei dMin, 0.5 = Beginn unten).
   * Die Elemente bleiben ganz (Geometrie wie ohne Oszillation – zerteilte Elemente brachen in Maestro die Werkzeugkorrektur):
   * Tiefe am Elementende → depth (SetAttribute("DEPTH")), Wendepunkte im Element → marks [{u, depth}] (u = Lage 0–1,
   * SetParametricAttribute); dazwischen linear. In Maestro bestätigt.
   */
  function oscillate(start, segs, dMin, dMax, wave, phase) {
    // ganze Zahl Schwingungen je Umlauf: Ende auf derselben Tiefe wie der Anfang (kein Absatz an der Naht)
    let total = 0;
    let p0 = start;
    for (const q of segs) {
      if (q.type === 'arc') {
        const r = Math.hypot(p0[0] - q.c[0], p0[1] - q.c[1]);
        let sw = Math.atan2(q.to[1] - q.c[1], q.to[0] - q.c[0]) - Math.atan2(p0[1] - q.c[1], p0[0] - q.c[0]);
        if (q.cw) { while (sw >= -1e-12) sw -= Math.PI * 2; } else { while (sw <= 1e-12) sw += Math.PI * 2; }
        total += Math.abs(sw) * r;
      } else total += Math.hypot(q.to[0] - p0[0], q.to[1] - p0[1]);
      p0 = q.to;
    }
    const w0 = wave > 1 ? wave : 300;
    const w = total / Math.max(1, Math.round(total / w0));
    const depthAt = (s) => {
      const u = s / w + (phase || 0);
      const v = u - Math.floor(u);
      return dMin + (dMax - dMin) * (v < 0.5 ? 2 * v : 2 - 2 * v);
    };
    const half = w / 2;
    const out = [];
    let pos = 0;
    let prev = start;
    for (const q of segs) {
      let len;
      let at;
      if (q.type === 'arc') {
        const r = Math.hypot(prev[0] - q.c[0], prev[1] - q.c[1]);
        const a0 = Math.atan2(prev[1] - q.c[1], prev[0] - q.c[0]);
        let sw = Math.atan2(q.to[1] - q.c[1], q.to[0] - q.c[0]) - a0;
        if (q.cw) { while (sw >= -1e-12) sw -= Math.PI * 2; } else { while (sw <= 1e-12) sw += Math.PI * 2; }
        len = Math.abs(sw) * r;
      } else len = Math.hypot(q.to[0] - prev[0], q.to[1] - prev[1]);
      // Wendepunkte (alle halbe Schwingung, je nach Phase verschoben) innerhalb des Elements
      const off = ((phase || 0) * w) % half;
      let k = Math.floor((pos + off) / half + 1e-9) + 1;
      const marks = [];
      for (;;) {
        const sTurn = k * half - off;
        if (sTurn >= pos + len - 0.5) break; // kein Stummel < 0,5 mm vor dem Elementende
        if (sTurn > pos + 0.5) marks.push({ u: (sTurn - pos) / len, depth: depthAt(sTurn) });
        k++;
      }
      pos += len;
      out.push(Object.assign({}, q, marks.length ? { depth: depthAt(pos), marks: marks } : { depth: depthAt(pos) }));
      prev = q.to;
    }
    return { d0: depthAt(0), segs: out };
  }

  // Geschlossene Kontur als Polylinie, Start in der Mitte der längsten Geraden (wie im Beispiel)
  function wholeContour(loop) {
    let k = -1;
    let best = -1;
    loop.forEach((q, i) => {
      if (q.type !== 'line') return;
      const l = Math.hypot(q.b[0] - q.a[0], q.b[1] - q.a[1]);
      if (l > best) { best = l; k = i; }
    });
    if (k < 0) {
      if (loop.length === 1 && loop[0].full) {
        const q = loop[0];
        const opp = [2 * q.c[0] - q.a[0], 2 * q.c[1] - q.a[1]];
        return { start: q.a, segs: [{ type: 'arc', to: opp, c: q.c, cw: !q.ccw }, { type: 'arc', to: q.a, c: q.c, cw: !q.ccw }] };
      }
      return { start: loop[0].a, segs: loop.map(toPolySeg) };
    }
    const q = loop[k];
    const mid = [(q.a[0] + q.b[0]) / 2, (q.a[1] + q.b[1]) / 2];
    const segs = [{ type: 'line', to: q.b }];
    for (let j = 1; j < loop.length; j++) segs.push(toPolySeg(loop[(k + j) % loop.length]));
    segs.push({ type: 'line', to: mid });
    return { start: mid, segs: segs };
  }

  // Liegt ein Liniensegment auf einer Seite des Rechtecks L×B?
  function onRectSide(s, L, W) {
    if (s.type !== 'line') return null;
    const t = 0.01;
    const same = (i, v) => Math.abs(s.a[i] - v) < t && Math.abs(s.b[i] - v) < t;
    if (same(1, 0)) return [1, 0];
    if (same(0, L)) return [0, 1];
    if (same(1, W)) return [-1, 0];
    if (same(0, 0)) return [0, -1];
    return null;
  }

  // Offene Fräsbahnen für alle Abschnitte der Außenkontur, die nicht auf dem Rechteck liegen.
  // Fahrtrichtung im Uhrzeigersinn, Abfall links (Korrektur 1) – wie Milling_2 im Beispiel.
  function notchPaths(p, cfg) {
    if (p.outlineIsRect) return [];
    const segs = p.outline;
    const isB = segs.map((s) => !!onRectSide(s, p.L, p.W) || !!s.inclined);
    if (!isB.some(Boolean)) {
      // Keine einzige Kante auf dem Rechteck: komplette Kontur im Uhrzeigersinn fräsen
      const rev = segs.slice().reverse().map(revSeg);
      return [{ start: rev[0].a, segs: rev.map(toPolySeg) }];
    }
    const n = segs.length;
    const k0 = isB.indexOf(true);
    const paths = [];
    let i = 1;
    while (i <= n) {
      const idx = (k0 + i) % n;
      if (isB[idx]) { i++; continue; }
      const chain = [];
      while (i <= n && !isB[(k0 + i) % n]) { chain.push(segs[(k0 + i) % n]); i++; }
      const prev = segs[(k0 + (i - chain.length) - 1 + n) % n];
      const next = segs[(k0 + i) % n];
      const A = chain[0].a;
      const B = chain[chain.length - 1].b;
      const uPrev = lineDir(prev);
      const uNext = lineDir(next);
      const ll = cfg.leadLength;
      const start = [B[0] + uNext[0] * ll, B[1] + uNext[1] * ll];
      const out = [{ type: 'line', to: B }];
      for (const s of chain.slice().reverse()) out.push(toPolySeg(revSeg(s)));
      out.push({ type: 'line', to: [A[0] - uPrev[0] * ll, A[1] - uPrev[1] * ll] });
      paths.push({ start: start, segs: out });
    }
    return paths;
  }

  function lineDir(s) {
    const d = [s.b[0] - s.a[0], s.b[1] - s.a[1]];
    const l = Math.hypot(d[0], d[1]) || 1;
    return [d[0] / l, d[1] / l];
  }

  function revSeg(s) {
    return s.type === 'arc'
      ? { type: 'arc', a: s.b, b: s.a, c: s.c, r: s.r, ccw: !s.ccw, full: s.full }
      : { type: 'line', a: s.b, b: s.a };
  }

  // ---------------------------------------------------------------- Ausgabe

  // Tasche mit kreisrunder Außenkontur (Kreistasche aus Bohrung oder runder Taschenboden)
  function isRoundPocket(op) {
    return op.kind === 'pocket' && op.segs.length === 1 && op.segs[0].type === 'arc' && !!op.segs[0].full;
  }

  function writePoly(L, name, segs) {
    if (segs.length === 1 && segs[0].type === 'arc' && segs[0].full) {
      const q = segs[0];
      L.push('CreateCircleCenterRadius("' + name + '", ' + pt(q.c) + ', ' + fmt(q.r) + ', ' + (q.ccw ? 'false' : 'true') + ');');
      return;
    }
    L.push('CreatePolyline("' + name + '", ' + pt(segs[0].a) + ');');
    for (const q of segs) {
      if (q.type === 'line') L.push('AddSegmentToPolyline(' + pt(q.b) + ');');
      else L.push('AddArc2PointCenterToPolyline(' + pt(q.b) + ', ' + pt(q.c) + ', ' + (q.ccw ? 'false' : 'true') + ');');
    }
  }

  function write(p, cfgIn, override) {
    const cfg = Object.assign({}, DEFAULTS, cfgIn || {});
    if (override && override.tools) cfg.toolOverrides = override.tools;
    if (override && override.steps) cfg.stepOverrides = override.steps;
    if (override && override.order) cfg.order = override.order;
    if (override && override.depths) cfg.depthOverrides = override.depths;
    if (override && override.tech) cfg.techOverrides = override.tech; // je Bearbeitung: Vorschub, Drehzahl, Eintauchen
    if (override && typeof override.twoStep === 'boolean') cfg.formatTwoStep = override.twoStep; // je Teil: normal / zweistufig
    const cv = override && override.curved; // je Teil: gekrümmte Flächen bearbeiten
    if (cv && typeof cv.slant === 'boolean') cfg.curvedSlantOn = cv.slant;
    if (cv && typeof cv.surface === 'boolean') cfg.curvedSurfaceOn = cv.surface;
    if (cv && typeof cv.surface === 'string') { cfg.curvedSurfaceOn = true; cfg.curvedSurfaceMode = cv.surface; } // 'ball' / 'flat4'
    if (override && override.mesh) cfg.mesh = override.mesh;
    if (override && override.suppress) cfg.suppress = override.suppress;
    if (override && override.avoid) cfg.avoid = override.avoid; // Saugerverbot: offene Stellen der Auflagefläche
    if (override && override.twoSided) cfg.twoSided = true;
    const pFull = p; // ganze Platte (Durchbrüche, Durchgangsbohrungen) für Sauger und Werkstück
    if (override && override.side === 2) {
      // Seite 2 (um Y gewendet): nur was von Seite 1 nicht ging – alles Durchgehende, Kanten und Konturen sind schon fertig
      cfg.side = 2;
      p = Object.assign({}, p, {
        cutouts: [], drills: p.drills.filter((d) => d.face === 'Top' && !d.through), sidePockets: [], chamfers: [], chamferPaths: [],
        // Schrägen mit Zapfen, die auf Seite 1 nach unten zeigten, zeigen jetzt nach oben; Clamex nur in der Fläche
        slantWalls: (p.slantWalls || []).filter((w) => w.boss && w.boss.plane.n[2] > 0),
        clamex: (p.clamex || []).filter((g) => g.n[2] > 0.5),
        slantDrills: p.slantDrills.filter((sd) => !sd.through), curvedSlants: [], edgeRounds: [],
        warnings: [], bottom: [],
      });
    }
    const { ops, warnings, groups, defaultGroups, suppressed } = plan(p, cfg);
    const field = (override && override.field) || autoField(p, cfg);
    const L = [];
    const blank = () => L.push('');
    L.push('SetMachiningParameters("' + field + '", 1, 10, 196608, false);'); blank();
    // Programmkopf: Kommentar/Beschreibung (nur ASCII, ohne Anführungszeichen), Optimierung, Tisch einrichten
    const ascii = (t) => String(t).replace(/[äöüÄÖÜß]/g, (c) => ({ 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'Ä': 'Ae', 'Ö': 'Oe', 'Ü': 'Ue', 'ß': 'ss' }[c]))
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '').replace(/["\\]/g, '');
    if (cfg.commentOn) {
      L.push('SetComment("' + ascii('STEP2XCS: ' + (p.name || 'Teil') + (cfg.profileName ? ' - ' + (/^profil\b/i.test(cfg.profileName) ? '' : 'Profil ') + cfg.profileName : '')) + '");');
      L.push('SetDescription("' + ascii(fmt(p.L) + ' x ' + fmt(p.W) + ' x ' + fmt(p.T) + ' mm, ' + ops.length + ' Bearbeitungen') + '");');
    }
    if (cfg.optimizeOn) L.push('SetOptimization(true);');
    if (cfg.autoSetupOn) L.push('SetAutoSetup(true);');
    if (cfg.commentOn || cfg.optimizeOn || cfg.autoSetupOn) blank();
    // Werkstück: Quader oder echte Außenkontur (nur wenn die Kontur vom Rechteck abweicht)
    if (cfg.workpieceShape === 'contour' && !p.outlineIsRect && p.outline && p.outline.length) {
      writePoly(L, 'Workpiece_Contour', p.outline);
      L.push('CreateFinishedWorkpieceFromExtrusion("Workpiece", ' + fmt(p.T) + ');'); blank();
    } else {
      L.push('CreateFinishedWorkpieceBox("Workpiece", ' + fmt(p.L) + ', ' + fmt(p.W) + ', ' + fmt(p.T) + ');'); blank();
    }
    const o = fmt(cfg.side === 2 ? 0 : cfg.rawOversize); // Seite 2: Teil liegt formatiert an den Anschlägen
    L.push('CreateRawWorkpiece("Workpiece", ' + [o, o, o, o].join(', ') + ', 0, 0);'); blank();
    L.push('SetWorkpieceSetupPosition(' + o + ', ' + o + ', 0, 0);'); blank();
    // Sauger-Vorschlag: Konsolen und Drehsauger (Koordinaten zum Werkstück-Nullpunkt)
    const suction = cfg.suctionOn ? planSuction(pFull, cfg) : { bars: [], warnings: [] };
    warnings.push(...suction.warnings);
    if (suction.bars.length) {
      suction.bars.forEach((b, i) => {
        L.push('SetBarPosition(' + (i + 1) + ', ' + fmt(b.x) + ');');
        b.cups.forEach((c, j) => L.push('SetSuctionCupPosition(' + (j + 1) + ', ' + fmt(c.y) + ', ' + fmt(c.angle) + ', "' + c.code + '");'));
      });
      blank();
    }

    let nSlot = 0;
    let nSeg = 0;
    const nDrill = { V: 0, H: 0 };
    const counts = { chamfer: 0, slant: 0, sdrill: 0, blade: 0, pdrill: 0, surface: 0, cyl4: 0, clamex: 0 };
    let plane = 'Top';
    const madePlanes = new Set();
    let multiStep = false;
    // Schnittwerte je Bearbeitung (Gruppe): gesetzt → Zahl, sonst -1 = Wert aus der Werkzeugdatei.
    // Reihenfolge in Maestro: inputSpeed (Eintauchen, m/min), rotSpeed (U/min), speed (Vorschub, m/min)
    const techOf = (op) => (cfg.techOverrides && cfg.techOverrides[op.group]) || {};
    const tv = (x, q) => (x > 0 ? fmt(x) : q ? '"-1"' : '-1');
    const S3 = (op, q) => { const t = techOf(op); return tv(t.descent, q) + ', ' + tv(t.rot, q) + ', ' + tv(t.feed, q); };
    const SD = (op) => { const t = techOf(op); return tv(t.rot) + ', ' + tv(t.feed); }; // Bohren: rotSpeed, boringSpeed
    for (const op of ops) {
      // Fräsungen und schräge Bohrungen beziehen sich auf die Oberseite, Kantentaschen auf ihre Kante,
      // Bearbeitungen auf schrägen Ebenen auf eine eigene Ebene (einmal angelegt)
      if (op.plane && !madePlanes.has(op.plane.name)) {
        const q = op.plane;
        if (plane !== 'Top') { L.push('SelectWorkplane("Top");'); blank(); plane = 'Top'; }
        L.push('CreateWorkplane("' + q.name + '", ' + fmt(q.o[0]) + ', ' + fmt(q.o[1]) + ', ' + fmt(q.o[2]) + ', ' + fmt(q.zRot) + ', ' + fmt(q.xRot) + ');');
        blank();
        madePlanes.add(q.name);
      }
      if (op.kind !== 'drill' || op.plane) {
        const want = op.plane ? op.plane.name : ((op.kind === 'pocket' || op.kind === 'clamex') && op.face) || 'Top';
        if (plane !== want) {
          L.push('SelectWorkplane("' + want + '");');
          blank();
          plane = want;
        }
      }
      if (op.kind === 'contour') {
        // Haltestege in der Mitte der längsten Elemente (Attribut gilt für das zuletzt angefügte Element)
        const tabAt = new Set();
        if (op.tabs) {
          let prev = op.start;
          const lens = op.segs.map((q, i) => {
            let l;
            if (q.type === 'arc') {
              const r = Math.hypot(prev[0] - q.c[0], prev[1] - q.c[1]);
              let sw = Math.atan2(q.to[1] - q.c[1], q.to[0] - q.c[0]) - Math.atan2(prev[1] - q.c[1], prev[0] - q.c[0]);
              if (q.cw) { while (sw >= 0) sw -= Math.PI * 2; } else { while (sw <= 0) sw += Math.PI * 2; }
              l = Math.abs(sw) * r;
            } else l = Math.hypot(q.to[0] - prev[0], q.to[1] - prev[1]);
            prev = q.to;
            return { i: i, l: l };
          });
          lens.sort((a, b) => b.l - a.l).slice(0, Math.max(1, cfg.tabsCount)).forEach((x) => tabAt.add(x.i));
        }
        // oszillierend: je Umlauf eigene Kontur (weitere Umläufe um eine halbe Schwingung versetzt), Tiefe je Punkt als DEPTH-Attribut
        const passes = op.osc ? op.passes || 1 : 1;
        for (let pi = 0; pi < passes; pi++) {
          const suffix = pi ? '_' + (pi + 1) : '';
          const o = op.osc ? oscillate(op.start, op.segs, op.osc.min, op.osc.max, cfg.oscWave, pi * 0.5) : null;
          const depth = o ? o.d0 : op.depth;
          L.push('CreatePolyline("Contour_' + op.contour + suffix + '", ' + pt(op.start) + ');');
          (o ? o.segs : op.segs).forEach((s, i) => {
            const attrs = [];
            for (const m of s.marks || []) attrs.push('SetParametricAttribute("DEPTH", ' + fmt(m.depth) + ', ' + fmt(Math.round(m.u * 1e4) / 1e4) + ');');
            if (s.depth !== undefined) attrs.push('SetAttribute("DEPTH", ' + fmt(s.depth) + ');');
            if (!o && tabAt.has(i)) attrs.push('SetParametricAttribute2("TAB", ' + fmt(cfg.tabLength) + ', ' + fmt(cfg.tabHeight) + ', 0.5);');
            if (cfg.attrPlacement === 'before') L.push(...attrs);
            if (s.type === 'line') L.push('AddSegmentToPolyline(' + pt(s.to) + ');');
            else L.push('AddArc2PointCenterToPolyline(' + pt(s.to) + ', ' + pt(s.c) + ', ' + (s.cw ? 'true' : 'false') + ');');
            if (cfg.attrPlacement !== 'before') L.push(...attrs);
          });
          blank();
          // An- und Abfahrt im Bogen (Schleifwalze immer; Bogen = Faktor × Werkzeugradius)
          const lead = () => {
            L.push('ResetApproachStrategy();');
            L.push('ResetRetractStrategy();');
            if (op.approach) {
              const f = op.sand ? fmt(cfg.sandLead > 0 ? cfg.sandLead : 1) : '2';
              L.push('SetApproachStrategy(false, true, ' + f + ');');
              L.push('SetRetractStrategy(false, true, ' + f + ', ' + fmt(op.sand ? cfg.sandOverlap : cfg.retractOverlap) + ');');
            }
            L.push('SetPneumaticHoodPosition(1);');
          };
          lead();
          if (op.rough && pi === 0) {
            // Vorfräsen: Werkzeug 1 mit Aufmaß (overMaterial), gleiche Geometrie
            if (op.step) L.push('CreateUnidirectionalMillingStrategy(true, ' + fmt(op.step) + ', ' + fmt(cfg.finishDepth) + ', 1, false);');
            L.push('CreateRoughFinish("Milling_' + op.milling + '_Vor", ' + fmt(depth) + ', "", TypeOfProcess.GeneralRouting, "' +
              op.rough.tool + '", "-1", ' + op.side + ', "-1", "-1", "-1", ' + fmt(op.rough.allowance) + ');');
            blank();
            lead();
          }
          if (op.helix) {
            // spiralförmig eintauchen: Zustellung je Umlauf, letzte Zustellung (Form wie im Handbuch-Beispiel)
            const hs = op.step || cfg.helixStep;
            L.push('CreateHelicMillingStrategy(' + fmt(hs) + ', ' + fmt(cfg.finishDepth) + ', ' + (cfg.finishDepth > 0 ? 'true' : 'false') + ');');
          } else if (op.step) L.push('CreateUnidirectionalMillingStrategy(true, ' + fmt(op.step) + ', ' + fmt(cfg.finishDepth) + ', 1, false);');
          L.push('CreateRoughFinish("Milling_' + op.milling + suffix + '", ' + fmt(depth) + ', "", TypeOfProcess.GeneralRouting, "' +
            op.tool + '", "-1", ' + op.side + ', ' + S3(op, true) + (op.finishAllowance > 0 ? ', ' + fmt(op.finishAllowance) : '') + ');');
          blank();
        }
      } else if (op.kind === 'clamex' && op.macro) {
        // SCM-Makro SawCut_Lamello mit der Parameterliste aus der Werkstatt, nur Lage/Winkel/Richtung eingesetzt
        const n = ++counts.clamex;
        const m = op.macro;
        const vals = { sx: fmt(m.x), sy: fmt(m.y), ex: fmt(m.x), ey: fmt(m.y), angle: fmt(m.angle), angleZ: fmt(m.angleZ), T: fmt(p.T), h: fmt(m.height) };
        const args = String(cfg.clamexTemplate || DEFAULTS.clamexTemplate).replace(/\{(\w+)\}/g, (all, k) => (vals[k] !== undefined ? vals[k] : all));
        L.push('CreateMacro("SawCut_Lamello_' + n + '", "' + String(cfg.clamexMacro || 'SawCut_Lamello').replace(/"/g, '') + '", ' + args + ');');
        blank();
      } else if (op.kind === 'clamex') {
        // hinein bis zur Scheibenmitte und auf demselben Weg zurück (nicht abheben: sonst schneidet die Scheibe nach oben heraus)
        const n = ++counts.clamex;
        L.push('CreatePolyline("ClamexPath_' + n + '", ' + pt(op.start) + ');');
        L.push('AddSegmentToPolyline(' + pt(op.end) + ');');
        L.push('AddSegmentToPolyline(' + pt(op.start) + ');');
        L.push('ResetApproachStrategy();');
        L.push('ResetRetractStrategy();');
        L.push('CreateRoughFinish("Clamex_' + n + '", ' + fmt(op.depth) + ', "", TypeOfProcess.GeneralRouting, "' + op.tool + '", "-1", 0, ' + S3(op, true) + ');');
        blank();
      } else if (op.kind === 'pocket') {
        const names = op.islands.map((isl, j) => 'Island_' + op.pocket + '_' + (j + 1));
        op.islands.forEach((isl, j) => writePoly(L, names[j], isl));
        // Runde Taschen: Kreis im Uhrzeigersinn anlegen
        writePoly(L, 'Pocket_' + op.pocket, isRoundPocket(op) ? [Object.assign({}, op.segs[0], { ccw: false })] : op.segs);
        blank();
        L.push('ResetApproachStrategy();');
        L.push('ResetRetractStrategy();');
        L.push('SetPneumaticHoodPosition(1);');
        if (isRoundPocket(op)) {
          // Runde Taschen immer im Uhrzeigersinn ausräumen (Drehrichtung 0 = Uhrzeigersinn)
          L.push('CreateContourParallelStrategy(true, 0' + (op.step ? ', true, ' + fmt(op.step) + ', ' + fmt(cfg.finishDepth) : '') + ');');
        } else if (op.step) {
          L.push('CreateContourParallelStrategy(true, 1, true, ' + fmt(op.step) + ', ' + fmt(cfg.finishDepth) + ');');
        }
        L.push('CreateContourPocket("Pocketing_' + op.pocket + '", ' + fmt(op.depth) + ', "", TypeOfProcess.ConcentricalPocket, "' +
          op.tool + '", "-1", ' + S3(op) + ', ' + fmt(cfg.pocketOverlap) + ', false' + names.map((n) => ', "' + n + '"').join('') + ');');
        blank();
      } else if (op.kind === 'chamfer') {
        const n = ++counts.chamfer;
        if (op.segs) {
          L.push('CreatePolyline("ChamferPath_' + n + '", ' + pt(op.start) + ');');
          for (const q of op.segs) {
            if (q.type === 'line') L.push('AddSegmentToPolyline(' + pt(q.to) + ');');
            else L.push('AddArc2PointCenterToPolyline(' + pt(q.to) + ', ' + pt(q.c) + ', ' + (q.cw ? 'true' : 'false') + ');');
          }
        } else {
          L.push('CreateSegment("ChamferSegment_' + n + '", ' + pt(op.a) + ', ' + pt(op.b) + ');');
        }
        L.push('ResetApproachStrategy();');
        L.push('ResetRetractStrategy();');
        L.push('CreateChamfer("Chamfer_' + n + '", ' + fmt(op.width) + ', ' + fmt(op.height) + ', 0, ' + op.toolPos +
          ', "", TypeOfProcess.GeneralRouting, "' + op.tool + '", "-1", ' + S3(op) + ', 0);');
        blank();
      } else if (op.kind === 'slant') {
        // CreateSlantedRoughFinish fräst auf Werkzeugmitte: Bahn um r / cos(Neigung) zur Abfallseite versetzen,
        // damit die Werkzeugflanke auf der schrägen Fläche liegt
        const n = ++counts.slant;
        const ti = cfg.toolInfo && cfg.toolInfo[op.tool];
        const off = ti && ti.d ? (ti.d / 2) / Math.cos(op.angle * Math.PI / 180) : 0;
        if (!off) warnings.push(op.label + ': Durchmesser von ' + op.tool + ' unbekannt – Bahn liegt auf der Kante (Werkzeugmitte).');
        const sh = (q) => [q[0] + op.scrap[0] * off, q[1] + op.scrap[1] * off];
        L.push('CreateSegment("SlantSegment_' + n + '", ' + pt(sh(op.a)) + ', ' + pt(sh(op.b)) + ');');
        L.push('ResetApproachStrategy();');
        L.push('ResetRetractStrategy();');
        L.push('CreateSlantedRoughFinish("SlantedMilling_' + n + '", 0, ' + fmt(op.angle) + ', ' + op.approach + ', ' + fmt(op.depth) +
          ', "", TypeOfProcess.GeneralRouting, "' + op.tool + '", "-1", ' + S3(op) + ', 0);');
        blank();
      } else if (op.kind === 'slantpath') {
        // Schräge an Rundungen: Kontur (schon um r / cos(Neigung) versetzt), Werkzeug quer zur Bahn geneigt (5-Achs)
        const n = ++counts.slant;
        L.push('CreatePolyline("SlantPath_' + n + '", ' + pt(op.start) + ');');
        for (const q of op.segs) {
          if (q.type === 'line') L.push('AddSegmentToPolyline(' + pt(q.to) + ');');
          else L.push('AddArc2PointCenterToPolyline(' + pt(q.to) + ', ' + pt(q.c) + ', ' + (q.cw ? 'true' : 'false') + ');');
        }
        L.push('ResetApproachStrategy();');
        L.push('ResetRetractStrategy();');
        L.push('CreateSlantedRoughFinish("SlantedMilling_' + n + '", 0, ' + fmt(op.angle) + ', ' + op.approach + ', ' + fmt(op.depth) +
          ', "", TypeOfProcess.GeneralRouting, "' + op.tool + '", "-1", ' + S3(op) + ', 0);');
        blank();
      } else if (op.kind === 'cyl4') {
        // je Zeile: Ebene tangential an die Fläche (Ursprung = Startpunkt der Zeile), darauf eine Gerade, Fräser senkrecht
        // zur Ebene mit der Stirn auf der Ebene (Tiefe 0, Werkzeugmitte). Danach wieder auf die Oberseite.
        const n = ++counts.cyl4;
        op.passes.forEach((q, k) => {
          const nm = 'Abzeilen_' + n + '_' + String(k + 1).padStart(2, '0');
          const nv = q.n;
          const b = Math.acos(Math.max(-1, Math.min(1, nv[2])));
          let ang = Math.atan2(nv[0], -nv[1]);
          if (b < 1e-9) ang = Math.atan2(q.b[1] - q.a[1], q.b[0] - q.a[0]); // waagerecht: X längs der Zeile
          const X = [Math.cos(ang), Math.sin(ang), 0];
          const Y = [nv[1] * X[2] - nv[2] * X[1], nv[2] * X[0] - nv[0] * X[2], nv[0] * X[1] - nv[1] * X[0]];
          const e = [q.b[0] - q.a[0], q.b[1] - q.a[1], q.b[2] - q.a[2]];
          const lx = e[0] * X[0] + e[1] * X[1] + e[2] * X[2];
          const ly = e[0] * Y[0] + e[1] * Y[1] + e[2] * Y[2];
          if (plane !== 'Top') L.push('SelectWorkplane("Top");');
          L.push('CreateWorkplane("' + nm + '", ' + fmt(q.a[0]) + ', ' + fmt(q.a[1]) + ', ' + fmt(q.a[2]) + ', ' + fmt(ang * 180 / Math.PI) + ', ' + fmt(b * 180 / Math.PI) + ');');
          L.push('SelectWorkplane("' + nm + '");');
          plane = nm;
          L.push('CreateSegment("' + nm + '_Linie", 0, 0, ' + fmt(lx) + ', ' + fmt(ly) + ');');
          L.push('ResetApproachStrategy();');
          L.push('ResetRetractStrategy();');
          L.push('CreateRoughFinish("' + nm + '_Fraesen", 0, "", TypeOfProcess.GeneralRouting, "' + op.tool + '", "-1", 0, ' + S3(op, true) + ');');
          blank();
        });
      } else if (op.kind === 'surface') {
        // Gewölbte Fläche: Bereich als Geometrie, Fräsung ohne Strategie, dazu die berechnete Bahn (explizite Werkzeugbahn,
        // Z relativ zur Oberseite, Werkzeugspitze). Zwischen den Zeilen über die Oberseite abheben.
        if (!op.passes.length) continue;
        const n = ++counts.surface;
        L.push('CreatePolyline("Surface_Area_' + n + '", ' + fmt(op.x0) + ', ' + fmt(op.y0) + ');');
        L.push('AddSegmentToPolyline(' + fmt(op.x1) + ', ' + fmt(op.y0) + ');');
        L.push('AddSegmentToPolyline(' + fmt(op.x1) + ', ' + fmt(op.y1) + ');');
        L.push('AddSegmentToPolyline(' + fmt(op.x0) + ', ' + fmt(op.y1) + ');');
        L.push('AddSegmentToPolyline(' + fmt(op.x0) + ', ' + fmt(op.y0) + ');');
        L.push('ResetApproachStrategy();');
        L.push('ResetRetractStrategy();');
        L.push('CreateRoughFinish("Surface_' + n + '", ' + fmt(op.depth) + ', "", TypeOfProcess.GeneralRouting, "' + op.tool + '", "-1", 0, ' + S3(op, true) + ');');
        const z = (v) => fmt(v - p.T);
        const up = fmt(op.safe);
        const first = op.passes[0][0];
        L.push('CreateToolpath("Surface_Path_' + n + '", ' + pt(first) + ', ' + up + ');');
        op.passes.forEach((ps, k) => {
          if (k) L.push('AddSegmentToToolpath(' + pt(ps[0]) + ', ' + up + ');');
          for (const q of ps) L.push('AddSegmentToToolpath(' + pt(q) + ', ' + z(q[2]) + ');');
          L.push('AddSegmentToToolpath(' + pt(ps[ps.length - 1]) + ', ' + up + ');');
        });
        blank();
      } else if (op.kind === 'blade') {
        // Sägeschnitt über die ganze Dicke, geneigt. Material links der Schnittrichtung, Säge rechts (Korrektur 2).
        // Winkel zur Senkrechten: 90 = senkrecht; < 90 Platte unten breiter (Schräge zeigt nach oben)
        const n = ++counts.blade;
        const ang = op.leanOut ? 90 - op.tilt : 90 + op.tilt;
        L.push('CreateSegment("Saegeschnitt_Linie_' + n + '", ' + pt(op.a) + ', ' + pt(op.b) + ');');
        L.push('ResetApproachStrategy();');
        L.push('ResetRetractStrategy();');
        // Vorritzen: erster Schnitt in Ritztiefe, Rückweg auf volle Tiefe
        if (op.score) L.push('CreateSectioningMillingStrategy(' + fmt(op.score.depth) + ', ' + fmt(op.score.out) + ', 0);');
        L.push('CreateBladeCut("Saegeschnitt_' + n + '", "Saegeschnitt ' + fmt(op.tilt) + ' Grad", TypeOfProcess.GeneralRouting, "' + op.tool + '", "-1", ' + fmt(ang) +
          ', 2, ' + S3(op) + ', 0, true, true, 0, ' + fmt(op.extra) + ');');
        blank();
      } else if (op.kind === 'sdrill') {
        const e = op.entry;
        L.push('CreateSlantedDrill("Drill_Slanted_' + (++counts.sdrill) + '", ' + fmt(e[0]) + ', ' + fmt(e[1]) + ', ' + fmt(e[2]) + ', ' +
          fmt(op.angleA) + ', ' + fmt(op.angleB) + ', ' + fmt(op.depth) + ', ' + fmt(op.d) +
          ', "", TypeOfProcess.Drilling, "-1", "-1", 1, ' + SD(op) + ', "' + op.tip + '");');
        blank();
      } else if (op.kind === 'slot') {
        L.push('CreateSegment("SlotSegment_' + (++nSeg) + '", ' + pt(op.a) + ', ' + pt(op.b) + ');');
        L.push('SetMachiningDirection(true);');
        L.push('CreateSlot("Slot_' + (++nSlot) + '", ' + fmt(op.depth) + ', "", TypeOfProcess.GeneralRouting, "' + op.tool + '", "-1", 1,' + S3(op).replace(/, /g, ',') + ',0);'); // Schreibweise wie im bestätigten Beispiel
        blank();
        if (op.single) continue; // Nut so breit wie das Blatt: ein Schnitt genügt
        L.push('SetMachiningDirection(false);');
        L.push('CreateSlot("Slot_' + (++nSlot) + '", ' + fmt(op.depth) + ', "", TypeOfProcess.GeneralRouting, "' + op.tool + '", "-1", 2,' + S3(op).replace(/, /g, ',') + ',' + fmt(-op.width) + ');');
        blank();
      } else if (op.kind === 'drill') {
        if (op.face !== plane) {
          L.push('SelectWorkplane("' + op.face + '");');
          blank();
          plane = op.face;
        }
        const pat = op.pattern;
        const d = op.d;
        const usePat = pat.nX > 1 || pat.nY > 1;
        if (usePat) L.push('CreatePattern(' + pat.nY + ', ' + pat.nX + ', ' + fmt(pat.dY) + ', ' + fmt(pat.dX) + ', 0, 90);');
        // tiefe Bohrung in Stufen mit Rückzug zum Spanen (isStepDepth, Anzahl, Tiefe je Stufe, Rückzug auf Sicherheitshöhe)
        const nStep = cfg.drillStep > 0 ? Math.ceil(d.depth / cfg.drillStep - 1e-9) : 1;
        if (cfg.drillStepFrom > 0 && d.depth > cfg.drillStepFrom + 1e-9 && nStep >= 2) { // eine Stufe = normal bohren
          const n = nStep;
          L.push('CreateMultiStepDrillingStrategy(true, ' + n + ', ' + fmt(d.depth / n) + ', true);');
          multiStep = true;
        } else if (multiStep) {
          // falls die Stufen-Strategie weiter gilt: für flache Bohrungen zurück auf einen Durchgang
          L.push('CreateSingleStepDrillingStrategy();');
          multiStep = false;
        }
        if (op.plane) {
          L.push('CreateDrill ("Drill_Slanted_Plane_' + (++counts.pdrill) + '", ' + fmt(d.x) + ', ' + fmt(d.y) + ', ' + fmt(d.depth) + ', ' +
            fmt(d.d) + ', "", TypeOfProcess.Drilling, "-1", "-1", 1, ' + SD(op) + ', "' + d.tip + '");');
        } else if (op.face === 'Top') {
          L.push('CreateDrill ("Drill_Vertical_' + (++nDrill.V) + '", ' + fmt(d.x) + ', ' + fmt(d.y) + ', ' + fmt(d.depth) + ', ' +
            fmt(d.d) + ', "", TypeOfProcess.Drilling, "-1", "-1", 1, ' + SD(op) + ', "' + d.tip + '");');
        } else {
          L.push('CreateDrill ("Drill_Horizontal_' + (++nDrill.H) + '", ' + fmt(d.x) + ', ' + fmt(d.y) + ', ' + fmt(d.depth) + ', ' +
            fmt(d.d) + ', "", TypeOfProcess.Drilling' + (techOf(op).rot > 0 || techOf(op).feed > 0 ? ', "-1", "-1", 1, ' + SD(op) + ', "' + d.tip + '"' : '') + ');');
        }
        if (usePat) L.push('CreatePattern(1, 1, 0, 0, 0, 90);');
        blank();
      }
    }
    L.push('CreateNullOperation("XN", ' + fmt(p.L + cfg.parkOffset) + ', null, 1, 50, false, " ");');
    L.push('');
    return { text: L.join('\r\n'), ops: ops, warnings: warnings, field: field, groups: groups, defaultGroups: defaultGroups, suction: suction,
      suppressed: suppressed };
  }

  // Einstellungen, die ein Werkstück-Profil festlegen kann (Werkzeuge und Strategie je Material)
  const PROFILE_KEYS = [
    ['contourTool', 'Formatfräser (bzw. Nachfräser)', 'mill'],
    ['formatTwoStep', 'Formatfräsen zweistufig (vor- und nachfräsen)', 'bool'],
    ['formatRoughTool', 'Vorfräser (zweistufig)', 'mill'],
    ['formatAllowance', 'Aufmaß beim Vorfräsen', 'number', 'mm'],
    ['contourExtra', 'Formatfräsen: Dicke +', 'number', 'mm'],
    ['stepDown', 'Zustelltiefe je Durchgang', 'number', 'mm · 0 = ein Durchgang'],
    ['finishDepth', 'Letzte Zustellung', 'number', 'mm'],
    ['cutoutTool', 'Fräser Ausschnitte/Durchbrüche', 'mill'],
    ['pocketTool', 'Fräser Taschen', 'mill'],
    ['pocketStepDown', 'Zustelltiefe Taschen', 'number', 'mm'],
    ['rebateTool', 'Fräser Falz', 'mill'],
    ['chamferTool', 'Fräser Fasen', 'mill'],
    ['slantTool', 'Fräser schräge Kanten', 'mill'],
    ['tenonTool', 'Fräser Zapfen auf Schräge', 'mill'],
    ['roundTopTool', 'Radiusfräser oben', 'mill'],
    ['roundBottomTool', 'Radiusfräser unten', 'mill'],
    ['sawTool', 'Säge für Nuten', 'saw'],
    ['bladeTool', 'Säge für Sägeschnitte', 'saw'],
    ['ballTool', 'Kugelfräser', 'mill'],
    ['cyl4Tool', '4-Achs: Schaftfräser', 'mill'],
    ['oscMill', 'Formatfräsen oszillierend', 'bool'],
    ['oscMillMin', 'Oszillation Fräser: min. unter der Platte', 'number', 'mm'],
    ['oscMillMax', 'Oszillation Fräser: max. unter der Platte', 'number', 'mm'],
    ['sandOn', 'Schleifen mit der Schleifwalze', 'bool'],
    ['sandTool', 'Schleifwalze', 'sand'],
    ['sandMin', 'Schleifwalze: min. unter der Platte', 'number', 'mm'],
    ['sandMax', 'Schleifwalze: max. unter der Platte', 'number', 'mm'],
    ['sandAllowance', 'Schleifzugabe', 'number', 'mm'],
  ];

  // Einstellungen mit Profil i (0–4; null = ohne Profil): gesetzte Werte des Profils gehen vor
  function applyProfile(settings, i) {
    const cfg = Object.assign({}, DEFAULTS, settings || {});
    const pr = i === null || i === undefined ? null : (cfg.profiles || [])[i];
    if (!pr) return cfg;
    for (const [k] of PROFILE_KEYS) {
      const v = pr.values && pr.values[k];
      if (v !== undefined && v !== null && v !== '') cfg[k] = v;
    }
    cfg.profileName = pr.name || 'Profil ' + (i + 1);
    return cfg;
  }

  return { write: write, plan: plan, planSuction: planSuction, DEFAULTS: DEFAULTS, CATEGORIES: CATEGORIES, ruleSequence: ruleSequence,
    PROFILE_KEYS: PROFILE_KEYS, applyProfile: applyProfile };
});
