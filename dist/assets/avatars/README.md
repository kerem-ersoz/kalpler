# Custom Avatars

Place custom avatar images in this directory. The system will try to match avatars by player name.

## Naming Convention

Name your avatar files using the player's name (case-insensitive):
- `playername.png`
- `playername.jpg`
- `playername.svg`

For example:
- `kerem.png` - Will be used when a player named "Kerem" joins
- `ali.svg` - Will be used when a player named "Ali" joins

## Supported Formats

- PNG (recommended for best quality)
- JPG/JPEG
- SVG

## Fallback

If no custom avatar is found, the system will fall back to generating a DiceBear pixel-art avatar.

## Tips

- Square images work best (e.g., 128x128 or 256x256)
- Keep file sizes reasonable for fast loading
- Transparent backgrounds (PNG/SVG) look best against the game UI
