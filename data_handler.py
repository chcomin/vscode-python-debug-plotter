import json
import base64
import tempfile
import os
import numpy as np

def get_data(variable):
    """Get json visualization data from a variable."""

    if hasattr(variable, "nodes") and hasattr(variable, "edges"):
        # Networkx-like object
        return get_graph_data(variable)
    elif hasattr(variable, 'cpu') and hasattr(variable, 'detach'):
        # PyTorch Tensor-like object
        variable = variable.detach().cpu().numpy()
    
    try:
        # Try to convert to numpy array
        np_array = np.asarray(variable)
    except (ValueError, TypeError, RuntimeError) as e:
        raise TypeError("Cannot convert variable to numpy array.") from e
    
    return get_numpy_data(np_array)

def get_numpy_data(np_array):
    """Extract visualization data from a numpy array."""

    ndim = np_array.ndim
    shape = np_array.shape

    # if ndim == 1:
        # TODO: Show 1D array as histogram
        #output_data = {
        #    "type": "array1d",
        #    "data": np_array.tolist(),
        #    "shape": np_array.shape
        #}
    # Assume that the array contains points
    if ndim == 2 and shape[1] in [2, 3]:
        if shape[1] == 2:
            type = "points"
        elif shape[1] == 3:
            type = "points3d"

        output_data = {
            "type": type,
            "data": np_array.tolist(),
            "shape": np_array.shape
        }

    # Assume that the array contains an image
    elif ndim == 2 or ndim == 3:
        if ndim == 2:
            # Insert channel dimension
            np_array = np_array[..., None]

        C, H, W = np_array.shape
        # Heuristic to detect if channel is first
        if C in [1, 3, 4] and H > 4 and W > 4:
            np_array = np.transpose(np_array, (1, 2, 0)) # type: ignore
    
        # Intensity normalization

        # If integer with range outside [0, 255], the array requires normalization
        if np_array.dtype.kind == 'i' and (np_array.max() > 255 or np_array.min() < 0):
            np_array = np_array.astype(np.float32)

        # If float, normalize to [0, 255]
        if np_array.dtype.kind == 'f':
            v_min, v_max = np_array.min(), np_array.max()
            if v_max - v_min > 1e-8: 
                np_array = (np_array - v_min) / (v_max - v_min) * 255.0
            else:
                # Array is constant. 
                # If val > 0, make it white, else black.
                if v_max > 0:
                    np_array.fill(255.0)
                else:
                    np_array.fill(0.0)
        np_array = np_array.astype(np.uint8)
        
        raw_bytes = np_array.tobytes(order='C')
        b64_data = base64.b64encode(raw_bytes).decode('utf-8')
        
        output_data = {
            "type": "image",
            "dtype": str(np_array.dtype),
            "shape": np_array.shape,
            "data": b64_data
        }
    else:
        raise ValueError(f"Numpy array shape {shape} not supported for visualization.")

    return output_data

def get_graph_data(graph):
    """Extract graph data for visualization from a NetworkX-like graph object."""
   
    pos = {}
    nodes = list(graph.nodes())
    
    # Try to find existing layout in node attributes
    first_node = nodes[0] if nodes else None
    if first_node is not None:
        node_attrs = graph.nodes[first_node]
        # heuristics for coordinate attributes
        for key in ['pos', 'position', 'coord', 'coordinates', 'xy', 'loc']:
            if key in node_attrs:
                # Extract all positions
                try:
                    # Check if ALL nodes have the key found in the first node
                    if all(key in graph.nodes[n] for n in nodes):
                        pos = {n: graph.nodes[n][key] for n in nodes}
                        break
                except KeyError: 
                    pass
    
    # Fallback: Compute Spring Layout if no coords found
    if not pos:
        try:
            import networkx as nx
        except ImportError as e:
            raise ImportError(
                "Nodes in the graph need to have a 'pos', 'position', 'coord', 'coordinates', 'xy', "
                "or 'loc' attribute. Otherwise, NetworkX is required to automatically compute " \
                "the graph layout.") from e
            
        # Limit iterations for speed on large graphs
        pos = nx.spring_layout(graph, scale=100, iterations=50)

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
    
    edges = list(graph.edges())
    for u, v in edges:
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
        "num_edges": len(edges)
    }
   
    return graph_data

def _vscode_extension_extract_data(variable):
    try:
        output_data = get_data(variable)
        # --- WRITE TO TEMP FILE ---
        fd, path = tempfile.mkstemp(suffix='.json', text=True)
        with os.fdopen(fd, 'w') as tmp:
            json.dump(output_data, tmp)
            
        return json.dumps({"file_path": path})

    except Exception as e:
        return json.dumps({"error": str(e)})