"""Доводка после pandoc: строки таблиц не рвутся между страницами, свойства документа."""
import sys

from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

USABLE_DXA = 9864  # A4 минус поля 1,8 см с каждой стороны

doc = Document(sys.argv[1])
for table in doc.tables:
    # Ширина колонок по содержимому: длинный текст шире, короткие числа узкие.
    columns = len(table.columns)
    weights = []
    for col in range(columns):
        lengths = sorted(len(row.cells[col].text) for row in table.rows)
        typical = lengths[int(len(lengths) * 0.8)]
        weights.append(max(6, min(typical, 70)) ** 0.8)
    widths = [USABLE_DXA * w / sum(weights) for w in weights]
    # Колонка не уже самого длинного слова в ней (≈115 dxa на знак в 9–10 pt плюс поля ячейки).
    minimums = [min(18, max(len(word) for row in table.rows for word in (row.cells[col].text.split() or [''])))
                * 115 + 230 for col in range(columns)]
    for _ in range(5):
        short = [i for i in range(columns) if widths[i] < minimums[i]]
        if not short:
            break
        need = sum(minimums[i] - widths[i] for i in short)
        donors = [i for i in range(columns) if i not in short and widths[i] > minimums[i]]
        spare = sum(widths[i] - minimums[i] for i in donors)
        for i in short:
            widths[i] = minimums[i]
        for i in donors:
            widths[i] -= need * (widths[i] - minimums[i]) / spare if spare else 0
    widths = [round(w) for w in widths]
    tblpr = table._tbl.tblPr
    tblw = tblpr.find(qn('w:tblW'))
    tblw.set(qn('w:type'), 'dxa')
    tblw.set(qn('w:w'), str(sum(widths)))
    layout = tblpr.find(qn('w:tblLayout'))
    if layout is None:
        layout = OxmlElement('w:tblLayout')
        for el in tblpr:
            if el.tag.split('}')[-1] in {'tblCellMar', 'tblLook', 'tblCaption', 'tblDescription'}:
                el.addprevious(layout)
                break
        else:
            tblpr.append(layout)
    layout.set(qn('w:type'), 'fixed')
    for grid_col, width in zip(table._tbl.tblGrid.findall(qn('w:gridCol')), widths):
        grid_col.set(qn('w:w'), str(width))
    for row in table.rows:
        for cell, width in zip(row.cells, widths):
            tcpr = cell._tc.get_or_add_tcPr()
            tcw = tcpr.find(qn('w:tcW'))
            if tcw is None:
                tcw = OxmlElement('w:tcW')
                tcpr.insert(0, tcw)
            tcw.set(qn('w:type'), 'dxa')
            tcw.set(qn('w:w'), str(width))
    for row in table.rows:
        trpr = row._tr.get_or_add_trPr()
        if trpr.find(qn('w:cantSplit')) is None:
            trpr.insert(0, OxmlElement('w:cantSplit'))
props = doc.core_properties
props.title = 'Сценарии ученика — как есть на проде (02.11.2026)'
props.subject = 'Maestro: все пути ученика в приложении, прод 941d30d'
props.author = 'Maestro'
props.keywords = ''
doc.save(sys.argv[2])
print('tables:', len(doc.tables))
