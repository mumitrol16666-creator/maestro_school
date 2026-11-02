"""Готовит markdown документа 19 для Word: якоря у заголовков, кликабельное оглавление, без линий-разделителей."""
import re
import sys
from pathlib import Path

src = Path(sys.argv[1]).read_text(encoding='utf-8').splitlines()
out = []
in_toc = False
for line in src:
    if line == '## Оглавление':
        in_toc = True
        out.append(line + ' {#toc}')
        continue
    if line == '---':
        in_toc = False
        continue
    if in_toc:
        m = re.match(r'^(\s*)- ([СН])-(\d+)\. (.*)$', line)
        if m:
            anchor = ('c' if m.group(2) == 'С' else 'n') + m.group(3)
            line = f'{m.group(1)}- [{m.group(2)}-{m.group(3)}. {m.group(4)}](#{anchor})'
        m = re.match(r'^- (Замечено при чтении — раздел (\d+))$', line)
        if m:
            line = f'- [{m.group(1)}](#z{m.group(2)})'
        m = re.match(r'^\*\*(\d+)\. (.*)\*\*$', line)
        if m:
            line = f'**[{m.group(1)}. {m.group(2)}](#s{m.group(1)})**'
        out.append(line)
        continue
    m = re.match(r'^#### ([СН])-(\d+)\. ', line)
    if m:
        line += ' {#' + ('c' if m.group(1) == 'С' else 'n') + m.group(2) + '}'
    m = re.match(r'^## (\d+)\. ', line)
    if m:
        line += ' {#s' + m.group(1) + '}'
    m = re.match(r'^### Замечено при чтении — раздел (\d+)$', line)
    if m:
        line += ' {#z' + m.group(1) + '}'
    out.append(line)

def cells(row):
    return [c.strip() for c in row.strip().strip('|').split('|')]


# Ширина колонок в таблицах по содержимому: pandoc берёт пропорции из числа дефисов в строке-разделителе.
SEPARATOR = re.compile(r'^\|(\s*:?-{3,}:?\s*\|)+\s*$')
i = 0
while i < len(out):
    if i > 0 and SEPARATOR.match(out[i]) and out[i - 1].startswith('|'):
        start, end = i - 1, i + 1
        while end < len(out) and out[end].startswith('|'):
            end += 1
        rows = [cells(out[start])] + [cells(r) for r in out[i + 1:end]]
        n = len(rows[0])
        weights = []
        for col in range(n):
            lengths = sorted(len(r[col]) for r in rows if col < len(r))
            typical = lengths[int(len(lengths) * 0.8)] if lengths else 3
            weights.append(max(6, min(typical, 70)) ** 0.8)
        total = sum(weights)
        out[i] = '|' + '|'.join('-' * max(3, round(60 * w / total)) for w in weights) + '|'
        i = end
    i += 1

Path(sys.argv[2]).write_text('\n'.join(out) + '\n', encoding='utf-8')
print('links in toc:', sum(1 for l in out if '](#' in l))
