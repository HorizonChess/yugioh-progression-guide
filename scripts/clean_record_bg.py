from PIL import Image

def clean_image():
    # Load the original image
    img_path = 'web/public/record_match_bg.png'
    output_path = 'web/public/record_match_bg_clean.png'
    
    try:
        img = Image.open(img_path)
    except FileNotFoundError:
        print(f"Error: Could not find {img_path}")
        return

    # Coordinates are estimated based on visual component placement
    # Format: (x, y, width, height)
    # We will copy a patch from slightly above or to the side to cover these
    
    # 1. Rare Hunter Name (Top Left)
    # Approx x: 40-400, y: 70-120
    # Patch styling: Stone texture
    name_clean_patch_source = (50, 40, 350, 60) # Source from above the name
    name_target_area = (50, 110, 400, 180)      # Target area covering "RARE HUNTER" and "AGGRO" tag
    
    # 2. Stats (Bottom Left)
    # Win Rate: x: 130-200, y: 500-540
    # Streak: x: 330-380, y: 500-540
    # Source from between them?
    stats_patch_source = (220, 500, 270, 540) # Area between winrate and streak
    
    # Let's be more precise with "Patching". 
    # Instead of defining coordinates blindly, let's paste "clean" stone over the text.
    # The image is roughly 1000x624 if it matches the aspect ratio 1000/624.
    # Let's assume the user uploaded the high res one.
    
    width, height = img.size
    print(f"Image size: {width}x{height}")
    
    # Helper to paste a crop
    def patch_area(target_box, source_box):
        # target_box: (left, top, right, bottom)
        # source_box: (left, top, right, bottom)
        msg_width = target_box[2] - target_box[0]
        msg_height = target_box[3] - target_box[1]
        
        # Crop source
        clean_patch = img.crop(source_box)
        # Resize if necessary (though simple tiling or stretching might be better for stone)
        clean_patch = clean_patch.resize((msg_width, msg_height))
        
        # Paste
        img.paste(clean_patch, target_box)

    # Convert percentage coordinates to pixels for better scaling support
    def pct_to_px(x_pct, y_pct, w_pct, h_pct):
        left = int(x_pct * width)
        top = int(y_pct * height)
        region_w = int(w_pct * width)
        region_h = int(h_pct * height)
        return (left, top, left + region_w, top + region_h)

    # 1. Remove Opponent Name & Tag
    # Target: Left ~5%, Top ~18%, Width ~35%, Height ~12% (Covering RARE HUNTER + AGGRO)
    # Source: Taking a slice of the empty stone texture from just above it (Top ~5%)
    # Let's find a clean spot. The header is at top. The area below header (y=10%?) might be clean.
    # Current Opponent label is at ~10%?
    # Name is at ~15-20%?
    # Let's try to patch the name area.
    name_target = pct_to_px(0.04, 0.16, 0.35, 0.12) 
    name_source = pct_to_px(0.04, 0.08, 0.35, 0.12) # Just above
    patch_area(name_target, name_source)

    # 2. Remove Stats Numbers
    # Win Rate Area: Left ~15%, Bottom ~15% (y ~85%) ??
    # Based on Screenshot:
    # "Win Rate" header is small. "33%" is big below it.
    # "Streak" header is small. "-1" is big below it.
    # We want to keep the "WIN RATE" and "STREAK" labels?
    # Use request: "places where we need text are empty for us to fill"
    # So remove the values "33%" and "-1".
    
    # Win Rate Value
    # Location: x ~15%, y ~82%, w ~10%, h ~8%
    wr_target = pct_to_px(0.12, 0.81, 0.12, 0.08)
    # Source: The area just to the right of it (between cols) or just above
    # The header "Win Rate" is above.
    wr_source = pct_to_px(0.24, 0.81, 0.12, 0.08) # Right of it (gap between cols)
    patch_area(wr_target, wr_source)
    
    # Streak Value
    # Location: x ~33%, y ~82%
    streak_target = pct_to_px(0.30, 0.81, 0.10, 0.08)
    streak_source = pct_to_px(0.24, 0.81, 0.10, 0.08) # Left of it (gap)
    patch_area(streak_target, streak_source)

    img.save(output_path)
    print(f"Saved cleaned image to {output_path}")

if __name__ == "__main__":
    clean_image()
