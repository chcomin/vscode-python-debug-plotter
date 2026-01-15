import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getWebviewContent } from './webview';

let currentPanel: vscode.WebviewPanel | undefined = undefined;

export function activate(context: vscode.ExtensionContext) {

    const disposable = vscode.commands.registerCommand('python-debug-plotter.viewVariable', async (variableContext) => {

        const session = vscode.debug.activeDebugSession;
        if (!session) {
            vscode.window.showErrorMessage('No active debug session found! Start debugging first.');
            return;
        }

        // Extract frameId from the active stack item
        let frameId: number | undefined;
        const activeItem = vscode.debug.activeStackItem;
        if (activeItem && 'frameId' in activeItem) {
            // It's a StackFrame (not a Thread or Session), so it has an ID
            frameId = (activeItem as vscode.DebugStackFrame).frameId;
        }
        // ----------------------------------------

        let variableName: string | undefined;

        // Case A: Triggered from Right-Click in Variables View
        if (variableContext) {
            // Check 1: Is it the VS Code wrapper? (Common in newer versions)
            if (variableContext.variable && variableContext.variable.evaluateName) {
                variableName = variableContext.variable.evaluateName;
            }
            // Check 2: Is it the direct variable object?
            else if (variableContext.evaluateName) {
                variableName = variableContext.evaluateName;
            }
            // Check 3: Fallback to simple 'name' if evaluateName is missing
            else if (variableContext.variable && variableContext.variable.name) {
                variableName = variableContext.variable.name;
            }
            else if (variableContext.name) {
                variableName = variableContext.name;
            }
        }
        // Case B: Editor Selection
        else {
            const editor = vscode.window.activeTextEditor;
            if (editor && !editor.selection.isEmpty) {
                variableName = editor.document.getText(editor.selection);
            }
        }

        if (!variableName) {
            vscode.window.showErrorMessage('Please select a variable.');
            return;
        }

        if (currentPanel) {
            currentPanel.reveal(vscode.ViewColumn.Two);
        } else {
            currentPanel = vscode.window.createWebviewPanel(
                'pythonDebugPlotter',
                'Variable Viewer',
                vscode.ViewColumn.Two, 
                { 
                    enableScripts: true,
                    localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')]

                }
            );
            currentPanel.webview.html = getWebviewContent(currentPanel.webview, context.extensionUri);
            
            currentPanel.onDidDispose(() => {
                currentPanel = undefined;
            }, null, context.subscriptions);
        }

        const scriptPath = path.join(context.extensionPath, 'python', 'data_handler.py');
        const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
        const scriptB64 = Buffer.from(scriptContent).toString('base64');

        let response: any; 

        try {
            const pythonOneLiner = `[exec(__import__('base64').b64decode('${scriptB64}').decode('utf-8')), _vscode_extension_extract_data(${variableName})][-1]`;

            response = await session.customRequest('evaluate', {
                expression: pythonOneLiner,
                context: 'repl',
                frameId: frameId
            });

            let rawResult = response.result;

            // Remove the outer quotes added by the Python Debugger (repr)
            // The debugger often returns: ' "{\"file_path\": ...}" '
            if (rawResult.startsWith("'") && rawResult.endsWith("'")) {
                rawResult = rawResult.slice(1, -1);
            } else if (rawResult.startsWith('"') && rawResult.endsWith('"')) {
                // Rare case: if the inner string had single quotes, python might use double quotes outside
                rawResult = rawResult.slice(1, -1);
            }

            try {

                const pathData = JSON.parse(rawResult);

                if (pathData.error) {
                    vscode.window.showErrorMessage("Python Error: " + pathData.error);
                    return;
                }

                if (pathData.file_path) {
                    try {
                        // Read the actual data from the temp file
                        const jsonContent = fs.readFileSync(pathData.file_path, 'utf-8');
                        
                        // Parse the data
                        const finalData = JSON.parse(jsonContent);

                        // Send to Webview
                        if (currentPanel) {
                            currentPanel.webview.postMessage(finalData);
                        }
                    } finally {
                        if (fs.existsSync(pathData.file_path)) {
                            // Clean up the temp file
                            fs.unlinkSync(pathData.file_path);
                        }
                    }
                }
            } catch (err) {
                const e = err as Error;
                vscode.window.showErrorMessage(`Parse Error: ${e.message}. Raw output: ${rawResult}`);
            }

        } catch (err) {
            const e = err as Error;
            const rawOutput = response ? response.result : "No response";
            if (currentPanel) {
                currentPanel.webview.postMessage({ 
                    error: `Process Failed. Error: ${e.message}. Raw: ${rawOutput.substring(0, 100)}...` 
                });
            }
            vscode.window.showErrorMessage(`Error: ${e.message}`);
        }
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {}