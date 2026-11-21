"""Read-only official comparison; never writes the supplied backup."""
import concurrent.futures
import csv
import hashlib
import html
import json
import pathlib
import re
import subprocess
import unicodedata

ROOT = pathlib.Path(__file__).resolve().parents[1]
URLS = dict(zip(['45F1', '45S', '48F', '60F1', '60SHF', '60SS'], [
    'v2p2hkc', '2023/05/09/08/50/wp91bik', '2a2z2da', 'tem1r2s', 'eqm75ws', '2023/05/09/08/48/m4bx7oh']))
BACKUP = ROOT / 'docs/rc42/fishing-log-backup-2026-11-21.json'

def text(value):
    return html.unescape(re.sub('<[^>]+>', '', value)).strip()

def key(value):
    return re.sub(r'\s+', '', unicodedata.normalize('NFKC', value)).replace('レッドグロー', 'RG').lower()

def fetch(pair):
    model, slug = pair
    url = 'https://www.daiwa.com/jp/product/' + slug
    # curl uses the OS certificate store on Windows; keep TLS verification enabled.
    raw = subprocess.run(['curl', '--fail', '--silent', '--show-error', '--location', '--max-time', '40', url],
                         check=True, capture_output=True).stdout
    page = raw.decode('utf-8')
    rows = []
    for tr in re.findall(r'<tr\b[^>]*>(.*?)</tr>', page, re.S):
        cells = [text(c) for c in re.findall(r'<t[dh]\b[^>]*>(.*?)</t[dh]>', tr, re.S)]
        if cells and re.fullmatch(r'\d{13}', cells[-1]):
            name = cells[0].split('　', 1)[-1]
            rows.append(dict(itemName=cells[0], name=unicodedata.normalize('NFKC', name), jan=cells[-1], spec=cells[1:-1]))
    assert rows and len({r['jan'] for r in rows}) == len(rows), model
    gallery = re.search(r'<ul class="item_view slider">(.*?)</ul>', page, re.S).group(1)
    images = []
    for li in re.findall(r'<li>(.*?)</li>', gallery, re.S):
        image = re.search(r'<img[^>]*src="([^"]+)"', li)
        caption = re.search(r'<p class="caption">(.*?)</p>', li, re.S)
        if image and caption:
            images.append(dict(url=html.unescape(image.group(1)), name=text(caption.group(1))))
    # 48F gallery typo: カゲボウシ; same page's SKU table says カゲホウシ.
    def image_key(name):
        return key('カゲホウシ' if model == '48F' and name == 'カゲボウシ' else name)
    assert {image_key(i['name']) for i in images} == {key(c['name']) for c in rows}, model
    for row in rows:
        image = next(i for i in images if image_key(i['name']) == key(row['name']))
        row['imageUrl'] = image['url']
        row['galleryName'] = image['name']
        row['productCode'] = None  # No independent product code column on these official pages.
        digits = list(map(int, row['jan']))
        assert (10 - sum(n * (1 if i % 2 == 0 else 3) for i, n in enumerate(digits[:12])) % 10) % 10 == digits[-1]
    return dict(model=model, sourceUrl=url, pageSha256=hashlib.sha256(raw).hexdigest(), colors=rows, images=images)

def main():
    raw = BACKUP.read_bytes()
    data = json.loads(raw.decode('utf-8-sig'))['data']
    results = list(concurrent.futures.ThreadPoolExecutor(max_workers=6).map(fetch, URLS.items()))
    for result in results:
        matches = [m for m in data['lureModels'] if m['name'] == 'PRESSO DOUBLE CLUTCH ' + result['model']]
        assert len(matches) == 1, result['model']
        model = matches[0]
        existing = [v for v in data['lureVariants'] if v['modelId'] == model['id']]
        result['existingModel'] = model
        parent = next(s for s in data['lureSeries'] if s['id'] == model['seriesId'])
        result['existingSeries'] = parent
        result['existingManufacturer'] = next(m for m in data['lureManufacturers'] if m['id'] == parent['manufacturerId'])
        assert parent['name'] == 'PRESSO DOUBLE CLUTCH F'
        assert result['existingManufacturer']['name'] in ['ダイワ', 'DAIWA']
        result['existingCount'] = len(existing)
        for color in result['colors']:
            found = [v for v in existing if key(v['colorName']) == key(color['name'])]
            color['existing'] = found
            color['status'] = 'hold' if len(found) > 1 else 'existing' if found else 'add'
        result['existingOnly'] = [v for v in existing if not any(key(v['colorName']) == key(c['name']) for c in result['colors'])]
        print(result['model'], 'official', len(result['colors']), 'existing', len(existing), 'add', [c['name'] for c in result['colors'] if c['status'] == 'add'])
    out = dict(checkedAt='2026-11-21', backupSha256=hashlib.sha256(raw).hexdigest(), models=results)
    (ROOT / 'docs/rc42/RC42_OFFICIAL_AUDIT.json').write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    with (ROOT / 'docs/rc42/RC42_COLOR_COMPARISON.csv').open('w', encoding='utf-8-sig', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['model', 'officialName', 'JAN', 'productCode', 'existingId', 'existingName', 'status', 'sourceUrl', 'imageUrl'])
        for m in results:
            for c in m['colors']:
                writer.writerow([m['model'], c['name'], c['jan'], '', '|'.join(str(v['id']) for v in c['existing']), '|'.join(v['colorName'] for v in c['existing']), c['status'], m['sourceUrl'], c['imageUrl']])
    assert BACKUP.read_bytes() == raw

if __name__ == '__main__':
    main()
