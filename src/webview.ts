import * as vscode from 'vscode';

export function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    
    // Convert local file paths to Webview URIs
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'main.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'styles.css'));

    // Content Security Policy
    // 1. Allows loading styles from our extension
    // 2. Allows loading scripts from our extension AND the Plotly CDN
    // 3. Allows data: images (for our canvas)
    const csp = `default-src 'none'; img-src 'self' data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline' https://cdn.plot.ly;`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    
    <link href="${styleUri}" rel="stylesheet">
    
    <script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script>
</head>
<body>
    <div id="status">Waiting for data...</div>
    <div id="plot-container"></div>
    <canvas id="helperCanvas"></canvas>

    <script src="${scriptUri}"></script>
</body>
</html>`;
}