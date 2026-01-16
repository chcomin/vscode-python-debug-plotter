# VSCode Python Debug Plotter

A lightweight VS Code extension for visualizing 1D and 2D NumPy arrays and PyTorch tensors during Python debugging sessions. It also supports variables that can be converted to a NumPy array (e.g. a list of points) and NetworkX graphs. Networkx, Pytorch or other dependencies are not required!

## Features

View 1D arrays as histogram

![Histogram viewer](https://raw.githubusercontent.com/chcomin/vscode-python-debug-plotter/main/assets/histogram.gif)

<br>

View 2D (Nx2) and 3D (Nx3) point clouds

![Points viewer](https://raw.githubusercontent.com/chcomin/vscode-python-debug-plotter/main/assets/points.gif)

<br>


View 2D and multichannel Pytorch and numpy arrays as images (HxW, HxWx3, HxWx1, 3xHxW and 1xHxW). Pillow images and objects that can be converted to numpy using `np.array(data)` is also supported.

![Image viewer](https://raw.githubusercontent.com/chcomin/vscode-python-debug-plotter/main/assets/image.gif)

<br>


You can explore any ND tensor or array. For instance, an image in a Bx3xHxW tensor can be shown by first defining the variable in the debug console using `img = batch[7]`. The variable can then be viewed as an image

![Batch viewer](https://raw.githubusercontent.com/chcomin/vscode-python-debug-plotter/main/assets/batch.gif)

<br>

The extension also support viewing Networkx graphs. Actually, any object with a .nodes attribute containing a list of node indices and a .edges attribute containg an edgelist is supported.

![Graph viewer](https://raw.githubusercontent.com/chcomin/vscode-python-debug-plotter/main/assets/graph.gif)

<br>

Compound data that cannot be plotted is printed with rich information. For instance, a list with a torch tensor on the GPU, a dictionary with an array, a tensor and a pillow image and a list of 10 arrays is shown as

![Data viewer](https://github.com/chcomin/vscode-python-debug-plotter/blob/main/assets/compound.png)


## Requirements

- VS Code 1.96.0 or higher
- Python debugger session active

## Installation

1. Download the .vsix file from the [Releases page](https://github.com/chcomin/vscode-python-debug-plotter/releases) or use wget

```bash
wget https://github.com/chcomin/vscode-python-debug-plotter/releases/download/v0.0.1/vscode-python-debug-plotter-0.0.1.vsix
```

2. In the Extensions VSCode panel, click on the three dots on the upper right corner and then on "Install from VSIX", or install from the terminal

```bash
code --install-extension vscode-python-debug-plotter-0.0.1.vsix
```

## Usage

1. Start a Python debugging session
2. Set a breakpoint and pause execution
3. In the Variables panel, right-click on a PyTorch tensor, NumPy array, or NetworkX graph
4. Select "Plot variable" from the context menu
5. The data will be visualized in a new panel

## Supported Variable Types

The full heuristic for automatically detecting and handling each data type is the following:

```python
def is_1d_array(np_array):
    """Check if a numpy array is 1D."""
    return np_array.squeeze().ndim == 1

def is_point_array(np_array):
    """Check if a numpy array is likely a point cloud."""
    return np_array.ndim == 2 and np_array.shape[1] in [2, 3]

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

def is_graph_like(variable):
    """Check if a variable has the attributes nodes and edges."""
    return hasattr(variable, "nodes") and hasattr(variable, "edges")

### Array intensity normalization for showing as image ###

# If integer with range outside [0, 255], the array requires normalization
if np_array.dtype.kind == 'i' and (np_array.max() > 255 or np_array.min() < 0):
    np_array = np_array.astype(np.float32)

# If float, normalize to [0, 255]
if np_array.dtype.kind == 'f':
    ...
```

## Release Notes

### 0.0.2

Second release

- View 1D arrays as histogram
- View complex nested lists as a string with rich information
- Some optimizations to reduce extension size (currently 52 kb!)

### 0.0.1

Initial release of Simple Data Viewer

- View PyTorch tensors during debugging
- View NumPy arrays during debugging
- View NetworkX graphs during debugging
- Right-click context menu in Variables panel

