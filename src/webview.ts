import * as vscode from 'vscode';

export function getWebviewContent(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { 
            background-color: var(--vscode-editor-background); 
            color: var(--vscode-editor-foreground);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
        }
        canvas {
            border: 1px solid var(--vscode-focusBorder);
            max-width: 90%;
            max-height: 90%;
            image-rendering: pixelated;
        }
        #status { font-family: monospace; margin-bottom: 10px; }
    </style>
</head>
<body>
    <div id="status">Waiting for data...</div>
    <canvas id="displayCanvas"></canvas>

    <script>
        const vscode = acquireVsCodeApi();
        const canvas = document.getElementById('displayCanvas');
        const ctx = canvas.getContext('2d');
        const status = document.getElementById('status');

        window.addEventListener('message', event => {
            const message = event.data; 

            if (message.error) {
                status.textContent = "Error: " + message.error;
                return;
            }

            try {
                if (message.type === 'image') {
                    renderImage(message);
                } else if (message.type === 'points') {
                    renderPoints(message);
                }
            } catch (e) {
                status.textContent = "JS Render Error: " + e.message;
            }
        });

        function renderImage(msg) {
            // Using standard quotes to avoid TypeScript confusion
            status.textContent = 'Image: ' + msg.dtype + ' ' + JSON.stringify(msg.shape);

            try {
                // 1. Aggressive Cleanup: Remove characters that break Base64
                var cleanB64 = msg.data.replace(/[^A-Za-z0-9+/=]/g, "");

                // 2. Fix Padding
                while (cleanB64.length % 4 > 0) {
                    cleanB64 += '=';
                }

                // 3. Decode
                var rawData = atob(cleanB64);
                var len = rawData.length;
                
                var height = msg.shape[0];
                var width = msg.shape[1];
                var channels = msg.shape.length > 2 ? msg.shape[2] : 1;

                canvas.width = width;
                canvas.height = height;

                var imgData = ctx.createImageData(width, height);
                var data = imgData.data;

                // 4. Fill Pixels
                for (var i = 0; i < len / channels; i++) {
                    var canvasIdx = i * 4;
                    var srcIdx = i * channels;

                    if (channels === 1) {
                        var val = rawData.charCodeAt(srcIdx);
                        data[canvasIdx] = val;     // R
                        data[canvasIdx + 1] = val; // G
                        data[canvasIdx + 2] = val; // B
                        data[canvasIdx + 3] = 255; // A
                    } else {
                        data[canvasIdx] = rawData.charCodeAt(srcIdx);     // R
                        data[canvasIdx + 1] = rawData.charCodeAt(srcIdx + 1); // G
                        data[canvasIdx + 2] = rawData.charCodeAt(srcIdx + 2); // B
                        data[canvasIdx + 3] = 255; // A
                    }
                }
                
                ctx.putImageData(imgData, 0, 0);

            } catch (e) {
                console.error(e);
                status.textContent = "Render Crash: " + e.message;
            }
        }

        function renderPoints(msg) {
            status.textContent = 'Points: ' + msg.data.length + ' items';
            
            var points = msg.data;
            var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

            for (var i = 0; i < points.length; i++) {
                var p = points[i];
                if (p[0] < minX) minX = p[0];
                if (p[0] > maxX) maxX = p[0];
                if (p[1] < minY) minY = p[1];
                if (p[1] > maxY) maxY = p[1];
            }

            var padding = 20;
            var width = 500; 
            var height = 500;
            canvas.width = width;
            canvas.height = height;

            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = '#1f77b4';

            var rangeX = maxX - minX || 1;
            var rangeY = maxY - minY || 1;

            for (var i = 0; i < points.length; i++) {
                var p = points[i];
                var x = ((p[0] - minX) / rangeX) * (width - 2 * padding) + padding;
                var y = height - (((p[1] - minY) / rangeY) * (height - 2 * padding) + padding);
                
                ctx.fillRect(x, y, 2, 2);
            }
        }
    </script>
</body>
</html>`;
}