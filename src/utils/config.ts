import * as vscode from 'vscode';

export interface Config {
    defaultPackageName: string;
    buildTool: 'maven' | 'gradle';
    javaVersion: string;
    springBootVersion: string;
    telemetryEnabled: boolean;
    customTemplatesPath: string;
    updateCheckUrl: string;
}

export function getConfig(): Config {
    const config = vscode.workspace.getConfiguration('devex');
    
    return {
        defaultPackageName: config.get('defaultPackageName', 'com.company'),
        buildTool: config.get('buildTool', 'maven') as 'maven' | 'gradle',
        javaVersion: config.get('javaVersion', '21'),
        springBootVersion: config.get('springBootVersion', '3.4.1'),
        telemetryEnabled: config.get('telemetryEnabled', true),
        customTemplatesPath: config.get('customTemplatesPath', ''),
        updateCheckUrl: config.get('updateCheckUrl', '')
    };
}

export function updateConfig(key: string, value: any): Thenable<void> {
    const config = vscode.workspace.getConfiguration('devex');
    return config.update(key, value, vscode.ConfigurationTarget.Global);
}
