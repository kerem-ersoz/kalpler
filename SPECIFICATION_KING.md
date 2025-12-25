# King Game Specification

A technical specification for the online 4-player King card game. This document closely mirrors the Hearts spec to enable multi-game support within the same codebase.

---

## Table of Contents

1. Overview
2. Architecture
3. Game Components
4. Game Flow
5. Contract Selection
6. Trick Play
7. Scoring System
8. Multiplayer Infrastructure
9. User Interface Components
10. Real-Time Communication
11. State Management
12. Error Handling & Edge Cases
13. Variants & Configurations
14. Future Considerations

---

## Overview

- Project Name: King
- Purpose: Browser-based 4-player King with real-time play via WebSockets. Standard “dejenere” style: each player selects contracts (penalty or trump) on their turn.

Tech Stack:
- Runtime: Node.js
- Server: Express.js v5.x
- Real-Time: Socket.IO v4.x
- Frontend: React 18 + Vite
- Styling: CSS Modules or Tailwind CSS
- State: React Context + useReducer
- Modules: ES Modules (ESM)

Design Principles:
- Server-authoritative logic; client renders server state
- Event-driven over Socket.IO; no REST for gameplay
- Room isolation per table; stateless clients
- Component-based UI; predictable state updates

---

## Architecture

```
CLIENT (React SPA)
  <Lobby />  <Game />  useSocket() (Socket.IO Client)
  GameContext (React Context + useReducer)

SERVER (Node.js)
  Express (static)  Socket.IO Server  Game State Manager (KingGame, Table)
```

---

## Game Components

Deck:
- 52-card French deck
- Suits: ♠ Spades, ♥ Hearts, ♦ Diamonds, ♣ Clubs
- Ranks: 2–10, J, Q, K, A (ascending)

Contracts (Ceza and Koz):
- Penalties (Ceza):
  - El Almaz (No Tricks)
  - Kupa Almaz (No Hearts)
  - Erkek Almaz (No Kings or Jacks)
  - Kız Almaz (No Queens)
  - Rıfkı (Avoid King of Hearts, K♥)
  - Son İki (Avoid last two tricks)
- Trump (Koz): Any one suit declared as trump; goal is to take tricks.

Terminology:
- El: One trick (4 cards played, highest according to rules wins)
- Party: 20 games total: 12 penalty games + 8 trump games
- Onör: A, K, Q, J (sometimes 10 counted in variants)

---

## Game Flow

State Machine:
- WAITING → SELECTING (contract) → PLAYING → ROUND_END → PARTY_END
  - Rematch optional after PARTY_END

Party Structure:
- Natural (baseline): 6 penalties played in order then 4 trump games; repeat once → 12 penalties + 8 trump = 20 games
- Dejenere (popular): On each turn, player selects a contract (penalty or trump) until all 20 games complete, respecting per-player quotas if configured

Per-Game Sequence:
1. Deal 13 cards to each player
2. Contract selection by current selector (penalty or trump)
3. Play 13 tricks
4. Score for selected contract
5. Advance selector to next player (counter-clockwise)

Starting Player:
- Standard: 2♦ holder leads the first trick of the first game (configurable)
- Turn order is counter-clockwise thereafter

---

## Contract Selection

Selection Rules (Dejenere):
- On a player’s selection turn, choose one:
  - A penalty contract (El Almaz, Kupa Almaz, Erkek Almaz, Kız Almaz, Rıfkı, Son İki)
  - A trump contract (suit declared: ♠/♥/♦/♣)
- Contract quotas may be enforced (e.g., each player must choose 3 penalties and 2 trumps per party)
- Some tables require the first N selections to be penalties before trumps (configurable)

Trump Declaration:
- Selector declares the trump suit (koz) for this game (e.g., “Koz: ♠”)
- Guidance (not enforced): Only select trump if holding sufficient onör/length (≥5 tricks potential)

Cancellation Cases (penalties):
- Kız Almaz: If all players take at least one queen this game, cancel and reselect
- Rıfkı: If any player holds only K♥ and A♥ as singletons (or only hearts comprising K♥ and A♥) before play, game may be canceled and reselected

Cancellation Cases (trump):
- If any player holds no cards above 10 across all suits (variant), the game may be canceled and re-dealt (configurable)

---

## Trick Play

Lead & Follow:
- Players must follow the led suit when possible
- If void in the led suit:
  - Penalty games: May play penalty-relevant cards per constraints
  - Trump games: May play trump (çakmak) or any card; trump overs (yükseltmek) on lead are mandatory only when leading trump

Hearts Restrictions:
- In Kupa Almaz and Rıfkı, no player may lead hearts until hearts are “out” (a heart has been played because someone was void), unless only hearts remain

Special Play Constraints (penalties):
- Erkek Almaz: If void in led suit and holding any K or J in other suits, must play one; if a higher card in led suit is on table and you hold an “erkek” in led suit, you must play it
- Kız Almaz: Analogous to Erkek: if void and holding any Q, must play one; if a higher card in led suit is on table and you hold a Q in led suit, you must play it
- Rıfkı: If void in led suit and holding K♥, must play K♥; else if holding any hearts, must play hearts; if no hearts, any card is allowed
- Son İki: Objective concerns the final two tricks only

Trump Games (Koz):
- Goal: take as many tricks as possible
- Before any trump is played (çakılmadan), no one may lead trump
- If leading trump, players must play higher trump when possible (configurable standard)
- If void in led suit, may play trump; multiple players can trump a trick

Trick Resolution:
- Trump games: Highest trump wins; if no trump, highest card of the led suit wins
- Penalty games: Highest card of the led suit wins; penalties are “collected” by the trick winner
- Winner leads next trick

Turn Timer:
- 30 seconds per turn; auto-play lowest legal card on timeout

---

## Scoring System

Sign:
- Penalty (Ceza) points accumulate negatively (−)
- Trump (Koz) points accumulate positively (+)

Party Totals:
- One pass of penalties totals 2600; penalties are played twice per party → 5200
- Each trump game totals 650 (13 tricks × 50); 8 trump games → 5200
- Party total absolute value: 5200 ceza and 5200 koz

Penalty Values (per game):
- El Almaz: −50 per trick taken; 13 tricks ⇒ total −650
- Kupa Almaz: −30 per heart captured; 13 hearts ⇒ total −390
- Erkek Almaz: −60 per king or jack captured; 8 cards (4K + 4J) ⇒ total −480
- Kız Almaz: −100 per queen captured; 4 cards ⇒ total −400
- Rıfkı: −320 for capturing K♥ (single card)
- Son İki: −180 for each of the last two tricks captured; 2 tricks ⇒ total −360

Trump Values (per game):
- Koz: +50 per trick captured; 13 tricks ⇒ total +650

Outcome:
- Players with ≤ −10 end “batmış”; players with ≥ 0 end “çıkmış” (configurable: some tables require > 0 to be “çıkmış”)
- Game/party winners: Often 1–3 players emerge positive due to penalty distribution

King Condition (optional rule):
- In a trump game, a player taking 10 or more tricks may “make King,” ending the party immediately; that player alone wins regardless of others’ current scores
- Variant requires pre-declaration to attempt King; failing after declaration may result in automatic loss for the declarer

---

## Multiplayer Infrastructure

Table Structure:
- id: String (human-readable)
- players: up to 4 { id, name, seat, connected }
- game: KingGame | null
- createdAt, cleanupTimer

Lifecycle:
- Create → Waiting → Full (4 players) → Active → Cleanup when empty or after party end with no rematch

Seat Assignment:
- Seats 0–3 in join order; fixed for party duration

Disconnect & Reconnect:
- Disconnect: mark player disconnected; AI auto-play on timeout during play
- Reconnect: restore seat and state if party still active

---

## User Interface Components

Lobby:
- Name input, create table, table list, join buttons

Game View:
- Player areas (bottom/self; top; left; right)
- Center trick area (4 slots)
- Contract selection UI for selector (penalty/trump)
- Trump declaration UI when applicable
- Scoreboard: per-game and cumulative; penalty breakdowns; per-player totals
- Timer bar for turn timeout
- Last Trick viewer; Chat panel with typing indicator

Visual Feedback:
- Card states: normal, hover, selected, playable/unplayable, currently playing
- Animations: card play, trick win, penalty collection indicators, trump breaks

---

## Real-Time Communication

Client → Server:
- createTable { playerName }
- joinTable { tableId, playerName }
- leaveTable {}
- listTables {}
- selectContract { type: 'penalty'|'trump', name?: 'el'|'kupa'|'erkek'|'kiz'|'rifki'|'sonIki', trumpSuit?: 'spades'|'hearts'|'diamonds'|'clubs' }
- playCard { card }
- chatMessage { text }
- rematch { vote: boolean }

Server → Client:
- tablesList [TableSummary]
- tableJoined { tableId, seat, players }
- contractSelected { contract, trumpSuit? }
- startGame { hand, startingPlayer }
- updateGame { GameState }
- turnStart { player, timeoutAt }
- cardPlayed { player, card }
- trickEnd { winner }
- roundEnd { scoresUpdate }
- partyEnd { finalTotals, winners }
- chat { from, text, timestamp }
- error { message }

Game State Payload:
- phase: 'selecting'|'playing'|'roundEnd'|'partyEnd'
- roundNumber: number (1–20)
- hand: [Card]
- currentTrick: [{ seat, card }]
- currentPlayer: seat number
- contract: { type: 'penalty'|'trump', name?: 'el'|'kupa'|'erkek'|'kiz'|'rifki'|'sonIki', trumpSuit?: 'spades'|'hearts'|'diamonds'|'clubs' }
- heartsBroken: boolean (for Kupa/Rıfkı)
- trickWinners: number[] (per trick)
- penaltyCounts: per-contract aggregation for this game
- scores: number[] (per player, this game)
- cumulativeScores: number[] (per player, party)

---

## State Management

Server-Side:
- tables: Map<tableId, Table>
- KingGame:
  - deck: Card[]; hands: Card[][]
  - roundNumber: number
  - phase: string
  - selectorSeat: number
  - contract: { type, name?, trumpSuit? }
  - heartsBroken: boolean
  - currentTrick: { seat, card }[]
  - currentPlayer: number
  - trickWinners: number[]
  - penaltyCounts: { el: number; kupa: number; erkek: number; kiz: number; rifki: 0|1; sonIki: number }
  - roundScores: number[]
  - cumulativeScores: number[]
  - turnTimer: Timeout

Client-Side (React):
- Connection status, tableId, seat
- Display: hand, legalCards, currentTrick, isMyTurn
- UI: selected contract (if selector), trump choice, scoreboard visibility
- Players: names, connected
- Scores: per-game and cumulative

---

## Error Handling & Edge Cases

Validation:
- INVALID_CONTRACT: Unknown or disallowed contract
- ILLEGAL_PLAY: Violates lead/follow or special penalty constraints
- NOT_YOUR_TURN: Action out of turn
- TABLE_FULL: Cannot join full table
- TABLE_NOT_FOUND: Invalid table ID

Network:
- Disconnect during play: AI auto-play on timeout; reconnection resumes
- All disconnect: party paused; cleanup timer starts

Gameplay:
- Hearts lead prohibition in Kupa/Rıfkı until broken (unless only hearts remain)
- Kız Almaz all take at least one queen → cancel game and reselect
- Rıfkı special cancel conditions pre-play (variant)
- Trump cancellation on low-card-only hands (variant)
- King attempt declaration rule (variant): failing after declaration → auto loss

---

## Variants & Configurations

- Natural vs Dejenere selection order
- Mandatory initial penalties before trumps
- King attempt declaration required or not
- Trump lead “yükseltmek” strictness
- Cancellation rules (Kız Almaz, Rıfkı, trump low-card)
- Turn start holder (2♦ vs 6♠ in some tournaments)
- Short Internet version: per player 2 penalties + 1 trump
- Scoring tweaks for three-player King

---

## Future Considerations

- Enhanced AI for selection and play strategies
- Detailed statistics (penalty counts taken, trick distributions)
- Spectator mode; persistence for party history
- Accessibility and mobile-friendly interactions
- Multi-language UI (Turkish primary)

---

Last Updated: December 2025
