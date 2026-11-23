"""Public HTML rechecks only; never request image URLs or write personal data."""
import hashlib
import html
import json
import pathlib
import re
import time
import urllib.request

root = pathlib.Path(__file__).resolve().parents[1]
folder = root / 'docs/noa-retailer-product-links'
baseline = json.loads((root / 'docs/noa-photo-coverage-followup/AUDIT.json').read_text(encoding='utf8'))
urls = sorted({r['productUrl'] for r in baseline['rows'] if r['productUrl']})
rows = []
for url in urls:
    row = dict(url=url, checkedAt='2026-11-23')
    try:
        time.sleep(1)
        with urllib.request.urlopen(url, timeout=20) as response:
            body = response.read()
            page = body.decode('euc_jis_2004' if 'fishing-shop-jh' in url else 'utf8')
            title = re.search(r'<meta property="og:title" content="([^"]+)"', page)
            image = re.search(r'<meta property="og:image" content="([^"]+)"', page)
            row.update(httpStatus=response.status, pageSha256=hashlib.sha256(body).hexdigest(),
                       title=html.unescape(title[1]) if title else '',
                       hasProductImageReference=bool(image), janEldoradoMatched='4573151264752' in page if '176993639' in url else None)
    except Exception as error:
        row['error'] = str(error)
    rows.append(row)
    (folder / 'CURRENT_LINK_HEALTH.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
    print(len(rows), '/', len(urls), row.get('httpStatus',row.get('error')), flush=True)
