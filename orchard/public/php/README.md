# wiese3d PHP sensor API (`orchard/public/php/`)

`api.php` serves daily min/mean/max aggregates of the `wiese.sensors` table
as JSON for the dashboard's data cards. The channel → sensor mapping lives
in `$CHANNELS` inside api.php — the single switch point when the orchard's
own sensors (Wiese-Verbund, sensor id 7) replace the reference sensors.

## Channels (current picks — closest available until the orchard sensors exist)

| Kanal | Sensor | Quelle | Daten seit |
|---|---|---|---|
| temperature | 0 (Referenz) | DWD Klimastation Rheinstetten | 2026-04 |
| humidity | 0 (Referenz) | DWD Klimastation Rheinstetten | 2026-04 |
| wind | 0 (Referenz) | DWD FF_10 (10-min → Stundenmittel) | 2026-04 |
| co2 | 0 (Referenz) | ICOS AS_KIT @30 m | 2026-04 |
| solar | 9 | SensorCity 116 Breite Straße (212 m N) | 2026-10-10 |
| soilMoist / soilTemp | 8 | SensorCity 002 Hohenzollernstraße (457 m N) | 2026-08-17 |

## API

```
GET api.php                       → all channels, each with its full data range
GET api.php?channels=co2,solar    → subset
GET api.php?from=2026-04-01&to=2026-04-30
```

Response: `{"ok":true,"generated":"…","channels":{"co2":{"sensor":0,
"column":"co2","unit":"ppm","source":"…","licence":"…","range":{"from":…,
"to":…},"days":[["2026-04-01",432.1,428.0,441.2],…]}}}` — `days` rows are
`[date, avg, min, max]`.

Errors: 4xx/5xx with `{"ok":false,"error":"…"}` (generic text; details only
in the server error log).

## Development

```sh
php -S 127.0.0.1:9000 -t orchard/public/php orchard/public/php/router.php
```

Vite (orchard + www) proxies `/php` → `127.0.0.1:9000`, so the frontend
fetches `/php/api.php`. For local testing copy
`/var/www/files/wiese3d/config.ini` (or the template, filled) to
`orchard/public/php/config.ini` — it is gitignored.

## Production

Copy `api.php` **and** `.htaccess` into `/var/www/files/wiese3d/` (the
config.ini already sits there). The `.htaccess` denies direct HTTP access
to `*.ini`/`*.txt`/`*.md`/`*.log` and disables directory listing — keep it
(or replicate the rules in the vhost if `AllowOverride` is off).

## Security notes

- GET only; every parameter validated server-side; channel/sensor/column
  come exclusively from the whitelisted `$CHANNELS` map; all values bound
  via PDO prepared statements (emulation off).
- Date spans capped (800 days); responses are small and cacheable
  (`Cache-Control: max-age=300`).
- Generic JSON errors only — DB/PHP details go to `error_log`.
- No CORS header (same-origin via the Vite proxy in dev), no sessions,
  no cookies, read-only DB usage. Recommend a read-only MariaDB user in
  config.ini.
