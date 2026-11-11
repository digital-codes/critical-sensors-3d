from playwright.sync_api import sync_playwright

HTML = open('/home/agent/projects/wiese/tmp/cat_build/view.html').read().replace(
    "const yaw = -0.10;",
    "const yaw = parseFloat(qs.get('yaw') || '-0.10');")
open('/home/agent/projects/wiese/tmp/cat_build/view.html', 'w').write(HTML)

D = '/home/agent/projects/wiese/tmp/cat_build'
with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox'])
    pg = b.new_page(viewport={'width': 900, 'height': 600})
    for yaw in ['0.3', '-0.3']:
        pg.goto(f'http://127.0.0.1:8001/view.html?file=cat_v26.glb&yaw={yaw}', timeout=30000)
        pg.wait_for_timeout(2200)
        pg.screenshot(path=f'{D}/v26_yaw{yaw}.png')
        print('shot', yaw)
    b.close()
