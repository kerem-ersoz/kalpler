# Spades Game Specification

A technical specification for an online 4-player Spades card game. This document closely mirrors the Hearts spec structure to ease multi-game support in the same codebase.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Game Components](#game-components)
4. [Game Flow](#game-flow)
5. [Bidding Phase](#bidding-phase)
6. [Trick Play Phase](#trick-play-phase)
7. [Scoring System](#scoring-system)
8. [Multiplayer Infrastructure](#multiplayer-infrastructure)
9. [User Interface Components](#user-interface-components)
10. [Real-Time Communication](#real-time-communication)
11. [State Management](#state-management)
12. [Error Handling & Edge Cases](#error-handling--edge-cases)
13. [Future Considerations](#future-considerations)

---

## Overview

**Project Name:** Spades

**Purpose:** Browser-based multiplayer Spades supporting exactly 4 concurrent players per table, with real-time gameplay via WebSockets. Standard team format (2 teams: seats 0+2 vs 1+3).

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
CLIENT (React SPA)
  <Lobby />  <Game />  useSocket() Hook (Socket.IO Client)
  GameContext (React Context + useReducer)

SERVER (Node.js)
  Express (static)  Socket.IO Server  Game State Manager (SpadesGame, Table)
```

### Design Principles

1. **Server-Authoritative:** All game logic executes server-side; clients render state snapshots.
2. **Event-Driven:** Gameplay via Socket.IO events; no REST endpoints for actions.
3. **Room Isolation:** Each table runs in its own Socket.IO room.
4. **Stateless Clients:** Minimal client-side mutation; server is source of truth.
5. **Component-Based UI:** React components with clear boundaries; Context for state; events for actions.

---

## Game Components

### Deck Composition

- **Total Cards:** 52 (standard French deck)
- **Suits:** Hearts (♥), Diamonds (♦), Clubs (♣), Spades (♠)
- **Ranks:** 2, 3, 4, 5, 6, 7, 8, 9, 10, J, Q, K, A (ascending order)
- **Trump:** Spades are always trump.

### Card Representation

```javascript
{
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades',
  rank: '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A',
  display: '2♠' | 'A♦' | ... // Human-readable format
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

### Special Concepts

- **Spades Trump:** Any spade beats any non-spade in a trick.
- **Spades Broken:** Spades cannot be led until spades have been played as trump (i.e., someone is void in the led suit and throws a spade), or a player holds only spades.

---

## Game Flow

### State Machine

```
WAITING  →  BIDDING  →  PLAYING  →  ROUND_END  →  GAME_END
         ↑                                 │
         └──────────── Rematch ────────────┘
```

- **WAITING:** Table created, awaiting 4 players.
- **BIDDING:** Each player declares expected tricks (0–13). Nil (0) allowed.
- **PLAYING:** 13 tricks; spades are trump; must follow suit.
- **ROUND_END:** Score evaluation (bids vs tricks, bags, nil outcomes).
- **GAME_END:** Target score reached; declare winning team; optional rematch.

### Phase Sequence Per Round

1. **Deal:** Server shuffles and deals 13 cards to each player.
2. **Bidding:** Players bid their expected trick count (Nil allowed; Blind Nil optional).
3. **Play:** 13 tricks executed with spades trump; track tricks per team.
4. **Scoring:** Compute team scores (bid success/failure, bags, nil bonuses/penalties).
5. **Continuation:** If winning threshold reached (e.g., 500), end game; else next round.

---

## Bidding Phase

### Overview

Each player declares a bid for the number of tricks they expect to win this round. Team bid is the sum of partner bids (seats 0+2 vs 1+3).

### Bid Rules

- **Range:** 0–13 per player.
- **Nil (0):** Player commits to taking zero tricks.
- **Blind Nil (Optional):** Declare Nil before seeing cards; larger bonus/penalty.
- **Minimum Team Bid:** None (standard); configurable variants may enforce.
- **Lock-In:** Bids are final once all four have submitted.

### Bidding Phase State

```javascript
{
  phase: 'bidding',
  roundNumber: Number,
  bids: { [playerId]: Number | 'nil' | 'blind_nil' },
  bidsSubmitted: Number // count of submitted bids (0–4)
}
```

### Server-Side Implementation

1. **Initiate Bidding:**
```javascript
startBiddingPhase();
emit('biddingPhase', { roundNumber, timeoutAt });
```

2. **Receive Bid:**
```javascript
socket.on('submitBid', (bid) => {
  // bid: 0–13 | 'nil' | 'blind_nil'
  if (!isValidBid(bid)) return error('Invalid bid');
  game.bids[playerId] = bid;
  if (Object.keys(game.bids).length === 4) startPlayPhase();
});
```

3. **Timeout:**
- If a player fails to bid within timeout (e.g., 45s), assign auto-bid (e.g., 2) or **auto-nil disabled** by default.

### Client-Side Implementation

- Show bid input (0–13) and Nil toggle (Blind Nil optional).
- Bid input should be a slider with a confirm and a blind nil button.
- Emit `submitBid` upon confirmation.
- Display partner/team bid sum as players submit.

---

## Trick Play Phase

### Lead & Follow Rules

1. **Opening Lead:** Any non-spade card; spades cannot be led until broken (unless player holds only spades).
2. **Following Suit:** Players must follow the led suit if they have it.
3. **Void in Suit:** If unable to follow suit, any card may be played; spades act as trump.
4. **Spades Broken:** Once a spade has been played as trump, spades may be led.

### Trick Resolution

- **Winner:** Highest spade wins; if no spade, highest card of led suit wins.
- **Collection:** Winner takes the trick; increment team trick count accordingly.
- **Next Lead:** Trick winner leads the next trick.

### Turn Timer

- **Duration:** 30 seconds per turn.
- **Auto-Play:** On timeout, server plays the lowest legal card.

```javascript
function autoPlayForPlayer(playerId) {
  const legal = getLegalCards(playerId);
  const lowest = legal.sort(byRankAscending)[0];
  playCard(playerId, lowest);
  emit(playerId, 'autoPlay', { card: lowest });
}
```

### Card Legality Validation

```javascript
function getLegalCards(playerId, trickCards, spadesBroken) {
  const hand = getPlayerHand(playerId);
  const isLeading = trickCards.length === 0;
  const ledSuit = trickCards[0]?.suit;

  if (isLeading) {
    if (!spadesBroken) {
      const nonSpades = hand.filter(c => c.suit !== 'spades');
      return nonSpades.length > 0 ? nonSpades : hand; // only spades => allowed
    }
    return hand;
  }

  const sameSuit = hand.filter(c => c.suit === ledSuit);
  if (sameSuit.length > 0) return sameSuit;

  return hand; // void in suit => can play anything (spades trump applies)
}
```

---

## Scoring System

### Team Scoring (per round)

- **Bid Success:** 10 points × team bid (sum of partners) if team meets or exceeds team bid.
- **Bid Failure:** −10 points × team bid if team falls short.
- **Overtricks (Bags):** +1 point per trick above team bid.
- **Bag Penalty:** Every 10 cumulative bags ⇒ −100 points (bags reduced by 10).

### Nil & Blind Nil

- **Nil (0):** If Nil bidder takes zero tricks ⇒ +50 points to team; if Nil fails (takes any trick) ⇒ −50 points to team.
- **Blind Nil (Optional):** Declare before seeing cards ⇒ +100 on success / −100 on failure. Blind nil may only be declared if a team is behind by at least 99 points, and it may only be declared by one member of the team. Each member of a blind nil team chooses two cards to send to their partner.
- **Partner Scoring:** Partner’s bid scored independently; Nil bidder’s tricks (if any) count toward team bags.

### Example Calculation

```javascript
function calculateRoundScores({ teamTricks, bids, priorBags, nilOutcomes }) {
  const teamBid = [bids[0] + bids[2], bids[1] + bids[3]]; // seats 0+2 vs 1+3
  const scores = [0, 0];
  const bags = [...priorBags];

  for (let t = 0; t < 2; t++) {
    const tricks = teamTricks[t];
    const bid = normalizeTeamBid(teamBid[t]); // treat 'nil' as 0 in sum
    if (tricks >= bid) {
      scores[t] += bid * 10;
      const over = Math.max(0, tricks - bid);
      scores[t] += over; // bags
      bags[t] += over;
    } else {
      scores[t] -= bid * 10;
    }
  }

  applyNilBonuses(scores, nilOutcomes);
  applyBagPenalties(scores, bags);
  return { scores, bags };
}
```

### Game End Condition

- **Threshold:** 300 points (configurable).
- **Trigger:** When a team’s cumulative score ≥ threshold.
- **Winner:** Higher cumulative score wins; ties ⇒ co-winners.

---

## Multiplayer Infrastructure

### Table Management

#### Table Object Structure

```javascript
{
  id: String,
  players: [
    { id, name, seat, connected }
  ],
  teams: { team0: [0, 2], team1: [1, 3] },
  game: SpadesGame | null,
  createdAt: Timestamp,
  cleanupTimer: Timeout | null
}
```

#### Seat & Team Assignment

- Seats assigned in join order 0–3.
- Teams are fixed: seats 0+2 vs seats 1+3.

#### Table Lifecycle

- Creation → Waiting → Full → Active → Cleanup (same as Hearts).

---

## User Interface Components

### Lobby View

- Same elements as Hearts: name input, create table, table list, join.

### Game View

#### Layout

- Four player areas (bottom/self; top/opponent; left; right).
- Center trick area with 4 slots.
- Team scoreboard (team totals + bags + round bids).
- Bidding UI before play (number input 0–13, Nil toggle; Blind Nil optional).

#### Visual Feedback

- Card states: normal, hover, selected, playable/unplayable, currently playing.
- Animations: card play, trick win, etc.

---

## Real-Time Communication

### Socket.IO Events

#### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `createTable` | `{ playerName }` | Create and join table |
| `joinTable` | `{ tableId, playerName }` | Join table |
| `leaveTable` | `{}` | Leave current table |
| `listTables` | `{}` | Request table list |
| `submitBid` | `{ bid: 0–13 | 'nil' | 'blind_nil' }` | Submit bid |
| `playCard` | `{ card }` | Play a card |
| `rematch` | `{ vote: Boolean }` | Rematch vote |
| `chatMessage` | `{ text }` | Send chat |

#### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `tablesList` | `[TableSummary]` | Joinable tables |
| `tableJoined` | `{ tableId, seat, players }` | Join confirm |
| `passingPhase` | — | Not used in Spades |
| `biddingPhase` | `{ timeoutAt }` | Start bidding |
| `bidsUpdate` | `{ bids }` | Current bids |
| `startGame` | `{ hand, startingPlayer }` | Round start |
| `updateGame` | `{ GameState }` | Full state update |
| `turnStart` | `{ player, timeoutAt }` | Turn begin |
| `cardPlayed` | `{ player, card }` | Card played |
| `trickEnd` | `{ winner, team }` | Trick winner |
| `roundEnd` | `{ scores, cumulative, bags }` | Round done |
| `gameEnd` | `{ winnerTeam, finalScores }` | Game done |
| `error` | `{ message }` | Error notification |

### Game State Payload

```javascript
{
  phase: 'bidding' | 'playing' | 'roundEnd' | 'gameEnd',
  roundNumber: Number,
  hand: [Card],
  currentTrick: [ { seat, card } ],
  currentPlayer: Number,
  spadesBroken: Boolean,
  bids: [Number|'nil'|'blind_nil'], // per seat
  teamTricks: [Number, Number],     // per team this round
  scores: [Number, Number],         // round scores per team
  cumulativeScores: [Number, Number],
  bags: [Number, Number]            // cumulative bag count per team
}
```

---

## State Management

### Server-Side State

```javascript
class SpadesGame {
  deck: Card[];
  hands: Card[][];          // [4]
  roundNumber: Number;
  phase: String;
  bids: (number|'nil'|'blind_nil')[]; // [4]
  spadesBroken: Boolean;
  currentTrick: { seat: number, card: Card }[];
  currentPlayer: Number;
  tricksTakenBySeat: Number[]; // [4]
  teamTricks: Number[];        // [2]
  bags: Number[];              // cumulative per team
  roundScores: Number[];       // per team
  cumulativeScores: Number[];  // per team
  turnTimer: Timeout;
}
```

### Client-Side State (React)

- Same architecture as Hearts; additional fields for bids, spadesBroken, team scores, bags.

---

## Error Handling & Edge Cases

### Validation Errors

| Error | Trigger | Response |
|-------|---------|----------|
| `INVALID_BID` | Bid not in allowed set | Reject |
| `ILLEGAL_PLAY` | Violates lead/follow rules | Reject |
| `NOT_YOUR_TURN` | Out of turn | Reject |
| `TABLE_FULL` | Join full table | Error |
| `TABLE_NOT_FOUND` | Invalid table ID | Error |

### Network Edge Cases

- Disconnect during bidding ⇒ auto-bid (configurable) and continue.
- Disconnect during play ⇒ AI auto-play on timeout; allow reconnection.

### Gameplay Edge Cases

- Leading spades before broken ⇒ reject unless only spades.
- Nil success/failure must consider tricks taken by Nil bidder.
- Bag penalty applied at every 10 bags (−100).
- Blind Nil (optional) must be declared before cards are revealed.

---

## Future Considerations

1. **Variants:** Cutthroat (3-player), Joker-Joker-Ace (Jokers as high trump), Deuces high, Boston (winning all 13 tricks).
2. **Configurable Rules:** Target score, bag penalty interval/amount, nil/Blind Nil values.
3. **AI Improvements:** Smarter bidding/play, partner signaling (legal).
4. **Statistics:** Track bids vs actual tricks, nil success rate, bag counts.
5. **Accessibility & Mobile:** Touch-friendly UI, keyboard support.

---

*Last Updated: December 2025*
