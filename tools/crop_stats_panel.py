from PIL import Image
import os

def crop_to_content(image_path, output_path):
    try:
        img = Image.open(image_path)
        img = img.convert("RGBA")
        
        # Get the bounding box of the non-zero alpha pixels
        bbox = img.getbbox()
        
        if bbox:
            print(f"Original size: {img.size}")
            print(f"Content bbox: {bbox}")
            width = bbox[2] - bbox[0]
            height = bbox[3] - bbox[1]
            print(f"Content dimensions: {width}x{height}")
            print(f"Aspect Ratio: {width/height:.2f}")
            
            cropped_img = img.crop(bbox)
            cropped_img.save(output_path)
            print(f"Saved cropped image to {output_path}")
        else:
            print("Image is completely transparent!")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    input_path = 'g:/games/dev/yugioh progression guide/web/public/ui/stats_panel.png'
    output_path = 'g:/games/dev/yugioh progression guide/web/public/ui/stats_panel_cropped.png'
    crop_to_content(input_path, output_path)
