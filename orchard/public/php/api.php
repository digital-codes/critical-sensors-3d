<?php
declare(strict_types=1);
/**
 * wiese3d sensor API — daily aggregates (min/mean/max) from the `sensors` table.
 *
 * Config: reads config.ini from THIS script's directory (flat keys
 * DBUSER, DBPASS, DBSCHEMA, DBHOST, DBPORT — see config.ini.template).
 * Production: copy api.php (+ .htaccess) into /var/www/files/wiese3d/
 * next to the config.ini. Development: run
 *   php -S 127.0.0.1:9000 -t <this dir> <this dir>/router.php
 * and let Vite proxy /php -> 127.0.0.1:9000.
 *
 * Usage (GET only):
 *   api.php                                       all channels, full range
 *   api.php?channels=co2,temperature              subset
 *   api.php?from=2026-04-01&to=2026-04-30         date window (<= 800 days)
 *   api.php?res=hourly&from=…&to=…                hourly rows (span <= 14 days)
 *
 * The $CHANNELS map below is the ONLY switch point for which sensor feeds
 * which displayed channel: when the orchard's own sensors (Wiese-Verbund,
 * id 7) are installed, point the affected channels at id 7 here — the
 * frontend reads source/unit metadata from the response and needs no
 * change.
 *
 * Security posture: GET only; channel/column/sensor ids never come from
 * the request (whitelisted map); all values bound via PDO prepared
 * statements (emulation off); date params strictly validated and capped;
 * errors answer as generic JSON — details go to error_log only; no CORS
 * header, no sessions, no cookies. Keep config.ini unreadable over HTTP
 * (.htaccess ships with this directory; the dev router.php refuses *.ini).
 */

ini_set('display_errors', '0');
error_reporting(E_ALL);
date_default_timezone_set('Europe/Berlin');

const CHANNELS = [
    // key           => [sensor id, sensors column, unit, source label, licence note]
    'temperature'   => [0, 'temp',      '°C',   'DWD Klimastation Rheinstetten',            '© Deutscher Wetterdienst'],
    'humidity'      => [0, 'hum',       '%',    'DWD Klimastation Rheinstetten',            '© Deutscher Wetterdienst'],
    'wind'          => [0, 'wind',      'm/s',  'DWD Klimastation Rheinstetten (FF_10)',    '© Deutscher Wetterdienst'],
    'co2'           => [0, 'co2',       'ppm',  'ICOS Atmosphärenstation AS_KIT (KIT)',     'ICOS ERIC, CC BY 4.0'],
    'solar'         => [9, 'solar',     'W/m²', 'SensorCity 116 Breite Straße (212 m N)',   'Stadt Karlsruhe'],
    'soilMoist'     => [8, 'soilMoist', '%',    'SensorCity 002 Hohenzollernstraße (457 m N)', 'Stadt Karlsruhe'],
    'soilTemp'      => [8, 'soilTemp',  '°C',   'SensorCity 002 Hohenzollernstraße (457 m N)', 'Stadt Karlsruhe'],
    // SW later: orchard channels -> id 7 (Wiese-Verbund) once installed.
];

// defence in depth: columns eligible for interpolation into SQL
const ALLOWED_COLUMNS = ['temp', 'hum', 'pres', 'light', 'rain', 'wind',
    'mastWind', 'mastRain', 'solar', 'soilMoist', 'soilTemp', 'co2'];

const MAX_SPAN_DAYS = 800;
// hourly rows are only served for small windows (168 rows per channel-day)
const MAX_HOURLY_SPAN_DAYS = 14;

/** Emit a JSON payload and terminate. */
function sendJson(array $payload, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/** Generic error answer; the detail string never reaches the client. */
function fail(int $status, string $message, string $logDetail = ''): void
{
    if ($logDetail !== '') {
        error_log('wiese3d api: ' . $logDetail);
    }
    sendJson(['ok' => false, 'error' => $message], $status);
}

/** Strict YYYY-MM-DD; returns the canonical string or null. */
function parseDate(?string $raw): ?string
{
    if ($raw === null || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $raw)) {
        return null;
    }
    $t = strtotime($raw);
    if ($t === false || date('Y-m-d', $t) !== $raw) {
        return null;
    }
    return date('Y-m-d', $t);
}

// ---------------------------------------------------------------- request gate

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET');
    fail(405, 'Nur GET-Anfragen erlaubt.');
}

$channelsParam = $_GET['channels'] ?? null;
if ($channelsParam !== null && !is_string($channelsParam)) {
    fail(400, 'Ungültige Anfrage.');
}
if ($channelsParam !== null && strlen($channelsParam) > 200) {
    fail(400, 'Ungültige Anfrage.');
}

$requested = $channelsParam === null || $channelsParam === ''
    ? array_keys(CHANNELS)
    : array_values(array_unique(array_filter(array_map('trim', explode(',', $channelsParam)), static fn ($s) => $s !== '')));

$unknown = array_diff($requested, array_keys(CHANNELS));
if ($requested === [] || $unknown !== []) {
    fail(400, 'Unbekannter Kanal. Erlaubt: ' . implode(', ', array_keys(CHANNELS)) . '.');
}

$from = isset($_GET['from']) && is_string($_GET['from']) ? parseDate($_GET['from']) : null;
$to   = isset($_GET['to'])   && is_string($_GET['to'])   ? parseDate($_GET['to'])   : null;
if ((isset($_GET['from']) && $from === null) || (isset($_GET['to']) && $to === null)) {
    fail(400, 'Ungültiges Datum, Format YYYY-MM-DD erwartet.');
}
$today = date('Y-m-d');
$loLim = '2000-01-01';
$hiLim = date('Y-m-d', strtotime($today) + 86400);
if ($from !== null && ($from < $loLim || $from > $hiLim)) {
    fail(400, 'Ungültige Anfrage.');
}
if ($to !== null && ($to < $loLim || $to > $hiLim)) {
    fail(400, 'Ungültige Anfrage.');
}
if ($from !== null && $to !== null && $from > $to) {
    fail(400, 'Ungültige Anfrage.');
}
if ($from !== null && $to !== null &&
    (strtotime($to) - strtotime($from)) / 86400 > MAX_SPAN_DAYS) {
    fail(400, 'Zeitraum zu groß (maximal ' . MAX_SPAN_DAYS . ' Tage).');
}

// resolution: daily (default) or hourly — hourly is limited to small spans
$resolution = $_GET['res'] ?? 'daily';
if (!is_string($resolution) || !in_array($resolution, ['daily', 'hourly'], true)) {
    fail(400, 'Ungültige Anfrage.');
}
if ($resolution === 'hourly') {
    $hFrom = $from ?? date('Y-m-d', strtotime($today) - (MAX_HOURLY_SPAN_DAYS * 86400));
    $hTo = $to ?? $today;
    if ((strtotime($hTo) - strtotime($hFrom)) / 86400 > MAX_HOURLY_SPAN_DAYS) {
        fail(400, 'Stundenwerte nur für Zeiträume bis ' . MAX_HOURLY_SPAN_DAYS . ' Tage.');
    }
    if ($from === null) { $from = $hFrom; }
    if ($to === null) { $to = $hTo; }
}

// ---------------------------------------------------------------- database

$configPath = __DIR__ . '/config.ini';
if (!is_file($configPath) || !is_readable($configPath)) {
    fail(500, 'Interner Fehler.', 'config.ini fehlt oder ist unlesbar: ' . $configPath);
}
$cfg = parse_ini_file($configPath, false, INI_SCANNER_RAW);
if ($cfg === false
    || !isset($cfg['DBUSER'], $cfg['DBPASS'], $cfg['DBSCHEMA'], $cfg['DBHOST'], $cfg['DBPORT'])
    || !is_string($cfg['DBUSER']) || !is_string($cfg['DBPASS']) || !is_string($cfg['DBSCHEMA'])
    || !is_string($cfg['DBHOST']) || !ctype_digit((string) $cfg['DBPORT'])) {
    fail(500, 'Interner Fehler.', 'config.ini unvollständig/falsch formatiert');
}

try {
    $pdo = new PDO(
        sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
            $cfg['DBHOST'], (int) $cfg['DBPORT'], $cfg['DBSCHEMA']),
        $cfg['DBUSER'],
        $cfg['DBPASS'],
        [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_EMULATE_PREPARES   => false,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_TIMEOUT            => 5,
        ]
    );
} catch (PDOException $e) {
    fail(500, 'Interner Fehler.', 'DB connect: ' . $e->getMessage());
}

// ---------------------------------------------------------------- query

/**
 * Daily aggregates for one whitelisted channel between two dates
 * (inclusive). Returns the days array [[date, avg, min, max], ...].
 *
 * @return array<int, array{0: string, 1: float, 2: float, 3: float}>
 */
function fetchDays(PDO $pdo, int $sensorId, string $col, ?string $from, ?string $to, bool $hourly = false): array
{
    if (!in_array($col, ALLOWED_COLUMNS, true)) {
        throw new RuntimeException('column not whitelisted');
    }
    // actual data window when the caller did not pin one
    $rangeSql = "SELECT MIN(`date`) AS mn, MAX(`date`) AS mx FROM sensors "
        . 'WHERE id = ? AND `' . str_replace('`', '', $col) . '` IS NOT NULL';
    $st = $pdo->prepare($rangeSql);
    $st->bindValue(1, $sensorId, PDO::PARAM_INT);
    $st->execute();
    $row = $st->fetch();
    if ($row === false || $row['mn'] === null) {
        return [];
    }
    $from = $from ?? substr((string) $row['mn'], 0, 10);
    $to   = $to   ?? substr((string) $row['mx'], 0, 10);
    if ($from > $to) {
        return [];
    }

    // group by day (daily) or by hour (hourly); the safe column interpolation
    // pattern is identical, only the GROUP BY expression differs
    $bucket = $hourly
        ? "DATE_FORMAT(`date`, '%Y-%m-%d %H:00:00')"
        : 'DATE(`date`)';
    $sql = 'SELECT ' . $bucket . ' AS d, '
        . 'AVG(`' . str_replace('`', '', $col) . '`) AS a, '
        . 'MIN(`' . str_replace('`', '', $col) . '`) AS mi, '
        . 'MAX(`' . str_replace('`', '', $col) . '`) AS ma '
        . 'FROM sensors WHERE id = ? '
        . 'AND `' . str_replace('`', '', $col) . '` IS NOT NULL '
        . 'AND `date` >= ? AND `date` < ? + INTERVAL 1 DAY '
        . 'GROUP BY d ORDER BY d';
    $st = $pdo->prepare($sql);
    $st->bindValue(1, $sensorId, PDO::PARAM_INT);
    $st->bindValue(2, $from, PDO::PARAM_STR);
    $st->bindValue(3, $to, PDO::PARAM_STR);
    $st->execute();

    $days = [];
    foreach ($st->fetchAll() as $r) {
        $days[] = [
            (string) $r['d'],
            round((float) $r['a'], 2),
            round((float) $r['mi'], 2),
            round((float) $r['ma'], 2),
        ];
    }
    return $days;
}

$out = ['ok' => true, 'generated' => date('c'), 'res' => $resolution, 'channels' => []];
foreach ($requested as $key) {
    [$sensorId, $col, $unit, $source, $licence] = CHANNELS[$key];
    try {
        $days = fetchDays($pdo, $sensorId, $col, $from, $to, $resolution === 'hourly');
    } catch (Throwable $e) {
        fail(500, 'Interner Fehler.', 'query ' . $key . ': ' . $e->getMessage());
    }
    $out['channels'][$key] = [
        'sensor'  => $sensorId,
        'column'  => $col,
        'unit'    => $unit,
        'source'  => $source,
        'licence' => $licence,
        'range'   => $days === [] ? null : ['from' => $days[0][0], 'to' => $days[count($days) - 1][0]],
        'days'    => $days,
    ];
}

header('Cache-Control: public, max-age=300');
sendJson($out);
