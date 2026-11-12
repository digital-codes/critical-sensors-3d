# Tasks

## 1. Schema: r/g/b columns + registry seeds

- [x] 1.1 create_tables.py: add `r FLOAT NULL`, `g FLOAT NULL`, `b FLOAT NULL` to DDL_SENSORS; update SEED_LOCATIONS id 2 (variables `co2,temp,hum,light,r,g,b,rssi,bat`, since `2026-09-19`) and id 7 (variables `co2,temp,hum,pres,light,r,g,b`); add SEED_SOURCES rows `(7,'r','sensor','2',…,'mean')`, `(7,'g',…)`, `(7,'b',…)` with a note naming Wiese2. Verify: `python3.12 -m py_compile datatools/create_tables.py` and `create_tables.py --sql` prints the DDL with the three columns and the seeds (offline mode, no DB needed).
- [x] 1.2 New `datatools/migrate_add_rgb_sensor.py` (pattern: migrate_add_station_air_columns.py): inspect-checked `ALTER TABLE sensors ADD COLUMN r/g/b FLOAT NULL`, INSERT IGNORE id-7 r/g/b sources, UPDATE sensor_locations id 2 (variables, since) and id 7 (variables) — each statement in its own transaction with printed row counts, idempotent. Verify: `python3.12 -m py_compile datatools/migrate_add_rgb_sensor.py` and a dry structural review of the statement list against the pattern.

## 2. refSensors.py: srv2 fetch, decode, gate, write

- [x] 2.1 Add the srv2 fetch/decode/aggregate block in the fetch section (after the SensorCity blocks, before the offline exit): `SRV2_URL`, `RFU_BYTE_ORDER = "RRGGBB"`, `SRV2_DAYS = int(os.environ.get("REFSENSORS_SRV2_DAYS", "35"))`; fetch with requests, filter id "2", decode `int(round(float(rfu))) & 0xFFFFFF` → r/g/b with r = high byte, build a DataFrame (date naive/CET — NO shift, id=2, temp/hum/co2/light/bat/rssi floats, r/g/b float-or-NaN gated by `light > 0` per row), hourly resample mean (r/g/b = mean over lit samples), failures logged with the frame set to None. Verify: `python3.12 -m py_compile datatools/refSensors.py` plus a small driver that imports/execs the block's functions against the live feed and prints the hourly frame (row count, gated-NULL share, decode spot values matching datatools/analyze_srv2.py).
- [x] 2.2 Add `r`,`g`,`b` to the auto-ALTER column list and to the to_sql dtype dict (Float). Verify: `python3.12 -m py_compile` and grep that both lists carry the three names.
- [x] 2.3 Write block after the scNeighbours block, before composeVirtualSensors: same gap-tolerant per-id date-set dedup, `checkShutdown` before the write, per-hour rows appended under id 2; extend the offline `--csv` branch to also write `srv2_<ts>.csv`. Verify: offline `--csv` run (`python3.12 datatools/refSensors.py --csv`) exits 0 and the srv2 CSV carries hourly rows with gated NULLs and no rfu column values.

## 3. Pipeline verification (offline first)

- [x] 3.1 Clean-venv check per datatools README constraint: fresh python3.12 venv, install requirements.txt, `py_compile` all three changed/new files. Verify: venv exists at project root, compile clean.
- [x] 3.2 Dedup/idempotence check without touching MariaDB: run the srv2 ingest logic twice over the same fetched window against a local stand-in (SQLite engine or pure-frame comparison) and assert the second pass adds 0 rows and the first pass yields date-ascending unique hours. Verify: assert output printed, exit 0.
- [x] 3.3 Composition spot check: with the stand-in DB, confirm id-7 composition picks up co2/r/g/b from id-2 hours (existing composeVirtualSensors against the stand-in) and leaves dark hours NULL. Verify: assert output printed.

## 4. Live run (user-gated production write)

- [x] 4.1 Ask the user, then run `migrate_add_rgb_sensor.py` against the live DB (dburl.txt) and confirm the readback (columns exist, sources registered, registry updated). Verify: SQL readback printed.
- [x] 4.2 Run the pipeline live once with `REFSENSORS_SRV2_DAYS=400` (backfill; PID-lock note: the server cron may overlap — date-ascending insert + latest-date dedup self-heals). Verify: DB readback — id-2 row count ≈ 936+, hourly, r/g/b NULL exactly in dark hours, spot values match datatools/analyze_srv2.py decode; id 7 gains co2/r/g/b. *(Actual: 281 hourly rows from 936 raw samples — the 936+ estimate was raw-count; hourly aggregation verified instead, all other criteria met.)*
- [x] 4.3 Second live run (default window) adds 0 id-2 rows. Verify: log shows "0 to add" for id 2.
- [x] 4.4 Update datatools/README.md (srv2 source section: feed shape, decode, gate, REFSENSORS_SRV2_DAYS, migration note). Verify: README section present in the same commit train.

## 5. Dashboard API: wiese channels

- [x] 5.1 api.php: add `wieseLight` => [2, 'light', '0–255', source label, licence] and `wieseR`/`wieseG`/`wieseB` => [7, 'r'/'g'/'b', '0–255', …] to the CHANNELS whitelist; add `'r','g','b'` to ALLOWED_COLUMNS. Verify: `php -l orchard/public/php/api.php` plus `curl 'http://127.0.0.1:9000/api.php?channels=wieseLight,wieseR&from=2026-11-12&to=2026-11-12'` (dev php server on 9000) returns 200 with days from sensors 2 and 7.

## 6. Dashboard frontend: Licht card real data + fallback

- [x] 6.1 api.ts: extend ChannelKey and CHANNEL_LIST with `wieseLight`, `wieseR`, `wieseG`, `wieseB`. Verify: `npm run build` (root, builds both apps) green.
- [x] 6.2 LightCard.vue: accept the four channel series (daily + hourly) as props; when the light channel's daily `range.to` is within 31 days of today render measured bars (year view: per measured day at its day-of-year on the 365-day axis, height = light/255×100 %, colour = convoluted rgb; 7-day zoom: hourly values, black where no rgb), readout via the existing value-at-day semantics ("—" without data); otherwise keep the synthetic curves with the dummy label. Real mode labels the card `Wiese` instead of `Wiese (fake/geplant)`. Verify: build green + browser check below.
- [x] 6.3 DataPane.vue: pass the new series (daily + hourly) into LightCard; update the mobile `Wiese/Licht` description (real measurements + demo fallback note). Verify: build green.

## 7. Dashboard verification (browser, sequential)

- [x] 7.1 Real mode: `php -S 127.0.0.1:9000` + `npm run dev` (port 5212), Playwright probe — LightCard shows bars only on measured days, header tag reads `Wiese`, day cursor on Nov 12 (doy 317) shows the measured intensity readout, colour bar present. Verify: screenshot + DOM assertions recorded.
- [x] 7.2 Fallback mode: Playwright route-intercept the api answer with a stale `range.to` (older than 31 days) — the card must switch to the synthetic demo rendering with the dummy label. Verify: screenshot + DOM assertions recorded.
- [x] 7.3 Full build `npm run build` green (both apps). Verify: exit 0.

## 8. Non-linear light characteristic (user amendment)

- [x] 8.1 LightCard.vue: single `lightToPct(light)` helper (log characteristic `100 × ln(1 + light) / ln(256)`) used by year bars, zoom bars and the readout; spec delta + design amended to the non-linear characteristic. Verify: `npm run build` green.
- [x] 8.2 Browser re-verify: real-mode readout for Nov 12 (light 2.14) ≈ 20.6 %, bars visibly taller than the linear render; fallback mode unchanged. Verify: Playwright DOM assertions + screenshot.
- [x] 8.3 Single colour indicator (user amendment): chart bars carry the hue-normalized colour themselves (`saturated()`, fill = `pure(saturated(rgb))`), the separate colour-bar strip and `barGradient` are removed; `convoluted()` remains only in the synthetic fallback bars. Spec delta gains MODIFIED "Data pane cards" + ADDED "Licht card single colour indicator". Verify: build green + Playwright (no .colorbar, saturated fills) + screenshot.

## Workflow follow-up

- Commit train per datatools conventions (one logical change per commit; no credentials; no generated artifacts).
- `openspec validate add-srv2-rgb-sensor` stays green; archive the change only after the user accepts the final state (`openspec archive add-srv2-rgb-sensor -y` + commit the moved directory).
- After archive, the www hard-reload note applies (Ctrl+Shift+R) — the Licht card changes are frontend code.
