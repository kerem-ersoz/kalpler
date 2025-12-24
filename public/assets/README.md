# Custom Assets

Place your custom assets in the appropriate subdirectory to override the defaults.

## Directory Structure

```
public/assets/
├── sounds/          # Audio files for game sounds
├── cards/           # Card face and back images
├── backgrounds/     # Background images/textures
└── fonts/           # Custom font files
```

## Sounds

Place audio files in `/public/assets/sounds/`. Supported formats: `.mp3`, `.wav`, `.ogg`

| Filename | Description |
|----------|-------------|
| `card-flip.mp3` | Sound when cards are dealt or animated |
| `card-flick.mp3` | Sound when a card is played |
| `timer-warning.mp3` | Warning beep when turn timer is low |

**Example:** To add a custom card play sound, place `card-flick.mp3` in the sounds folder.

## Cards

Place card images in `/public/assets/cards/`. Supported formats: `.png`, `.svg`, `.webp`

### Naming Convention

- **Card faces:** `{suit}-{rank}.png`
  - Suits: `hearts`, `diamonds`, `clubs`, `spades`
  - Ranks: `2`, `3`, `4`, `5`, `6`, `7`, `8`, `9`, `10`, `J`, `Q`, `K`, `A`
- **Card back:** `card-back.png`

**Examples:**
- `hearts-A.png` - Ace of Hearts
- `spades-10.png` - 10 of Spades
- `clubs-K.png` - King of Clubs
- `card-back.png` - Back of card design

**Recommended dimensions:** 126×180 pixels (or maintain 7:10 aspect ratio)

## Backgrounds

Place background images in `/public/assets/backgrounds/`. Supported formats: `.png`, `.jpg`, `.webp`, `.svg`

| Filename | Description |
|----------|-------------|
| `table.png` | Main game table background |
| `table-border.png` | Border frame around the table (alpha-channel PNG supported) |
| `chat.png` | Chat pane background (alpha-channel PNG supported) |
| `lobby.png` | Lobby screen background |
| `felt.png` | Card playing area texture |

### Table Border Asset

The `table-border.png` is used as a CSS `border-image` around the game table. This asset:
- Supports **alpha-channel transparency** for complex border designs
- Uses 9-slice scaling (corners stay fixed, edges stretch)
- Falls back to solid brown (#8b4513) if not present
- **Recommended:** Create a border frame image with transparent center
- **Tip:** The border slice is 6px from each edge

### Chat Background Asset

The `chat.png` is used as the background for the chat pane. This asset:
- Supports **alpha-channel transparency** for semi-transparent designs
- Falls back to gray (`rgba(50, 50, 50, 0.5)`) if not present
- **Recommended dimensions:** 225×431 pixels (matches chat pane size)
- **Tip:** Use transparency to allow the game background to show through

## Fonts

Place font files in `/public/assets/fonts/`. Supported formats: `.woff2`, `.woff`, `.ttf`, `.otf`

| Filename | Usage |
|----------|-------|
| `primary.woff2` | Main UI text |
| `display.woff2` | Headers and titles |
| `mono.woff2` | Scores, timers, fixed-width text |

**Note:** `.woff2` is preferred for best performance, but `.woff` and `.ttf` are also supported as fallbacks.

## Notes

- Assets are auto-detected on page load
- If a custom asset is not found, the default (programmatic) version is used
- The browser console will log which custom assets were loaded
- Supported image formats are checked in order: `.png`, `.svg`, `.webp` (first found is used)
- Supported audio formats are checked in order: `.mp3`, `.wav`, `.ogg`
