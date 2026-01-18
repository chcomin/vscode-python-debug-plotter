import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getWebviewContent } from './webview';

let currentPanel: vscode.WebviewPanel | undefined = undefined;
let isWebviewReady = false;
let currentExpression: string | undefined = undefined; // Remember what we are plotting

export function activate(context: vscode.ExtensionContext) {

    // Sets the variable and triggers the first plot
    const disposable = vscode.commands.registerCommand('python-debug-plotter.plotVariable', async (variableContext) => {
        
        const session = vscode.debug.activeDebugSession;
        if (!session) {
            vscode.window.showErrorMessage('No active debug session found! Start debugging first.');
            return;
        }

        let variableName: string | undefined;

        // Case A: Triggered from Right-Click in Variables View
        if (variableContext) {
            // Check 1: Is it the VS Code wrapper?
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

        // Save the expression for auto-updates
        currentExpression = variableName;

        // Initialize Panel if needed
        if (currentPanel) {
            currentPanel.reveal(vscode.ViewColumn.Two);
        } else {
            createPanel(context);
        }

        // Trigger the first update (verbose mode: show errors)
        await updateWebview(context, session, false);
    });

    // Auto-updates when stepping or changing stack frames
    const stackChangeDisposable = vscode.debug.onDidChangeActiveStackItem(async (item) => {
        // Only update if we have a panel, a valid session, and a variable is selected
        if (currentPanel && currentExpression && item && item instanceof vscode.DebugStackFrame) {
            // We pass 'true' for silent mode to avoid popups while stepping
            await updateWebview(context, item.session, true, item.frameId);
        }
    });

    // Close everything when Debugging Stops
    const sessionTerminateDisposable = vscode.debug.onDidTerminateDebugSession((session) => {
        // Optional: Check if the session that ended is the one we were using, 
        // or just close the panel regardless (simplest approach).
        if (currentPanel) {
            currentPanel.dispose(); 
        }
    });

    context.subscriptions.push(disposable, stackChangeDisposable, sessionTerminateDisposable);
}

function createPanel(context: vscode.ExtensionContext) {
    isWebviewReady = false;
    currentPanel = vscode.window.createWebviewPanel(
        'pythonDebugPlotter',
        `Plot: ${currentExpression || 'Variable'}`, // Dynamic Title
        vscode.ViewColumn.Two, 
        { 
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')]
        }
    );

    currentPanel.webview.onDidReceiveMessage(
        message => {
            if (message.command === 'ready') {isWebviewReady = true;}
        },
        undefined,
        context.subscriptions
    );

    currentPanel.onDidDispose(() => {
        currentPanel = undefined;
        isWebviewReady = false;
        currentExpression = undefined; // Reset state on close
    }, null, context.subscriptions);

    currentPanel.webview.html = getWebviewContent(currentPanel.webview, context.extensionUri);
}

// The Core Logic: Reusable update function
async function updateWebview(
    context: vscode.ExtensionContext, 
    session: vscode.DebugSession, 
    silent: boolean = false,
    explicitFrameId?: number
) {
    if (!currentPanel || !currentExpression) {return;}

    // Update Title
    currentPanel.title = `Plot: ${currentExpression}`;

    // Determine FrameID if not provided
    let frameId = explicitFrameId;
    if (!frameId) {
        const activeItem = vscode.debug.activeStackItem;
        if (activeItem && activeItem instanceof vscode.DebugStackFrame) {
            frameId = activeItem.frameId;
        }
    }

    const scriptPath = path.join(context.extensionPath, 'python', 'data_handler.py');
    const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
    const scriptB64 = Buffer.from(scriptContent).toString('base64');

    // Construct Python payload
    const pythonOneLiner = `(lambda d: [exec(__import__('base64').b64decode('${scriptB64}').decode('utf-8'), d), d['_vscode_extension_extract_data'](${currentExpression})][-1])({})`;

    try {

        let rawResult;
        try {
            const response = await session.customRequest('evaluate', {
                expression: pythonOneLiner,
                context: 'repl',
                frameId: frameId
            });
            rawResult = response.result;
        } catch (e) {
            throw new Error(`Script evaluation Failed: ${(e as Error).message}`);
        }    

        // Remove the outer quotes added by the Python Debugger (repr)
        // The debugger often returns: ' "{\"file_path\": ...}" '
        if (rawResult.startsWith("'") && rawResult.endsWith("'")) {
            rawResult = rawResult.slice(1, -1);
        } else if (rawResult.startsWith('"') && rawResult.endsWith('"')) {
            rawResult = rawResult.slice(1, -1);
        }

        let pathData;
        try {
            pathData = JSON.parse(rawResult);
        } catch (e) {
            throw new Error(`Returned Invalid JSON: ${(e as Error).message}`);
        }

        if (pathData.error) {
            throw new Error("Python Error: " + pathData.error);
        }

        if (pathData.file_path) {
            try {
                // Read the data from the temp file
                const jsonContent = fs.readFileSync(pathData.file_path, 'utf-8');
                const finalData = JSON.parse(jsonContent);

                // Send to Webview
                if (currentPanel) {
                    if (isWebviewReady) {
                        // Scenario A: Panel was already open or loaded very fast. Send immediately.
                        currentPanel.webview.postMessage(finalData);
                    } else {
                        // Scenario B: Panel is still parsing Plotly. Wait for the handshake.
                        // We attach a temporary listener specifically for this data packet.
                        let hasHandled = false;
                        const disposableListener = currentPanel.webview.onDidReceiveMessage(message => {
                            if (message.command === 'ready') {
                                if (!hasHandled && currentPanel) {
                                    currentPanel?.webview.postMessage(finalData);
                                    hasHandled = true;
                                }
                                disposableListener.dispose(); // Cleanup this one-time listener
                            }
                        });
                        // If the user closes the panel BEFORE 'ready' arrives, 
                        // we must kill this listener to prevent leaks.
                        // We attach this disposal logic to the panel's own disposal.
                        const cleanupListener = currentPanel.onDidDispose(() => {
                            disposableListener.dispose();
                            cleanupListener.dispose();
                        });
                    }
                }
            } catch (e) {
                throw new Error(`Temp File Read Failed: ${(e as Error).message}`);
            } finally {
                if (fs.existsSync(pathData.file_path)) {
                    // Clean up the temp file
                    fs.unlinkSync(pathData.file_path);
                }
            }
        }

    } catch (err) {
        const e = err as Error;
        // Important: If silent (auto-update), update the webview status text but DO NOT show a popup.
        // This handles cases where the variable goes out of scope during stepping.
        if (currentPanel) {
            currentPanel.webview.postMessage({ 
                error: silent ? `Variable '${currentExpression}' not available in this scope.` : e.message 
            });
        }
        
        if (!silent) {
            vscode.window.showErrorMessage(`Error: ${e.message}`);
        }
    }
}

export function deactivate() {}