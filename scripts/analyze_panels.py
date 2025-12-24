import cv2
import numpy as np
from PIL import Image

def analyze_layout():
    img_path = 'web/public/assets/record match/record_match_ui.png'
    
    try:
        # Read image
        img = cv2.imread(img_path)
        if img is None:
            print(f"Error: Could not read {img_path}")
            return

        height, width = img.shape[:2]
        print(f"Image Dimensions: {width}x{height}")

        # Convert to grayscale
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        # Apply threshold to find dark areas (recessed panels are usually darker)
        # In the image, panels are darker stone? Or lighter?
        # Looking at previous screenshot, text is on "panels". 
        # Let's try adaptive threshold or just hard threshold.
        # Assuming the "panels" are the distinct rectangular regions.
        
        # Blur to reduce noise
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        
        # Canny edge detection might be better to find the Boxes
        edges = cv2.Canny(blurred, 30, 100)
        
        # Find contours
        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        panels = []
        
        for cnt in contours:
            x, y, w, h = cv2.boundingRect(cnt)
            
            # Filter huge or tiny ones
            # Screen is ~1200x760. 
            # A panel should be at least 50x50?
            if w > 50 and h > 50:
                # Calculate % coordinates
                pct_x = (x / width) * 100
                pct_y = (y / height) * 100
                pct_w = (w / width) * 100
                pct_h = (h / height) * 100
                
                # Filter out the whole image border if detected
                if pct_w > 95 and pct_h > 95:
                    continue
                    
                panels.append({
                    'x': pct_x, 'y': pct_y, 
                    'w': pct_w, 'h': pct_h,
                    'px_x': x, 'px_y': y, 'px_w': w, 'px_h': h
                })

        # Sort panels by Y then X to order them logicaly
        # Group by rows roughly?
        panels.sort(key=lambda k: (int(k['y'] / 10), k['x'])) # Fuzzy row sort

        print(f"Found {len(panels)} potential panels:")
        for i, p in enumerate(panels):
            print(f"Panel {i}: Left:{p['x']:.1f}% Top:{p['y']:.1f}% W:{p['w']:.1f}% H:{p['h']:.1f}%")
            
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    analyze_layout()
