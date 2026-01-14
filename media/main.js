// media/main.js

const vscode = acquireVsCodeApi();
let initialData = null; 
let isPlotlyLoaded = false;

// 1. Listen immediately for data from extension
window.addEventListener('message', event => {
    const message = event.data;
    if (message.error) {
        document.getElementById('status').textContent = "Error: " + message.error;
        return;
    }
    
    if (isPlotlyLoaded) {
        routeMessage(message);
    } else {
        initialData = message;
        document.getElementById('status').textContent = "Data received. Loading Plotly...";
    }
});

// 2. Logic to handle the data once Plotly is ready
function routeMessage(msg) {
    try {
        if (msg.type === 'image') {
            renderImage(msg);
        } 
        else if (msg.type === 'points') {
            renderPoints(msg);
        } 
        else if (msg.type === 'points3d') {
            renderPoints3D(msg);
        } 
        else if (msg.type === 'graph') {
            renderGraph(msg);
        } 
        else if (msg.type === 'graph3d') {
            renderGraph3D(msg);
        }
    } catch (e) {
        document.getElementById('status').textContent = "Render Crash: " + e.message;
        console.error(e);
    }
}

// 3. Renderers
function renderImage(msg) {
    const plotDiv = document.getElementById('plot-container');
    const helperCanvas = document.getElementById('helperCanvas');
    const helperCtx = helperCanvas.getContext('2d');
    const status = document.getElementById('status');

    const h = msg.shape[0];
    const w = msg.shape[1];
    const channels = msg.shape.length > 2 ? msg.shape[2] : 1;
    
    status.textContent = `Image: ${msg.dtype} [${w}x${h}x${channels}]`;

    const cleanB64 = msg.data.replace(/[^A-Za-z0-9+/=]/g, "");
    const rawString = atob(cleanB64);
    const bytes = new Uint8ClampedArray(rawString.length);
    for (let i = 0; i < rawString.length; i++) {
        bytes[i] = rawString.charCodeAt(i);
    }

    const imageData = helperCtx.createImageData(w, h);
    const data = imageData.data;
    for (let i = 0; i < w * h; i++) {
        const tIdx = i * 4; 
        const sIdx = i * channels;
        const val = bytes[sIdx];
        if (channels === 1) {
            data[tIdx] = val; data[tIdx+1] = val; data[tIdx+2] = val; data[tIdx+3] = 255;
        } else {
            data[tIdx] = bytes[sIdx]; data[tIdx+1] = bytes[sIdx+1]; 
            data[tIdx+2] = bytes[sIdx+2]; data[tIdx+3] = 255;
        }
    }

    helperCanvas.width = w; helperCanvas.height = h;
    helperCtx.putImageData(imageData, 0, 0);
    
    const layout = {
        margin: { t: 30, l: 30, r: 30, b: 30 },
        xaxis: { range: [0, w], showgrid: false, zeroline: false },
        yaxis: { range: [h, 0], showgrid: false, zeroline: false, scaleanchor: 'x' },
        images: [{
            source: helperCanvas.toDataURL(),
            xref: "x", yref: "y",
            x: 0, y: 0, sizex: w, sizey: h,
            sizing: "stretch", layer: "below"
        }],
        dragmode: "pan",
        plot_bgcolor: "#1e1e1e", paper_bgcolor: "#1e1e1e", font: { color: "#ccc" },
        hovermode: false
    };
    Plotly.newPlot(plotDiv, [], layout, { scrollZoom: true, responsive: true });
}

function renderPoints(msg) {
    const plotDiv = document.getElementById('plot-container');
    const count = msg.data.length;
    document.getElementById('status').textContent = `Point Cloud: ${count} points`;
    
    const x = [], y = [];
    for(let i=0; i<count; i++) {
        x.push(msg.data[i][0]);
        y.push(msg.data[i][1]);
    }

    const trace = {
        x: x, y: y,
        mode: 'markers',
        type: 'scatter', 
        marker: { size: 5, color: y, colorscale: 'Viridis', showscale: true, opacity: 0.8 }
    };

    const layout = {
        title: '2D Point Cloud',
        margin: { t: 30, l: 40, r: 20, b: 30 },
        dragmode: "pan",
        xaxis: { gridcolor: '#444', zerolinecolor: '#666' },
        yaxis: { scaleanchor: 'x', gridcolor: '#444', zerolinecolor: '#666' },
        plot_bgcolor: "#1e1e1e", paper_bgcolor: "#1e1e1e", font: { color: "#ccc" },
        hovermode: count > 5000 ? false : 'closest'
    };
    Plotly.newPlot(plotDiv, [trace], layout, { scrollZoom: true, responsive: true });
}

function renderPoints3D(msg) {
    const plotDiv = document.getElementById('plot-container');
    const count = msg.data.length;
    document.getElementById('status').textContent = `3D Cloud: ${count} points`;
    
    const x = [], y = [], z = [];
    for(let i=0; i<count; i++) {
        x.push(msg.data[i][0]);
        y.push(msg.data[i][1]);
        z.push(msg.data[i][2]);
    }

    const trace = {
        x: x, y: y, z: z,
        mode: 'markers',
        type: 'scatter3d',
        marker: { size: 3, color: z, colorscale: 'Viridis', opacity: 0.8 }
    };

    const layout = {
        title: '3D Point Cloud',
        margin: { t: 30, l: 0, r: 0, b: 0 },
        scene: {
            aspectmode: 'data',
            xaxis: { title: 'X', gridcolor: '#444', zerolinecolor: '#666', backgroundcolor: '#1e1e1e' },
            yaxis: { title: 'Y', gridcolor: '#444', zerolinecolor: '#666', backgroundcolor: '#1e1e1e' },
            zaxis: { title: 'Z', gridcolor: '#444', zerolinecolor: '#666', backgroundcolor: '#1e1e1e' },
            camera: { eye: { x: 1.5, y: 1.5, z: 1.5 } }
        },
        paper_bgcolor: "#1e1e1e", font: { color: "#ccc" }
    };
    Plotly.newPlot(plotDiv, [trace], layout, { responsive: true });
}

function renderGraph(msg) { renderGraphCommon(msg, false); }
function renderGraph3D(msg) { renderGraphCommon(msg, true); }

function renderGraphCommon(msg, is3D) {
    document.getElementById('status').textContent = `Graph: ${msg.num_nodes} nodes, ${msg.num_edges} edges`;
    const plotDiv = document.getElementById('plot-container');
    const traces = [];

    const edgeTrace = {
        x: msg.edge_x, y: msg.edge_y,
        mode: 'lines',
        line: { color: '#586e75b5', width: 1 },
        type: is3D ? 'scatter3d' : 'scatter',
        hoverinfo: 'none'
    };
    if (is3D) {
        edgeTrace.z = msg.edge_z;
    }
    traces.push(edgeTrace);

    const nodeTrace = {
        x: msg.node_x, y: msg.node_y,
        mode: 'markers',
        marker: { color: '#1f77b4', size: is3D ? 4 : 6 },
        type: is3D ? 'scatter3d' : 'scatter'
    };
    if (is3D) {
        nodeTrace.z = msg.node_z;
    }
    traces.push(nodeTrace);

    const layout = {
        title: 'Graph Topology',
        showlegend: false,
        margin: { t: 40, l: 20, r: 20, b: 20 },
        paper_bgcolor: "#1e1e1e", font: { color: "#ccc" }
    };

    if (is3D) {
        layout.scene = {
            aspectmode: 'data',
            xaxis: { showgrid: false, backgroundcolor: '#1e1e1e', showticklabels: false },
            yaxis: { showgrid: false, backgroundcolor: '#1e1e1e', showticklabels: false },
            zaxis: { showgrid: false, backgroundcolor: '#1e1e1e', showticklabels: false }
        };
    } else {
        layout.xaxis = { showgrid: false, zeroline: false, showticklabels: false };
        layout.yaxis = { showgrid: false, zeroline: false, showticklabels: false, scaleanchor: 'x' };
        layout.plot_bgcolor = "#1e1e1e";
        layout.dragmode = "pan";
    }

    Plotly.newPlot(plotDiv, traces, layout, { scrollZoom: true, responsive: true });
}

// 4. Initialization Loop
// Check every 50ms if Plotly has finished loading from the CDN
function checkPlotly() {
    if (typeof Plotly !== 'undefined') {
        isPlotlyLoaded = true;
        if (initialData) {
            routeMessage(initialData);
            initialData = null;
        }
        window.addEventListener('resize', () => {
            Plotly.Plots.resize(document.getElementById('plot-container'));
        });
    } else {
        setTimeout(checkPlotly, 50);
    }
}
checkPlotly();