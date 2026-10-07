<?php
/*
 * Step2Maestro – Projektablage auf dem Server (Webspace oder Diskstation/Docker, PHP 8).
 *
 * Projekte sind die .s2m-Daten (STEP/DXF, Teile, Stückliste, Zuschnitt, Einstellungen), gzip-gepackt in daten/<id>.s2m.gz,
 * dazu die Liste daten/projekte.json (Name, Kunde, Notiz, Teile, Stück, Materialien, Zeiten). Gelöschte gehen in
 * daten/papierkorb/.
 *   GET  api.php?a=list                 → { ok, projekte: [...], offen, login, csrf? }
 *   GET  api.php?a=get&id=…             → die gepackte Projektdatei (application/gzip)
 *   POST a=save   id?, basis?, name, kunde, notiz, info (JSON), datei (gzip)   → { ok, projekt }
 *                 basis = „geaendert“ des Stands, auf dem die Änderung beruht: ist das Projekt inzwischen von einem anderen
 *                 Gerät gespeichert worden, kommt 409 (nichts überschrieben) – ohne basis wird nicht geprüft (erzwingen).
 *   POST a=meta   id, name, kunde, notiz  /  a=copy id, name  /  a=delete id
 * Zugriff: mit dem Passwort der Dekor-Verwaltung (gleiche Anmeldung, dekore/api.php a=login) – oder ohne Anmeldung, wenn
 * die Umgebungsvariable S2M_OFFEN=1 gesetzt ist bzw. die Datei OFFEN neben api.php liegt (Server nur im eigenen Netz, z. B.
 * Diskstation). Schreibende Aufrufe brauchen immer den Kopf X-CSRF (aus list).
 */
declare(strict_types=1);
ini_set('display_errors', '0');

const MAX_BYTES = 80 * 1024 * 1024; // größte (gepackte) Projektdatei

$base = __DIR__;
$dataDir = $base . '/daten';
$trashDir = $dataDir . '/papierkorb';
$dbFile = $dataDir . '/projekte.json';
$lockFile = $dataDir . '/.sperre';
$pwFile = dirname($base) . '/dekore/daten/passwort.php'; // ein Passwort für Dekore und Projekte

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function out(array $data, int $code = 200): void {
  http_response_code($code);
  echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}
function fail(string $msg, int $code = 400, array $extra = []): void { out(['ok' => false, 'fehler' => $msg] + $extra, $code); }
function post(string $k): string { $v = $_POST[$k] ?? ''; return is_string($v) ? $v : ''; }
function clean(string $s, int $max = 120): string {
  $s = trim(preg_replace('/[\x00-\x1f\x7f]+/u', ' ', $s) ?? '');
  return mb_substr($s, 0, $max);
}
function idOk(string $id): string { return preg_match('/^[a-z0-9]{8,40}$/', $id) ? $id : ''; }
function newId(): string { return date('Ymd') . bin2hex(random_bytes(6)); }

function ensureDirs(): void {
  global $dataDir, $trashDir;
  foreach ([$dataDir, $trashDir] as $d) if (!is_dir($d) && !@mkdir($d, 0755, true)) fail('Ordner ' . basename($d) . ' kann nicht angelegt werden (Schreibrechte prüfen).', 500);
  $ht = $dataDir . '/.htaccess';
  if (!is_file($ht)) @file_put_contents($ht, "<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n  Order allow,deny\n  Deny from all\n</IfModule>\n");
}
$lockHandle = null;
function lockDb(): void {
  global $lockFile, $lockHandle;
  $lockHandle = @fopen($lockFile, 'c');
  if (!$lockHandle || !flock($lockHandle, LOCK_EX)) fail('Projektliste ist gesperrt – bitte nochmal versuchen.', 503);
}
function loadDb(bool $strict = false): array {
  global $dbFile;
  if (!is_file($dbFile)) return [];
  $j = json_decode((string) file_get_contents($dbFile), true);
  if (is_array($j) && isset($j['projekte']) && is_array($j['projekte'])) return $j['projekte'];
  if ($strict) fail('Die Projektliste (daten/projekte.json) ist beschädigt – bitte aus der Sicherung zurückholen. Es wurde nichts geändert.', 500);
  return [];
}
function writeAtomic(string $file, string $data): void {
  $tmp = @tempnam(dirname($file), 's2m');
  if (!$tmp || @file_put_contents($tmp, $data) !== strlen($data)) { if ($tmp) @unlink($tmp); fail('Speichern nicht möglich (Schreibrechte / Speicherplatz prüfen).', 500); }
  @chmod($tmp, 0644);
  if (!@rename($tmp, $file)) { @unlink($tmp); fail('Speichern nicht möglich.', 500); }
}
function saveDb(array $list): void {
  global $dbFile;
  usort($list, fn($a, $b) => strcmp($b['geaendert'] ?? '', $a['geaendert'] ?? ''));
  $json = json_encode(['version' => 1, 'projekte' => array_values($list)], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
  if ($json === false) fail('Liste kann nicht gespeichert werden.', 500);
  writeAtomic($dbFile, $json);
}
function fileOf(string $id): string { global $dataDir; return $dataDir . '/' . $id . '.s2m.gz'; }
// Kurzinfo vom Programm (Teile, Stück, Materialien …): nur einfache Werte übernehmen
function infoOf(string $json): array {
  $j = json_decode($json, true);
  if (!is_array($j)) return [];
  $o = [];
  foreach (['teile', 'stueck', 'platten'] as $k) if (isset($j[$k]) && is_numeric($j[$k])) $o[$k] = (int) $j[$k];
  if (isset($j['materialien']) && is_array($j['materialien'])) $o['materialien'] = array_slice(array_values(array_map(fn($m) => clean((string) $m, 60), array_filter($j['materialien'], 'is_string'))), 0, 12);
  if (isset($j['zeit']) && is_numeric($j['zeit'])) $o['zeit'] = (float) $j['zeit'];
  return $o;
}

// --- Zugriff
function offen(): bool { return getenv('S2M_OFFEN') === '1' || is_file(__DIR__ . '/OFFEN'); }
function startSession(): void {
  $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
  // Cookie für den ganzen Programmordner: dieselbe Anmeldung wie dekore/
  $root = rtrim(dirname(dirname($_SERVER['SCRIPT_NAME'] ?? '/x/api.php')), '/') . '/';
  session_name('s2m_dekore');
  session_set_cookie_params(['lifetime' => 0, 'path' => $root, 'secure' => $https, 'httponly' => true, 'samesite' => 'Strict']);
  session_start();
}
function loggedIn(): bool { return offen() || (isset($_SESSION) && !empty($_SESSION['ok'])); }
function csrf(): string {
  if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(16));
  return $_SESSION['csrf'];
}
function needAccess(bool $write): void {
  if (!loggedIn()) fail('Bitte anmelden (Passwort wie in der Dekor-Verwaltung).', 401, ['login' => false]);
  if (!$write) return;
  $h = $_SERVER['HTTP_X_CSRF'] ?? '';
  if (!is_string($h) || !hash_equals(csrf(), $h)) fail('Sitzung abgelaufen – bitte neu laden.', 403);
}

// ---------------------------------------------------------------- Ablauf
ensureDirs();
startSession();
$a = $_GET['a'] ?? $_POST['a'] ?? 'list';
if (!is_string($a)) $a = '';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($a === 'list') {
  if (!loggedIn()) out(['ok' => true, 'projekte' => [], 'offen' => false, 'login' => false, 'passwort' => is_file($pwFile)]);
  out(['ok' => true, 'projekte' => loadDb(), 'offen' => offen(), 'login' => true, 'csrf' => csrf()]);
}
if ($a === 'get') {
  needAccess(false);
  $id = idOk((string) ($_GET['id'] ?? ''));
  if ($id === '' || !is_file(fileOf($id))) fail('Projekt nicht gefunden.', 404);
  header('Content-Type: application/gzip');
  header('Content-Length: ' . filesize(fileOf($id)));
  readfile(fileOf($id));
  exit;
}
if ($method !== 'POST') fail('Nur POST.', 405);
needAccess(true);

switch ($a) {
  case 'save':
    $f = $_FILES['datei'] ?? null;
    if (!$f || ($f['error'] ?? 1) !== UPLOAD_ERR_OK || !is_uploaded_file($f['tmp_name'])) fail('Keine Projektdaten empfangen (zu groß? Upload-Grenze des Servers: upload_max_filesize / post_max_size).');
    if ($f['size'] > MAX_BYTES) fail('Projekt ist größer als 80 MB.');
    $fh = fopen($f['tmp_name'], 'rb');
    $magic = $fh ? fread($fh, 2) : '';
    if ($fh) fclose($fh);
    if ($magic !== "\x1f\x8b") fail('Projektdaten sind nicht gzip-gepackt.');
    $name = clean(post('name'), 120);
    if ($name === '') fail('Bitte einen Projektnamen angeben.');
    lockDb();
    $list = loadDb(true);
    $id = idOk(post('id'));
    $idx = null;
    if ($id !== '') foreach ($list as $i => $p) if ($p['id'] === $id) $idx = $i;
    if ($idx !== null && post('basis') !== '' && post('basis') !== ($list[$idx]['geaendert'] ?? '')) {
      fail('Das Projekt wurde inzwischen auf einem anderen Gerät gespeichert (' . ($list[$idx]['geaendert'] ?? '') . ').', 409, ['projekt' => $list[$idx]]);
    }
    if ($idx === null) $id = $id !== '' ? $id : newId();
    $now = date('c');
    $p = $idx !== null ? $list[$idx] : ['id' => $id, 'erstellt' => $now];
    $p['name'] = $name;
    $p['kunde'] = clean(post('kunde'), 120);
    $p['notiz'] = clean(post('notiz'), 500);
    $p['geaendert'] = $now;
    $p['groesse'] = (int) $f['size'];
    $p['geraet'] = clean(post('geraet'), 60);
    $p = array_merge($p, infoOf(post('info')));
    if (!@move_uploaded_file($f['tmp_name'], fileOf($id) . '.neu') || !@rename(fileOf($id) . '.neu', fileOf($id))) fail('Projekt kann nicht gespeichert werden (Schreibrechte prüfen).', 500);
    @chmod(fileOf($id), 0644);
    if ($idx !== null) $list[$idx] = $p; else $list[] = $p;
    saveDb($list);
    out(['ok' => true, 'projekt' => $p]);

  case 'meta':
    $id = idOk(post('id'));
    lockDb();
    $list = loadDb(true);
    $idx = null;
    foreach ($list as $i => $p) if ($p['id'] === $id) $idx = $i;
    if ($idx === null) fail('Projekt nicht gefunden.', 404);
    $name = clean(post('name'), 120);
    if ($name === '') fail('Bitte einen Projektnamen angeben.');
    $list[$idx]['name'] = $name;
    $list[$idx]['kunde'] = clean(post('kunde'), 120);
    $list[$idx]['notiz'] = clean(post('notiz'), 500);
    saveDb($list);
    out(['ok' => true, 'projekt' => $list[$idx]]);

  case 'copy':
    $id = idOk(post('id'));
    lockDb();
    $list = loadDb(true);
    $src = null;
    foreach ($list as $p) if ($p['id'] === $id) $src = $p;
    if (!$src || !is_file(fileOf($id))) fail('Projekt nicht gefunden.', 404);
    $nid = newId();
    if (!@copy(fileOf($id), fileOf($nid))) fail('Kopieren nicht möglich.', 500);
    $now = date('c');
    $p = array_merge($src, ['id' => $nid, 'name' => clean(post('name'), 120) ?: $src['name'] . ' (Kopie)', 'erstellt' => $now, 'geaendert' => $now]);
    $list[] = $p;
    saveDb($list);
    out(['ok' => true, 'projekt' => $p]);

  case 'delete':
    $id = idOk(post('id'));
    lockDb();
    $list = loadDb(true);
    $keep = array_values(array_filter($list, fn($p) => $p['id'] !== $id));
    if (count($keep) === count($list)) fail('Projekt nicht gefunden.', 404);
    // nicht endgültig: in den Papierkorb (Datei + Eintrag), von Hand zurückholbar
    $gone = array_values(array_filter($list, fn($p) => $p['id'] === $id))[0];
    if (is_file(fileOf($id))) @rename(fileOf($id), $trashDir . '/' . $id . '.s2m.gz');
    @file_put_contents($trashDir . '/' . $id . '.json', json_encode($gone + ['geloescht' => date('c')], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    saveDb($keep);
    out(['ok' => true]);
}
fail('Unbekannter Aufruf.');
