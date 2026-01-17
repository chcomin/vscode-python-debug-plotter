# VSCode Python Debug Plotter

A lightweight VS Code extension for visualizing NumPy arrays, PyTorch tensors and graphs during Python debugging sessions. Dependencies are not required!

## Features

View 2D single and three channel arrays as images, Nx2 and Nx3 arrays as point clouds, networkx graphs and 1D arrays as hisograms.

![Histogram viewer](https://raw.githubusercontent.com/chcomin/vscode-python-debug-plotter/main/assets/showcase1.gif)

<br>

You can explore any ND array or tensor by first creating one of the primitives above in the debug console. A Bx3xHxW tensor can be shown by first typing `img = batch[4]` and then plotting the image.

![Batch viewer](https://raw.githubusercontent.com/chcomin/vscode-python-debug-plotter/main/assets/showcase2.gif)

<br>

Compound data that cannot be plotted is printed with rich information. For instance, a list with a torch tensor on the GPU, a dictionary with an array, a tensor and a pillow image and a list of 10 arrays is shown as

![Data viewer](https://raw.githubusercontent.com/chcomin/vscode-python-debug-plotter/refs/heads/main/assets/compound.png)


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

* **Histogram**: If `np_array.squeeze().ndim == 1`. Warning! NaNs ans infs are converted to 0 since they cannot be plotted.
* **Point cloud**: If `np_array.ndim == 2 and np_array.shape[1] in [2, 3]`
* **Image**: If `np_array.ndim == 2 and np_array.shape[1] >= 4` or `np_array.ndim == 3` and `D0 > 4 and D1 > 4 and D2 in [1, 3, 4]` (channels last) or `D0 in [1, 3, 4] and D1 > 4 and D2 > 4` (channel first)
* **Graph**: If `hasattr(variable, "nodes") and hasattr(variable, "edges")`. Each variable.node must have a `['pos', 'position', 'coord', 'coordinates', 'xy', 'loc']` key, otherwise networkx is needed for calculating node positions.
* If a Pytorch tensor, `variable.detach().cpu().numpy()` is used to avoid errors.
* Any variable that supports `np.asarray(variable)` or `variable.numpy()` is converted to a numpy array. So, pillow images and Tensorflow tensors are supported.
* Everything else is displayed as a string.

## Release Notes

### 1.0

First full release

- Fixed rouding errors in the image tooltip
- Significantly improved the appearance of the plots
- Significantly improved the performance
- Many bug fixes

### 0.0.2

Second beta release

- View 1D arrays as histogram
- View complex nested lists as a string with rich information
- Some optimizations to reduce extension size

### 0.0.1

Initial beta release

- View PyTorch tensors during debugging
- View NumPy arrays during debugging
- View NetworkX graphs during debugging
- Right-click context menu in Variables panel

