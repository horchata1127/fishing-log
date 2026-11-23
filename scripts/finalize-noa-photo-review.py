"""Freeze the explicitly inspected product IDs; never approve new research automatically."""
import json
import pathlib
import re

root = pathlib.Path(__file__).resolve().parents[1]
out = root / 'docs/noa-color-photos'
# Each image was visually inspected on 2026-11-23. Reissue-only evidence is excluded.
approved = set('''190913343 190913133 190913103 180545938 172647997 167608634 166352342
191995631 191995626 191995617 189679913 187095197 184568655 183533564 175616658 154667795 145668461
190951743 190951713 190951687 183533481 183533459 176993187 172648015 166352468
113407905 113407891 113407845 99940848 99940773 99940716 191995665 191995656 191995650
183651050 180545997 175617005 154666898 137516205 137515236 137515218
175616277 154669449 148327444 111535873 180546010 176993518 175617317 172648049 166352554
154657213 126506738 126506704 126506671 126506565 126506528 126506491 108305675
190934183 190934165 176993639 166352563 113407961 113407941 113407930 100207212 100207209 100207179
180546432 180546427 175618274 172357163 164474790 154655230 148341193'''.split())
rows = json.loads((out / 'REVIEW_CANDIDATES.json').read_text(encoding='utf8'))
selected = []
for row in rows:
    pid = re.search(r'pid=(\d+)', row['url'])[1]
    if pid not in approved:
        continue
    selected.append({k: v for k, v in row.items() if k not in ['inspectionPath', 'inspectionFile', 'approved']} | dict(
        checkedAt='2026-11-23', approved=True, photographedFaces='刻印面1面。反対面・UV/グロー発光は未確認。',
        verificationBasis='個別商品名・モデル・重量・色名を照合し、当該商品IDの画像を目視。台紙または刻印のモデル/重量を確認。モデル間の塗装共有は承認しない。',
        sourceName='城峰釣具店', rightsStatus='unknown', localAssetAdded=False))
assert len(selected) == len(approved), approved - {re.search(r'pid=(\d+)', r['url'])[1] for r in selected}
(out / 'REVIEWED_LINKS.json').write_text(json.dumps(selected, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
print('reviewed', len(selected))
