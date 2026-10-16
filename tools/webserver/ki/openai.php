<?php
/*
 * Weckwop – KI über den Server (ChatGPT/OpenAI): der API-Schlüssel liegt nur auf dem Server, die Geräte (PC, Pi an der
 * Säge) brauchen keinen eigenen. Das Programm ruft das OpenAI-SDK mit baseURL = ki/openai.php/v1 auf; hier wird nur
 * weitergereicht:
 *   GET  openai.php?a=status   → { ok, aktiv (Schlüssel da), zugang, csrf? }
 *   POST openai.php/v1/responses,  GET openai.php/v1/models
 * Schlüssel: Umgebungsvariable OPENAI_API_KEY (Docker) oder Datei schluessel.php neben diesem Skript
 * (Inhalt: <?php return 'sk-…';). Zugang wie die Projektablage: angemeldet (Passwort der Dekor-Verwaltung) oder offen
 * (S2M_OFFEN=1 bzw. Datei projekte/OFFEN). POST braucht den Kopf X-CSRF.
 */
declare(strict_types=1);
ini_set('display_errors', '0');
set_time_limit(330);
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function jout(array $d, int $code = 200): void {
  http_response_code($code);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}
// Fehler im Format der OpenAI-API (das SDK zeigt message an)
function efail(string $msg, int $code): void { jout(['error' => ['message' => $msg, 'type' => 'step2maestro']], $code); }

function apiKey(): string {
  $k = getenv('OPENAI_API_KEY');
  if (is_string($k) && $k !== '') return trim($k);
  $f = __DIR__ . '/schluessel.php';
  if (is_file($f)) { $v = include $f; if (is_string($v)) return trim($v); }
  return '';
}
function offen(): bool { return getenv('S2M_OFFEN') === '1' || is_file(dirname(__DIR__) . '/projekte/OFFEN'); }
$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
$root = rtrim(dirname(dirname($_SERVER['SCRIPT_NAME'] ?? '/x/openai.php')), '/') . '/';
session_name('s2m_dekore');
session_set_cookie_params(['lifetime' => 0, 'path' => $root, 'secure' => $https, 'httponly' => true, 'samesite' => 'Strict']);
session_start();
$zugang = offen() || !empty($_SESSION['ok']);
if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(16));
$path = (string) ($_SERVER['PATH_INFO'] ?? '');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($path === '' || $path === '/') {
  $r = ['ok' => true, 'aktiv' => apiKey() !== '', 'zugang' => $zugang];
  if ($zugang) $r['csrf'] = $_SESSION['csrf'];
  jout($r);
}
if (!$zugang) efail('Bitte anmelden (Passwort wie in der Dekor-Verwaltung).', 401);
$key = apiKey();
if ($key === '') efail('Auf dem Server ist kein OpenAI-Schlüssel eingetragen (OPENAI_API_KEY).', 503);
$allowed = ($method === 'POST' && $path === '/v1/responses') || ($method === 'GET' && $path === '/v1/models');
if (!$allowed) efail('Nicht erlaubt: ' . $method . ' ' . $path, 404);
if ($method === 'POST') {
  $h = $_SERVER['HTTP_X_CSRF'] ?? '';
  if (!is_string($h) || !hash_equals($_SESSION['csrf'], $h)) efail('Sitzung abgelaufen – bitte neu laden.', 403);
}
session_write_close(); // lange Anfragen sollen andere Aufrufe nicht blockieren

$body = $method === 'POST' ? (string) file_get_contents('php://input', false, null, 0, 4 * 1024 * 1024 + 1) : '';
if (strlen($body) > 4 * 1024 * 1024) efail('Anfrage zu groß.', 413);
$upstream = rtrim((string) (getenv('S2M_OPENAI_URL') ?: 'https://api.openai.com'), '/') . $path;
$ch = curl_init($upstream);
curl_setopt_array($ch, [
  CURLOPT_CUSTOMREQUEST => $method,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HEADER => false,
  CURLOPT_TIMEOUT => 320,
  CURLOPT_CONNECTTIMEOUT => 15,
  CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $key, 'Content-Type: application/json', 'Accept: application/json'],
]);
if ($method === 'POST') curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
$res = curl_exec($ch);
$code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
$err = curl_error($ch);
curl_close($ch);
if ($res === false) efail('Server erreicht OpenAI nicht: ' . $err, 502);
http_response_code($code ?: 502);
header('Content-Type: application/json; charset=utf-8');
echo $res;
