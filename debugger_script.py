import json
import base64
import tempfile
import os

def _vscode_extension_extract_data(variable):
    try:
        # 1. Detect and Unwrap PyTorch / List
        type_str = str(type(variable))
        if 'torch' in type_str and 'Tensor' in type_str:
            variable = variable.detach().cpu().numpy()

        import numpy as np
        if isinstance(variable, list):
            variable = np.array(variable)
            
        # 2. Heuristics
        is_points = False
        if variable.ndim == 2 and variable.shape[1] == 2:
            is_points = True
        
        output_data = {}

        if is_points:
            output_data = {
                "type": "points",
                "data": variable.tolist(),
                "shape": variable.shape
            }

        else:
            # Image Logic
            if variable.ndim == 3:
                C, H, W = variable.shape
                if C in [1, 3, 4] and H > 4 and W > 4:
                    variable = np.transpose(variable, (1, 2, 0))
            
            # Normalize to uint8
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

        # --- THE FIX: WRITE TO TEMP FILE ---
        # We create a temp file, write the huge JSON there, and return the path.
        fd, path = tempfile.mkstemp(suffix='.json', text=True)
        with os.fdopen(fd, 'w') as tmp:
            json.dump(output_data, tmp)
            
        # Return the path to the extension
        return json.dumps({"file_path": path})

    except Exception as e:
        return json.dumps({"error": str(e)})