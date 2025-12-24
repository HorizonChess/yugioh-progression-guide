import cv2
import numpy as np
import json

def analyze_layout_visual():
    img_path = 'web/public/assets/record match/record_match_ui.png'
    output_path = 'web/public/layout_debug.png'
    
    try:
        img = cv2.imread(img_path)
        if img is None:
            print(f"Error: Could not read {img_path}")
            return

        height, width = img.shape[:2]
        print(f"Image Dimensions: {width}x{height}")

        # Convert to grayscale
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        # Adaptive Threshold to handle lighting variations on the "stone"
        thresh = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
                                     cv2.THRESH_BINARY_INV, 11, 2)
        
        # Find contours
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        # Canvas to draw on
        debug_img = img.copy()
        
        detected_panels = []
        
        for cnt in contours:
            x, y, w, h = cv2.boundingRect(cnt)
            
            # Constraints for meaningful panels
            # Min size: 5% of width/height
            if w > width * 0.05 and h > height * 0.05:
                # Merge nearby rectangles? Or just take them as is.
                # For now, let's just log them.
                
                pct_x = (x / width) * 100
                pct_y = (y / height) * 100
                pct_w = (w / width) * 100
                pct_h = (h / height) * 100
                
                # Filter out the full border (usually >95%)
                if pct_w > 98 and pct_h > 98:
                    continue
                
                detected_panels.append({
                    'id': len(detected_panels),
                    'x': pct_x, 'y': pct_y, 'w': pct_w, 'h': pct_h,
                    'px': {'x': x, 'y': y, 'w': w, 'h': h}
                })
                
                # Draw rect
                cv2.rectangle(debug_img, (x, y), (x+w, y+h), (0, 0, 255), 2)
                # Label
                cv2.putText(debug_img, f"#{len(detected_panels)-1}", (x+5, y+20), 
                           cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)

        # Sort panels: Top to Bottom, then Left to Right
        detected_panels.sort(key=lambda p: (int(p['y'] / 10), p['x']))
        
        # Save debug image
        cv2.imwrite(output_path, debug_img)
        print(f"Saved debug image to {output_path}")
        
        print("Detected Panels (Sorted):")
        for p in detected_panels:
            print(f"Panel #{p['id']}: Top:{p['y']:.2f}% Left:{p['x']:.2f}% W:{p['w']:.2f}% H:{p['h']:.2f}%")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    analyze_layout_visual()
