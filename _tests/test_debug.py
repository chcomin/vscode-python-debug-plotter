import numpy as np
from PIL import Image
import networkx as nx

def generate_lorenz(num_points=10000, sigma=10, rho=28, beta=8/3, dt=0.01):
    # Initialize array
    points = np.zeros((num_points, 3))
    # Starting point
    points[0] = [0.1, 0.0, 0.0]
    
    for i in range(1, num_points):
        x, y, z = points[i-1]
        dx = sigma * (y - x)
        dy = x * (rho - z) - y
        dz = x * y - beta * z
        
        points[i] = points[i-1] + np.array([dx, dy, dz]) * dt
        
    return points

def generate_graph():

    # 1. Define community sizes and probability matrices
    sizes = [75, 75, 75, 75]  # 4 groups of 75 nodes each
    # High probability of edges within groups (0.2), low between groups (0.005)
    probs = [[0.20, 0.005, 0.005, 0.005],
            [0.005, 0.20, 0.005, 0.005],
            [0.005, 0.005, 0.20, 0.005],
            [0.005, 0.005, 0.005, 0.20]]

    # 2. Generate the Stochastic Block Model graph
    graph = nx.stochastic_block_model(sizes, probs, seed=42)

    return graph


# 3D points
points = generate_lorenz()

# Images
imgs = np.zeros((8, 584, 565, 3), dtype=np.uint8)
for idx in range(1, 9):
    imgs[idx-1] = np.array(Image.open(f"images/2{idx}_training.tif"))

# Graph
graph = generate_graph()

print("Breakpoint")

