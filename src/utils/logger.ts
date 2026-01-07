export class Logger {
    private outputChannel: any;

    constructor(channelName: string = 'DevEx AI Assistant') {
        // Will be initialized with VS Code output channel
        this.outputChannel = null;
    }

    info(message: string): void {
        const timestamp = new Date().toISOString();
        console.log(`[INFO] [${timestamp}] ${message}`);
        if (this.outputChannel) {
            this.outputChannel.appendLine(`[INFO] ${message}`);
        }
    }

    error(message: string, error?: any): void {
        const timestamp = new Date().toISOString();
        console.error(`[ERROR] [${timestamp}] ${message}`, error);
        if (this.outputChannel) {
            this.outputChannel.appendLine(`[ERROR] ${message}`);
            if (error) {
                this.outputChannel.appendLine(JSON.stringify(error, null, 2));
            }
        }
    }

    warn(message: string): void {
        const timestamp = new Date().toISOString();
        console.warn(`[WARN] [${timestamp}] ${message}`);
        if (this.outputChannel) {
            this.outputChannel.appendLine(`[WARN] ${message}`);
        }
    }

    debug(message: string): void {
        const timestamp = new Date().toISOString();
        console.debug(`[DEBUG] [${timestamp}] ${message}`);
    }
}

export const logger = new Logger();
