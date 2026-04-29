import * as vscode from 'vscode';

/**
 * Diagnostic command to verify DevEx language model tools are registered
 */
export async function verifyToolRegistration(context: vscode.ExtensionContext): Promise<void> {
    const outputChannel = vscode.window.createOutputChannel('DevEx Tool Diagnostics');
    outputChannel.clear();
    outputChannel.show();

    outputChannel.appendLine('🔍 DevEx Tool Registration Diagnostics');
    outputChannel.appendLine('=====================================\n');

    // Check package.json capabilities
    const extension = vscode.extensions.getExtension('CodeSamurai.devex-ai-assistant');
    if (!extension) {
        outputChannel.appendLine('❌ Extension not found!');
        return;
    }

    outputChannel.appendLine(`✅ Extension found: ${extension.id}`);
    outputChannel.appendLine(`   Version: ${extension.packageJSON.version}`);
    outputChannel.appendLine(`   Active: ${extension.isActive}\n`);

    // Check declared capabilities
    const capabilities = extension.packageJSON.capabilities;
    if (capabilities?.languageModelTools?.provides) {
        const tools = capabilities.languageModelTools.provides;
        outputChannel.appendLine(`📋 Declared Language Model Tools (${tools.length}):`);
        tools.forEach((tool: string, index: number) => {
            outputChannel.appendLine(`   ${index + 1}. ${tool}`);
        });
        outputChannel.appendLine('');
    } else {
        outputChannel.appendLine('❌ No languageModelTools capabilities declared\n');
    }

    // Check if GitHub Copilot is available
    const copilotExtension = vscode.extensions.getExtension('github.copilot');
    const copilotChatExtension = vscode.extensions.getExtension('github.copilot-chat');
    
    if (copilotExtension) {
        outputChannel.appendLine(`✅ GitHub Copilot: ${copilotExtension.packageJSON.version} (Active: ${copilotExtension.isActive})`);
    } else if (copilotChatExtension) {
        outputChannel.appendLine('ℹ️  GitHub Copilot (standalone) not found - this is normal as it was merged into Copilot Chat');
    } else {
        outputChannel.appendLine('⚠️  GitHub Copilot extension not found');
    }

    if (copilotChatExtension) {
        outputChannel.appendLine(`✅ GitHub Copilot Chat: ${copilotChatExtension.packageJSON.version} (Active: ${copilotChatExtension.isActive})`);
    } else {
        outputChannel.appendLine('❌ GitHub Copilot Chat extension not found - REQUIRED for language model tools');
    }

    outputChannel.appendLine('');

    // Check VS Code version
    const vscodeVersion = vscode.version;
    outputChannel.appendLine(`VS Code Version: ${vscodeVersion}`);
    
    // Check engine requirement
    const engineRequirement = extension.packageJSON.engines.vscode;
    outputChannel.appendLine(`Required VS Code Version: ${engineRequirement}\n`);

    // Test if language model API is available
    try {
        // @ts-ignore - vscode.lm might not be in all type definitions
        if (vscode.lm && typeof vscode.lm.registerTool === 'function') {
            outputChannel.appendLine('✅ vscode.lm.registerTool API is available');
        } else {
            outputChannel.appendLine('❌ vscode.lm.registerTool API is NOT available');
            outputChannel.appendLine('   This API requires VS Code 1.95.0 or later with GitHub Copilot Chat');
        }
    } catch (error) {
        outputChannel.appendLine(`❌ Error checking language model API: ${error}`);
    }

    outputChannel.appendLine('\n=====================================');
    outputChannel.appendLine('📊 SUMMARY');
    outputChannel.appendLine('=====================================\n');

    // Provide troubleshooting guidance
    if (!copilotChatExtension) {
        outputChannel.appendLine('❌ ACTION REQUIRED:');
        outputChannel.appendLine('   Install GitHub Copilot Chat extension');
        outputChannel.appendLine('   for language model tools to work.\n');
    } else {
        outputChannel.appendLine('✅ All required components are installed!\n');
    }

    outputChannel.appendLine('💡 HOW TO USE LANGUAGE MODEL TOOLS:');
    outputChannel.appendLine('');
    outputChannel.appendLine('1. Open GitHub Copilot Chat (Ctrl+Alt+I or Cmd+Shift+I)');
    outputChannel.appendLine('2. Ask natural language questions like:');
    outputChannel.appendLine('   • "Analyze this ERD file"');
    outputChannel.appendLine('   • "Generate an OpenAPI spec from this LLD"');
    outputChannel.appendLine('   • "Review my LLD document"');
    outputChannel.appendLine('   • "Fetch my Jira tickets"');
    outputChannel.appendLine('');
    outputChannel.appendLine('3. GitHub Copilot will automatically discover and use');
    outputChannel.appendLine('   the appropriate DevEx tools to fulfill your request.');
    outputChannel.appendLine('');
    outputChannel.appendLine('📝 NOTE: Language model tools are invoked automatically by');
    outputChannel.appendLine('   GitHub Copilot - you don\'t type the tool names directly.');
    outputChannel.appendLine('');
    outputChannel.appendLine('🔧 ALTERNATIVE: Use the chat participant:');
    outputChannel.appendLine('   Type @askcodesamurai in Copilot Chat for direct access');
    outputChannel.appendLine('   to DevEx commands.');
    outputChannel.appendLine('');

    vscode.window.showInformationMessage('DevEx Tool Diagnostics completed. Check the Output panel for details.');
}
