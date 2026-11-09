# Tasks — dashboard-prototype

## 1. PHP sensor endpoint

- [x] 1.1 `orchard/public/php/api.php`: config.ini reader (flat DBUSER/
      DBPASS/DBSCHEMA/DBHOST/DBPORT), whitelisted channel map (temp/hum/
      wind/co2 → id 0, solar → id 9, soilMoist/soilTemp → id 8), prepared
      daily min/mean/max queries, JSON response with per-channel
      source/unit metadata
- [x] 1.2 Hardening: GET-only, input validation (channel whitelist, date
      regex + span cap 800 d), generic JSON errors (details to error_log
      only), nosniff header, no CORS/sessions; `router.php` dev router
      (403 on *.ini/dotfiles) + `.htaccess` (deny *.ini, -Indexes);
      `config.ini.template` committed, real config.ini gitignored
- [x] 1.3 Vite proxy `/php` → `127.0.0.1:9000` in orchard + www configs;
      verify via `php -S 127.0.0.1:9000` + curl: valid query, unknown
      channel, bad date, POST, `GET /php/config.ini` (403), and daily
      aggregates match a direct SQL readback

## 2. Orchard embed refactor

- [x] 2.1 Refactor `orchard/src/main.ts`: export `mountOrchard(host, opts)`
      with `{embed}` mode (hide compare panel/Kamera/footer; keep presets,
      cat, sky, scene day slider, compass), return controller
      `{setDay, onDay, rig, scene3}`; standalone path unchanged
- [x] 2.2 Regression-verify standalone orchard (5199): season label, presets,
      Kamera panel, compare panel, cat, `__scene3` keys, `npm run build`
- [x] 2.3 Commit the refactor as its own commit (safe rollback point)

## 3. imgsmear wrapped emit (submodule)

- [ ] 3.1 Add optional `wrapped` emit to `ideas/imgsmear/src/components/
      ImgSmear.vue` (both cpu + shader renderers, backward-compatible)
- [ ] 3.2 Commit inside the submodule, then bump the gitlink in wiese
      (nested-repo commit order)

## 4. www app skeleton

- [x] 4.1 Scaffold `www/` (Vue 3 + Vite + TS, port 5212, publicDir →
      orchard/public, alias to imgsmear, /php proxy), deps: vue,
      @capacitor/device, three@0.170, @vitejs/plugin-vue; Mohave fonts
      from `oldwww/fonts/Mohave/` into `orchard/public/fonts/Mohave/`
- [x] 4.2 Design tokens + layout grid in `styles.css` (cz palette, red
      accent, fixed-width readouts); global time store `store.ts`
- [x] 4.3 `OrchardPane.vue` mounts `mountOrchard(paneEl, {embed: true})`
      and wires the controller to the store

## 5. Header + data pane (real data + dummy Licht card)

- [x] 5.1 `App.vue` + `TimeSlider.vue`: header with title, global slider,
      date readout (German month names, tabular-nums fixed width)
- [x] 5.2 `api.ts` fetch layer + `curves.ts` (only the Licht dummy:
      mulberry32 intensity + RGB triplet, convoluted colour)
- [x] 5.3 `DataPane.vue` + `SeriesCard.vue`: six real cards (CO₂, temp,
      hum, solar, wind, Boden with moist+temp) — SVG curve over the
      data range, month ticks, red cursor at global day, value readout
      (— where empty), source subtitle from the endpoint
- [x] 5.4 `LightCard.vue`: single intensity chart (0–100 %) coloured by
      rgb × intensity/100, ONE combined colour bar (not 3 separate),
      labeled "Dummy-Daten — Wiesenstation (geplant)"

## 6. Photo streak

- [ ] 6.1 `StreakPanel.vue`: ImgSmear 6-photo sequencer (auto-advance on
      wrapped, band 0.12, forward-only), six date markers with click-to-
      jump, active marker highlight
- [ ] 6.2 Month sync both directions with loop guard: streak completion →
      setDay(photo doy, 'streak'); slider change → nearest-photo switch

## 7. Menu + info page

- [ ] 7.1 `MenuButton.vue` + `InfoPage.vue`: overlay with about text, link
      to https://critical-sensors.de/, complete credits list, Capacitor
      Device readout (platform/model/OS/screen); streak pauses while open
- [ ] 7.2 Sources footer under the streak section

## 8. Responsive + verification

- [ ] 8.1 Breakpoints: ≥1024px landscape two-pane (3D ~60%/data ~40%);
      portrait/narrow single column data → 3D → streak; touch targets ≥44px
- [ ] 8.2 Playwright checks at 1920×1024, 1024×768, 768×1024, 390×844:
      pane geometry per breakpoint, slider→scene/cards/streak sync,
      streak→scene day jump, wrap advance, info overlay content + pause
- [ ] 8.3 `npm run build` (www) + orchard `tsc && vite build` clean; no
      console/page errors on any viewport
- [ ] 8.4 Screenshots (all viewports, winter+summer) posted for the user's
      visual verdict against ideas/shot-001.png
- [ ] 8.5 Task checkboxes ticked only after own verification of each

## 9. Docs + trace

- [ ] 9.1 Update `orchard/README.md` (embed mode, php endpoint) + root
      `README.md` layout table (www/, orchard/public/php rows) +
      dashboard-plan.md status note
- [ ] 9.2 Commit; archive the change after final verification
      (`openspec archive dashboard-prototype -y`) with the archive in the
      same commit
