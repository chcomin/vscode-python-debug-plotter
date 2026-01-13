import numpy as np

# Create an image (Gradient)
x = np.linspace(0, 1, 256)
y = np.linspace(0, 1, 256)
xx, yy = np.meshgrid(x, y)
image = (xx * 255).astype(np.uint8) # Grayscale image

# Create points (Circle)
theta = np.linspace(0, 2*np.pi, 100)
points = np.column_stack((np.cos(theta), np.sin(theta)))

print("Breakpoint here")