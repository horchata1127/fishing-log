"""Build an additive full release; never modify v1 or a device backup."""
import copy
import hashlib
import json
import pathlib

root = pathlib.Path(__file__).resolve().parents[1]
original = root / 'src/data/facility-master.v1.json'
raw = original.read_bytes()
master = json.loads(raw)
assert master['releaseOrder'] == 1 and len(master['facilities']) == 50
assert sum(len(f['zones']) for f in master['facilities']) == 73
assert not any('okutama' in f['id'] or '奥多摩フィッシングセンター' in f['name'] for f in master['facilities'])
source = 'https://www.okutama-fc.co.jp/okutama_fc_esa.html'
facility = dict(id='official:okutama-fishing-center', name='奥多摩フィッシングセンター', prefecture='東京都',
    address='東京都青梅市御岳2丁目333', facilityTypes=['stream', 'pond'], lureAllowed=True, operationStatus='open',
    officialUrl='https://www.okutama-fc.co.jp/', sourceUrl=source, verifiedAt='2026-11-21', aliases=[],
    zones=[dict(id='official:okutama-fishing-center:' + slug, name=name, sortOrder=i + 1, sourceUrl=source)
           for i, (slug, name) in enumerate([
               ('lure-stream', 'ルアー・フライ・テンカラ釣り場'), ('lure-pond', 'ポンドエリア'),
               ('beginner-bait', '初級者エサ釣り場'), ('general-bait', '一般エサ釣り場'), ('fishing-pond', '釣り堀エリア')])])
release = copy.deepcopy(master)
release.update(masterVersion='1.1.0-rc44-okutama-51f78z', releaseOrder=2)
release['facilities'].append(facility)
out = root / 'src/data/facility-master.rc44.json'
out.write_text(json.dumps(release, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
assert original.read_bytes() == raw
assert release['facilities'][:-1] == master['facilities']
print('releaseOrder 2: 51 facilities / 78 zones; existing 50/73 unchanged')
print('v1 SHA-256:', hashlib.sha256(raw).hexdigest())
