<p align="center">
  <img src="assets/icon.png" width="128" alt="Python Debug Plotter Icon">
</p>

<h1 align="center">Python Debug Plotter</h1>

<p align="center">
  <strong>Visualize NumPy, PyTorch, and Graphs while debugging — no extra dependencies required.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/VS_Code-1.100+-007ACC?logo=visual-studio-code&logoColor=white" alt="VS Code Version">
  <img src="https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white" alt="Python Version">
  <img src="https://img.shields.io/github/last-commit/chcomin/vscode-python-debug-plotter?color=green" alt="Last Commit">
  <img src="https://img.shields.io/badge/License-MIT-green" alt="License">
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=inag-ufscar.python-debug-plotter">
    <img src="https://img.shields.io/badge/Marketplace-Install-blue?style=for-the-badge&logo=visual-studio-code" alt="Marketplace">
  </a>
  <a href="https://github.com/chcomin/vscode-python-debug-plotter">
    <img src="https://img.shields.io/badge/GitHub-Repository-black?style=for-the-badge&logo=github" alt="GitHub">
  </a>
</p>

## Features

View 2D single and three channel arrays as images, Nx2 and Nx3 arrays as point clouds, networkx graphs as interactive 3D plots and 1D arrays as histograms.

![Histogram viewer](https://raw.githubusercontent.com/chcomin/vscode-python-debug-plotter/main/assets/showcase1.gif)

<br>

You can explore any ND array or tensor by first creating one of the primitives above in the debug console. A Bx3xHxW tensor can be shown by first typing `img = batch[4]` and then plotting the image.

![Batch viewer](https://raw.githubusercontent.com/chcomin/vscode-python-debug-plotter/main/assets/showcase2.gif)

<br>

The visualization is automatically updated while steping through the code.

![Live update](https://raw.githubusercontent.com/chcomin/vscode-python-debug-plotter/main/assets/live.gif)

<br>

Compound data that cannot be plotted is printed with rich information. For instance, a list with a torch tensor on the GPU, a dictionary with an array, a tensor and a pillow image and a list of 10 arrays is shown as

![Data viewer](https://raw.githubusercontent.com/chcomin/vscode-python-debug-plotter/refs/heads/main/assets/compound.png)


## Requirements

- VS Code 1.96.0 or higher
- Python debugger session active

## Usage

1. Start a Python debugging session
2. Set a breakpoint and pause execution
3. In the Variables panel, right-click on a PyTorch tensor, NumPy array, or NetworkX graph
4. Select "Plot variable" from the context menu
5. The data will be visualized in a new panel

## Supported Variable Types

The extension uses a smart heuristic to automatically detect the best visualization for your data.

| **TYPE** | **DETECTION LOGIC** | **SPECIAL NOTES** |
| :--- | :--- | :--- |
| **Histogram** | `ndim == 1` | NaNs and Infs are converted to `0`. |
| **Point Cloud** | `ndim == 2` AND `shape[1]` is `2` or `3` | Supports 2D (XY) and 3D (XYZ) coordinates. |
| **Image** | `ndim == 2` (width ≥ 4) OR `ndim == 3` | Supports Channels First/Last and 1, 3, or 4 channels. |
| **Graph** | Has `.nodes` and `.edges` | Looks for `pos`, `coord`, or `xy` keys for node layout. |
| **PyTorch** | Checks for `detach` and `cpu` attributes | Automatically calls `.detach().cpu().numpy()`. |
| **Generic** | Supports `np.asarray()` or `.numpy()` | Seamlessly handles **Pillow** images and **Tensorflow** tensors. |
| **Text** | Anything else | Fallback to a rich string representation. |

> **Note on Graphs:** If no coordinate information is found in the node data, the extension will attempt to use NetworkX for automatic layout calculation if available in the environment.

## Change Log

See [CHANGELOG.md](./CHANGELOG.md) for full release history.
