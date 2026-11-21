"""Fetch public product HTML only, serially. Never request image URLs."""
import hashlib
import html
import json
import pathlib
import re
import subprocess
import time
import unicodedata
import urllib.robotparser

root = pathlib.Path(__file__).resolve().parents[1]
definitions = json.loads((root / 'src/data/noaSharedColors.ts').read_text(encoding='utf8').split(' = ', 1)[1].rsplit(' as const', 1)[0])
def norm(s):
    return re.sub(r'\s', '', unicodedata.normalize('NFKC', s)).lower()

def get_html(url):
    return subprocess.run(['curl', '--fail', '--silent', '--show-error', '--location', '--max-time', '25',
                           '--user-agent', 'FishingLogCatalogResearch/1.0', url], check=True, capture_output=True).stdout

robots = urllib.robotparser.RobotFileParser()
robots.parse(get_html('https://fishing-shop-jh.com/robots.txt').decode('utf8').splitlines())
listing_url = 'https://fishing-shop-jh.com/?mode=grp&gid=1274891&sort=n'
assert robots.can_fetch('FishingLogCatalogResearch', listing_url)
time.sleep(1)
listing = get_html(listing_url).decode('euc_jis_2004')
results = []
links = []
for url, body in re.findall('<a[^>]+href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', listing, re.S):
    title = html.unescape(re.sub('<[^>]+>', '', body)).strip()
    if 'pid=' not in url or 'NOA 1.8g' not in title:
        continue
    label = title.split('NOA 1.8g', 1)[1].strip().lstrip('#')
    match = re.match(r'^(\d+)\s+(.+)$', unicodedata.normalize('NFKC', label))
    code, name = (match[1], match[2]) if match else ('', label)
    definition = next((c for c in definitions if c['code'] == code and norm(c['name']) == norm(name)), None)
    # Explicitly reviewed source spelling, same numbered regular color.
    if not definition and code == '5' and norm(name) == norm('鉄板!!南関東'):
        definition = next(c for c in definitions if c['code'] == '5')
    item = dict(sourceUrl='https://fishing-shop-jh.com/' + html.unescape(url), productTitle=title,
                rightsStatus='unknown', localDownload=False, selected=False)
    if definition:
        assert robots.can_fetch('FishingLogCatalogResearch', item['sourceUrl'])
        time.sleep(1)
        raw = get_html(item['sourceUrl'])
        page = raw.decode('euc_jis_2004')
        pid = re.search(r'pid=(\d+)', url)[1]
        image = re.search(r'<meta property="og:image" content="([^"]+)"', page)
        page_title = html.unescape(re.search(r'<meta property="og:title" content="([^"]+)"', page)[1])
        # Related-product thumbnails and generic banners are not the main photo.
        confirmed = image and ('/product/' + pid + '.') in image[1] and title in page_title
        item.update(colorName=definition['name'], colorCode=definition['code'], pageSha256=hashlib.sha256(raw).hexdigest(),
                    imageReferenceUrl=html.unescape(image[1]) if image else '',
                    janCodes=list(dict.fromkeys(re.findall(r'\b\d{13}\b', page))), selected=bool(confirmed),
                    verificationBasis='個別商品名・カラー番号・当該商品IDのog:imageをHTMLで照合。画像バイナリは取得しない。')
        if confirmed:
            links.append(dict(colorName=definition['name'], colorCode=definition['code'], externalProductUrl=item['sourceUrl'], sourceName='城峰釣具店', lastCheckedAt='2026-11-21'))
    else:
        item['holdReason'] = '既存カラーとの正式名・限定区分の対応を確定できないため不採用。代表画像・似た色を流用しない。'
    results.append(item)

(root / 'docs/rc43/NOA_LINK_RESEARCH.json').write_text(json.dumps(dict(checkedAt='2026-11-21',
    sourceListing='https://fishing-shop-jh.com/?mode=grp&gid=1274891&sort=n', candidates=results), ensure_ascii=False, indent=2)+'\n', encoding='utf8')
(root / 'src/data/noaExternalLinks.ts').write_text('// RC43: selected individual product pages, metadata only. No image assets.\nexport const noaExternalLinks = '
    + json.dumps(links, ensure_ascii=False, indent=2) + ' as const\n', encoding='utf8')
print('candidates', len(results), 'selected single-site individual links', len(links), 'image binaries downloaded', 0)
