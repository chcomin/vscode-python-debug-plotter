import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getWebviewContent } from './webview';

let currentPanel: vscode.WebviewPanel | undefined = undefined;

export function activate(context: vscode.ExtensionContext) {

    const disposable = vscode.commands.registerCommand('simple-data-viewer.viewImage', async (variableContext) => {

        const session = vscode.debug.activeDebugSession;
        if (!session) {
            vscode.window.showErrorMessage('No active debug session found! Start debugging first.');
            return;
        }

        // We need the frameId to tell the debugger "look for variables in the current function"
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
                'numpyViewer',
                'Data Viewer',
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

        const scriptPath = path.join(context.extensionPath, 'data_handler.py');
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

            // Basic cleanup of quotes around the filename JSON
            if (rawResult.startsWith("'") && rawResult.endsWith("'")) {rawResult = rawResult.slice(1, -1);}
            if (rawResult.startsWith('"') && rawResult.endsWith('"')) {rawResult = rawResult.slice(1, -1);}
            rawResult = rawResult.replace(/\\"/g, '"').replace(/\\'/g, "'");

            // 1. Parse the initial response (which is just { "file_path": "..." })
            const initialData = JSON.parse(rawResult);

            if (initialData.error) {
                vscode.window.showErrorMessage("Python Error: " + initialData.error);
                return;
            }

            if (initialData.file_path) {
                // 2. Read the actual data from the temp file
                const jsonContent = fs.readFileSync(initialData.file_path, 'utf-8');
                
                // 3. Parse the big data
                const finalData = JSON.parse(jsonContent);

                // 4. Send to Webview
                if (currentPanel) {
                    currentPanel.webview.postMessage(finalData);
                }

                // Optional: Delete the temp file to keep things clean
                fs.unlinkSync(initialData.file_path);
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