"""
Convert a .docx file to a Markdown (.md) file.

Usage:
    python docx_to_md.py <input.docx> [output.md]

If output.md is not specified, the output file will have the same name
as the input with a .md extension.

Requirements:
    pip install python-docx
"""

import sys
import os
import re
from docx import Document
from docx.oxml.ns import qn
from docx.enum.text import WD_ALIGN_PARAGRAPH


def get_heading_level(paragraph):
    """Return heading level (1-9) or 0 if not a heading."""
    style_name = paragraph.style.name
    if style_name.startswith("Heading"):
        try:
            return int(style_name.split()[-1])
        except ValueError:
            return 0
    return 0


def get_list_info(paragraph):
    """Return (list_type, level) or (None, 0) if not a list item.
    list_type is 'ordered' or 'unordered'.
    """
    numPr = paragraph._element.find(qn("w:pPr"))
    if numPr is not None:
        numPr = numPr.find(qn("w:numPr"))
    if numPr is not None:
        ilvl_elem = numPr.find(qn("w:ilvl"))
        level = int(ilvl_elem.get(qn("w:val"))) if ilvl_elem is not None else 0

        # Try to determine if ordered or unordered from the style name
        style_name = paragraph.style.name.lower()
        if "bullet" in style_name or "list bullet" in style_name:
            return ("unordered", level)
        elif "number" in style_name or "list number" in style_name:
            return ("ordered", level)
        else:
            # Default: check numId to guess; fallback to unordered
            return ("unordered", level)
    return (None, 0)


def run_to_markdown(run):
    """Convert a single Run to its Markdown representation."""
    text = run.text
    if not text:
        return ""

    # Escape markdown special characters inside text (light touch)
    # We intentionally don't escape everything to keep output readable.

    if run.bold and run.italic:
        text = f"***{text}***"
    elif run.bold:
        text = f"**{text}**"
    elif run.italic:
        text = f"*{text}*"

    if run.underline:
        text = f"<u>{text}</u>"

    try:
        if run.font.strike:
            text = f"~~{text}~~"
    except AttributeError:
        pass

    try:
        if run.font.superscript:
            text = f"<sup>{text}</sup>"
    except AttributeError:
        pass

    try:
        if run.font.subscript:
            text = f"<sub>{text}</sub>"
    except AttributeError:
        pass

    return text


def paragraph_to_markdown(paragraph):
    """Convert a Paragraph object to a Markdown string."""
    # Collect inline text from runs
    inline_text = "".join(run_to_markdown(r) for r in paragraph.runs)

    # Check for hyperlinks in the paragraph XML
    hyperlinks = paragraph._element.findall(qn("w:hyperlink"))
    if hyperlinks:
        # Rebuild text including hyperlink markup
        parts = []
        for child in paragraph._element:
            if child.tag == qn("w:hyperlink"):
                rId = child.get(qn("r:id"))
                link_text = "".join(
                    node.text or "" for node in child.iter(qn("w:t"))
                )
                url = ""
                if rId and paragraph.part.rels.get(rId):
                    url = paragraph.part.rels[rId].target_ref
                if url:
                    parts.append(f"[{link_text}]({url})")
                else:
                    parts.append(link_text)
            elif child.tag == qn("w:r"):
                from docx.text.run import Run

                parts.append(run_to_markdown(Run(child, paragraph)))
        inline_text = "".join(parts)

    # Strip leading/trailing whitespace
    inline_text = inline_text.strip()

    return inline_text


def extract_table(table):
    """Convert a docx Table to a Markdown table string."""
    rows = []
    for row in table.rows:
        cells = [cell.text.strip().replace("\n", " ") for cell in row.cells]
        rows.append(cells)

    if not rows:
        return ""

    lines = []
    # Header row
    lines.append("| " + " | ".join(rows[0]) + " |")
    # Separator
    lines.append("| " + " | ".join("---" for _ in rows[0]) + " |")
    # Data rows
    for row in rows[1:]:
        # Pad row if it has fewer cells than the header
        while len(row) < len(rows[0]):
            row.append("")
        lines.append("| " + " | ".join(row[: len(rows[0])]) + " |")

    return "\n".join(lines)


def convert_docx_to_markdown(input_path):
    """Read a .docx file and return its content as a Markdown string."""
    doc = Document(input_path)
    md_lines = []
    ordered_counters = {}  # track counters per indent level for ordered lists

    for element in doc.element.body:
        # Handle tables
        if element.tag == qn("w:tbl"):
            from docx.table import Table

            table = Table(element, doc)
            md_lines.append("")
            md_lines.append(extract_table(table))
            md_lines.append("")
            continue

        # Handle paragraphs
        if element.tag == qn("w:p"):
            from docx.text.paragraph import Paragraph

            paragraph = Paragraph(element, doc)
            text = paragraph_to_markdown(paragraph)

            # Heading
            heading_level = get_heading_level(paragraph)
            if heading_level > 0:
                md_lines.append("")
                md_lines.append(f"{'#' * heading_level} {text}")
                md_lines.append("")
                continue

            # List items
            list_type, level = get_list_info(paragraph)
            if list_type is not None:
                indent = "    " * level
                if list_type == "ordered":
                    counter = ordered_counters.get(level, 0) + 1
                    ordered_counters[level] = counter
                    md_lines.append(f"{indent}{counter}. {text}")
                else:
                    md_lines.append(f"{indent}- {text}")
                continue
            else:
                # Reset ordered counters when we leave a list
                ordered_counters = {}

            # Empty paragraph -> blank line
            if not text:
                md_lines.append("")
                continue

            # Regular paragraph
            md_lines.append(text)

    # Clean up excessive blank lines
    markdown = "\n".join(md_lines)
    markdown = re.sub(r"\n{3,}", "\n\n", markdown).strip() + "\n"

    return markdown


def main():
    if len(sys.argv) < 2:
        print(f"Usage: python {os.path.basename(__file__)} <input.docx> [output.md]")
        sys.exit(1)

    input_path = sys.argv[1]
    if not os.path.isfile(input_path):
        print(f"Error: File not found: {input_path}")
        sys.exit(1)

    if len(sys.argv) >= 3:
        output_path = sys.argv[2]
    else:
        output_path = os.path.splitext(input_path)[0] + ".md"

    print(f"Converting: {input_path}")
    markdown = convert_docx_to_markdown(input_path)

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(markdown)

    print(f"Output written to: {output_path}")


if __name__ == "__main__":
    main()
