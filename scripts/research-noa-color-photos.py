"""Read public product metadata serially; cache inspection images outside the repo.

Never import a user backup into the application or publish its private records.
Run from the repository root. Outputs are evidence, not automatic approval of links.
"""
import hashlib
import html
import json
import pathlib
import re
import tempfile
import time
import urllib.parse
import urllib.request
import unicodedata

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/noa-color-photos'
OUT.mkdir(exist_ok=True)
CACHE = pathlib.Path(tempfile.gettempdir()) / 'fishing-log-noa-research'
CACHE.mkdir(exist_ok=True)


def fetch(url):
    time.sleep(1)
    request = urllib.request.Request(url, headers={'User-Agent': 'FishingLogCatalogResearch/1.0'})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read()


def anchors(page):
    return [(html.unescape(a), html.unescape(re.sub('<[^>]+>', '', b)).strip())
            for a, b in re.findall(r'''<a[^>]+href=["']([^"']+)["'][^>]*>(.*?)</a>''', page, re.S)]


def main():
    raw = (ROOT / 'docs/rc45/fishing-log-backup-2026-11-23.json').read_bytes()
    data = json.loads(raw.decode('utf-8-sig'))['data']
    makers = [m for m in data['lureManufacturers'] if m['name'] == 'RODIO CRAFT']
    series = [s for s in data['lureSeries'] if s['manufacturerId'] in {m['id'] for m in makers} and s['name'].startswith('NOA')]
    models = [m for m in data['lureModels'] if m['seriesId'] in {s['id'] for s in series}]
    variants = [v for v in data['lureVariants'] if v['modelId'] in {m['id'] for m in models}]
    (OUT / 'CATALOG.json').write_text(json.dumps(dict(checkedAt='2026-11-23', backupSha256=hashlib.sha256(raw).hexdigest(),
        manufacturers=makers, series=series, models=models, variants=variants), ensure_ascii=False, indent=2)+'\n', encoding='utf8')
    # HTML only, no auth or access challenge workarounds.
    base = 'https://fishing-shop-jh.com/'
    robots = fetch(base + 'robots.txt').decode('utf8')
    import urllib.robotparser
    policy = urllib.robotparser.RobotFileParser()
    policy.parse(robots.splitlines())
    parent = base + '?mode=grp&gid=1269245&sort=n'
    assert policy.can_fetch('FishingLogCatalogResearch', parent)
    page = fetch(parent).decode('euc_jis_2004')
    scopes = [(urllib.parse.urljoin(base, a), t) for a, t in anchors(page)
              if 'gid=' in a and re.fullmatch(r'NOA(?:-S|Jr)?\s*[\d.]+g', t)]
    print('scopes', scopes, flush=True)
    candidates = {}
    for url, scope in scopes:
        if scope in ['NOA 1.0g', 'NOA 2.6g']:
            continue
        assert policy.can_fetch('FishingLogCatalogResearch', url)
        try:
            listing = fetch(url).decode('euc_jis_2004')
            for a, title in anchors(listing):
                if 'pid=' in a and 'ノア' in title:
                    candidates[urllib.parse.urljoin(base, a)] = title
        except Exception as error:
            print(scope, str(error), flush=True)
    previous = json.loads((ROOT / 'docs/rc43/NOA_LINK_RESEARCH.json').read_text(encoding='utf8'))
    known = {r['sourceUrl'] for r in previous['candidates'] if r['selected']}
    old_audit = json.loads((ROOT / 'docs/rc43/NOA_COLOR_AUDIT.json').read_text(encoding='utf8'))
    def fold(value):
        return re.sub(r'[\s.・()（）/\-]', '', unicodedata.normalize('NFKC', value)).lower()
    missing = [fold(g['colorName']) for g in old_audit['groups'] if not g.get('externalProductUrl')]
    extra = ['エルドラド', '2024', 'US-', 'K.F', 'N.O', 'N.0', 'T.S', '25セレクト']
    rows = []
    # Fetch all missing product candidates; selecting a page still needs human/model review.
    for url, title in candidates.items():
        if url in known:
            continue
        if not any(name in fold(title) for name in missing) and not any(name in title for name in extra):
            continue
        assert policy.can_fetch('FishingLogCatalogResearch', url)
        try:
            raw = fetch(url)
            page = raw.decode('euc_jis_2004')
            image = re.search(r'<meta property="og:image" content="([^"]+)"', page)
            rows.append(dict(url=url, title=title, pageSha256=hashlib.sha256(raw).hexdigest(),
                imageUrl=html.unescape(image[1]) if image else '', rightsStatus='unknown', localAssetAdded=False))
        except Exception as error:
            rows.append(dict(url=url, title=title, error=str(error)))
        print(title, flush=True)
        (OUT / 'SOURCE_PAGES.json').write_text(json.dumps(dict(checkedAt='2026-11-23', scopes=scopes, candidates=rows), ensure_ascii=False, indent=2)+'\n', encoding='utf8')
    (OUT / 'SOURCE_PAGES.json').write_text(json.dumps(dict(checkedAt='2026-11-23', scopes=scopes, candidates=rows), ensure_ascii=False, indent=2)+'\n', encoding='utf8')


if __name__ == '__main__':
    main()
