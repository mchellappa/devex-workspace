import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AIService } from '../services/aiService';
import { logger } from '../utils/logger';

// ─── Main command ─────────────────────────────────────────────────────────────

export async function structureKTTranscriptsCommand(): Promise<void> {
    try {
        // 1. Locate the transcript folder
        const outputDir = await findTranscriptFolder();
        if (!outputDir) { return; }

        // 2. Find .txt files from the Whisper batch
        const allEntries = fs.readdirSync(outputDir);
        const txtFiles = allEntries
            .filter(f => f.endsWith('.txt'))
            .map(f => path.join(outputDir, f));

        if (txtFiles.length === 0) {
            vscode.window.showWarningMessage(
                'No .txt transcript files found in the selected folder. ' +
                'Wait for the KT transcription batch to complete before running this command. ' +
                'The batch window will say "Press Enter to close" when done.'
            );
            return;
        }

        // 3. Multi-select which transcripts to process
        const picks = await vscode.window.showQuickPick(
            txtFiles.map(f => ({
                label: `$(file-text) ${path.basename(f)}`,
                description: `${Math.round(fs.statSync(f).size / 1024)} KB`,
                picked: true,
                filePath: f
            })),
            {
                canPickMany: true,
                title: `Structure KT Transcripts — ${txtFiles.length} file(s) found in ${outputDir}`,
                placeHolder: 'Select transcripts to convert into structured AI notes (Space to toggle)'
            }
        );
        if (!picks || picks.length === 0) { return; }

        // 4. AI structuring loop
        const aiService = new AIService();
        const results: Array<{ name: string; notesPath?: string; error?: string }> = [];

        await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: 'Structuring KT Notes', cancellable: false },
            async (progress) => {
                for (let i = 0; i < picks.length; i++) {
                    const item = picks[i];
                    const baseName = path.basename(item.filePath, '.txt');
                    progress.report({ message: `(${i + 1}/${picks.length}) ${baseName}…` });

                    try {
                        const transcript = fs.readFileSync(item.filePath, 'utf-8').trim();
                        const notes = await structureTranscript(aiService, transcript, baseName);

                        const notesPath = path.join(outputDir, `${baseName}-kt-notes.md`);
                        fs.writeFileSync(notesPath, notes, 'utf-8');
                        results.push({ name: baseName, notesPath });
                        logger.info(`KT notes saved: ${notesPath}`);
                    } catch (err: any) {
                        logger.error(`Failed to structure "${baseName}": ${err.message}`);
                        results.push({ name: baseName, error: err.message });
                    }
                }
            }
        );

        // 5. Summary
        const ok = results.filter(r => r.notesPath);
        const failed = results.filter(r => r.error);

        const summary = `✅ Structured ${ok.length} KT session(s)` +
            (failed.length > 0 ? `, ❌ ${failed.length} failed (${failed.map(f => f.name).join(', ')})` : '');

        const action = ok.length > 0
            ? await vscode.window.showInformationMessage(summary, 'Open First Notes', 'Open Folder')
            : await vscode.window.showWarningMessage(summary);

        if (action === 'Open First Notes' && ok[0]?.notesPath) {
            const doc = await vscode.workspace.openTextDocument(ok[0].notesPath!);
            await vscode.window.showTextDocument(doc);
        } else if (action === 'Open Folder') {
            await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(outputDir));
        }

        logger.info(`KT structuring complete: ${ok.length} succeeded, ${failed.length} failed`);

    } catch (err: any) {
        logger.error(`Structure KT Transcripts failed: ${err.message}`);
        vscode.window.showErrorMessage(`Structure KT Transcripts failed: ${err.message}`);
    }
}

// ─── Folder picker ────────────────────────────────────────────────────────────

async function findTranscriptFolder(): Promise<string | undefined> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const defaultDir = workspaceRoot
        ? path.join(workspaceRoot, 'kt-transcripts')
        : path.join(os.homedir(), 'kt-transcripts');

    // Check for a completion marker in the default location
    const defaultMarker = path.join(defaultDir, '.kt-transcribe-complete.json');
    const defaultHasTxt = fs.existsSync(defaultDir) &&
        fs.readdirSync(defaultDir).some(f => f.endsWith('.txt'));

    const choices: vscode.QuickPickItem[] = [];

    if (fs.existsSync(defaultDir) && defaultHasTxt) {
        const label = fs.existsSync(defaultMarker)
            ? `$(check) ${defaultDir}  ✓ Batch complete`
            : `$(folder) ${defaultDir}`;
        choices.push({ label, description: 'Default transcript folder', detail: defaultDir });
    }

    choices.push({ label: '$(folder-opened) Browse for folder…', description: 'Choose a different output folder' });

    const pick = await vscode.window.showQuickPick(choices, {
        title: 'Select Transcript Output Folder',
        placeHolder: 'Choose the folder where kt-transcribe-runner.py saved .txt files'
    });
    if (!pick) { return undefined; }

    if (pick.detail) { return pick.detail; }

    // Browse mode
    const uris = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        title: 'Select the folder containing .txt transcript files'
    });
    return uris?.[0]?.fsPath;
}

// ─── AI structuring ───────────────────────────────────────────────────────────

async function structureTranscript(
    aiService: AIService,
    transcript: string,
    sessionName: string
): Promise<string> {
    const MAX_CHARS = 60_000;
    const rawText = transcript.length > MAX_CHARS
        ? transcript.substring(0, MAX_CHARS) + '\n\n[Transcript truncated — only first 60,000 characters processed]'
        : transcript;

    const sessionTitle = path.basename(sessionName, path.extname(sessionName));

    const systemPrompt =
        'You are a technical knowledge base editor. You structure raw transcripts from engineering ' +
        'Knowledge Transfer (KT) sessions into clean, organized documents. ' +
        'Preserve technical accuracy and use the speakers\' own terminology. ' +
        'Never invent or assume content not present in the transcript.';

    const prompt =
        `The following is a raw transcript from a KT (Knowledge Transfer) session titled: "${sessionTitle}"\n\n` +
        `Structure this into a KT session document using these sections:\n\n` +
        `## Executive Summary\n` +
        `2–3 sentences summarising what was covered.\n\n` +
        `## Key Topics Covered\n` +
        `Bullet list of the main subjects discussed.\n\n` +
        `## Technical Concepts\n` +
        `Explain technical terms, systems, or architectural patterns mentioned. ` +
        `Use the speakers' own terminology.\n\n` +
        `## Decisions & Conclusions\n` +
        `Key outcomes, design choices, or conclusions stated.\n\n` +
        `## Action Items\n` +
        `Follow-ups mentioned. If none, write "None mentioned."\n\n` +
        `## Q&A Highlights\n` +
        `Notable questions and answers. If none distinguishable, omit this section.\n\n` +
        `## Full Transcript\n` +
        `The cleaned-up, lightly formatted transcript (preserve all technical content).\n\n` +
        `---\nRAW TRANSCRIPT:\n${rawText}`;

    try {
        const response = await aiService.callLanguageModel(prompt, systemPrompt);
        return (
            `# KT Session Notes: ${sessionTitle}\n\n` +
            `*Generated by DevEx AI Assistant on ${new Date().toLocaleDateString('en-AU', { dateStyle: 'long' })}*\n\n` +
            `---\n\n` +
            `${response.content}`
        );
    } catch (err: any) {
        logger.warn(`AI structuring failed for "${sessionTitle}", saving raw transcript: ${err.message}`);
        return (
            `# KT Session Transcript: ${sessionTitle}\n\n` +
            `*Transcribed by DevEx AI Assistant on ${new Date().toLocaleDateString('en-AU', { dateStyle: 'long' })}*\n` +
            `*(AI structuring failed — raw transcript below)*\n\n` +
            `---\n\n` +
            `## Raw Transcript\n\n` +
            transcript
        );
    }
}
