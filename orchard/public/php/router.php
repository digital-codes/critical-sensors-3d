<?php
declare(strict_types=1);
/**
 * Dev router for the PHP built-in server:
 *   php -S 127.0.0.1:9000 -t <this dir> <this dir>/router.php
 *
 * Executes PHP files (api.php), refuses credentials and dotfiles with 403,
 * answers everything else with 404. Production (Apache) is covered by the
 * .htaccess in this directory instead.
 */

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$base = basename($path);

if ($base !== '' && str_ends_with($base, '.php')) {
    return false; // let the built-in server execute the PHP file
}
if ($base !== '' && (str_starts_with($base, '.') || str_ends_with($base, '.ini'))) {
    http_response_code(403);
    header('Content-Type: text/plain; charset=utf-8');
    exit("Forbidden\n");
}
http_response_code(404);
header('Content-Type: text/plain; charset=utf-8');
exit("Not found\n");
