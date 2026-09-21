"""Read the supplied workbook. Preserve interval-level precision and raw labels."""
import argparse
import hashlib
import json
import re
from pathlib import Path
import openpyxl

ROOT = Path(__file__).resolve().parents[1]

def convert(path):
    workbook = openpyxl.load_workbook(path, data_only=True, read_only=True)
    annotations = []
    for row_number, (time, label) in enumerate(workbook['Sheet1'].iter_rows(min_row=2, max_col=2, values_only=True), 2):
        if not time or not label:
            continue
        times = re.findall(r'(\d+):(\d+):(\d+)', str(time))
        if len(times) != 2:
            raise ValueError(f'Invalid interval at row {row_number}')
        start, end = [int(h)*3600+int(m)*60+int(s) for h,m,s in times]
        technique = ('up-glide' if '上滑' in label else 'down-glide' if '下滑' in label else
                     'vibrato' if '揉弦' in label else 'slide-vibrato' if '滑柔' in label else
                     'dayin' if '打音' in label else 'return-glide' if '回滑音' in label else None)
        if technique is None:
            raise ValueError(f'Unknown label: {label}')
        annotations.append(dict(id=f'manual-{row_number-1:02}', start=start, end=end,
            technique=technique, label=label, description=label, repeatCount=4 if '四次' in label else 1,
            dynamics='crescendo' if '渐强' in label else 'diminuendo' if '渐弱' in label else 'steady',
            reviewStatus='confirmed', annotationSource='human-workbook', enabled=True,
            source=dict(sheet='Sheet1',row=row_number,timeText=time,label=label),
            timingPrecision='interval-seconds'))
    song = json.loads((ROOT/'src/data/song.json').read_text(encoding='utf-8'))
    song.update(schemaVersion=2, annotationVersion=2, annotationSource='human-workbook',
        reviewStatus='confirmed', labelMode='human', annotations=annotations, rhythmTargets=[],
        annotationWorkbook=dict(filename=Path(path).name, sha256=hashlib.sha256(Path(path).read_bytes()).hexdigest()),
        notes=['人工表格给出13个秒级区间。保留原始技法名称，包括“滑柔”。',
               '四连动作在人工区间内等分为四个游戏落点；细分时间属于游戏编排，不是人工逐音时间。',
               '节拍由当前音频自动估算。未标注区间只编排中性的节拍音符，不推测技法。'])
    (ROOT/'src/data/song.json').write_text(json.dumps(song,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f'Imported {len(annotations)} manual intervals from Sheet1!A2:B14')

if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('workbook')
    convert(parser.parse_args().workbook)
