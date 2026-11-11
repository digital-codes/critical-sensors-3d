from playwright.sync_api import sync_playwright

D = '/home/agent/projects/wiese/tmp/cat_build'
import sys
files = sys.argv[1:] or ['cat_v1']
with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox'])
    pg = b.new_page(viewport={'width': 900, 'height': 600})
    errs = []
    pg.on('console', lambda m: errs.append(m.text))
    for f in files:
        for mode in ['shaded', 'wire']:
            errs.clear()
            pg.goto(f'http://127.0.0.1:8001/view.html?file={f}.glb&mode={mode}', timeout=30000)
            pg.wait_for_timeout(2500)
            pg.screenshot(path=f'{D}/shot_{f}_{mode}.png')
            print(f, mode, 'ready:', pg.evaluate('window.__ready'), errs[-2:])
    b.close()
