import * as vscode from 'vscode';

export function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    
    // Create URIs for local resources
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'main.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'styles.css'));

    const plotlyUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'plotly.min.js'));

    // 'unsafe-eval' and 'worker-src blob:' required for Plotly WebGL
    const csp = `
        default-src 'none';
        style-src ${webview.cspSource} 'unsafe-inline';
        script-src ${webview.cspSource} 'unsafe-inline' 'unsafe-eval';
        img-src ${webview.cspSource} https: data:;
        worker-src blob:; 
    `;
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    
    <link href="${styleUri}" rel="stylesheet">
</head>
<body>
    <div id="status">Waiting for data...</div>
    <div id="plot-container"></div>
    <canvas id="helperCanvas"></canvas>

    <script src="${plotlyUri}"></script>
    <script src="${scriptUri}"></script>
</body>
</html>`;
}