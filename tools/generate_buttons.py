from PIL import Image, ImageDraw, ImageFont, ImageFilter
import sys
import os

def create_button_with_text(base_image_path, text, output_path, font_path="C:/Windows/Fonts/georgia.ttf", font_size=40):
    try:
        # Open the base image
        img = Image.open(base_image_path).convert("RGBA")
        
        # Resize if necessary (optional, but good for consistency)
        # img = img.resize((400, 100)) 
        
        width, height = img.size
        draw = ImageDraw.Draw(img)
        
        # Load font
        try:
            font = ImageFont.truetype(font_path, font_size)
        except IOError:
            print(f"Font not found at {font_path}, falling back to default.")
            font = ImageFont.load_default()
        
        # Calculate text position
        text_bbox = draw.textbbox((0, 0), text, font=font)
        text_width = text_bbox[2] - text_bbox[0]
        text_height = text_bbox[3] - text_bbox[1]
        
        x = (width - text_width) / 2
        y = (height - text_height) / 2 - 5 # Slight adjustment for visual center
        
        # Draw text with "engraved" effect
        # 1. Drop shadow (light, bottom-right) for "pressed" look or dark for "raised"
        # Let's go for "engraved": Dark text, light highlight at bottom
        
        # Highlight (Bottom-Right)
        draw.text((x + 1, y + 1), text, font=font, fill=(255, 255, 255, 128))
        
        # Shadow (Top-Left) - Inner shadow effect
        draw.text((x - 1, y - 1), text, font=font, fill=(0, 0, 0, 180))
        
        # Main Text (Dark Gold/Brown)
        draw.text((x, y), text, font=font, fill=(74, 59, 34, 255)) # #4a3b22
        
        # Save
        img.save(output_path)
        print(f"Generated {output_path}")
        
    except Exception as e:
        print(f"Error creating button {output_path}: {e}")

if __name__ == "__main__":
    # Define buttons to generate
    buttons = [
        {"text": "OPEN PACKS", "filename": "btn_open_packs.png"},
        {"text": "RECORD MATCH", "filename": "btn_record_match.png"},
        {"text": "PREPARE YOUR DECK", "filename": "btn_prepare_deck.png"},
        {"text": "BONUS MATCHES", "filename": "btn_bonus_matches.png"}
    ]
    
    base_img = "web/public/ui/button_gold.png"
    output_dir = "web/public/ui"
    
    for btn in buttons:
        create_button_with_text(
            base_img, 
            btn["text"], 
            os.path.join(output_dir, btn["filename"])
        )
