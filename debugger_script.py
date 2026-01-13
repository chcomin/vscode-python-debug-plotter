import json
import base64
import tempfile
import os

def _vscode_extension_extract_data(variable):
    try:
        # --- 1. DETECT AND UNWRAP TENSORS ---
        type_str = str(type(variable))
        if 'torch' in type_str and 'Tensor' in type_str:
            variable = variable.detach().cpu().numpy()
        
        import numpy as np
        
        # --- 2. DETECT GRAPH TYPES (NetworkX) ---
        is_graph = False
        graph_data = {}
        
        # Check for NetworkX without crashing if not installed
        try:
            import networkx as nx
            if isinstance(variable, (nx.Graph, nx.DiGraph, nx.MultiGraph)):
                is_graph = True
                G = variable
                
                # A. Extract Positions (Crucial for Medical/Vessel Graphs)
                # We look for common attribute names used in segmentation
                pos = {}
                nodes = list(G.nodes())
                
                # Try to find existing layout in node attributes
                first_node = nodes[0] if nodes else None
                if first_node is not None:
                    node_attrs = G.nodes[first_node]
                    # heuristics for coordinate attributes
                    for key in ['pos', 'position', 'coord', 'coordinates', 'xy', 'loc']:
                        if key in node_attrs:
                            # Extract all positions
                            try:
                                pos = {n: G.nodes[n][key] for n in nodes}
                                break
                            except KeyError: 
                                pass
                
                # Fallback: Compute Spring Layout if no coords found
                if not pos:
                    # Limit iterations for speed on large graphs
                    pos = nx.spring_layout(G, scale=100, iterations=50)

                # B. Serialize Nodes
                node_x = []
                node_y = []
                # Map node ID to index for edge construction
                node_map = {} 
                
                for i, n in enumerate(nodes):
                    p = pos[n]
                    # Handle 2D or 3D positions (project 3D to 2D for now)
                    node_x.append(float(p[0]))
                    node_y.append(float(p[1]))
                    node_map[n] = i

                # C. Serialize Edges
                edge_x = []
                edge_y = []
                
                for u, v in G.edges():
                    if u in node_map and v in node_map:
                        x0, y0 = node_x[node_map[u]], node_y[node_map[u]]
                        x1, y1 = node_x[node_map[v]], node_y[node_map[v]]
                        
                        # Plotly line segments need 'None' to break the line between edges
                        edge_x.extend([x0, x1, None])
                        edge_y.extend([y0, y1, None])

                graph_data = {
                    "type": "graph",
                    "node_x": node_x,
                    "node_y": node_y,
                    "edge_x": edge_x,
                    "edge_y": edge_y,
                    "num_nodes": len(nodes),
                    "num_edges": G.number_of_edges()
                }

        except ImportError:
            pass # NetworkX not installed

        # --- 3. HANDLE VISUALIZATION TYPES ---
        
        output_data = {}

        if is_graph:
            output_data = graph_data
            
        # Point Cloud Detection 
        elif hasattr(variable, 'shape') and variable.ndim == 2:
            if variable.shape[1] == 2:
                output_data = {
                    "type": "points",
                    "data": variable.tolist(),
                    "shape": variable.shape
                }
            elif variable.shape[1] == 3:
                # NEW: 3D Point Cloud
                output_data = {
                    "type": "points3d",
                    "data": variable.tolist(),
                    "shape": variable.shape
                }

        # Image Detection
        elif hasattr(variable, 'shape'):
            # Standard Image Logic
            if variable.ndim == 3:
                C, H, W = variable.shape
                if C in [1, 3, 4] and H > 4 and W > 4:
                    variable = np.transpose(variable, (1, 2, 0)) # type: ignore
            
            # Normalize
            if variable.dtype.kind == 'f':
                v_min, v_max = variable.min(), variable.max()
                if v_max - v_min > 0:
                    variable = (variable - v_min) / (v_max - v_min) * 255.0
                variable = variable.astype(np.uint8)
            
            raw_bytes = variable.tobytes(order='C')
            b64_data = base64.b64encode(raw_bytes).decode('utf-8')
            
            output_data = {
                "type": "image",
                "dtype": str(variable.dtype),
                "shape": variable.shape,
                "data": b64_data
            }

        # --- WRITE TO TEMP FILE ---
        fd, path = tempfile.mkstemp(suffix='.json', text=True)
        with os.fdopen(fd, 'w') as tmp:
            json.dump(output_data, tmp)
            
        return json.dumps({"file_path": path})

    except Exception as e:
        return json.dumps({"error": str(e)})