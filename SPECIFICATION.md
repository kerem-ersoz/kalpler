# Hearts Game Specification

A technical specification for the online 4-player Hearts card game (kalpler). This document serves as a reference for developers and contributors.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Game Components](#game-components)
4. [Game Flow](#game-flow)
5. [Card Passing Phase](#card-passing-phase)
6. [Trick Play Phase](#trick-play-phase)
7. [Scoring System](#scoring-system)
8. [Multiplayer Infrastructure](#multiplayer-infrastructure)
9. [User Interface Components](#user-interface-components)
10. [Real-Time Communication](#real-time-communication)
11. [State Management](#state-management)
12. [Error Handling & Edge Cases](#error-handling--edge-cases)

---

## Overview

**Project Name:** kalpler (Turkish for "hearts")

**Purpose:** Browser-based multiplayer Hearts card game supporting exactly 4 concurrent players per table, with real-time gameplay via WebSockets.

**Tech Stack:**
| Component | Technology |
|-----------|------------|
| Runtime | Node.js |
| Server Framework | Express.js v5.x |
| Real-Time Layer | Socket.IO v4.x |
| Frontend | React 18.x with Vite |
| Styling | CSS Modules or Tailwind CSS |
| State Management | React Context + useReducer |
| Module System | ES Modules (ESM) |

---

## Architecture

### High-Level Design

```
┌─────────────────────────────────────────────────────────────────┐
│                     CLIENT (React SPA)                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  <Lobby />  │  │  <Game />   │  │  useSocket() Hook       │  │
│  │  Component  │  │  Component  │  │  Socket.IO Client       │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  GameContext (React Context + useReducer)                   ││
│  │  - tableState, gameState, dispatch                          ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ WebSocket (Socket.IO)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       SERVER (Node.js)                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Express   │  │  Socket.IO  │  │  Game State Manager     │  │
│  │   (Static)  │  │   Server    │  │  (HeartsGame, Table)    │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Design Principles

1. **Server-Authoritative:** All game logic executes server-side. Clients receive state updates and render accordingly. This prevents cheating and ensures consistency.

2. **Event-Driven:** All client-server interactions occur via Socket.IO events. No REST endpoints for gameplay.

3. **Room Isolation:** Each table operates in its own Socket.IO room, preventing cross-table message leakage.

4. **Stateless Clients:** Clients maintain minimal local state; the server is the source of truth.

5. **Component-Based UI:** React components encapsulate UI logic with clear prop/state boundaries. Game state flows down via Context; actions dispatch to server via Socket.IO.

---

## Game Components

### Deck Composition

- **Total Cards:** 52 (standard French deck)
- **Suits:** Hearts (♥), Diamonds (♦), Clubs (♣), Spades (♠)
- **Ranks:** 2, 3, 4, 5, 6, 7, 8, 9, 10, J, Q, K, A (ascending order)

### Card Representation

```javascript
{
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades',
  rank: '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A',
  display: '2♥' | '3♦' | ... // Human-readable format
}
```

### Rank Values (for comparison)

| Rank | Value |
|------|-------|
| 2    | 2     |
| 3    | 3     |
| ...  | ...   |
| 10   | 10    |
| J    | 11    |
| Q    | 12    |
| K    | 13    |
| A    | 14    |

### Point Cards

| Card | Point Value |
|------|-------------|
| Any Heart (♥) | 1 point |
| Queen of Spades (Q♠) | 13 points |
| All other cards | 0 points |

**Maximum Points Per Round:** 26 (13 hearts + Q♠)

---

## Game Flow

### State Machine

```
┌──────────────┐
│   WAITING    │ ◄── Table created, waiting for 4 players
└──────┬───────┘
       │ 4 players joined
       ▼
┌──────────────┐
│   PASSING    │ ◄── Card passing phase (3 cards)
└──────┬───────┘
       │ All players submitted passes
       ▼
┌──────────────┐
│   PLAYING    │ ◄── Trick-taking gameplay
└──────┬───────┘
       │ 13 tricks completed
       ▼
┌──────────────┐
│  ROUND_END   │ ◄── Score calculation, check game end
└──────┬───────┘
       │ No player ≥ 50 points
       ▼
┌──────────────┐     Player ≥ 50 points
│   PASSING    │ ────────────────────────►┌──────────────┐
└──────────────┘                          │   GAME_END   │
                                          └──────┬───────┘
                                                 │ Rematch vote
                                                 ▼
                                          ┌──────────────┐
                                          │   WAITING    │
                                          └──────────────┘
```

### Phase Sequence Per Round

1. **Deal Phase:** Server shuffles deck, deals 13 cards to each player
2. **Passing Phase:** Players select 3 cards to pass (direction varies by round)
3. **Receive Phase:** Server exchanges cards between players
4. **Play Phase:** 13 tricks are played
5. **Scoring Phase:** Points tallied, scores updated
6. **Continuation Check:** If any player ≥ 50 points, game ends; otherwise, new round begins

---

## Card Passing Phase

### Overview

Before each round of play, players must pass 3 cards from their hand to another player. The passing direction rotates each round in a fixed pattern.

### Passing Direction Cycle

| Round Number | Direction | Description |
|--------------|-----------|-------------|
| 1, 5, 9, ... | Left | Pass to the player on your left |
| 2, 6, 10, ... | Right | Pass to the player on your right |
| 3, 7, 11, ... | Across | Pass to the player opposite you |
| 4, 8, 12, ... | Hold | No passing; play with dealt hand |

**Formula:** `direction = roundNumber % 4`
- 1 → Left
- 2 → Right
- 3 → Across
- 0 → Hold (no passing)

### Passing Phase State

```javascript
{
  phase: 'passing',
  passDirection: 'left' | 'right' | 'across' | 'hold',
  roundNumber: Number,
  passes: {
    // Keyed by socket ID or player index
    [playerId]: [card1, card2, card3] | null
  },
  passesReceived: Boolean // True once all passes exchanged
}
```

### Passing Logic

#### Server-Side Implementation

1. **Initiate Passing Phase:**
   ```javascript
   // After dealing, if not a "hold" round
   if (roundNumber % 4 !== 0) {
     game.phase = 'passing';
     game.passDirection = getPassDirection(roundNumber);
     game.passes = {}; // Reset passes
     emit('passingPhase', { direction: game.passDirection });
   } else {
     // Skip to play phase
     startPlayPhase();
   }
   ```

2. **Receive Pass Submission:**
   ```javascript
   socket.on('submitPass', (cards) => {
     // Validate: exactly 3 cards
     if (cards.length !== 3) return error('Must pass exactly 3 cards');
     
     // Validate: all cards in player's hand
     if (!allCardsInHand(playerId, cards)) return error('Invalid cards');
     
     // Store pass
     game.passes[playerId] = cards;
     
     // Check if all players have submitted
     if (Object.keys(game.passes).length === 4) {
       executeCardExchange();
     }
   });
   ```

3. **Execute Card Exchange:**
   ```javascript
   function executeCardExchange() {
     const direction = game.passDirection;
     
     for (let i = 0; i < 4; i++) {
       const giver = players[i];
       const receiver = getReceiverIndex(i, direction);
       
       // Remove cards from giver
       removeCardsFromHand(giver, game.passes[giver.id]);
       
       // Add cards to receiver
       addCardsToHand(players[receiver], game.passes[giver.id]);
     }
     
     // Notify players of received cards
     players.forEach(p => {
       emit(p.socket, 'cardsReceived', { 
         cards: getReceivedCards(p),
         from: getGiverName(p, direction)
       });
     });
     
     startPlayPhase();
   }
   ```

4. **Receiver Index Calculation:**
   ```javascript
   function getReceiverIndex(giverIndex, direction) {
     switch (direction) {
       case 'left':  return (giverIndex + 1) % 4;
       case 'right': return (giverIndex + 3) % 4;
       case 'across': return (giverIndex + 2) % 4;
     }
   }
   ```

### Client-Side Implementation

1. **Enter Passing Phase:**
   ```javascript
   socket.on('passingPhase', ({ direction }) => {
     showPassingUI(direction);
     selectedCards = [];
     enableCardSelection(3); // Allow selecting up to 3 cards
   });
   ```

2. **Card Selection:**
   ```javascript
   function onCardClick(card) {
     if (selectedCards.includes(card)) {
       // Deselect
       selectedCards = selectedCards.filter(c => c !== card);
     } else if (selectedCards.length < 3) {
       // Select
       selectedCards.push(card);
     }
     
     updateCardHighlights();
     updatePassButton(); // Enable when 3 selected
   }
   ```

3. **Submit Pass:**
   ```javascript
   function submitPass() {
     if (selectedCards.length !== 3) return;
     
     socket.emit('submitPass', selectedCards);
     disableCardSelection();
     showWaitingMessage('Waiting for other players to pass...');
   }
   ```

4. **Receive Passed Cards:**
   ```javascript
   socket.on('cardsReceived', ({ cards, from }) => {
     // Animate cards arriving
     animateCardsReceived(cards, from);
     
     // Update local hand
     hand = hand.concat(cards);
     sortHand();
     renderHand();
   });
   ```

### Passing Phase Timeout

- **Timeout Duration:** 45 seconds
- **Auto-Pass Behavior:** If a player doesn't submit within the timeout, the server automatically selects 3 random cards from their hand

```javascript
function autoPassForPlayer(playerId) {
  const hand = getPlayerHand(playerId);
  const randomCards = shuffleArray(hand).slice(0, 3);
  game.passes[playerId] = randomCards;
  
  emit(playerId, 'autoPass', { cards: randomCards });
  
  checkAllPassesSubmitted();
}
```

### Edge Cases

| Scenario | Handling |
|----------|----------|
| Player disconnects during passing | Auto-pass with random cards, mark as bot/AI |
| Player tries to pass cards not in hand | Reject with error, prompt reselection |
| Player submits fewer than 3 cards | Reject with error |
| Player submits duplicate cards | Reject with error |
| "Hold" round | Skip passing phase entirely |

---

## Trick Play Phase

### First Trick Rules

1. **Opening Lead:** Player holding 2♣ must lead it
2. **First Trick Restrictions:** 
   - Hearts cannot be played (unless only hearts in hand)
   - Queen of Spades cannot be played

### General Play Rules

1. **Following Suit:** Players must follow the led suit if possible
2. **Void in Suit:** If unable to follow suit, any card may be played
3. **Hearts Breaking:** Hearts cannot be led until:
   - A heart has been discarded on a previous trick, OR
   - The player has only hearts remaining

### Trick Resolution

1. **Winner Determination:** Highest card of the led suit wins
2. **Points Collection:** Winner collects any point cards in the trick
3. **Next Lead:** Trick winner leads the next trick

### Turn Timer

- **Duration:** 30 seconds per turn
- **Auto-Play:** On timeout, server plays the lowest legal card

```javascript
function autoPlayForPlayer(playerId) {
  const legalCards = getLegalCards(playerId);
  const lowestCard = legalCards.sort(byRankAscending)[0];
  playCard(playerId, lowestCard);
  emit(playerId, 'autoPlay', { card: lowestCard });
}
```

### Card Legality Validation

```javascript
function getLegalCards(playerId, trickCards, heartsBroken) {
  const hand = getPlayerHand(playerId);
  const isLeading = trickCards.length === 0;
  const ledSuit = trickCards[0]?.suit;
  
  if (isLeading) {
    if (!heartsBroken) {
      // Cannot lead hearts unless only hearts remain
      const nonHearts = hand.filter(c => c.suit !== 'hearts');
      return nonHearts.length > 0 ? nonHearts : hand;
    }
    return hand;
  }
  
  // Must follow suit if possible
  const sameSuit = hand.filter(c => c.suit === ledSuit);
  if (sameSuit.length > 0) return sameSuit;
  
  // Void in suit - can play anything
  // First trick: cannot play hearts or Q♠
  if (isFirstTrick) {
    const safe = hand.filter(c => 
      c.suit !== 'hearts' && 
      !(c.suit === 'spades' && c.rank === 'Q')
    );
    return safe.length > 0 ? safe : hand;
  }
  
  return hand;
}
```

---

## Scoring System

### Per-Round Scoring

```javascript
function calculateRoundScores(tricksTaken) {
  const scores = [0, 0, 0, 0];
  
  for (let playerIdx = 0; playerIdx < 4; playerIdx++) {
    for (const trick of tricksTaken[playerIdx]) {
      for (const card of trick) {
        if (card.suit === 'hearts') scores[playerIdx] += 1;
        if (card.suit === 'spades' && card.rank === 'Q') scores[playerIdx] += 13;
      }
    }
  }
  
  return scores;
}
```

### Shooting the Moon

**Condition:** One player collects all 26 points (all hearts + Q♠)

**Effect:** Two scoring variants (implement Option A):

| Option | Shooter | Other Players |
|--------|---------|---------------|
| A (Standard) | 0 points | +26 points each |
| B (Alternate) | -26 points | 0 points |

```javascript
function applyShootTheMoon(roundScores) {
  const moonShooter = roundScores.findIndex(s => s === 26);
  
  if (moonShooter !== -1) {
    // Option A: Others get 26 points
    return roundScores.map((s, i) => i === moonShooter ? 0 : 26);
  }
  
  return roundScores;
}
```

### Game End Condition

- **Threshold:** 50 points
- **Trigger:** After any round where a player's cumulative score ≥ 50
- **Winner:** Player with the lowest cumulative score

```javascript
function checkGameEnd(cumulativeScores) {
  const maxScore = Math.max(...cumulativeScores);
  
  if (maxScore >= 50) {
    const minScore = Math.min(...cumulativeScores);
    const winner = cumulativeScores.indexOf(minScore);
    return { ended: true, winner };
  }
  
  return { ended: false };
}
```

### Tie-Breaking

If multiple players tie for lowest score at game end:
1. All tied players are declared co-winners
2. No additional tie-breaker rounds

---

## Multiplayer Infrastructure

### Table Management

#### Table Object Structure

```javascript
{
  id: String,           // Turkish word (e.g., "deniz", "kelebek")
  players: [            // Array of 0-4 players
    {
      id: String,       // Socket ID
      name: String,     // Display name
      seat: Number,     // 0-3 (fixed after joining)
      connected: Boolean
    }
  ],
  game: HeartsGame | null,  // Active game instance
  createdAt: Timestamp,
  cleanupTimer: Timeout | null
}
```

#### Table ID Generation

Table IDs are random Turkish dictionary words, making them memorable and easy to share verbally.

```javascript
// turkish-words.js - Curated list of common, appropriate Turkish words
const TURKISH_WORDS = [
  'elma',      // apple
  'kitap',     // book
  'deniz',     // sea
  'güneş',     // sun
  'yıldız',    // star
  'çiçek',     // flower
  'kuş',       // bird
  'bulut',     // cloud
  'nehir',     // river
  'orman',     // forest
  'dağ',       // mountain
  'ay',        // moon
  'rüzgar',    // wind
  'yağmur',    // rain
  'kar',       // snow
  'ateş',      // fire
  'toprak',    // earth/soil
  'taş',       // stone
  'yaprak',    // leaf
  'göl',       // lake
  'kelebek',   // butterfly
  'arı',       // bee
  'balık',     // fish
  'kedi',      // cat
  'köpek',     // dog
  'aslan',     // lion
  'kartal',    // eagle
  'gül',       // rose
  'lale',      // tulip
  'papatya',   // daisy
  'menekşe',   // violet
  'kiraz',     // cherry
  'portakal',  // orange
  'limon',     // lemon
  'üzüm',      // grape
  'armut',     // pear
  'kavun',     // melon
  'karpuz',    // watermelon
  'fındık',    // hazelnut
  'ceviz',     // walnut
  'badem',     // almond
  'zeytin',    // olive
  'ekmek',     // bread
  'su',        // water
  'çay',       // tea
  'kahve',     // coffee
  'şeker',     // sugar
  'tuz',       // salt
  'kalem',     // pen/pencil
  'masa',      // table
  'sandalye',  // chair
  'pencere',   // window
  'kapı',      // door
  'anahtar',   // key
  'saat',      // clock/hour
  'gece',      // night
  'gündüz',    // daytime
  'sabah',     // morning
  'akşam',     // evening
  'bahar',     // spring
  'yaz',       // summer
  'sonbahar',  // autumn
  'kış',       // winter
  // ... extend to ~500+ words for sufficient uniqueness
];

function generateTableId() {
  let word;
  let attempts = 0;
  const maxAttempts = 100;
  
  do {
    word = TURKISH_WORDS[Math.floor(Math.random() * TURKISH_WORDS.length)];
    attempts++;
  } while (tables.has(word) && attempts < maxAttempts);
  
  if (attempts >= maxAttempts) {
    // Fallback: append random number if all words taken
    word = word + Math.floor(Math.random() * 100);
  }
  
  return word;
}
```

**Word List Requirements:**
- Minimum 500 words for adequate collision resistance
- Words should be common, easy to spell, and appropriate for all audiences
- Avoid words with negative connotations or double meanings
- Include diverse categories: nature, food, animals, objects, colors
- Store in separate `data/turkish-words.json` file for maintainability

#### Table Lifecycle

1. **Creation:** Player creates table, joins as first player
2. **Waiting:** Table visible in lobby, accepting joins (up to 4)
3. **Full:** 4 players joined, game starts automatically
4. **Active:** Game in progress
5. **Cleanup:** Table destroyed when empty for 60 seconds or game ends without rematch

### Player Management

#### Seat Assignment

Players are assigned seats 0-3 in join order. Seats remain fixed for the duration of the table's existence.

```javascript
function assignSeat(table, player) {
  const occupiedSeats = table.players.map(p => p.seat);
  for (let seat = 0; seat < 4; seat++) {
    if (!occupiedSeats.includes(seat)) {
      player.seat = seat;
      return;
    }
  }
  throw new Error('Table full');
}
```

#### Disconnect Handling

```javascript
socket.on('disconnect', () => {
  const table = findPlayerTable(socket.id);
  if (!table) return;
  
  const player = table.players.find(p => p.id === socket.id);
  player.connected = false;
  
  if (table.game) {
    // Game in progress: mark as disconnected, enable AI
    enableAIForPlayer(table.game, player.seat);
  } else {
    // Waiting room: remove player
    table.players = table.players.filter(p => p.id !== socket.id);
    
    if (table.players.length === 0) {
      scheduleTableCleanup(table, 60000);
    }
  }
  
  broadcastTableUpdate(table);
});
```

#### Reconnection

```javascript
socket.on('reconnect', ({ tableId, playerName }) => {
  const table = tables.get(tableId);
  if (!table) return error('Table not found');
  
  const player = table.players.find(p => p.name === playerName && !p.connected);
  if (!player) return error('Cannot reconnect');
  
  player.id = socket.id;
  player.connected = true;
  disableAIForPlayer(table.game, player.seat);
  
  socket.join(tableId);
  emit(socket, 'reconnected', getGameState(table, player.seat));
});
```

---

## User Interface Components

### Lobby View

#### Elements

| Component | Purpose |
|-----------|---------|
| Display Name Input | Set player's visible name |
| Create Table Button | Generate new table, join as first player |
| Table List | Show available tables with player counts |
| Join Button (per table) | Enter a specific table |

#### Table List Entry

```javascript
{
  id: String,          // Display as Turkish word (e.g., "Masa: deniz")
  playerCount: Number, // 1-3 (full tables not shown)
  playerNames: [String] // Names of current players
}
```

### Game View

#### Layout (Clockwise from bottom)

```
              ┌─────────────────────┐
              │   Opponent (Top)    │
              │   [Cards Hidden]    │
              └─────────────────────┘
                        
┌───────────┐ ┌─────────────────────┐ ┌───────────┐
│ Opponent  │ │                     │ │ Opponent  │
│  (Left)   │ │    CENTER TRICK     │ │  (Right)  │
│  [Cards]  │ │    [4 card slots]   │ │  [Cards]  │
└───────────┘ └─────────────────────┘ └───────────┘

              ┌─────────────────────┐
              │   Player (Bottom)   │
              │   [Cards Visible]   │
              └─────────────────────┘
```

#### Component Details

| Component | Description |
|-----------|-------------|
| Player Areas (x4) | Show player name, card backs (opponents) or faces (self), turn indicator |
| Center Trick Area | 4 slots for played cards, positioned by player seat |
| Hand Display | Player's 13 cards, fanned horizontally, clickable |
| Turn Timer Bar | Visual progress bar, depletes over 30 seconds |
| Scoreboard | Collapsible panel showing cumulative scores |
| Last Trick Button | Shows the 4 cards from the previous trick |
| Chat Panel | Message history + input field |
| Pass Direction Indicator | During passing phase, shows arrow/text for direction |

### Visual Feedback

#### Card States

| State | Visual |
|-------|--------|
| Normal | Default card appearance |
| Hoverable | Slight lift on mouse enter |
| Selected (Passing) | Raised position, highlight border |
| Playable | Full opacity |
| Unplayable | Reduced opacity (50%), cursor: not-allowed |
| Currently Playing | Flying animation to center |

#### Animations

| Event | Animation |
|-------|-----------|
| Card Dealt | Fly from deck position to hand |
| Card Played | Fly from hand to center trick area |
| Trick Won | All 4 cards fly to winner's side |
| Cards Passed | Fly in direction of pass |
| Cards Received | Fly into hand from pass direction |

---

## Real-Time Communication

### Socket.IO Events

#### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `createTable` | `{ playerName }` | Create new table and join |
| `joinTable` | `{ tableId, playerName }` | Join existing table |
| `leaveTable` | `{}` | Leave current table |
| `listTables` | `{}` | Request current table list |
| `submitPass` | `{ cards: [Card, Card, Card] }` | Submit passing phase cards |
| `playCard` | `{ card: Card }` | Play a card during trick |
| `rematch` | `{ vote: Boolean }` | Vote for/against rematch |
| `chatMessage` | `{ text: String }` | Send chat message |
| `typing` | `{ isTyping: Boolean }` | Typing indicator |

#### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `tablesList` | `[TableSummary]` | List of joinable tables |
| `tableJoined` | `{ tableId, seat, players }` | Confirmation of join |
| `tableClosed` | `{ reason }` | Table was destroyed |
| `updatePlayers` | `{ players }` | Player list changed |
| `passingPhase` | `{ direction, timeoutAt }` | Start passing phase |
| `cardsReceived` | `{ cards, from }` | Passed cards received |
| `startGame` | `{ hand, startingPlayer }` | Game/round beginning |
| `updateGame` | `{ GameState }` | Full game state update |
| `turnStart` | `{ player, timeoutAt }` | New turn beginning |
| `cardPlayed` | `{ player, card }` | A card was played |
| `trickEnd` | `{ winner, points }` | Trick completed |
| `roundEnd` | `{ scores, cumulativeScores }` | Round completed |
| `gameEnd` | `{ winner, finalScores }` | Game completed |
| `lastTrick` | `{ cards }` | Previous trick data |
| `rematchStatus` | `{ votes }` | Rematch vote status |
| `chat` | `{ from, text, timestamp }` | Chat message received |
| `typingUpdate` | `{ players }` | Who is typing |
| `error` | `{ message }` | Error notification |

### Game State Payload

Sent with `updateGame` event:

```javascript
{
  phase: 'passing' | 'playing' | 'roundEnd' | 'gameEnd',
  roundNumber: Number,
  hand: [Card],           // Player's current hand
  currentTrick: [         // Cards played this trick
    { seat: Number, card: Card }
  ],
  currentPlayer: Number,  // Seat of player to act
  heartsBroken: Boolean,
  scores: [Number],       // Current round scores
  cumulativeScores: [Number],
  tricksTaken: [Number],  // Tricks won per player this round
  passDirection: String | null,  // During passing phase
  passSubmitted: Boolean  // Whether this player submitted pass
}
```

---

## State Management

### Server-Side State

```javascript
// Global state
const tables = new Map();  // tableId -> Table

// Per-table state
class Table {
  id: String;
  players: Player[];
  game: HeartsGame | null;
  cleanupTimer: Timeout | null;
}

// Per-game state
class HeartsGame {
  deck: Card[];
  hands: Card[][];        // [4] arrays of cards
  roundNumber: Number;
  phase: String;
  passDirection: String;
  passes: Map;            // playerId -> [Card, Card, Card]
  currentTrick: Object[];
  currentPlayer: Number;  // Seat index
  heartsBroken: Boolean;
  tricksTaken: Card[][][]; // [4][tricksWon][cardsInTrick]
  roundScores: Number[];
  cumulativeScores: Number[];
  turnTimer: Timeout;
}
```

### Client-Side State (React)

Managed via React Context with useReducer for predictable state updates:

```typescript
// types/game.ts
interface GameState {
  // Connection
  connectionStatus: 'connecting' | 'connected' | 'disconnected';
  tableId: string | null;
  mySeat: number | null;
  
  // Game display
  hand: Card[];
  currentTrick: TrickCard[];
  isMyTurn: boolean;
  legalCards: Card[];
  
  // UI state
  selectedPassCards: Card[];
  showLastTrick: boolean;
  showScoreboard: boolean;
  
  // Players
  players: Player[];
  scores: number[];
  cumulativeScores: number[];
}

// context/GameContext.tsx
type GameAction =
  | { type: 'SET_TABLE'; payload: { tableId: string; seat: number } }
  | { type: 'UPDATE_GAME'; payload: Partial<GameState> }
  | { type: 'PLAY_CARD'; payload: Card }
  | { type: 'SELECT_PASS_CARD'; payload: Card }
  | { type: 'TOGGLE_SCOREBOARD' }
  | { type: 'RESET' };

function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'SET_TABLE':
      return { ...state, tableId: action.payload.tableId, mySeat: action.payload.seat };
    case 'UPDATE_GAME':
      return { ...state, ...action.payload };
    // ... other cases
  }
}

export const GameContext = createContext<{
  state: GameState;
  dispatch: Dispatch<GameAction>;
} | null>(null);
```

#### React Component Structure

```
src/
├── App.tsx                 # Root component, router
├── main.tsx                # Entry point
├── context/
│   ├── GameContext.tsx     # Game state context + reducer
│   └── SocketContext.tsx   # Socket.IO connection context
├── hooks/
│   ├── useSocket.ts        # Socket.IO connection hook
│   ├── useGame.ts          # Game state hook
│   └── useSound.ts         # Sound effects hook
├── components/
│   ├── Lobby/
│   │   ├── Lobby.tsx
│   │   ├── TableList.tsx
│   │   ├── CreateTableButton.tsx
│   │   └── PlayerNameInput.tsx
│   ├── Game/
│   │   ├── Game.tsx        # Main game container
│   │   ├── Table.tsx       # Oval table surface
│   │   ├── PlayerArea.tsx  # Individual player seat
│   │   ├── Hand.tsx        # Player's card hand
│   │   ├── Card.tsx        # Single card component
│   │   ├── TrickArea.tsx   # Center trick display
│   │   ├── PassingUI.tsx   # Card passing interface
│   │   ├── Scoreboard.tsx  # Score display
│   │   ├── TurnTimer.tsx   # Timer progress bar
│   │   └── LastTrick.tsx   # Previous trick viewer
│   ├── Chat/
│   │   ├── ChatPanel.tsx
│   │   ├── ChatMessage.tsx
│   │   └── TypingIndicator.tsx
│   └── common/
│       ├── Button.tsx
│       ├── Modal.tsx
│       └── Loading.tsx
├── utils/
│   ├── cardUtils.ts        # Card sorting, comparison
│   └── animations.ts       # Framer Motion variants
├── types/
│   └── game.ts             # TypeScript interfaces
└── styles/
    └── *.module.css        # CSS Modules
```

---

## Error Handling & Edge Cases

### Validation Errors

| Error | Trigger | Response |
|-------|---------|----------|
| `INVALID_CARD` | Card not in hand | Reject play, re-prompt |
| `NOT_YOUR_TURN` | Play out of turn | Reject, ignore |
| `ILLEGAL_PLAY` | Card violates rules | Reject with reason |
| `TABLE_FULL` | Join full table | Error message |
| `TABLE_NOT_FOUND` | Invalid table ID | Error message |
| `GAME_IN_PROGRESS` | Join during game | Error message |

### Network Edge Cases

| Scenario | Handling |
|----------|----------|
| Player disconnects mid-game | AI takes over, allow reconnect |
| All players disconnect | Game paused, cleanup timer starts |
| Player disconnects mid-pass | Auto-pass random cards |
| Server restart | All tables lost (no persistence) |

### Game Logic Edge Cases

| Scenario | Handling |
|----------|----------|
| Player has only hearts on first trick | Allow hearts (exception) |
| Player has only hearts when leading | Allow leading hearts |
| Player has only Q♠ on first trick | Allow Q♠ (rare but possible) |
| Multiple players tie at game end | All tied lowest are winners |
| All 4 cards same suit & rank (impossible) | N/A - deck has no duplicates |

---

## Future Considerations

### Potential Enhancements

1. **Persistent Accounts:** User authentication, stored statistics
2. **Ranking System:** ELO or similar competitive rating
3. **Spectator Mode:** Watch ongoing games without participating
4. **AI Players:** Fill empty seats with computer opponents
5. **Game Variants:** Jack of Diamonds (-10 points), different end scores
6. **Mobile Optimization:** Touch-friendly UI, responsive layout
7. **Accessibility:** Screen reader support, keyboard navigation

### Performance Considerations

- Consider WebSocket connection pooling for high traffic
- Implement rate limiting on chat and game actions
- Add database persistence for game history and statistics
- Consider horizontal scaling with Redis adapter for Socket.IO

---

*Last Updated: December 2024*
