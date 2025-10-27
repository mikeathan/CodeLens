import { UnusedDependencyDetectorService } from './services/UnusedDependencyDetectorService';

// Existing imports

export function activate(context: vscode.ExtensionContext) {
    // Existing activation code

    // Initialize the UnusedDependencyDetectorService
    const unusedDependencyDetector = new UnusedDependencyDetectorService();

    // Register the command for detecting unused dependencies
    let disposable = vscode.commands.registerCommand('codelens.detectUnusedDependencies', () => {
        unusedDependencyDetector.detect();
    });

    context.subscriptions.push(disposable);
    
    // Push existing context subscriptions
    // ... other service registrations
}