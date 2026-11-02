"""Шаблон стилей для pandoc: A4, Arial, сдержанные заголовки, таблицы с рамками, номера страниц."""
import sys

from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

SRC, DEST = sys.argv[1], sys.argv[2]
doc = Document(SRC)
styles = doc.styles
FONT = 'Arial'


def insert_before(parent, child, later):
    """Вставляет child перед первым из элементов, которые по схеме идут после него."""
    for el in parent:
        if el.tag.split('}')[-1] in later:
            el.addprevious(child)
            return
    parent.append(child)

# Шрифт по умолчанию — явно Arial вместо тем, язык русский.
defaults = styles.element.find(qn('w:docDefaults'))
rpr = defaults.find(qn('w:rPrDefault')).find(qn('w:rPr'))
fonts = rpr.find(qn('w:rFonts'))
for attr in list(fonts.attrib):
    del fonts.attrib[attr]
for k in ('ascii', 'hAnsi', 'eastAsia', 'cs'):
    fonts.set(qn('w:' + k), FONT)
rpr.find(qn('w:sz')).set(qn('w:val'), '20')
rpr.find(qn('w:szCs')).set(qn('w:val'), '20')
rpr.find(qn('w:lang')).set(qn('w:val'), 'ru-RU')


def set_font(style, size=None, bold=None, color='1A1A1A', font=FONT, italic=None):
    rpr = style.element.get_or_add_rPr()
    old = rpr.find(qn('w:rFonts'))
    if old is not None:
        rpr.remove(old)
    f = OxmlElement('w:rFonts')
    for k in ('ascii', 'hAnsi', 'eastAsia', 'cs'):
        f.set(qn('w:' + k), font)
    rpr.insert(0, f)
    old_color = rpr.find(qn('w:color'))
    if old_color is not None:
        rpr.remove(old_color)
    if size:
        style.font.size = Pt(size)
    if bold is not None:
        style.font.bold = bold
    if italic is not None:
        style.font.italic = italic
    if color:
        style.font.color.rgb = RGBColor.from_string(color)


def spacing(style, before, after, line=None):
    pf = style.paragraph_format
    pf.space_before, pf.space_after = Pt(before), Pt(after)
    if line:
        pf.line_spacing = line


def border(style, side, color='D0D0D0', size=4, space=6):
    ppr = style.element.get_or_add_pPr()
    bdr = ppr.find(qn('w:pBdr'))
    if bdr is None:
        bdr = OxmlElement('w:pBdr')
        insert_before(ppr, bdr, {'shd', 'tabs', 'suppressAutoHyphens', 'kinsoku', 'wordWrap', 'overflowPunct',
                                 'topLinePunct', 'autoSpaceDE', 'autoSpaceDN', 'bidi', 'adjustRightInd',
                                 'snapToGrid', 'spacing', 'ind', 'contextualSpacing', 'mirrorIndents',
                                 'suppressOverlap', 'jc', 'textDirection', 'textAlignment', 'textboxTightWrap',
                                 'outlineLvl', 'divId', 'cnfStyle', 'rPr', 'sectPr', 'pPrChange'})
    el = OxmlElement('w:' + side)
    for k, v in (('val', 'single'), ('sz', str(size)), ('space', str(space)), ('color', color)):
        el.set(qn('w:' + k), v)
    bdr.append(el)


for name in ('Normal', 'Body Text', 'First Paragraph', 'Compact'):
    set_font(styles[name], size=10)
spacing(styles['Body Text'], 0, 5, 1.1)
spacing(styles['Compact'], 0, 2, 1.1)

set_font(styles['Heading 1'], 20, True, '111111')
spacing(styles['Heading 1'], 0, 10)
set_font(styles['Heading 2'], 16, True, '8A6A1F')
spacing(styles['Heading 2'], 0, 8)
styles['Heading 2'].paragraph_format.page_break_before = True
border(styles['Heading 2'], 'bottom', 'C59A44', 8, 4)
set_font(styles['Heading 3'], 12.5, True, '111111')
spacing(styles['Heading 3'], 16, 4)
set_font(styles['Heading 4'], 11, True, '1F3A5F', italic=False)
spacing(styles['Heading 4'], 14, 3)
border(styles['Heading 4'], 'top', 'D9D9D9', 4, 6)
set_font(styles['Verbatim Char'], 8.5, None, '5A5A5A', 'Consolas')
set_font(styles['Hyperlink'], None, None, '1F4E8C')

# Таблицы: тонкие серые рамки, серая шапка.
table = styles['Table'].element
tblpr = table.find(qn('w:tblPr'))
borders = OxmlElement('w:tblBorders')
for side in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'):
    el = OxmlElement('w:' + side)
    for k, v in (('val', 'single'), ('sz', '4'), ('space', '0'), ('color', 'BFBFBF')):
        el.set(qn('w:' + k), v)
    borders.append(el)
insert_before(tblpr, borders, {'shd', 'tblLayout', 'tblCellMar', 'tblLook', 'tblCaption', 'tblDescription'})
for cell_mar in tblpr.iter(qn('w:tblCellMar')):
    for side in ('top', 'bottom'):
        el = cell_mar.find(qn('w:' + side))
        if el is not None:
            el.set(qn('w:w'), '40')
for first_row in table.findall(qn('w:tblStylePr')):
    if first_row.get(qn('w:type')) == 'firstRow':
        tcpr = first_row.find(qn('w:tcPr'))
        if tcpr is None:
            tcpr = OxmlElement('w:tcPr')
            first_row.append(tcpr)
        shd = OxmlElement('w:shd')
        for k, v in (('val', 'clear'), ('color', 'auto'), ('fill', 'F2F2F2')):
            shd.set(qn('w:' + k), v)
        insert_before(tcpr, shd, {'noWrap', 'tcMar', 'textDirection', 'tcFitText', 'vAlign', 'hideMark'})

section = doc.sections[0]
section.page_width, section.page_height = Cm(21), Cm(29.7)
section.left_margin = section.right_margin = Cm(1.8)
section.top_margin = section.bottom_margin = Cm(1.7)
section.header_distance = section.footer_distance = Cm(0.8)
section.gutter = Cm(0)
footer = section.footer.paragraphs[0]
footer.alignment = 1
for kind, text in (('begin', None), (None, ' PAGE '), ('separate', None), (None, '1'), ('end', None)):
    run = footer.add_run()
    run.font.size = Pt(8.5)
    run.font.color.rgb = RGBColor(0x80, 0x80, 0x80)
    if kind:
        fld = OxmlElement('w:fldChar')
        fld.set(qn('w:fldCharType'), kind)
        run._r.append(fld)
    elif text.strip() == 'PAGE':
        instr = OxmlElement('w:instrText')
        instr.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
        instr.text = text
        run._r.append(instr)
    else:
        run.text = text

doc.save(DEST)
print('reference ok')
