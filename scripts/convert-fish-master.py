"""Excel原本を読み取り専用で変換する。標準ライブラリのみ、推測補完なし。"""
import hashlib
import json
import sys
from collections import Counter
from pathlib import Path
import xml.etree.ElementTree as ET
from zipfile import ZipFile

sys.stdout.reconfigure(encoding='utf-8')

source = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(r'C:\Users\plain\source\fishing-log-notes\fishing-log-fish-master-reviewed-2026-10-10.xlsx')
target = Path(__file__).resolve().parents[1] / 'src' / 'data' / 'fishMaster.ts'
if not source.is_file():
    raise SystemExit(f'正式原本がありません: {source}')
ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
def string_text(node):
    # 表示文字列だけを取得。Excelのふりがな・書式情報を名称へ混ぜない。
    return ''.join(child.text or '' if child.tag.endswith('}t') else
                   ''.join(text.text or '' for text in child.findall('s:t', ns))
                   if child.tag.endswith('}r') else '' for child in node)

with ZipFile(source) as book:
    shared = []
    if 'xl/sharedStrings.xml' in book.namelist():
        shared = [string_text(row) for row in ET.fromstring(book.read('xl/sharedStrings.xml'))]
    relationships = {row.attrib['Id']: row.attrib['Target'] for row in ET.fromstring(book.read('xl/_rels/workbook.xml.rels'))}
    sheets = {}
    for sheet in ET.fromstring(book.read('xl/workbook.xml')).find('s:sheets', ns):
        location = relationships[sheet.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']]
        location = location.lstrip('/') if location.startswith('/') else 'xl/' + location
        rows = []
        for row in ET.fromstring(book.read(location)).findall('.//s:sheetData/s:row', ns):
            cells = {}
            for cell in row:
                column = ''.join(c for c in cell.attrib['r'] if c.isalpha())
                value = cell.find('s:v', ns)
                if cell.attrib.get('t') == 's':
                    text = shared[int(value.text)]
                elif cell.attrib.get('t') == 'inlineStr':
                    text = string_text(cell.find('s:is', ns))
                else:
                    text = value.text if value is not None else ''
                cells[column] = text
            if any(cells.values()):
                rows.append(cells)
        headers = rows.pop(0)
        sheets[sheet.attrib['name']] = [{name: row.get(column, '') for column, name in headers.items()} for row in rows]

assert set(sheets) == {'初期マスター', 'ブランド放流確認', '保留・対象外', '判定方針'}, sheets.keys()
all_rows = sheets['初期マスター']
assert len(all_rows) == 44, len(all_rows)
assert list(all_rows[0]) == ['fish_id', 'group', 'display_name', 'aliases', 'region', 'lineage_or_type', 'source_status', 'notes', 'source_url']
selected = [row for row in all_rows if row['group'] in ('ニジマス', 'イロモノ') or
            (row['group'] == 'ブランドマス' and row['source_status'] == '管釣り実績確認')]
assert Counter(row['group'] for row in selected) == {'ニジマス': 1, 'イロモノ': 15, 'ブランドマス': 21}
assert len({row['fish_id'] for row in all_rows}) == 44
assert len({row['display_name'] for row in selected}) == 37
target.parent.mkdir(parents=True, exist_ok=True)
payload = {'sourceFile': source.name, 'sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'sheets': sheets}
target.write_text('// scripts/convert-fish-master.pyで原本から生成。原本情報を補完・正規化しない。\n'
                  'export const fishMasterSource = ' + json.dumps(payload, ensure_ascii=False, indent=2) + ' as const\n'
                  'export const initialFishMaster = fishMasterSource.sheets["初期マスター"].filter(row =>\n'
                  '  row.group === "ニジマス" || row.group === "イロモノ" ||\n'
                  '  (row.group === "ブランドマス" && row.source_status === "管釣り実績確認"))\n', encoding='utf-8')
print(json.dumps({'sheets': {name: len(rows) for name, rows in sheets.items()}, 'initial': dict(Counter(row['group'] for row in selected)),
                 'excluded': [row for row in all_rows if row not in selected], 'selected': [{k: row[k] for k in ('fish_id','display_name','group','source_status')} for row in selected]}, ensure_ascii=False, indent=2))
