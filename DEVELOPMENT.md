# Development Guide

This document provides instructions for setting up, building, and testing the Kalpler (Hearts) card game locally.

## Prerequisites

- **Node.js**: Version 18.x or higher
- **npm**: Version 9.x or higher (comes with Node.js)

## Project Structure

```
gonul/
├── data/
│   └── turkish-words.json    # Turkish word list for table IDs
├── server/
│   └── index.js              # Express + Socket.IO server
├── src/
│   ├── components/
│   │   ├── Chat/             # Chat panel components
│   │   ├── Game/             # Game table components
│   │   └── Lobby/            # Lobby/waiting room components
│   ├── context/
│   │   ├── GameContext.tsx   # Game state management
│   │   └── SocketContext.tsx # Socket.IO connection management
│   ├── types/
│   │   └── game.ts           # TypeScript interfaces
│   ├── App.tsx               # Root component
│   ├── main.tsx              # Entry point
│   └── index.css             # Global styles
├── public/
│   └── heart.svg             # Favicon
├── index.html                # HTML template
├── package.json
├── tsconfig.json
├── vite.config.ts
└── SPECIFICATION.md          # Game specification document
```

## Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/kerem-ersoz/gonul.git
   cd gonul
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

## Development

### Running in Development Mode

Start both the backend server and frontend dev server concurrently:

```bash
npm run dev
```

This will:
- Start the Node.js server on `http://localhost:3000`
- Start the Vite dev server on `http://localhost:5173`
- Enable hot module replacement (HMR) for the React frontend

**Open your browser to `http://localhost:5173`** to access the game.

### Running Components Separately

If you need to run the server and client separately:

**Server only:**
```bash
npm run dev:server
```

**Client only:**
```bash
npm run dev:client
```

## Building for Production

1. **Build the frontend:**
   ```bash
   npm run build
   ```
   
   This creates an optimized production build in the `dist/` directory.

2. **Start the production server:**
   ```bash
   NODE_ENV=production npm start
   ```
   
   The server will serve the built frontend and handle Socket.IO connections on port 3000.

## Testing Locally

### Manual Testing with Multiple Browsers

Since Hearts requires 4 players, you'll need to open multiple browser windows/tabs:

1. Start the development server: `npm run dev`
2. Open 4 browser windows to `http://localhost:5173`
3. Enter a different player name in each window
4. Create a table in one window
5. Join the table from the other 3 windows using the table code
6. The game will start automatically once 4 players have joined

**Tip:** Use different browsers (Chrome, Firefox, Safari) or incognito/private windows to simulate separate players.

### Testing Card Passing

1. Start a new game
2. On rounds 1, 2, 3 (not 4), a passing phase will occur:
   - Round 1: Pass left
   - Round 2: Pass right  
   - Round 3: Pass across
   - Round 4: No passing (hold)
3. Select 3 cards to pass
4. Click "Kartları Ver" (Submit Pass)
5. Wait for all players to submit passes
6. Cards will be exchanged and play begins

### Testing Gameplay

1. Player with 2♣ must lead the first trick
2. Players must follow suit if possible
3. Hearts cannot be led until "broken" (a heart has been played)
4. Queen of Spades (Q♠) is worth 13 points
5. Each heart is worth 1 point
6. First player to 50 points ends the game
7. **Lowest** score wins

### Testing Turn Timer

If a player doesn't play within 30 seconds, the server automatically plays their lowest legal card.

### Testing Rematch

After a game ends:
1. Each player can vote "Evet" (Yes) or "Hayır" (No) for rematch
2. If all 4 players vote yes, a new game starts
3. Vote status is displayed showing `X / 4` votes

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `NODE_ENV` | `development` | Environment mode |

**Example:**
```bash
PORT=8080 NODE_ENV=production npm start
```

## Troubleshooting

### "Module not found" errors

```bash
rm -rf node_modules
npm install
```

### Port already in use

```bash
# Find process using port 3000
lsof -i :3000
# Kill it
kill -9 <PID>
```

### Socket connection issues

1. Check that the server is running on port 3000
2. Check browser console for CORS errors
3. Ensure you're accessing via `http://localhost:5173` in development

### Cards not displaying

Clear browser cache or try incognito mode.

## Code Quality

### Type Checking

```bash
npx tsc --noEmit
```

### Linting (if ESLint is added)

```bash
npm run lint
```

## Deployment

### Deploying to a VPS/Server

1. Build the project: `npm run build`
2. Copy to server: `scp -r dist/ server/ data/ package.json user@server:/path/to/app`
3. On server:
   ```bash
   npm install --production
   NODE_ENV=production PORT=3000 node server/index.js
   ```

### Using PM2 (Recommended for Production)

```bash
npm install -g pm2
pm2 start server/index.js --name gonul
pm2 save
pm2 startup
```

### Using Docker (Optional)

Create a `Dockerfile`:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist ./dist
COPY server ./server
COPY data ./data
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server/index.js"]
```

Build and run:
```bash
npm run build
docker build -t gonul .
docker run -p 3000:3000 gonul
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Run type checking: `npx tsc --noEmit`
5. Test manually with 4 players
6. Commit: `git commit -m "Add my feature"`
7. Push: `git push origin feature/my-feature`
8. Open a Pull Request

## License

MIT
