// media/main.js

const vscode = acquireVsCodeApi();
let initialData = null; 

window.addEventListener('message', event => {
    const message = event.data;
    
    if (message.error) {
        document.getElementById('status').textContent = "Error: " + message.error;
        return;
    }

    // Pass directly to the router
    routeMessage(message);
});

window.addEventListener('resize', () => {
    const plotContainer = document.getElementById('plot-container');
    if (plotContainer && plotContainer.data) {
        Plotly.Plots.resize(plotContainer);
    }
});

function resetPlotContainer() {
    const tooltip = document.getElementById('custom-tooltip');
    if (tooltip) {
        tooltip.style.display = 'none'; // Force hide the tooltip
    }

    const oldDiv = document.getElementById('plot-container');
    if (oldDiv) {
        // Cloning the node removes all event listeners attached via addEventListener
        const newDiv = oldDiv.cloneNode(false); 
        oldDiv.parentNode.replaceChild(newDiv, oldDiv);
    }
}

// 2. Logic to handle the data once Plotly is ready
function routeMessage(msg) {

    document.getElementById('status').textContent = "Rendering...";

    resetPlotContainer();

    requestAnimationFrame(() => {
        try {
            if (msg.type === 'image') {
                renderImage(msg);
            } 
            else if (msg.type === 'points2d') {
                renderPoints2D(msg);
            } 
            else if (msg.type === 'points3d') {
                renderPoints3D(msg);
            } 
            else if (msg.type === 'graph2d') {
                renderGraph(msg);
            } 
            else if (msg.type === 'graph3d') {
                renderGraph3D(msg);
            }
            else if (msg.type === 'array1d') {
                renderArray1D(msg);
            }
            else if (msg.type === 'object') {
                renderObject(msg);
            }
        } catch (e) {
            document.getElementById('status').textContent = "Render Crash: " + e.message;
            console.error(e);
        }
    });
}

/**
 * Render an image with robust pixel-to-data mapping and custom tooltip. A canvas is used
 * to decode and display the image, while mouse events are handled to show pixel values
 *
 * @param {Object} msg - The message object containing image data and metadata.
 * @returns {void}
 */
function renderImage(msg) {
    const plotDiv = document.getElementById('plot-container');
    const status = document.getElementById('status');
    const tooltip = getOrCreateTooltip();

    const h = msg.shape[0];
    const w = msg.shape[1];
    const channels = msg.shape.length > 2 ? msg.shape[2] : 1;
    
    const vMin = msg.orig_min !== undefined ? msg.orig_min : 0;
    const vMax = msg.orig_max !== undefined ? msg.orig_max : 255;
    const range = vMax - vMin;

    status.textContent = `Image: ${msg.dtype} [${w}x${h}x${channels}], min: ${fmt(vMin)}, max: ${fmt(vMax)}`;

    // 1. Prepare Flat Data for Fast Lookup
    const cleanB64 = msg.data.replace(/[^A-Za-z0-9+/=]/g, "");
    const rawString = atob(cleanB64);
    const bytes = new Uint8Array(rawString.length);
    for (let i = 0; i < rawString.length; i++) {
        bytes[i] = rawString.charCodeAt(i);
    }

    // 2. Create Layout Image Source (Canvas)
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(w, h);
    
    for (let i = 0; i < w * h; i++) {
        const tIdx = i * 4; 
        const sIdx = i * channels;
        if (channels === 1) {
            const val = bytes[sIdx];
            imgData.data[tIdx] = val; imgData.data[tIdx+1] = val; imgData.data[tIdx+2] = val; imgData.data[tIdx+3] = 255;
        } else {
            imgData.data[tIdx] = bytes[sIdx]; imgData.data[tIdx+1] = bytes[sIdx+1]; imgData.data[tIdx+2] = bytes[sIdx+2]; imgData.data[tIdx+3] = 255;
        }
    }
    ctx.putImageData(imgData, 0, 0);
    const imageSource = canvas.toDataURL();

    // 3. Setup Plotly Layout
    const layout = {
        margin: { t: 0, l: 0, r: 0, b: 0 },
        //xaxis: { range: [0, w], showgrid: false, zeroline: false, side: 'top' },
        xaxis: { visible: false,  range: [0, w] },        
        // Note: range [h, 0] sets 'h' at the visual bottom, '0' at top
        //yaxis: { range: [h, 0], showgrid: false, zeroline: false, scaleanchor: 'x' },
        yaxis: { visible: false, range: [h, 0],  scaleanchor: 'x' },
        images: [{
            source: imageSource,
            xref: "x", yref: "y",
            x: 0, y: 0,
            sizex: w, sizey: h,
            sizing: "stretch",
            layer: "below"
        }],
        dragmode: "pan",
        plot_bgcolor: "#1e1e1e", paper_bgcolor: "#1e1e1e", font: { color: "#ccc" },
        hovermode: false
    };

    const config = {
        responsive: true,
        scrollZoom: true,
        modeBarButtonsToRemove: ['autoScale2d'],
        displaylogo: false
    };

    Plotly.newPlot(plotDiv, [], layout, config)
    .then(gd => {
        
        // 4. Robust Mouse Event Listener
        gd.addEventListener('mousemove', function(evt) {
            // Get the bounding rectangle of the container
            const rect = gd.getBoundingClientRect();
            
            // Access Plotly's calculated internal layout details
            // This contains the ACTUAL margins and axis ranges (even after zoom)
            const fullLayout = gd._fullLayout;
            const xaxis = fullLayout.xaxis;
            const yaxis = fullLayout.yaxis;
            const margin = fullLayout.margin;

            // Calculate Mouse Position relative to the "Plot Area" (inside margins)
            // xPixel and yPixel are 0 at the Top-Left of the graph grid
            const xPixel = evt.clientX - rect.left - margin.l;
            const yPixel = evt.clientY - rect.top - margin.t;

            // Reject if mouse is in the margins (outside the actual graph)
            if (xPixel < 0 || xPixel > xaxis._length || yPixel < 0 || yPixel > yaxis._length) {
                tooltip.style.display = 'none';
                return;
            }

            // --- Robust Linear Interpolation ---
            // Map pixel coordinate to Data coordinate using current Ranges
            // Formula: Data = Start + (Pixel / Length) * (End - Start)
            
            // X-Axis: Standard Left-to-Right
            const xPct = xPixel / xaxis._length;
            const xVal = xaxis.range[0] + xPct * (xaxis.range[1] - xaxis.range[0]);

            // Y-Axis: Pixels go Top-to-Bottom (0 to Length)
            // But Plotly Axes usually have range[0] at Bottom (visual min) and range[1] at Top (visual max)
            // HOWEVER, we set range: [h, 0], so range[0]=h (Bottom), range[1]=0 (Top).
            // So: Pixel 0 (Top) should map to range[1] (0). Pixel Length (Bottom) maps to range[0] (h).
            const yPct = yPixel / yaxis._length;
            const yVal = yaxis.range[1] + yPct * (yaxis.range[0] - yaxis.range[1]);

            const xIndex = Math.floor(xVal);
            const yIndex = Math.floor(yVal);

            // Bounds Check (Data Space)
            if (xIndex >= 0 && xIndex < w && yIndex >= 0 && yIndex < h) {
                const fileIdx = (yIndex * w + xIndex) * channels;
                let text = `<b>x:</b> ${xIndex} <b>y:</b> ${yIndex}<br><b>Val:</b> `;

                if (channels === 1) {
                    const rawVal = bytes[fileIdx];
                    const valNorm = rawVal / 255.0;
                    const originalVal = (valNorm * range) + vMin;
                    text += fmt(originalVal);
                } else {
                    const vals = [];
                    for(let c=0; c<channels; c++) {
                        const rawVal = bytes[fileIdx+c];
                        const valNorm = rawVal / 255.0;
                        const originalVal = (valNorm * range) + vMin;
                        vals.push(fmt(originalVal));
                    }
                    text += `(${vals.join(', ')})`;
                }

                tooltip.style.display = 'block';
                // Offset the tooltip slightly so it doesn't get stuck under the mouse cursor
                tooltip.style.left = (evt.clientX + 15) + 'px';
                tooltip.style.top = (evt.clientY + 15) + 'px';
                tooltip.innerHTML = text;
            } else {
                tooltip.style.display = 'none';
            }
        });

        gd.addEventListener('mouseleave', () => {
            tooltip.style.display = 'none';
        });
    });
}

// Helper to manage the custom tooltip DOM element
function getOrCreateTooltip() {
    let tooltip = document.getElementById('custom-tooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'custom-tooltip';
        tooltip.style.position = 'fixed'; // Important: Fixed prevents scroll issues
        tooltip.style.background = 'rgba(20, 20, 20, 0.9)';
        tooltip.style.border = '1px solid #555';
        tooltip.style.color = '#fff';
        tooltip.style.padding = '8px';
        tooltip.style.borderRadius = '4px';
        tooltip.style.pointerEvents = 'none'; // Let mouse pass through
        tooltip.style.zIndex = '1000';
        tooltip.style.fontFamily = 'monospace';
        tooltip.style.fontSize = '12px';
        tooltip.style.display = 'none';
        document.body.appendChild(tooltip);
    }
    return tooltip;
}

function renderPoints2D(msg) {

    const markerSize = 5;

    const plotDiv = document.getElementById('plot-container');
    const count = msg.data.length;
    document.getElementById('status').textContent = `Number of points: ${count}`;
    
    const x = new Float32Array(count);
    const y = new Float32Array(count);
    for(let i=0; i<count; i++) {
        x[i] = msg.data[i][0];
        y[i] = msg.data[i][1];
    }

    const traceType = count < 5000 ? 'scatter' : 'scattergl';

    const trace = {
        x: x, y: y,
        mode: 'markers',
        type: traceType, 
        marker: { size: markerSize, opacity: 0.8 }
    };

    const layout = {
        title: '2D Point Cloud',
        margin: { t: 30, l: 40, r: 20, b: 30 },
        dragmode: "pan",
        xaxis: { gridcolor: '#444', zerolinecolor: '#666' },
        yaxis: { scaleanchor: 'x', gridcolor: '#444', zerolinecolor: '#666' },
        plot_bgcolor: "#1e1e1e", paper_bgcolor: "#1e1e1e", font: { color: "#ccc" },
        hovermode: 'closest'
    };

    const config = {
        responsive: true,
        scrollZoom: true,
        modeBarButtonsToRemove: ['toImage', 'select2d', 'lasso2d', 'autoScale2d'],
        displaylogo: false
    };

    Plotly.newPlot(plotDiv, [trace], layout, config);
}

function renderPoints3D(msg) {
    const plotDiv = document.getElementById('plot-container');
    const count = msg.data.length;
    document.getElementById('status').textContent = `Number of points: ${count}`;
    
    const x = new Float32Array(count);
    const y = new Float32Array(count);
    const z = new Float32Array(count);
    for(let i=0; i<count; i++) {
        x[i] = msg.data[i][0];
        y[i] = msg.data[i][1];
        z[i] = msg.data[i][2];
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

    const config = {
        responsive: true,
        scrollZoom: true,
        modeBarButtonsToRemove: ['toImage', 'resetCameraLastSave3d'],
        displaylogo: false
    };

    Plotly.newPlot(plotDiv, [trace], layout, config);
}

function renderArray1D(msg) {
    const plotDiv = document.getElementById('plot-container');
    const count = msg.data.length;
    document.getElementById('status').textContent = `Number of values: ${count}`;

    const trace = {
        x: msg.data,
        type: 'histogram',
        marker: { 
            color: '#1f77b4',
            line: {
                color: 'black', 
                width: 1        
            }            
        }
    };

    const layout = {
        title: 'Data Distribution',
        margin: { t: 40, l: 40, r: 20, b: 30 },
        xaxis: { gridcolor: '#444', zerolinecolor: '#666' },
        yaxis: { gridcolor: '#444', zerolinecolor: '#666' },
        plot_bgcolor: "#1e1e1e", paper_bgcolor: "#1e1e1e", font: { color: "#ccc" }
    };
    const config = {
        responsive: true,
        scrollZoom: true,
        modeBarButtonsToRemove: ['toImage', 'select2d', 'lasso2d', 'autoScale2d'],
        displaylogo: false
    };
    Plotly.newPlot(plotDiv, [trace], layout, config);
}

function renderObject(msg) {
    const plotDiv = document.getElementById('plot-container');
    document.getElementById('status').textContent = "Object Representation";

    if (typeof Plotly !== 'undefined') {
        Plotly.purge(plotDiv);
    }

    plotDiv.innerHTML = '';
    const pre = document.createElement('pre');
    pre.style.cssText = 'color: #ccc; padding: 20px; white-space: pre-wrap; font-family: monospace; overflow: auto; height: 100%; box-sizing: border-box; margin: 0;';
    pre.textContent = msg.data;
    plotDiv.appendChild(pre);
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

    const config = {
        responsive: true,
        scrollZoom: true,
        modeBarButtonsToRemove: ['toImage', 'resetCameraLastSave3d'],
        displaylogo: false
    };

    Plotly.newPlot(plotDiv, traces, layout, config);
}

// Helper function to format based on magnitude
const fmt = (n) => {
  const abs = Math.abs(n);
  
  if (n === 0) {return "0.000";}

  if (abs < 0.001 || abs > 1000) {
    return n.toExponential(3); // Scientific notation with 3 decimals
  }

  return n.toFixed(3);
};



// 4. Initialization Loop
// Check every 50ms if Plotly has finished loading from the CDN
// This function was needed when Plotly was not bundled with the extension.
// let attempts = 0;
// function checkPlotly() {
//     if (typeof Plotly !== 'undefined') {
//         isPlotlyLoaded = true;
//         if (initialData) {
//             routeMessage(initialData);
//             initialData = null;
//         }
//         window.addEventListener('resize', () => {
//             Plotly.Plots.resize(document.getElementById('plot-container'));
//         });
//     } else {
//         attempts++;
//         if (attempts > 200) { // 10 seconds timeout
//             document.getElementById('status').textContent = 
//                 "Error: Plotly.js failed to load from CDN. Check internet connection.";
//             return;
//         }
//         setTimeout(checkPlotly, 50);
//     }
// }
// checkPlotly();

vscode.postMessage({ command: 'ready' });