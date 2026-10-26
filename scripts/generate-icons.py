"""
Complete icon generation script for oxyDoku.
Generates:
- Android adaptive foregrounds (108, 162, 216, 324, 432 px)
- Android legacy standard icons (48, 72, 96, 144, 192 px)
- Android legacy round icons (48, 72, 96, 144, 192 px)
- PWA icons (192, 512 px)
"""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

def render_icon(target_size, mode='standard'):
    """
    mode: 'standard' (full icon with squircle),
          'round' (circular mask),
          'foreground' (adaptive icon foreground with transparent background and safe zone padding)
    """
    canvas_size = 1024
    img = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    center = canvas_size / 2.0

    # 1. Background (only for standard and round icons)
    if mode in ('standard', 'round'):
        bg_radius = int(center if mode == 'round' else 230)
        bg_rect = [0, 0, canvas_size, canvas_size]
        
        # Mask
        bg_mask = Image.new('L', (canvas_size, canvas_size), 0)
        mask_draw = ImageDraw.Draw(bg_mask)
        if mode == 'round':
            mask_draw.ellipse(bg_rect, fill=255)
        else:
            mask_draw.rounded_rectangle(bg_rect, radius=bg_radius, fill=255)

        # Gradient: #1e2238 -> #10121d
        gradient = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
        g_draw = ImageDraw.Draw(gradient)
        for y in range(canvas_size):
            t = y / canvas_size
            r = int(30 * (1 - t) + 16 * t)
            g = int(34 * (1 - t) + 18 * t)
            b = int(56 * (1 - t) + 29 * t)
            g_draw.line([(0, y), (canvas_size, y)], fill=(r, g, b, 255))

        # Radial accent glow
        glow = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
        glow_draw = ImageDraw.Draw(glow)
        glow_center = (int(canvas_size * 0.35), int(canvas_size * 0.35))
        max_r = int(canvas_size * 0.65)
        for i in range(max_r, 0, -4):
            alpha = int(45 * (1 - i / max_r) ** 1.5)
            glow_draw.ellipse(
                [glow_center[0] - i, glow_center[1] - i, glow_center[0] + i, glow_center[1] + i],
                fill=(91, 143, 224, alpha)
            )

        gradient.paste(glow, (0, 0), glow)
        img.paste(gradient, (0, 0), bg_mask)

        # Outer border
        border_col = (91, 143, 224, 75)
        if mode == 'round':
            draw.ellipse(bg_rect, outline=border_col, width=6)
        else:
            draw.rounded_rectangle(bg_rect, radius=bg_radius, outline=border_col, width=6)

    # 2. Grid Dimensions
    # In foreground mode, adaptive icon safe zone is central 66% (diameter ~676px)
    grid_size = 530 if mode == 'foreground' else 580
    gx0 = center - grid_size / 2.0
    gy0 = center - grid_size / 2.0
    gx1 = gx0 + grid_size
    gy1 = gy0 + grid_size
    grid_radius = 48

    # Grid surface
    grid_surface = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
    gs_draw = ImageDraw.Draw(grid_surface)
    gs_draw.rounded_rectangle(
        [gx0, gy0, gx1, gy1],
        radius=grid_radius,
        fill=(28, 32, 48, 225),
        outline=(91, 143, 224, 180),
        width=8
    )

    cell_w = grid_size / 3.0
    # Accent cells
    gs_draw.rounded_rectangle(
        [gx0 + 6, gy0 + 6, gx0 + cell_w - 4, gy0 + cell_w - 4],
        radius=28,
        fill=(91, 143, 224, 60)
    )
    gs_draw.rounded_rectangle(
        [gx0 + 2 * cell_w + 4, gy0 + 2 * cell_w + 4, gx1 - 6, gy1 - 6],
        radius=28,
        fill=(155, 116, 216, 65)
    )
    gs_draw.rounded_rectangle(
        [gx0 + 2 * cell_w + 4, gy0 + 6, gx1 - 6, gy0 + cell_w - 4],
        radius=28,
        fill=(217, 161, 60, 50)
    )

    # Divider lines
    line_col = (154, 163, 181, 130)
    for i in (1, 2):
        lx = gx0 + i * cell_w
        gs_draw.line([(lx, gy0 + 16), (lx, gy1 - 16)], fill=line_col, width=5)
        ly = gy0 + i * cell_w
        gs_draw.line([(gx0 + 16, ly), (gx1 - 16, ly)], fill=line_col, width=5)

    img.paste(grid_surface, (0, 0), grid_surface)

    # 3. Corner Numbers
    try:
        font_num = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", int(74 if mode == 'foreground' else 80))
    except Exception:
        font_num = ImageFont.load_default()

    numbers = [
        ("4", gx0 + cell_w * 0.5, gy0 + cell_w * 0.5, (127, 176, 245, 230)),
        ("9", gx0 + cell_w * 2.5, gy0 + cell_w * 0.5, (230, 199, 76, 220)),
        ("7", gx0 + cell_w * 0.5, gy0 + cell_w * 2.5, (180, 190, 210, 180)),
        ("3", gx0 + cell_w * 2.5, gy0 + cell_w * 2.5, (185, 150, 240, 230)),
    ]
    for num, cx, cy, col in numbers:
        bbox = draw.textbbox((0, 0), num, font=font_num)
        nw = bbox[2] - bbox[0]
        nh = bbox[3] - bbox[1]
        draw.text((cx - nw / 2.0 - bbox[0], cy - nh / 2.0 - bbox[1]), num, font=font_num, fill=col)

    # 4. Central Hero Text: "oxy" + "D  O  K  U"
    oxy_font_size = 155 if mode == 'foreground' else 170
    doku_font_size = 40 if mode == 'foreground' else 44
    try:
        font_oxy = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", oxy_font_size)
        font_doku = ImageFont.truetype("C:/Windows/Fonts/bahnschrift.ttf", doku_font_size)
    except Exception:
        font_oxy = ImageFont.load_default()
        font_doku = ImageFont.load_default()

    text_oxy = "oxy"
    text_doku = "D  O  K  U"

    bb_oxy = font_oxy.getbbox(text_oxy)
    bb_doku = font_doku.getbbox(text_doku)

    oxy_w = bb_oxy[2] - bb_oxy[0]
    oxy_h = bb_oxy[3] - bb_oxy[1]
    doku_w = bb_doku[2] - bb_doku[0]
    doku_h = bb_doku[3] - bb_doku[1]

    # Explicit vertical gap between bottom of 'y' and top of 'DOKU'
    gap = 24 if mode == 'foreground' else 26
    total_content_h = oxy_h + gap + doku_h

    # Vertically center the text stack in the grid
    top_ink_y = center - total_content_h / 2.0
    oy = top_ink_y - bb_oxy[1]
    ox = center - oxy_w / 2.0 - bb_oxy[0]

    oxy_ink_bottom = oy + bb_oxy[3]
    sy = oxy_ink_bottom + gap - bb_doku[1]
    sx = center - doku_w / 2.0 - bb_doku[0]
    doku_ink_bottom = sy + bb_doku[3]

    # Pill container dimensions
    pad_x = 46 if mode == 'foreground' else 52
    pad_top = 26 if mode == 'foreground' else 30
    pad_bottom = 22 if mode == 'foreground' else 26

    pill = [
        center - max(oxy_w, doku_w) / 2.0 - pad_x,
        top_ink_y - pad_top,
        center + max(oxy_w, doku_w) / 2.0 + pad_x,
        doku_ink_bottom + pad_bottom
    ]

    # Pill shadow
    shadow_img = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
    s_draw = ImageDraw.Draw(shadow_img)
    s_draw.rounded_rectangle([pill[0], pill[1] + 12, pill[2], pill[3] + 12], radius=42, fill=(0, 0, 0, 180))
    shadow_img = shadow_img.filter(ImageFilter.GaussianBlur(radius=16))
    img.paste(shadow_img, (0, 0), shadow_img)

    # Frosted pill
    draw.rounded_rectangle(pill, radius=38, fill=(16, 18, 28, 248), outline=(91, 143, 224, 215), width=6)

    # "oxy" in bold pure white
    draw.text((ox, oy), text_oxy, font=font_oxy, fill=(255, 255, 255, 255))

    # "D  O  K  U" in high-contrast bright ice-cyan (#BAE6FD) - fully visible and readable
    draw.text((sx, sy), text_doku, font=font_doku, fill=(186, 230, 253, 255))

    # Downsample to target size with highest quality antialiasing
    return img.resize((target_size, target_size), Image.Resampling.LANCZOS)

def generate_all():
    # 1. Android Mipmap densities
    densities = {
        'mdpi': {'legacy': 48, 'foreground': 108},
        'hdpi': {'legacy': 72, 'foreground': 162},
        'xhdpi': {'legacy': 96, 'foreground': 216},
        'xxhdpi': {'legacy': 144, 'foreground': 324},
        'xxxhdpi': {'legacy': 192, 'foreground': 432},
    }

    res_root = 'android/app/src/main/res'
    for dens, sizes in densities.items():
        folder = os.path.join(res_root, f'mipmap-{dens}')
        os.makedirs(folder, exist_ok=True)
        
        # Standard legacy icon
        std_icon = render_icon(sizes['legacy'], mode='standard')
        std_icon.save(os.path.join(folder, 'ic_launcher.png'))

        # Round legacy icon
        round_icon = render_icon(sizes['legacy'], mode='round')
        round_icon.save(os.path.join(folder, 'ic_launcher_round.png'))

        # Foreground adaptive icon
        fg_icon = render_icon(sizes['foreground'], mode='foreground')
        fg_icon.save(os.path.join(folder, 'ic_launcher_foreground.png'))
        print(f"Generated mipmap-{dens} icons")

    # 2. PWA icons in public/
    pwa_192 = render_icon(192, mode='standard')
    pwa_192.save('public/icon-192.png')

    pwa_512 = render_icon(512, mode='standard')
    pwa_512.save('public/icon-512.png')
    print("Generated public/icon-192.png and public/icon-512.png")

    # 3. Update background color
    bg_xml_path = os.path.join(res_root, 'values/ic_launcher_background.xml')
    with open(bg_xml_path, 'w', encoding='utf-8') as f:
        f.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#14161F</color>\n</resources>\n')
    print("Updated ic_launcher_background.xml")

if __name__ == '__main__':
    generate_all()
