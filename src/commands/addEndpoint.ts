import * as vscode from 'vscode';
import { TelemetryService } from '../services/telemetryService';

export async function addEndpointCommand(
    context: vscode.ExtensionContext,
    telemetryService: TelemetryService
): Promise<void> {
    vscode.window.showInformationMessage(
        'Add Endpoint feature coming soon! This will allow you to add new API endpoints to an existing Spring Boot project.'
    );
}
