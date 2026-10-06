<?php
/*
 * Step2Maestro – Dekor-Bibliothek auf dem Webspace (z. B. Strato, PHP 8).
 *
 * Lesen ist offen (Step2Maestro holt sich die Liste), Ändern nur nach Anmeldung.
 *   GET  api.php?a=list                       → { ok, dekore: [...], login, setup, csrf? }
 *   POST a=setup    passwort                  → erstes Passwort festlegen (nur solange keins gesetzt ist)
 *   POST a=login    passwort  /  a=logout  /  a=passwort  alt, neu
 *   POST a=save     key?, code, name, hersteller, grain, color, scale, notiz   (key = bisheriger Schlüssel beim Umbenennen)
 *   POST a=upload   datei (Bild), key?, code?, name?  → Bild als JPEG (max. 2048 px) + Vorschau (320 px), Farbe = Mittelwert
 *   POST a=delete   key
 * Schreibende Aufrufe brauchen den Kopf X-CSRF (aus login/list). Daten in daten/ (per .htaccess gesperrt), Bilder in bilder/
 * und vorschau/ – diese Ordner legt das Skript selbst an, ein Update des Programms überschreibt sie also nicht.
 */
declare(strict_types=1);

const MAX_BYTES = 25 * 1024 * 1024; // größtes hochladbares Bild
const MAX_SIDE = 2048;              // Textur: längste Seite
const THUMB_SIDE = 320;             // Vorschau

$base = __DIR__;
$dataDir = $base . '/daten';
$imgDir = $base . '/bilder';
$thumbDir = $base . '/vorschau';
$dbFile = $dataDir . '/dekore.json';
$pwFile = $dataDir . '/passwort.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function out(array $data, int $code = 200): void {
  http_response_code($code);
  echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}
function fail(string $msg, int $code = 400): void { out(['ok' => false, 'fehler' => $msg], $code); }

function ensureDirs(): void {
  global $dataDir, $imgDir, $thumbDir;
  foreach ([$dataDir, $imgDir, $thumbDir] as $d) {
    if (!is_dir($d) && !@mkdir($d, 0755, true)) fail('Ordner ' . basename($d) . ' kann nicht angelegt werden (Schreibrechte prüfen).', 500);
  }
  // Daten nie direkt ausliefern (Passwort-Hash, Liste nur über die API)
  $ht = $dataDir . '/.htaccess';
  if (!is_file($ht)) @file_put_contents($ht, "<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n  Order allow,deny\n  Deny from all\n</IfModule>\n");
  foreach ([$imgDir, $thumbDir] as $d) {
    $h = $d . '/.htaccess';
    if (!is_file($h)) @file_put_contents($h, "Options -Indexes\n<IfModule mod_php.c>\n  php_flag engine off\n</IfModule>\n<FilesMatch \"\\.(php|phtml|phar|pl|py|cgi|sh)$\">\n  <IfModule mod_authz_core.c>\n    Require all denied\n  </IfModule>\n</FilesMatch>\n");
  }
}

// Dekor-Liste lesen / schreiben (mit Sperre)
function loadDb(): array {
  global $dbFile;
  if (!is_file($dbFile)) return [];
  $j = json_decode((string) file_get_contents($dbFile), true);
  return is_array($j) && isset($j['dekore']) && is_array($j['dekore']) ? $j['dekore'] : [];
}
function saveDb(array $list): void {
  global $dbFile;
  usort($list, fn($a, $b) => strnatcasecmp($a['code'], $b['code']));
  $tmp = $dbFile . '.tmp';
  $fh = fopen($tmp, 'w');
  if (!$fh) fail('Liste kann nicht gespeichert werden (Schreibrechte prüfen).', 500);
  flock($fh, LOCK_EX);
  fwrite($fh, json_encode(['version' => 1, 'dekore' => array_values($list)], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT));
  fflush($fh);
  flock($fh, LOCK_UN);
  fclose($fh);
  rename($tmp, $dbFile);
}

// Schlüssel für Dateinamen aus dem Code: „U708 ST9“ → U708_ST9 (nur A–Z, 0–9, _ und -)
function keyOf(string $code): string {
  $s = strtr($code, ['ä' => 'ae', 'ö' => 'oe', 'ü' => 'ue', 'Ä' => 'Ae', 'Ö' => 'Oe', 'Ü' => 'Ue', 'ß' => 'ss']);
  $s = strtoupper(preg_replace('/[^A-Za-z0-9-]+/', '_', $s) ?? '');
  return substr(trim($s, '_-'), 0, 60);
}
function clean(string $s, int $max = 120): string {
  $s = trim(preg_replace('/[\x00-\x1f\x7f]+/u', ' ', $s) ?? '');
  return mb_substr($s, 0, $max);
}
function colorOk(string $c): string { return preg_match('/^#[0-9a-fA-F]{6}$/', $c) ? strtolower($c) : ''; }

function withUrls(array $d): array {
  global $imgDir, $thumbDir;
  $f = $imgDir . '/' . $d['key'] . '.jpg';
  $t = $thumbDir . '/' . $d['key'] . '.jpg';
  $d['bild'] = is_file($f) ? 'bilder/' . $d['key'] . '.jpg?v=' . filemtime($f) : '';
  $d['vorschau'] = is_file($t) ? 'vorschau/' . $d['key'] . '.jpg?v=' . filemtime($t) : '';
  return $d;
}

// --- Anmeldung
function pwHash(): string {
  global $pwFile;
  if (!is_file($pwFile)) return '';
  $s = (string) file_get_contents($pwFile);
  return preg_match('/\'([^\']+)\'/', $s, $m) ? $m[1] : '';
}
function setPw(string $pw): void {
  global $pwFile;
  if (mb_strlen($pw) < 8) fail('Das Passwort braucht mindestens 8 Zeichen.');
  $h = password_hash($pw, PASSWORD_DEFAULT);
  if (file_put_contents($pwFile, "<?php // Passwort der Dekor-Verwaltung (Hash)\nreturn '" . $h . "';\n") === false) fail('Passwort kann nicht gespeichert werden.', 500);
  @chmod($pwFile, 0600);
}
function startSession(): void {
  $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
  session_name('s2m_dekore');
  session_set_cookie_params(['lifetime' => 0, 'path' => dirname($_SERVER['SCRIPT_NAME']) . '/', 'secure' => $https, 'httponly' => true, 'samesite' => 'Strict']);
  session_start();
}
function loggedIn(): bool { return !empty($_SESSION['ok']); }
function csrf(): string {
  if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(16));
  return $_SESSION['csrf'];
}
function needLogin(): void {
  if (!loggedIn()) fail('Bitte zuerst anmelden.', 401);
  $h = $_SERVER['HTTP_X_CSRF'] ?? '';
  if (!is_string($h) || !hash_equals(csrf(), $h)) fail('Sitzung abgelaufen – bitte neu laden.', 403);
}

// --- Bild speichern: neu als JPEG kodieren (entfernt alles außer Pixeln), verkleinern, Vorschau, Mittelfarbe
function storeImage(string $tmp, string $key): string {
  global $imgDir, $thumbDir;
  if (!function_exists('imagecreatefromstring')) fail('Auf dem Server fehlt PHP-GD (Bildbearbeitung).', 500);
  $info = @getimagesize($tmp);
  if (!$info || !in_array($info[2], [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_WEBP, IMAGETYPE_GIF], true)) fail('Nur Bilder (JPG, PNG, WebP).');
  if ($info[0] * $info[1] > 60000000) fail('Bild ist zu groß (mehr als 60 Megapixel).');
  $src = @imagecreatefromstring((string) file_get_contents($tmp));
  if (!$src) fail('Bild kann nicht gelesen werden.');
  $w = imagesx($src);
  $h = imagesy($src);
  $fit = function (int $max) use ($src, $w, $h) {
    $k = min(1, $max / max($w, $h));
    $nw = max(1, (int) round($w * $k));
    $nh = max(1, (int) round($h * $k));
    $dst = imagecreatetruecolor($nw, $nh);
    imagefill($dst, 0, 0, imagecolorallocate($dst, 255, 255, 255));
    imagecopyresampled($dst, $src, 0, 0, 0, 0, $nw, $nh, $w, $h);
    return $dst;
  };
  $big = $fit(MAX_SIDE);
  $small = $fit(THUMB_SIDE);
  if (!imagejpeg($big, $imgDir . '/' . $key . '.jpg', 86) || !imagejpeg($small, $thumbDir . '/' . $key . '.jpg', 82)) fail('Bild kann nicht gespeichert werden.', 500);
  // Mittelfarbe für Listen und Farbfelder
  $one = imagecreatetruecolor(1, 1);
  imagecopyresampled($one, $small, 0, 0, 0, 0, 1, 1, imagesx($small), imagesy($small));
  $c = imagecolorat($one, 0, 0);
  return sprintf('#%02x%02x%02x', ($c >> 16) & 255, ($c >> 8) & 255, $c & 255);
}

// ---------------------------------------------------------------- Ablauf
ensureDirs();
startSession();
$a = $_GET['a'] ?? $_POST['a'] ?? 'list';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($a === 'list') {
  $res = ['ok' => true, 'dekore' => array_map('withUrls', loadDb()), 'login' => loggedIn(), 'setup' => pwHash() === ''];
  if (loggedIn()) $res['csrf'] = csrf();
  // Step2Maestro darf die Liste auch von einer anderen Adresse holen (nur lesen)
  header('Access-Control-Allow-Origin: *');
  out($res);
}
if ($method !== 'POST') fail('Nur POST.', 405);

switch ($a) {
  case 'setup':
    if (pwHash() !== '') fail('Es gibt schon ein Passwort.', 403);
    setPw((string) ($_POST['passwort'] ?? ''));
    session_regenerate_id(true);
    $_SESSION['ok'] = true;
    out(['ok' => true, 'csrf' => csrf()]);

  case 'login':
    $h = pwHash();
    if ($h === '') fail('Noch kein Passwort festgelegt.', 403);
    $_SESSION['fails'] = (int) ($_SESSION['fails'] ?? 0);
    if ($_SESSION['fails'] >= 5) sleep(3);
    if (!password_verify((string) ($_POST['passwort'] ?? ''), $h)) {
      $_SESSION['fails']++;
      sleep(1);
      fail('Passwort falsch.', 401);
    }
    session_regenerate_id(true);
    $_SESSION = ['ok' => true];
    out(['ok' => true, 'csrf' => csrf()]);

  case 'logout':
    $_SESSION = [];
    session_destroy();
    out(['ok' => true]);

  case 'passwort':
    needLogin();
    if (!password_verify((string) ($_POST['alt'] ?? ''), pwHash())) fail('Bisheriges Passwort falsch.', 401);
    setPw((string) ($_POST['neu'] ?? ''));
    out(['ok' => true]);

  case 'save':
    needLogin();
    $code = clean((string) ($_POST['code'] ?? ''), 40);
    $key = keyOf($code);
    if ($key === '') fail('Bitte einen Dekor-Code angeben (z. B. U708 ST9).');
    $old = keyOf((string) ($_POST['key'] ?? ''));
    $list = loadDb();
    $idx = null;
    foreach ($list as $i => $d) if ($d['key'] === ($old !== '' ? $old : $key)) $idx = $i;
    foreach ($list as $i => $d) if ($d['key'] === $key && $i !== $idx) fail('Den Code ' . $code . ' gibt es schon.');
    $d = $idx !== null ? $list[$idx] : ['key' => $key, 'color' => '#c8c8c4'];
    // umbenennen: Bilder mitnehmen
    if ($idx !== null && $d['key'] !== $key) {
      foreach ([$imgDir, $thumbDir] as $dir) if (is_file($dir . '/' . $d['key'] . '.jpg')) rename($dir . '/' . $d['key'] . '.jpg', $dir . '/' . $key . '.jpg');
    }
    $d['key'] = $key;
    $d['code'] = $code;
    $d['name'] = clean((string) ($_POST['name'] ?? ''), 80);
    $d['hersteller'] = clean((string) ($_POST['hersteller'] ?? ''), 40);
    $d['notiz'] = clean((string) ($_POST['notiz'] ?? ''), 200);
    $d['grain'] = !empty($_POST['grain']) && $_POST['grain'] !== '0';
    $c = colorOk((string) ($_POST['color'] ?? ''));
    if ($c !== '') $d['color'] = $c;
    $sc = (float) ($_POST['scale'] ?? 0);
    $d['scale'] = $sc >= 50 && $sc <= 6000 ? round($sc) : ($d['scale'] ?? 1000);
    $d['geaendert'] = date('c');
    if ($idx !== null) $list[$idx] = $d; else $list[] = $d;
    saveDb($list);
    out(['ok' => true, 'dekor' => withUrls($d)]);

  case 'upload':
    needLogin();
    $f = $_FILES['datei'] ?? null;
    if (!$f || ($f['error'] ?? 1) !== UPLOAD_ERR_OK || !is_uploaded_file($f['tmp_name'])) fail('Kein Bild empfangen (Datei zu groß? Upload-Grenze des Servers prüfen).');
    if ($f['size'] > MAX_BYTES) fail('Bild ist größer als 25 MB.');
    // Code: angegeben, sonst aus dem Dateinamen („U708_ST9.jpg“ → „U708 ST9“)
    $code = clean((string) ($_POST['code'] ?? ''), 40);
    if ($code === '') $code = clean(str_replace('_', ' ', preg_replace('/\.[^.]+$/', '', (string) $f['name']) ?? ''), 40);
    $key = keyOf((string) ($_POST['key'] ?? '')) ?: keyOf($code);
    if ($key === '') fail('Kein Dekor-Code (Dateiname wie U708_ST9.jpg oder Code angeben).');
    $color = storeImage($f['tmp_name'], $key);
    $list = loadDb();
    $idx = null;
    foreach ($list as $i => $d) if ($d['key'] === $key) $idx = $i;
    $d = $idx !== null ? $list[$idx] : ['key' => $key, 'code' => $code, 'name' => clean((string) ($_POST['name'] ?? ''), 80), 'hersteller' => clean((string) ($_POST['hersteller'] ?? ''), 40),
      'notiz' => '', 'grain' => (bool) preg_match('/^H\d/i', $code), 'scale' => 1000];
    $d['color'] = $color;
    $d['geaendert'] = date('c');
    if ($idx !== null) $list[$idx] = $d; else $list[] = $d;
    saveDb($list);
    out(['ok' => true, 'dekor' => withUrls($d), 'neu' => $idx === null]);

  case 'delete':
    needLogin();
    $key = keyOf((string) ($_POST['key'] ?? ''));
    $list = array_values(array_filter(loadDb(), fn($d) => $d['key'] !== $key));
    foreach ([$imgDir, $thumbDir] as $dir) if (is_file($dir . '/' . $key . '.jpg')) unlink($dir . '/' . $key . '.jpg');
    saveDb($list);
    out(['ok' => true]);
}
fail('Unbekannter Aufruf.');
