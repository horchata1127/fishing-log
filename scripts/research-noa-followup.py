"""Read-only public catalog extraction and source rechecks. No image redistribution.

Usage: python scripts/research-noa-followup.py --backup <private local JSON>
Only NOA catalog fields, HTTP evidence and hashes are written to docs.
"""
import argparse
import hashlib
import html
import json
import pathlib
import re
import time
import urllib.request

root = pathlib.Path(__file__).resolve().parents[1]
out = root / 'docs/noa-photo-coverage-followup'
out.mkdir(exist_ok=True)
sha = lambda b: hashlib.sha256(b).hexdigest()


def get(url):
    time.sleep(1)
    with urllib.request.urlopen(url, timeout=25) as response:
        return response.read(), response.status, response.url


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--backup', required=True)
    parser.add_argument('--recheck-links', action='store_true')
    args = parser.parse_args()
    raw = pathlib.Path(args.backup).read_bytes()
    data = json.loads(raw.decode('utf-8-sig'))['data']
    makers = [m for m in data['lureManufacturers'] if m['name'] == 'RODIO CRAFT']
    series = [s for s in data['lureSeries'] if s['manufacturerId'] in {m['id'] for m in makers} and s['name'].startswith('NOA')]
    models = [m for m in data['lureModels'] if m['seriesId'] in {s['id'] for s in series}]
    variants = [v for v in data['lureVariants'] if v['modelId'] in {m['id'] for m in models}]
    catalog = dict(checkedAt='2026-11-23', backupSha256=sha(raw), manufacturers=makers, series=series, models=models, variants=variants)
    (out / 'CATALOG.json').write_text(json.dumps(catalog, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
    prior_path = out / 'FORODOX_SOURCES.json'
    prior = json.loads(prior_path.read_text(encoding='utf8')) if prior_path.exists() else []
    rows = []
    for slug, model in [('noa-15', 'NOA 1.5g'), ('noa-18', 'NOA 1.8g'), ('noa-s10', 'NOA S 1.0g'), ('noa-s14', 'NOA S 1.4g')]:
        url = f'https://store.shopping.yahoo.co.jp/openwater/{slug}-forodox.html'
        row = dict(url=url, modelName=model, collaboration='2026 FORODOX: RODIO CRAFT / FOCUS / Deep Paradox',
                   rightsStatus='unknown', embedded=False, checkedAt='2026-11-23')
        try:
            body, status, resolved = get(url)
            page = body.decode('utf8')
            title = re.search(r'<title>(.*?)</title>', page, re.S)
            images = list(dict.fromkeys(re.findall(r'https://item-shopping\.c\.yimg\.jp/i/n/openwater_'+slug+r'-forodox[^"<>\\\s]*', page)))
            row.update(httpStatus=status, resolvedUrl=resolved, pageSha256=sha(body), title=html.unescape(title[1]) if title else '', images=[])
            for image_url in images:
                inspected = next((image for source in prior for image in source.get('images', []) if image['url'] == image_url), None)
                row['images'].append(inspected or dict(url=image_url, visualReview='pending'))
        except Exception as error:
            row['error'] = str(error)
        rows.append(row)
    (out / 'FORODOX_SOURCES.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
    if args.recheck_links:
        old = json.loads((root / 'docs/noa-color-photos/REVIEWED_LINKS.json').read_text(encoding='utf8'))
        common = json.loads((root / 'docs/rc43/NOA_LINK_RESEARCH.json').read_text(encoding='utf8'))
        urls = list(dict.fromkeys([r['url'] for r in old]+[r['sourceUrl'] for r in common['candidates'] if r['selected']]))
        check_path = out / 'EXISTING_LINK_RECHECK.json'
        checks = json.loads(check_path.read_text(encoding='utf8')) if check_path.exists() else []
        for url in urls:
            if any(c['url'] == url and c.get('httpStatus') == 200 for c in checks):
                continue
            check = dict(url=url, checkedAt='2026-11-23', previousImageSha256=next((r['imageSha256'] for r in old if r['url'] == url), None))
            try:
                body, status, resolved = get(url)
                page = body.decode('euc_jis_2004')
                image = re.search(r'<meta property="og:image" content="([^"]+)"', page)
                title = re.search(r'<meta property="og:title" content="([^"]+)"', page)
                check.update(httpStatus=status, resolvedUrl=resolved, pageSha256=sha(body),
                             title=html.unescape(title[1]) if title else '', imageUrl=html.unescape(image[1]) if image else '',
                             eldoradoJanMatched='4573151264752' in page if '176993639' in url else None)
            except Exception as error:
                check['error'] = str(error)
            checks.append(check)
            (out / 'EXISTING_LINK_RECHECK.json').write_text(json.dumps(checks, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
            print(len(checks), len(urls), check.get('httpStatus', check.get('error')), flush=True)
    assert sha(pathlib.Path(args.backup).read_bytes()) == sha(raw), 'Private source changed during read-only research'
    print('catalog', len(models), len(variants), 'source SHA', sha(raw), flush=True)


if __name__ == '__main__':
    main()
