import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, Packer, Table, TableRow, TableCell, BorderStyle, WidthType, convertInchesToTwip, AlignmentType as CellAlignment, VerticalAlign } from 'docx';
import { TelemetryService } from '../services/telemetryService';

interface MarkdownNode {
    type: 'heading' | 'paragraph' | 'list' | 'code' | 'blockquote' | 'table' | 'horizontalRule';
    level?: number;
    content?: string;
    children?: MarkdownNode[];
    ordered?: boolean;
    headers?: string[];
    rows?: string[][];
    language?: string;
}

export async function convertMarkdownCommand(
    context: vscode.ExtensionContext,
    telemetryService: TelemetryService,
    fileUri?: vscode.Uri
): Promise<void> {
    const startTime = Date.now();

    try {
        // Get the markdown file
        let markdownFile: vscode.Uri | undefined = fileUri;

        if (!markdownFile) {
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document.languageId === 'markdown') {
                markdownFile = editor.document.uri;
            } else {
                const files = await vscode.window.showOpenDialog({
                    canSelectFiles: true,
                    canSelectFolders: false,
                    canSelectMany: false,
                    filters: {
                        'Markdown': ['md', 'markdown']
                    },
                    title: 'Select Markdown File to Convert'
                });

                if (!files || files.length === 0) {
                    vscode.window.showWarningMessage('No markdown file selected');
                    return;
                }

                markdownFile = files[0];
            }
        }

        // Ask for output format
        const format = await vscode.window.showQuickPick(
            [
                { label: 'DOCX', description: 'Microsoft Word Document (.docx)', value: 'docx' },
                { label: 'PDF', description: 'Portable Document Format (.pdf)', value: 'pdf' }
            ],
            {
                placeHolder: 'Select output format',
                title: 'Convert Markdown To...'
            }
        );

        if (!format) {
            return;
        }

        // Read markdown content
        const markdownContent = fs.readFileSync(markdownFile.fsPath, 'utf-8');

        // Convert based on format
        if (format.value === 'docx') {
            await convertToDocx(markdownFile.fsPath, markdownContent);
        } else if (format.value === 'pdf') {
            await convertToPdf(markdownFile.fsPath, markdownContent);
        }

        const duration = Date.now() - startTime;
        telemetryService.trackEvent('markdown.convert', {
            format: format.value,
            duration: duration.toString(),
            fileSize: markdownContent.length.toString()
        });

    } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to convert markdown: ${error.message}`);
        telemetryService.trackEvent('markdown.convert.error', {
            error: error.message
        });
    }
}

export async function convertToDocx(markdownPath: string, markdownContent: string): Promise<void> {
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Converting markdown to DOCX...',
        cancellable: false
    }, async (progress) => {
        try {
            progress.report({ increment: 20, message: 'Parsing markdown...' });

            // Parse markdown into structured nodes
            const nodes = parseMarkdown(markdownContent);

            progress.report({ increment: 30, message: 'Creating document...' });

            // Create DOCX document
            const doc = new Document({
                numbering: {
                    config: [
                        {
                            reference: 'bullet-list',
                            levels: [
                                {
                                    level: 0,
                                    format: 'bullet',
                                    text: '•',
                                    alignment: AlignmentType.LEFT,
                                    style: {
                                        paragraph: {
                                            indent: { left: convertInchesToTwip(0.5), hanging: convertInchesToTwip(0.25) }
                                        }
                                    }
                                }
                            ]
                        },
                        {
                            reference: 'ordered-list',
                            levels: [
                                {
                                    level: 0,
                                    format: 'decimal',
                                    text: '%1.',
                                    alignment: AlignmentType.LEFT,
                                    style: {
                                        paragraph: {
                                            indent: { left: convertInchesToTwip(0.5), hanging: convertInchesToTwip(0.25) }
                                        }
                                    }
                                }
                            ]
                        }
                    ]
                },
                sections: [{
                    properties: {},
                    children: convertNodesToDocx(nodes)
                }]
            });

            progress.report({ increment: 30, message: 'Saving file...' });

            // Save document
            const outputPath = markdownPath.replace(/\.(md|markdown)$/i, '.docx');
            const buffer = await Packer.toBuffer(doc);
            fs.writeFileSync(outputPath, buffer);

            progress.report({ increment: 20, message: 'Opening document...' });

            // Open the document
            const docUri = vscode.Uri.file(outputPath);
            await vscode.commands.executeCommand('vscode.open', docUri);

            vscode.window.showInformationMessage(`✅ Markdown converted to DOCX: ${path.basename(outputPath)}`);

        } catch (error: any) {
            throw new Error(`DOCX conversion failed: ${error.message}`);
        }
    });
}

async function convertToPdf(markdownPath: string, markdownContent: string): Promise<void> {
    // PDF conversion using markdown-pdf approach
    // Since we don't have a PDF library installed, we'll convert to HTML first, then suggest printing to PDF
    
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Converting markdown to PDF...',
        cancellable: false
    }, async (progress) => {
        try {
            progress.report({ increment: 30, message: 'Generating HTML...' });

            // Convert markdown to HTML
            const html = convertMarkdownToHtml(markdownContent);

            progress.report({ increment: 30, message: 'Creating preview...' });

            // Create HTML file
            const outputPath = markdownPath.replace(/\.(md|markdown)$/i, '.html');
            const styledHtml = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Markdown Preview</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            max-width: 800px;
            margin: 40px auto;
            padding: 0 20px;
            color: #333;
        }
        h1, h2, h3, h4, h5, h6 {
            margin-top: 24px;
            margin-bottom: 16px;
            font-weight: 600;
            line-height: 1.25;
        }
        h1 { font-size: 2em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
        h2 { font-size: 1.5em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
        h3 { font-size: 1.25em; }
        code {
            background-color: #f6f8fa;
            border-radius: 3px;
            padding: 2px 6px;
            font-family: 'Courier New', monospace;
            font-size: 85%;
        }
        pre {
            background-color: #f6f8fa;
            border-radius: 6px;
            padding: 16px;
            overflow-x: auto;
        }
        pre code {
            background-color: transparent;
            padding: 0;
        }
        blockquote {
            border-left: 4px solid #dfe2e5;
            padding: 0 15px;
            color: #6a737d;
            margin: 0;
        }
        table {
            border-collapse: collapse;
            width: 100%;
            margin: 16px 0;
        }
        table th, table td {
            border: 1px solid #dfe2e5;
            padding: 8px 13px;
        }
        table th {
            background-color: #f6f8fa;
            font-weight: 600;
        }
        ul, ol {
            padding-left: 2em;
        }
        li {
            margin: 4px 0;
        }
        hr {
            border: 0;
            border-top: 1px solid #eaecef;
            margin: 24px 0;
        }
        @media print {
            body {
                max-width: 100%;
            }
        }
    </style>
</head>
<body>
${html}
</body>
</html>`;

            fs.writeFileSync(outputPath, styledHtml);

            progress.report({ increment: 40, message: 'Opening preview...' });

            // Show instructions for PDF export
            const action = await vscode.window.showInformationMessage(
                '📄 HTML preview created. To generate PDF: Open the file and use "Print to PDF" from your browser.',
                'Open HTML',
                'Use DOCX Instead'
            );

            if (action === 'Open HTML') {
                const htmlUri = vscode.Uri.file(outputPath);
                await vscode.commands.executeCommand('vscode.open', htmlUri);
            } else if (action === 'Use DOCX Instead') {
                await convertToDocx(markdownPath, markdownContent);
            }

        } catch (error: any) {
            throw new Error(`PDF conversion failed: ${error.message}`);
        }
    });
}

function parseMarkdown(content: string): MarkdownNode[] {
    const nodes: MarkdownNode[] = [];
    const lines = content.split('\n');
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        // Headings
        const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch) {
            nodes.push({
                type: 'heading',
                level: headingMatch[1].length,
                content: headingMatch[2]
            });
            i++;
            continue;
        }

        // Horizontal rule
        if (line.match(/^(-{3,}|\*{3,}|_{3,})$/)) {
            nodes.push({ type: 'horizontalRule' });
            i++;
            continue;
        }

        // Code blocks
        const codeBlockMatch = line.match(/^```(\w+)?$/);
        if (codeBlockMatch) {
            const language = codeBlockMatch[1] || 'text';
            const codeLines: string[] = [];
            i++;
            while (i < lines.length && !lines[i].match(/^```$/)) {
                codeLines.push(lines[i]);
                i++;
            }
            nodes.push({
                type: 'code',
                language,
                content: codeLines.join('\n')
            });
            i++; // Skip closing ```
            continue;
        }

        // Blockquotes
        if (line.startsWith('>')) {
            const quoteLines: string[] = [];
            while (i < lines.length && lines[i].startsWith('>')) {
                quoteLines.push(lines[i].substring(1).trim());
                i++;
            }
            nodes.push({
                type: 'blockquote',
                content: quoteLines.join('\n')
            });
            continue;
        }

        // Tables
        if (line.includes('|') && lines[i + 1]?.match(/\|[\s-:]+\|/)) {
            const headers = line.split('|').map(h => h.trim()).filter(h => h);
            i += 2; // Skip header and separator
            const rows: string[][] = [];
            while (i < lines.length && lines[i].includes('|')) {
                const row = lines[i].split('|').map(c => c.trim()).filter(c => c);
                rows.push(row);
                i++;
            }
            nodes.push({
                type: 'table',
                headers,
                rows
            });
            continue;
        }

        // Lists
        const listMatch = line.match(/^(\s*)([-*+]|\d+\.)\s+(.+)$/);
        if (listMatch) {
            const ordered = /^\d+\./.test(listMatch[2]);
            const listItems: string[] = [listMatch[3]];
            i++;
            while (i < lines.length) {
                const nextListMatch = lines[i].match(/^(\s*)([-*+]|\d+\.)\s+(.+)$/);
                if (nextListMatch) {
                    listItems.push(nextListMatch[3]);
                    i++;
                } else {
                    break;
                }
            }
            nodes.push({
                type: 'list',
                ordered,
                children: listItems.map(item => ({ type: 'paragraph', content: item }))
            });
            continue;
        }

        // Regular paragraph
        if (line.trim()) {
            nodes.push({
                type: 'paragraph',
                content: line
            });
        }

        i++;
    }

    return nodes;
}

function convertNodesToDocx(nodes: MarkdownNode[]): (Paragraph | Table)[] {
    const elements: (Paragraph | Table)[] = [];

    for (const node of nodes) {
        switch (node.type) {
            case 'heading':
                const headingLevel = [
                    HeadingLevel.HEADING_1,
                    HeadingLevel.HEADING_2,
                    HeadingLevel.HEADING_3,
                    HeadingLevel.HEADING_4,
                    HeadingLevel.HEADING_5,
                    HeadingLevel.HEADING_6
                ][node.level! - 1];

                elements.push(new Paragraph({
                    text: node.content || '',
                    heading: headingLevel,
                    spacing: { before: 240, after: 120 }
                }));
                break;

            case 'paragraph':
                const textRuns = parseInlineMarkdown(node.content || '');
                elements.push(new Paragraph({
                    children: textRuns,
                    spacing: { after: 120 }
                }));
                break;

            case 'code':
                elements.push(new Paragraph({
                    text: node.content || '',
                    style: 'Code',
                    shading: { fill: 'F5F5F5' },
                    spacing: { before: 120, after: 120 }
                }));
                break;

            case 'blockquote':
                elements.push(new Paragraph({
                    text: node.content || '',
                    indent: { left: convertInchesToTwip(0.5) },
                    border: {
                        left: {
                            color: '999999',
                            size: 6,
                            style: BorderStyle.SINGLE
                        }
                    },
                    spacing: { before: 120, after: 120 }
                }));
                break;

            case 'list':
                if (node.children) {
                    for (let i = 0; i < node.children.length; i++) {
                        const textRuns = parseInlineMarkdown(node.children[i].content || '');
                        elements.push(new Paragraph({
                            children: textRuns,
                            numbering: {
                                reference: node.ordered ? 'ordered-list' : 'bullet-list',
                                level: 0
                            },
                            spacing: { after: 60 }
                        }));
                    }
                }
                break;

            case 'horizontalRule':
                elements.push(new Paragraph({
                    text: '',
                    border: {
                        bottom: {
                            color: 'CCCCCC',
                            size: 6,
                            style: BorderStyle.SINGLE
                        }
                    },
                    spacing: { before: 120, after: 120 }
                }));
                break;

            case 'table':
                if (node.headers && node.rows) {
                    const tableRows: TableRow[] = [];
                    
                    // Add header row
                    tableRows.push(new TableRow({
                        children: node.headers.map(header => 
                            new TableCell({
                                children: [new Paragraph({
                                    children: [new TextRun({ text: header, bold: true })]
                                })],
                                shading: { fill: 'D3D3D3' }
                            })
                        )
                    }));

                    // Add data rows
                    for (const row of node.rows) {
                        tableRows.push(new TableRow({
                            children: row.map(cell => 
                                new TableCell({
                                    children: [new Paragraph({ text: cell })]
                                })
                            )
                        }));
                    }

                    elements.push(new Table({
                        rows: tableRows,
                        width: {
                            size: 100,
                            type: WidthType.PERCENTAGE
                        }
                    }));
                }
                break;
        }
    }

    return elements;
}

function parseInlineMarkdown(text: string): TextRun[] {
    const runs: TextRun[] = [];
    let currentText = '';
    let i = 0;

    const flushCurrentText = () => {
        if (currentText) {
            runs.push(new TextRun({ text: currentText }));
            currentText = '';
        }
    };

    while (i < text.length) {
        // Bold **text** or __text__
        if ((text[i] === '*' && text[i + 1] === '*') || (text[i] === '_' && text[i + 1] === '_')) {
            flushCurrentText();
            const delimiter = text[i];
            i += 2;
            let boldText = '';
            while (i < text.length - 1 && !(text[i] === delimiter && text[i + 1] === delimiter)) {
                boldText += text[i];
                i++;
            }
            if (text[i] === delimiter && text[i + 1] === delimiter) {
                runs.push(new TextRun({ text: boldText, bold: true }));
                i += 2;
            } else {
                currentText += delimiter + delimiter + boldText;
            }
            continue;
        }

        // Italic *text* or _text_
        if (text[i] === '*' || text[i] === '_') {
            flushCurrentText();
            const delimiter = text[i];
            i++;
            let italicText = '';
            while (i < text.length && text[i] !== delimiter) {
                italicText += text[i];
                i++;
            }
            if (text[i] === delimiter) {
                runs.push(new TextRun({ text: italicText, italics: true }));
                i++;
            } else {
                currentText += delimiter + italicText;
            }
            continue;
        }

        // Inline code `text`
        if (text[i] === '`') {
            flushCurrentText();
            i++;
            let codeText = '';
            while (i < text.length && text[i] !== '`') {
                codeText += text[i];
                i++;
            }
            if (text[i] === '`') {
                runs.push(new TextRun({
                    text: codeText,
                    font: 'Courier New',
                    shading: { fill: 'F5F5F5' }
                }));
                i++;
            } else {
                currentText += '`' + codeText;
            }
            continue;
        }

        currentText += text[i];
        i++;
    }

    flushCurrentText();
    return runs.length > 0 ? runs : [new TextRun({ text: text })];
}

function convertMarkdownToHtml(content: string): string {
    let html = content;

    // Headings
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^##### (.+)$/gm, '<h5>$1</h5>');
    html = html.replace(/^###### (.+)$/gm, '<h6>$1</h6>');

    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');

    // Italic
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/_(.+?)_/g, '<em>$1</em>');

    // Inline code
    html = html.replace(/`(.+?)`/g, '<code>$1</code>');

    // Code blocks
    html = html.replace(/```(\w+)?\n([\s\S]+?)```/g, '<pre><code>$2</code></pre>');

    // Links
    html = html.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');

    // Horizontal rules
    html = html.replace(/^(-{3,}|\*{3,}|_{3,})$/gm, '<hr>');

    // Lists (simple conversion)
    html = html.replace(/^\* (.+)$/gm, '<li>$1</li>');
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/^\+ (.+)$/gm, '<li>$1</li>');
    html = html.replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>');

    // Wrap consecutive list items
    html = html.replace(/(<li>.*<\/li>\n)+/g, '<ul>$&</ul>');

    // Blockquotes
    html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');

    // Paragraphs
    html = html.replace(/^(?!<[h|u|p|b|l|d])(.*\S.*)$/gm, '<p>$1</p>');

    return html;
}
