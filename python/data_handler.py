import json
import base64
import tempfile
import os
from dataclasses import is_dataclass, fields
from typing import Any

# Numpy is imported here because it is used on three functions. But it is only
# required if a numpy array was passed to the script, in which case the user
# has numpy installed.
try:
    import numpy as np
except ImportError:
    _has_numpy = False
else:
    _has_numpy = True


def is_1d_array(np_array):
    """Check if a numpy array is 1D."""
    return np_array.squeeze().ndim == 1

def is_image_array(np_array):
    """Check if a numpy array is likely an image."""
    is_image = False
    if np_array.ndim == 2 and np_array.shape[1] >= 4:
        # Not a point cloud (Nx2 or Nx3)
        is_image = True
    elif np_array.ndim == 3:
        D0, D1, D2 = np_array.shape
        if D0 > 4 and D1 > 4 and D2 in [1, 3, 4]:
            # Channels last
            is_image = True
        elif D0 in [1, 3, 4] and D1 > 4 and D2 > 4:
            # Channels first
            is_image = True
    return is_image

def is_point_array(np_array):
    """Check if a numpy array is likely a point cloud."""
    return np_array.ndim == 2 and np_array.shape[1] in [2, 3]

def is_tensor_like_pytorch(variable):
    """Check if a variable behaves like a PyTorch tensor."""
    return hasattr(variable, 'cpu') and hasattr(variable, 'detach')

def has_numpy_conversion(variable):
    """Check if a variable has builtin numpy conversion."""
    return hasattr(variable, 'numpy')

def is_graph_like(variable):
    """Check if a variable is a NetworkX-like graph."""
    return hasattr(variable, "nodes") and hasattr(variable, "edges")

def is_plottable_array(variable):
    """Check if a variable is a numpy array that can be plotted (1D values, point cloud or image)."""

    if not _has_numpy:
        return False

    is_plottable = False
    try:
        # Try to convert to numpy array
        np_array = np.asarray(variable)
    except (ValueError, TypeError, RuntimeError, NameError):
        pass
    else:
        if np_array.dtype != object:
            np_array = np_array.squeeze()
            if is_1d_array(np_array) or is_image_array(np_array) or is_point_array(np_array):
                is_plottable = True

    return is_plottable

def get_data(variable):
    """Get json visualization data from a variable."""

    if is_graph_like(variable):
        return get_graph_data(variable)
    if is_tensor_like_pytorch(variable):
        variable = variable.detach().cpu()
    if _has_numpy and has_numpy_conversion(variable):
        variable = variable.numpy()
    
    is_plottable = is_plottable_array(variable)
    if is_plottable and _has_numpy:
        np_array = np.asarray(variable)
        return get_numpy_data(np_array)
    else:
        repr = inspect_object(variable)

        output_data = {
            "type": "object",
            "data": repr,
        }

        return output_data

def get_numpy_data(np_array):
    """Extract visualization data from a numpy array."""

    np_array = np_array.squeeze()
    ndim = np_array.ndim
    shape = np_array.shape
    dtype = np_array.dtype

    if is_1d_array(np_array):
        # 1D array
        # Replace NaN and inf with zeros to not break JSON serialization
        # TODO: Better handling of NaNs and infs?
        data_list = np.where(~np.isfinite(np_array), 0, np_array).tolist()
        output_data = {
            "type": "array1d",
            "data": data_list,
            "shape": np_array.shape
        }
    elif is_point_array(np_array):
        # Assume that the array contains points    
        if shape[1] == 3:
            type = "points3d"
        else:
            # Assume 2D points
            type = "points2d"

        output_data = {
            "type": type,
            "data": np_array.tolist(),
            "shape": np_array.shape
        }

    # Assume that the array contains an image
    elif is_image_array(np_array):
        if ndim == 2:
            # Insert channel dimension
            np_array = np_array[..., None]

        C, H, W = np_array.shape
        # Heuristic to detect if channel is first
        if C in [1, 3, 4] and H > 4 and W > 4:
            np_array = np_array.transpose((1, 2, 0)) # type: ignore

        # Get raw data for the plot tooltip
        raw_float_data = np_array.astype(np.float32).tobytes(order='C')
        raw_b64 = base64.b64encode(raw_float_data).decode('utf-8')
    
        # Capture original stats
        orig_min = float(np_array.min())
        orig_max = float(np_array.max())

        # Intensity normalization
        # In previous versions, integer images with values in the range [0, 255] were 
        # not normalized. The commented code below contains that logic in case it becomes
        # necessary to restore it.
        # If integer with range outside [0, 255], the array requires normalization
        #if np_array.dtype.kind == 'i' and (np_array.max() > 255 or np_array.min() < 0):
        #    np_array = np_array.astype(np.float32)

        # If float, normalize to [0, 255]
        #if np_array.dtype.kind == 'f':
        vis_array = np_array.astype(np.float32)

        if orig_max - orig_min > 1e-8: 
            vis_array = (vis_array - orig_min) / (orig_max - orig_min) * 255.0
        else:
            # Array is constant. 
            # If val > 0, make it white, else black.
            if orig_max > 0:
                vis_array.fill(255.0)
            else:
                vis_array.fill(0.0)
        vis_array = vis_array.astype(np.uint8)
        
        img_bytes = vis_array.tobytes(order='C')
        img_b64 = base64.b64encode(img_bytes).decode('utf-8')
        
        output_data = {
            "type": "image",
            "dtype": str(dtype),
            "shape": np_array.shape,
            "data": img_b64,
            "real_data": raw_b64,
            "orig_min": orig_min,
            "orig_max": orig_max            
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
                except Exception: 
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
        pos = nx.spring_layout(graph, scale=100, iterations=50, dim=3)

    if all(len(p) == 3 for p in pos.values()):
        is_3d = True
    elif all(len(p) == 2 for p in pos.values()):
        is_3d = False
    else:
        raise ValueError("Node positions must be all 2D or all 3D coordinates.")

    # Serialize Nodes
    node_x = []
    node_y = []
    node_z = []
    # Map node ID to index for edge construction
    node_map = {} 
    for i, n in enumerate(nodes):
        p = pos[n]
        node_x.append(float(p[0]))
        node_y.append(float(p[1]))
        if is_3d:
            node_z.append(float(p[2]))
        node_map[n] = i

    # Serialize Edges
    edge_x = []
    edge_y = []
    edge_z = []
    edges = list(graph.edges())
    for edge in edges:
        u, v = edge[0], edge[1]
        if u in node_map and v in node_map:
            x0, y0 = node_x[node_map[u]], node_y[node_map[u]]
            x1, y1 = node_x[node_map[v]], node_y[node_map[v]]
            if is_3d:
                z0, z1 = node_z[node_map[u]], node_z[node_map[v]]
            
            # Plotly line segments need 'None' to break the line between edges
            edge_x.extend([x0, x1, None])
            edge_y.extend([y0, y1, None])
            if is_3d:
                edge_z.extend([z0, z1, None])

    graph_data = {
        "type": "graph3d" if is_3d else "graph2d",
        "node_x": node_x,
        "node_y": node_y,
        "node_z": node_z if is_3d else None,
        "edge_x": edge_x,
        "edge_y": edge_y,
        "edge_z": edge_z if is_3d else None,
        "num_nodes": len(nodes),
        "num_edges": len(edges)
    }
   
    return graph_data

def inspect_object(obj: Any) -> str:
    """Public interface to inspect any complex Python object."""
    return _format_recursive(obj, indent=0)

def _format_recursive(obj: Any, indent: int, depth_limit: int = 6) -> str:
    """Recursively format a complex Python object into a string representation."""
    
    if indent > depth_limit:
        return "..."

    prefix = "  " * indent
    # Get the full type name (e.g., 'torch.Tensor', 'PIL.Image.Image')
    obj_type = type(obj)
    type_str = f"{obj_type.__module__}.{obj_type.__name__}"

    # CASE A: PyTorch Tensor (Detected via type string)
    if "torch.Tensor" in type_str or type_str == "torch.Tensor":
        # Access properties dynamically to avoid import errors if torch isn't present
        shape = list(obj.shape)
        dt = str(obj.dtype).replace("torch.", "")
        
        # Check if pinned (safely)
        is_pinned = getattr(obj, "is_pinned", lambda: False)()
        dev = "pinned" if is_pinned else str(obj.device)
        
        return f"Tensor{shape} ({dt}, {dev})"

    # CASE B: Numpy Array
    elif "numpy" in type_str and "ndarray" in type_str:
        dt = str(obj.dtype)
        return f"NDArray{list(obj.shape)} ({dt})"

    # CASE C: Pillow Image (Detected via type string)
    # PIL images often have types like 'PIL.Image.Image' or 'PIL.PngImagePlugin.PngImageFile'
    elif "PIL." in type_str and "Image" in type_str:
        # Access attributes dynamically
        mode = getattr(obj, "mode", "Unknown")
        size = getattr(obj, "size", "?")
        fmt = getattr(obj, "format", "RAW")
        fmt = fmt if fmt else "RAW"
        return f"PIL.Image (Mode: {mode}, Size: {size}, Format: {fmt})"

    # CASE D: Dictionary
    elif isinstance(obj, dict):
        length = len(obj)
        name = "dict"
        
        if length == 0:
            return f"{name}{{}}"
            
        # Check for Homogeneity
        # We grab values to check if they all share the same type
        values = list(obj.values())
        first_type = type(values[0])
        is_homogeneous = all(type(v) is first_type for v in values)

        # Set Thresholds based on Homogeneity
        if is_homogeneous:
            # If all items have the same type and there are more than 4 items,
            # we show only 1 item to give a quick preview of the type.
            print_limit = 4
            items_to_show = 4 
        else:
            # Heterogeneous dicts get more items shown. But if more than 10 items,
            # we still truncate.
            print_limit = 10
            items_to_show = 10

        if length <= print_limit:
            # Print all items
            lines = [f"{name}[{length}]"]
            for k, v in obj.items():
                val_str = _format_recursive(v, indent + 1)
                lines.append(f"{prefix}  '{k}': {val_str}")
            return "\n".join(lines)
        else:
            # Print truncated list
            lines = [f"{name}[{length}] containing:"]
            # Convert to list to slice safely by index
            items = list(obj.items())
            
            for i in range(items_to_show):
                k, v = items[i]
                val_str = _format_recursive(v, indent + 1)
                lines.append(f"{prefix}  '{k}': {val_str}")
                
            remaining = length - items_to_show
            lines.append(f"{prefix}  ... ({remaining} more items)")
            return "\n".join(lines)

    # CASE E: Iterables (List, Tuple)
    elif isinstance(obj, (list, tuple)):
        name = type(obj).__name__
        length = len(obj)
        
        if length == 0:
            return f"{name}[]"
        
        # Check for Homogeneity
        first_type = type(obj[0])
        is_homogeneous = all(type(x) is first_type for x in obj)

        # Set Thresholds
        if is_homogeneous:
            # Same types: strict limit (4), truncates heavily (shows 1)
            print_limit = 4
            items_to_show = 1
        else:
            # Mixed types: loose limit (10), truncates lightly (shows 10)
            print_limit = 10
            items_to_show = 10

        # Print
        if length <= print_limit:
            # Print ALL items
            lines = [f"{name}[{length}]"]
            for i, item in enumerate(obj):
                val_str = _format_recursive(item, indent + 1)
                lines.append(f"{prefix}  ({i}): {val_str}")
            return "\n".join(lines)
        else:
            # Print truncated list
            header = f"{name}[{length}]"
            lines = [f"{header} containing:"]
            
            for i in range(items_to_show):
                val_str = _format_recursive(obj[i], indent + 1)
                lines.append(f"{prefix}  ({i}): {val_str}")
                
            remaining = length - items_to_show
            lines.append(f"{prefix}  ... ({remaining} more items)")
            return "\n".join(lines)
        
    # CASE F: Dataclass
    elif is_dataclass(obj):
        lines = [f"{obj.__class__.__name__}"]
        for field in fields(obj):
            val = getattr(obj, field.name)
            val_str = _format_recursive(val, indent + 1)
            lines.append(f"{prefix}  {field.name}: {val_str}")
        return "\n".join(lines)

    # CASE G: Primitives / Other
    return str(type(obj).__name__)

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