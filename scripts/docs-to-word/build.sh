#!/usr/bin/env bash
# Word-версия документа из docs/product-map: ./build.sh docs/product-map/19-....md docs/product-map/19-....docx
# Один раз: python3 -m venv /tmp/docs-word && /tmp/docs-word/bin/pip install pypandoc_binary python-docx
set -euo pipefail
PY=${DOCS_WORD_PY:-/tmp/docs-word/bin/python}
HERE=$(cd "$(dirname "$0")" && pwd)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
PANDOC=$("$PY" -c 'import pypandoc; print(pypandoc.get_pandoc_path())')
"$PANDOC" -o "$WORK/ref-default.docx" --print-default-data-file reference.docx
"$PY" -I "$HERE/make_reference.py" "$WORK/ref-default.docx" "$WORK/ref.docx"
"$PY" -I "$HERE/prepare_md.py" "$1" "$WORK/word.md"
"$PANDOC" "$WORK/word.md" -f commonmark_x -t docx --reference-doc "$WORK/ref.docx" -o "$WORK/pandoc.docx"
"$PY" -I "$HERE/finish_docx.py" "$WORK/pandoc.docx" "$2"
