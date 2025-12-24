import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? false : ['http://localhost:5173'],
    methods: ['GET', 'POST'],
  },
});

// Load Turkish words for table IDs
const turkishWords = JSON.parse(
  readFileSync(join(__dirname, '..', 'data', 'turkish-words.json'), 'utf-8')
);

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(join(__dirname, '..', 'dist')));
  app.get('/{*path}', (req, res) => {
    res.sendFile(join(__dirname, '..', 'dist', 'index.html'));
  });
}

// ============================================================================
// GAME CLASSES
// ============================================================================

const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RANK_VALUES = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
};
const SUIT_SYMBOLS = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({
        suit,
        rank,
        display: `${rank}${SUIT_SYMBOLS[suit]}`,
      });
    }
  }
  return deck;
}

function shuffleDeck(deck) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function cardEquals(a, b) {
  return a.suit === b.suit && a.rank === b.rank;
}

function getPassDirection(roundNumber) {
  const directions = ['left', 'right', 'across', 'hold'];
  return directions[(roundNumber - 1) % 4];
}

function getReceiverIndex(giverIndex, direction) {
  switch (direction) {
    case 'left': return (giverIndex + 1) % 4;
    case 'right': return (giverIndex + 3) % 4;
    case 'across': return (giverIndex + 2) % 4;
    default: return giverIndex;
  }
}

class HeartsGame {
  constructor() {
    this.hands = [[], [], [], []];
    this.roundNumber = 1;
    this.phase = 'dealing';
    this.passDirection = null;
    this.passes = {};
    this.currentTrick = [];
    this.currentPlayer = 0;
    this.heartsBroken = false;
    this.tricksTaken = [[], [], [], []];
    this.roundScores = [0, 0, 0, 0];
    this.cumulativeScores = [0, 0, 0, 0];
    this.turnTimer = null;
    this.turnWarningTimer = null;
    this.lastTrick = null;
    this.tricksPlayed = 0;
  }

  deal() {
    const deck = shuffleDeck(createDeck());
    this.hands = [[], [], [], []];
    
    for (let i = 0; i < 52; i++) {
      this.hands[i % 4].push(deck[i]);
    }
    
    // Sort hands
    for (let i = 0; i < 4; i++) {
      this.hands[i] = this.sortHand(this.hands[i]);
    }
    
    this.passDirection = getPassDirection(this.roundNumber);
    this.phase = this.passDirection === 'hold' ? 'playing' : 'passing';
    this.passes = {};
    this.currentTrick = [];
    this.heartsBroken = false;
    this.tricksTaken = [[], [], [], []];
    this.roundScores = [0, 0, 0, 0];
    this.lastTrick = null;
    this.tricksPlayed = 0;
    
    // Find player with 2 of clubs
    if (this.phase === 'playing') {
      this.currentPlayer = this.findTwoOfClubsPlayer();
    }
    
    return this.passDirection;
  }

  sortHand(hand) {
    const suitOrder = { clubs: 0, diamonds: 1, spades: 2, hearts: 3 };
    return [...hand].sort((a, b) => {
      if (suitOrder[a.suit] !== suitOrder[b.suit]) {
        return suitOrder[a.suit] - suitOrder[b.suit];
      }
      return RANK_VALUES[a.rank] - RANK_VALUES[b.rank];
    });
  }

  findTwoOfClubsPlayer() {
    for (let i = 0; i < 4; i++) {
      if (this.hands[i].some(c => c.suit === 'clubs' && c.rank === '2')) {
        return i;
      }
    }
    return 0;
  }

  submitPass(playerIndex, cards) {
    if (this.phase !== 'passing') {
      return { success: false, error: 'Not in passing phase' };
    }
    
    if (cards.length !== 3) {
      return { success: false, error: 'Must pass exactly 3 cards' };
    }
    
    // Validate cards are in player's hand
    for (const card of cards) {
      if (!this.hands[playerIndex].some(c => cardEquals(c, card))) {
        return { success: false, error: 'Card not in hand' };
      }
    }
    
    this.passes[playerIndex] = cards;
    
    // Check if all passes submitted
    if (Object.keys(this.passes).length === 4) {
      const exchangeInfo = this.executeCardExchange();
      return { success: true, allPassed: true, exchangeInfo };
    }
    
    return { success: true, allPassed: false };
  }

  executeCardExchange() {
    const direction = this.passDirection;
    const receivedCards = [[], [], [], []];
    const passedCards = { ...this.passes }; // Store before clearing
    
    // Calculate what each player receives
    for (let i = 0; i < 4; i++) {
      const receiverIndex = getReceiverIndex(i, direction);
      receivedCards[receiverIndex] = this.passes[i];
    }
    
    // Remove passed cards and add received cards
    for (let i = 0; i < 4; i++) {
      // Remove passed cards
      this.hands[i] = this.hands[i].filter(
        c => !this.passes[i].some(p => cardEquals(c, p))
      );
      // Add received cards
      this.hands[i].push(...receivedCards[i]);
      // Re-sort hand
      this.hands[i] = this.sortHand(this.hands[i]);
    }
    
    this.phase = 'playing';
    this.currentPlayer = this.findTwoOfClubsPlayer();
    this.passes = {};
    
    // Return exchange info for each player
    return {
      passedCards,
      receivedCards,
    };
  }

  getLegalCards(playerIndex) {
    const hand = this.hands[playerIndex];
    const isLeading = this.currentTrick.length === 0;
    const isFirstTrick = this.tricksPlayed === 0 && this.currentTrick.length === 0;
    
    // First trick: must lead 2 of clubs
    if (isFirstTrick && isLeading) {
      return hand.filter(c => c.suit === 'clubs' && c.rank === '2');
    }
    
    if (isLeading) {
      // Can't lead hearts until broken (unless only hearts remain)
      if (!this.heartsBroken) {
        const nonHearts = hand.filter(c => c.suit !== 'hearts');
        if (nonHearts.length > 0) {
          return nonHearts;
        }
      }
      return hand;
    }
    
    // Must follow suit if possible
    const ledSuit = this.currentTrick[0].card.suit;
    const sameSuit = hand.filter(c => c.suit === ledSuit);
    
    if (sameSuit.length > 0) {
      return sameSuit;
    }
    
    // Can't play on first trick: hearts or Q♠
    if (this.tricksPlayed === 0) {
      const safe = hand.filter(c => 
        c.suit !== 'hearts' && 
        !(c.suit === 'spades' && c.rank === 'Q')
      );
      if (safe.length > 0) {
        return safe;
      }
    }
    
    // Can play anything
    return hand;
  }

  playCard(playerIndex, card) {
    if (this.phase !== 'playing') {
      return { success: false, error: 'Not in playing phase' };
    }
    
    if (playerIndex !== this.currentPlayer) {
      return { success: false, error: 'Not your turn' };
    }
    
    const legalCards = this.getLegalCards(playerIndex);
    if (!legalCards.some(c => cardEquals(c, card))) {
      return { success: false, error: 'Illegal card play' };
    }
    
    // Remove card from hand
    this.hands[playerIndex] = this.hands[playerIndex].filter(c => !cardEquals(c, card));
    
    // Add to current trick
    this.currentTrick.push({ seat: playerIndex, card });
    
    // Check if hearts broken
    if (card.suit === 'hearts') {
      this.heartsBroken = true;
    }
    
    // Check if trick is complete
    if (this.currentTrick.length === 4) {
      return this.completeTrick();
    }
    
    // Move to next player
    this.currentPlayer = (this.currentPlayer + 1) % 4;
    
    return { success: true, trickComplete: false };
  }

  completeTrick() {
    const ledSuit = this.currentTrick[0].card.suit;
    let winningPlay = this.currentTrick[0];
    
    for (const play of this.currentTrick) {
      if (play.card.suit === ledSuit && 
          RANK_VALUES[play.card.rank] > RANK_VALUES[winningPlay.card.rank]) {
        winningPlay = play;
      }
    }
    
    const winner = winningPlay.seat;
    
    // Calculate points in trick
    let points = 0;
    for (const play of this.currentTrick) {
      if (play.card.suit === 'hearts') points += 1;
      if (play.card.suit === 'spades' && play.card.rank === 'Q') points += 13;
    }
    
    this.roundScores[winner] += points;
    this.tricksTaken[winner].push([...this.currentTrick]);
    this.lastTrick = [...this.currentTrick];
    this.tricksPlayed++;
    
    // Check if round is complete
    if (this.tricksPlayed === 13) {
      return this.completeRound(winner);
    }
    
    this.currentTrick = [];
    this.currentPlayer = winner;
    
    return { 
      success: true, 
      trickComplete: true, 
      winner, 
      points,
      roundComplete: false 
    };
  }

  completeRound(lastTrickWinner) {
    // Check for shooting the moon
    const moonShooter = this.roundScores.findIndex(s => s === 26);
    let moonShotType = null; // 'gave' or 'took'
    
    if (moonShooter !== -1) {
      // Calculate what cumulative scores would be if shooter gets 0 and others get 26
      const hypotheticalScores = this.cumulativeScores.map((score, i) => 
        i === moonShooter ? score : score + 26
      );
      
      // Check if shooter would win (have lowest score) with Option A
      const shooterHypotheticalScore = hypotheticalScores[moonShooter];
      const othersMinScore = Math.min(...hypotheticalScores.filter((_, i) => i !== moonShooter));
      const shooterWouldWin = shooterHypotheticalScore <= othersMinScore;
      
      if (shooterWouldWin) {
        // Option A: Others get 26 points, shooter gets 0
        moonShotType = 'gave';
        for (let i = 0; i < 4; i++) {
          if (i === moonShooter) {
            this.roundScores[i] = 0;
          } else {
            this.roundScores[i] = 26;
          }
        }
      } else {
        // Option B: Shooter takes 26 points (loses), others get 0
        moonShotType = 'took';
        for (let i = 0; i < 4; i++) {
          if (i === moonShooter) {
            this.roundScores[i] = 26;
          } else {
            this.roundScores[i] = 0;
          }
        }
      }
    }
    
    // Add to cumulative scores
    for (let i = 0; i < 4; i++) {
      this.cumulativeScores[i] += this.roundScores[i];
    }
    
    // Check for game end (set to 20 for bot testing, normally 50)
    const maxScore = Math.max(...this.cumulativeScores);
    const gameOver = maxScore >= 20;
    
    let winner = null;
    if (gameOver) {
      const minScore = Math.min(...this.cumulativeScores);
      winner = this.cumulativeScores.indexOf(minScore);
    }
    
    this.currentTrick = [];
    this.phase = 'roundEnd';
    
    return {
      success: true,
      trickComplete: true,
      winner: lastTrickWinner,
      points: this.roundScores[lastTrickWinner],
      roundComplete: true,
      roundScores: [...this.roundScores],
      cumulativeScores: [...this.cumulativeScores],
      moonShooter: moonShooter !== -1 ? moonShooter : null,
      moonShotType, // 'gave' or 'took' or null
      gameOver,
      gameWinner: winner,
    };
  }

  startNextRound() {
    this.roundNumber++;
    this.deal();
  }

  getStateForPlayer(playerIndex) {
    return {
      phase: this.phase,
      roundNumber: this.roundNumber,
      hand: this.hands[playerIndex],
      currentTrick: this.currentTrick,
      currentPlayer: this.currentPlayer,
      heartsBroken: this.heartsBroken,
      roundScores: this.roundScores,
      cumulativeScores: this.cumulativeScores,
      passDirection: this.passDirection,
      passSubmitted: this.passes[playerIndex] !== undefined,
      lastTrick: this.lastTrick,
      legalCards: this.phase === 'playing' && playerIndex === this.currentPlayer
        ? this.getLegalCards(playerIndex)
        : [],
    };
  }

  // Get point cards (hearts and queen of spades) taken by each player, sorted in ascending order
  getPointCardsTaken() {
    const rankValues = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
    const suitOrder = { clubs: 0, diamonds: 1, spades: 2, hearts: 3 };
    
    return this.tricksTaken.map(tricks => {
      const pointCards = [];
      for (const trick of tricks) {
        for (const { card } of trick) {
          if (card.suit === 'hearts' || (card.suit === 'spades' && card.rank === 'Q')) {
            pointCards.push(card);
          }
        }
      }
      // Sort: spades first (Q♠), then hearts by rank ascending
      return pointCards.sort((a, b) => {
        if (a.suit !== b.suit) {
          return suitOrder[a.suit] - suitOrder[b.suit];
        }
        return rankValues[a.rank] - rankValues[b.rank];
      });
    });
  }
}

// ============================================================================
// TABLE MANAGEMENT
// ============================================================================

const tables = new Map();

function generateTableId() {
  let word;
  let attempts = 0;
  const maxAttempts = 100;
  
  do {
    word = turkishWords[Math.floor(Math.random() * turkishWords.length)];
    attempts++;
  } while (tables.has(word) && attempts < maxAttempts);
  
  if (attempts >= maxAttempts) {
    word = word + Math.floor(Math.random() * 100);
  }
  
  return word;
}

class Table {
  constructor(id) {
    this.id = id;
    this.players = [];
    this.game = null;
    this.cleanupTimer = null;
    this.rematchVotes = {};
    this.turnTimer = null;
    this.passTimer = null;
    this.passTimeoutAt = null;
    this.typingPlayers = new Set();
  }

  addPlayer(socketId, name) {
    if (this.players.length >= 4) {
      return { success: false, error: 'Table is full' };
    }
    
    if (this.game) {
      return { success: false, error: 'Game already in progress' };
    }
    
    const seat = this.getNextSeat();
    this.players.push({
      id: socketId,
      name,
      seat,
      connected: true,
    });
    
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    
    return { success: true, seat };
  }

  getNextSeat() {
    const takenSeats = this.players.map(p => p.seat);
    for (let i = 0; i < 4; i++) {
      if (!takenSeats.includes(i)) return i;
    }
    return -1;
  }

  removePlayer(socketId) {
    const playerIndex = this.players.findIndex(p => p.id === socketId);
    if (playerIndex === -1) return null;
    
    const player = this.players[playerIndex];
    
    if (this.game) {
      player.connected = false;
    } else {
      this.players.splice(playerIndex, 1);
    }
    
    return player;
  }

  getPlayerBySeat(seat) {
    return this.players.find(p => p.seat === seat);
  }

  getPlayerBySocketId(socketId) {
    return this.players.find(p => p.id === socketId);
  }

  startGame() {
    if (this.players.length !== 4) return false;
    
    this.game = new HeartsGame();
    this.game.deal();
    this.rematchVotes = {};
    
    return true;
  }

  getPublicInfo() {
    return {
      id: this.id,
      playerCount: this.players.length,
      playerNames: this.players.map(p => p.name),
      inGame: this.game !== null,
    };
  }
}

// ============================================================================
// SOCKET.IO EVENT HANDLERS
// ============================================================================

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  
  let currentTableId = null;

  // -------------------------------------------------------------------------
  // LOBBY EVENTS
  // -------------------------------------------------------------------------

  socket.on('listTables', () => {
    const tableList = [];
    for (const [id, table] of tables) {
      if (table.players.length < 4 && !table.game) {
        tableList.push(table.getPublicInfo());
      }
    }
    socket.emit('tablesList', tableList);
  });

  socket.on('createTable', ({ playerName }) => {
    if (!playerName || playerName.trim().length === 0) {
      socket.emit('error', { message: 'Player name is required' });
      return;
    }
    
    const tableId = generateTableId();
    const table = new Table(tableId);
    tables.set(tableId, table);
    
    const result = table.addPlayer(socket.id, playerName.trim());
    
    if (result.success) {
      socket.join(tableId);
      currentTableId = tableId;
      
      socket.emit('tableJoined', {
        tableId,
        seat: result.seat,
        players: table.players.map(p => ({ name: p.name, seat: p.seat, connected: p.connected })),
      });
      
      broadcastTablesList();
    } else {
      socket.emit('error', { message: result.error });
    }
  });

  socket.on('joinTable', ({ tableId, playerName }) => {
    if (!playerName || playerName.trim().length === 0) {
      socket.emit('error', { message: 'Player name is required' });
      return;
    }
    
    const table = tables.get(tableId);
    
    if (!table) {
      socket.emit('error', { message: 'Table not found' });
      return;
    }
    
    const result = table.addPlayer(socket.id, playerName.trim());
    
    if (result.success) {
      socket.join(tableId);
      currentTableId = tableId;
      
      socket.emit('tableJoined', {
        tableId,
        seat: result.seat,
        players: table.players.map(p => ({ name: p.name, seat: p.seat, connected: p.connected })),
      });
      
      socket.to(tableId).emit('updatePlayers', {
        players: table.players.map(p => ({ name: p.name, seat: p.seat, connected: p.connected })),
      });
      
      // Start game if 4 players
      if (table.players.length === 4) {
        table.startGame();
        
        for (const player of table.players) {
          io.to(player.id).emit('startGame', {
            hand: table.game.hands[player.seat],
            passDirection: table.game.passDirection,
            phase: table.game.phase,
            currentPlayer: table.game.currentPlayer,
          });
        }
        
        // Start pass timer if in passing phase, otherwise auto-play 2 of clubs
        if (table.game.phase === 'passing') {
          startPassTimer(table);
        } else if (table.game.phase === 'playing') {
          setTimeout(() => autoPlayTwoOfClubs(table), 500);
        }
      }
      
      broadcastTablesList();
    } else {
      socket.emit('error', { message: result.error });
    }
  });

  socket.on('leaveTable', () => {
    if (!currentTableId) return;
    
    const table = tables.get(currentTableId);
    if (!table) return;
    
    const player = table.removePlayer(socket.id);
    socket.leave(currentTableId);
    
    if (player) {
      socket.to(currentTableId).emit('updatePlayers', {
        players: table.players.map(p => ({ name: p.name, seat: p.seat, connected: p.connected })),
      });
      
      // Clean up empty tables
      if (table.players.length === 0 || table.players.every(p => !p.connected)) {
        table.cleanupTimer = setTimeout(() => {
          tables.delete(currentTableId);
          broadcastTablesList();
        }, 60000);
      }
    }
    
    currentTableId = null;
    broadcastTablesList();
  });

  // -------------------------------------------------------------------------
  // GAME EVENTS
  // -------------------------------------------------------------------------

  socket.on('submitPass', ({ cards }) => {
    if (!currentTableId) return;
    
    const table = tables.get(currentTableId);
    if (!table || !table.game) return;
    
    const player = table.getPlayerBySocketId(socket.id);
    if (!player) return;
    
    const result = table.game.submitPass(player.seat, cards);
    
    if (!result.success) {
      socket.emit('error', { message: result.error });
      return;
    }
    
    socket.emit('passSubmitted');
    
    if (result.allPassed) {
      clearPassTimer(table);
      
      // Send updated hands to all players with pass/receive info for animation
      for (const p of table.players) {
        io.to(p.id).emit('cardsReceived', {
          hand: table.game.hands[p.seat],
          phase: table.game.phase,
          currentPlayer: table.game.currentPlayer,
          cardsPassed: result.exchangeInfo.passedCards[p.seat],
          cardsReceived: result.exchangeInfo.receivedCards[p.seat],
        });
      }
      
      // Auto-play 2 of clubs after animation completes (2.5 seconds)
      setTimeout(() => autoPlayTwoOfClubs(table), 2500);
    }
  });

  socket.on('playCard', ({ card }) => {
    if (!currentTableId) return;
    
    const table = tables.get(currentTableId);
    if (!table || !table.game) return;
    
    const player = table.getPlayerBySocketId(socket.id);
    if (!player) return;
    
    clearTurnTimer(table);
    
    const result = table.game.playCard(player.seat, card);
    
    if (!result.success) {
      socket.emit('error', { message: result.error });
      startTurnTimer(table);
      return;
    }
    
    // Broadcast card played - if trick is complete, send lastTrick since currentTrick is now cleared
    io.to(currentTableId).emit('cardPlayed', {
      seat: player.seat,
      card,
      currentTrick: result.trickComplete ? table.game.lastTrick : table.game.currentTrick,
      trickComplete: result.trickComplete || false,
      winner: result.trickComplete ? result.winner : null,
    });
    
    if (result.trickComplete) {
      // Delay trickEnd to allow animation to play (1.6 seconds)
      setTimeout(() => {
        io.to(currentTableId).emit('trickEnd', {
          winner: result.winner,
          points: result.points,
          lastTrick: table.game.lastTrick,
        });
        
        if (result.roundComplete) {
          io.to(currentTableId).emit('roundEnd', {
            roundScores: result.roundScores,
            cumulativeScores: result.cumulativeScores,
            moonShooter: result.moonShooter,
            moonShotType: result.moonShotType,
            gameOver: result.gameOver,
            gameWinner: result.gameWinner,
            pointCardsTaken: table.game.getPointCardsTaken(),
          });
          
          if (result.gameOver) {
            table.rematchVotes = {};
            io.to(currentTableId).emit('gameEnd', {
              winner: result.gameWinner,
              finalScores: result.cumulativeScores,
            });
          } else {
            // Auto-advance to next round after animation
            // Animation: 700ms delay between players, 300ms per card, 1000ms final delay
            // Worst case: ~14 point cards across 4 players = ~(14 * 300) + (3 * 700) + 1000 = ~7300ms
            setTimeout(() => {
              if (!table.game || table.game.phase !== 'roundEnd') return;
              
              table.game.startNextRound();
              
              for (const p of table.players) {
                io.to(p.id).emit('startGame', {
                  hand: table.game.hands[p.seat],
                  passDirection: table.game.passDirection,
                  phase: table.game.phase,
                  currentPlayer: table.game.currentPlayer,
                });
              }
              
              // Start pass timer if in passing phase, otherwise auto-play 2 of clubs
              if (table.game.phase === 'passing') {
                startPassTimer(table);
              } else if (table.game.phase === 'playing') {
                setTimeout(() => autoPlayTwoOfClubs(table), 500);
              }
            }, 8000);
          }
        } else {
          // Update game state for next trick - delay to allow client animation
          setTimeout(() => {
            for (const p of table.players) {
              io.to(p.id).emit('updateGame', table.game.getStateForPlayer(p.seat));
            }
            startTurnTimer(table);
          }, 2000);
        }
      }, 500);
    } else {
      // Update game state
      for (const p of table.players) {
        io.to(p.id).emit('updateGame', table.game.getStateForPlayer(p.seat));
      }
      startTurnTimer(table);
    }
  });

  socket.on('nextRound', () => {
    if (!currentTableId) return;
    
    const table = tables.get(currentTableId);
    if (!table || !table.game) return;
    
    table.game.startNextRound();
    
    for (const p of table.players) {
      io.to(p.id).emit('startGame', {
        hand: table.game.hands[p.seat],
        passDirection: table.game.passDirection,
        phase: table.game.phase,
        currentPlayer: table.game.currentPlayer,
      });
    }
    
    // Start pass timer if in passing phase, otherwise auto-play 2 of clubs
    if (table.game.phase === 'passing') {
      startPassTimer(table);
    } else if (table.game.phase === 'playing') {
      setTimeout(() => autoPlayTwoOfClubs(table), 500);
    }
  });

  socket.on('rematch', ({ vote }) => {
    if (!currentTableId) return;
    
    const table = tables.get(currentTableId);
    if (!table || !table.game) return;
    
    const player = table.getPlayerBySocketId(socket.id);
    if (!player) return;
    
    table.rematchVotes[player.seat] = vote;
    
    io.to(currentTableId).emit('rematchStatus', {
      votes: { ...table.rematchVotes },
    });
    
    // Check if all voted yes
    const votes = Object.values(table.rematchVotes);
    if (votes.length === 4 && votes.every(v => v)) {
      table.game = new HeartsGame();
      table.game.deal();
      table.rematchVotes = {};
      
      for (const p of table.players) {
        io.to(p.id).emit('startGame', {
          hand: table.game.hands[p.seat],
          passDirection: table.game.passDirection,
          phase: table.game.phase,
          currentPlayer: table.game.currentPlayer,
        });
      }
      
      // Start pass timer if in passing phase, otherwise auto-play 2 of clubs
      if (table.game.phase === 'passing') {
        startPassTimer(table);
      } else if (table.game.phase === 'playing') {
        setTimeout(() => autoPlayTwoOfClubs(table), 500);
      }
    }
  });

  socket.on('getLastTrick', () => {
    if (!currentTableId) return;
    
    const table = tables.get(currentTableId);
    if (!table || !table.game) return;
    
    socket.emit('lastTrick', { cards: table.game.lastTrick });
  });

  // -------------------------------------------------------------------------
  // CHAT EVENTS
  // -------------------------------------------------------------------------

  socket.on('chatMessage', ({ text }) => {
    if (!currentTableId) return;
    if (!text || text.trim().length === 0) return;
    if (text.length > 140) return;
    
    // Only allow alphanumerics, common symbols, and Turkish characters
    const sanitized = text.replace(/[^a-zA-Z0-9çÇğĞıİöÖşŞüÜ\s.,!?;:'"()-@#$%&*+=]/g, '').trim();
    if (sanitized.length === 0) return;
    
    const table = tables.get(currentTableId);
    if (!table) return;
    
    const player = table.getPlayerBySocketId(socket.id);
    if (!player) return;
    
    io.to(currentTableId).emit('chat', {
      from: player.name,
      seat: player.seat,
      text: sanitized,
      timestamp: Date.now(),
    });
  });

  socket.on('typing', ({ isTyping }) => {
    if (!currentTableId) return;
    
    const table = tables.get(currentTableId);
    if (!table) return;
    
    const player = table.getPlayerBySocketId(socket.id);
    if (!player) return;
    
    if (isTyping) {
      table.typingPlayers.add(player.name);
    } else {
      table.typingPlayers.delete(player.name);
    }
    
    socket.to(currentTableId).emit('typingUpdate', {
      players: Array.from(table.typingPlayers),
    });
  });

  // -------------------------------------------------------------------------
  // DISCONNECT
  // -------------------------------------------------------------------------

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    
    if (currentTableId) {
      const table = tables.get(currentTableId);
      if (table) {
        const player = table.removePlayer(socket.id);
        
        if (player) {
          socket.to(currentTableId).emit('updatePlayers', {
            players: table.players.map(p => ({ name: p.name, seat: p.seat, connected: p.connected })),
          });
          
          if (table.game && !player.connected) {
            socket.to(currentTableId).emit('playerDisconnected', {
              seat: player.seat,
              name: player.name,
            });
          }
          
          if (table.players.length === 0 || table.players.every(p => !p.connected)) {
            table.cleanupTimer = setTimeout(() => {
              clearTurnTimer(table);
              tables.delete(currentTableId);
              broadcastTablesList();
            }, 60000);
          }
        }
      }
    }
  });
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function broadcastTablesList() {
  const tableList = [];
  for (const [id, table] of tables) {
    if (table.players.length < 4 && !table.game) {
      tableList.push(table.getPublicInfo());
    }
  }
  io.emit('tablesList', tableList);
}

function autoPlayTwoOfClubs(table) {
  if (!table.game || table.game.phase !== 'playing') return;
  if (table.game.tricksPlayed !== 0 || table.game.currentTrick.length !== 0) return;
  
  const currentPlayer = table.game.currentPlayer;
  const twoOfClubs = { suit: 'clubs', rank: '2', display: '2♣' };
  
  // Find and play the 2 of clubs
  const result = table.game.playCard(currentPlayer, twoOfClubs);
  
  if (result.success) {
    const player = table.getPlayerBySeat(currentPlayer);
    if (player) {
      io.to(player.id).emit('autoPlay', { card: twoOfClubs });
    }
    
    io.to(table.id).emit('cardPlayed', {
      seat: currentPlayer,
      card: twoOfClubs,
      currentTrick: table.game.currentTrick,
      trickComplete: false,
      winner: null,
      autoPlayed: true,
    });
    
    // Update game state for all players
    for (const p of table.players) {
      io.to(p.id).emit('updateGame', table.game.getStateForPlayer(p.seat));
    }
    
    // Start timer for next player
    startTurnTimer(table);
  }
}

function startTurnTimer(table) {
  clearTurnTimer(table);
  
  if (!table.game || table.game.phase !== 'playing') return;
  
  const currentPlayer = table.game.currentPlayer;
  const turnStartTime = Date.now();
  const turnDuration = 30000;
  const warningTime = 20000; // Warning at 10 seconds remaining (30 - 10 = 20)
  
  io.to(table.id).emit('turnStart', {
    player: currentPlayer,
    timeoutAt: turnStartTime + turnDuration,
  });
  
  // Warning timer at 10 seconds remaining
  table.turnWarningTimer = setTimeout(() => {
    if (!table.game || table.game.phase !== 'playing') return;
    if (table.game.currentPlayer !== currentPlayer) return;
    
    io.to(table.id).emit('timerWarning', {
      player: currentPlayer,
    });
  }, warningTime);
  
  table.turnTimer = setTimeout(() => {
    if (!table.game || table.game.phase !== 'playing') return;
    if (table.game.currentPlayer !== currentPlayer) return;
    
    // Auto-play lowest legal card
    const legalCards = table.game.getLegalCards(currentPlayer);
    if (legalCards.length === 0) return;
    
    const lowestCard = legalCards.sort((a, b) => 
      RANK_VALUES[a.rank] - RANK_VALUES[b.rank]
    )[0];
    
    const player = table.getPlayerBySeat(currentPlayer);
    if (player) {
      io.to(player.id).emit('autoPlay', { card: lowestCard });
    }
    
    const result = table.game.playCard(currentPlayer, lowestCard);
    
    if (result.success) {
      io.to(table.id).emit('cardPlayed', {
        seat: currentPlayer,
        card: lowestCard,
        currentTrick: result.trickComplete ? table.game.lastTrick : table.game.currentTrick,
        trickComplete: result.trickComplete || false,
        winner: result.trickComplete ? result.winner : null,
        autoPlayed: true,
      });
      
      if (result.trickComplete) {
        // Delay trickEnd to allow animation to play (1.6 seconds)
        setTimeout(() => {
          io.to(table.id).emit('trickEnd', {
            winner: result.winner,
            points: result.points,
            lastTrick: table.game.lastTrick,
          });
          
          if (result.roundComplete) {
            io.to(table.id).emit('roundEnd', {
              roundScores: result.roundScores,
              cumulativeScores: result.cumulativeScores,
              moonShooter: result.moonShooter,
              moonShotType: result.moonShotType,
              gameOver: result.gameOver,
              gameWinner: result.gameWinner,
              pointCardsTaken: table.game.getPointCardsTaken(),
            });
            
            if (result.gameOver) {
              table.rematchVotes = {};
              io.to(table.id).emit('gameEnd', {
                winner: result.gameWinner,
                finalScores: result.cumulativeScores,
              });
            } else {
              // Auto-advance to next round after animation
              // Animation: 700ms delay between players, 300ms per card, 1000ms final delay
              setTimeout(() => {
                if (!table.game || table.game.phase !== 'roundEnd') return;
                
                table.game.startNextRound();
                
                for (const p of table.players) {
                  io.to(p.id).emit('startGame', {
                    hand: table.game.hands[p.seat],
                    passDirection: table.game.passDirection,
                    phase: table.game.phase,
                    currentPlayer: table.game.currentPlayer,
                  });
                }
                
                // Start pass timer if in passing phase, otherwise auto-play 2 of clubs
                if (table.game.phase === 'passing') {
                  startPassTimer(table);
                } else if (table.game.phase === 'playing') {
                  setTimeout(() => autoPlayTwoOfClubs(table), 500);
                }
              }, 8000);
            }
          } else {
            // Delay to allow client animation
            setTimeout(() => {
              for (const p of table.players) {
                io.to(p.id).emit('updateGame', table.game.getStateForPlayer(p.seat));
              }
              startTurnTimer(table);
            }, 2000);
          }
        }, 1500);
      } else {
        for (const p of table.players) {
          io.to(p.id).emit('updateGame', table.game.getStateForPlayer(p.seat));
        }
        startTurnTimer(table);
      }
    }
  }, turnDuration);
}

function clearTurnTimer(table) {
  if (table.turnTimer) {
    clearTimeout(table.turnTimer);
    table.turnTimer = null;
  }
  if (table.turnWarningTimer) {
    clearTimeout(table.turnWarningTimer);
    table.turnWarningTimer = null;
  }
}

function startPassTimer(table) {
  clearPassTimer(table);
  
  const passDuration = 30000; // 30 seconds for pass phase
  const passStartTime = Date.now();
  table.passTimeoutAt = passStartTime + passDuration;
  
  io.to(table.id).emit('passTimerStart', {
    timeoutAt: table.passTimeoutAt,
  });
  
  table.passTimer = setTimeout(() => {
    if (!table.game || table.game.phase !== 'passing') return;
    
    // Auto-submit passes for any player who hasn't submitted
    let exchangeInfo = null;
    
    for (let seat = 0; seat < 4; seat++) {
      if (table.game.passes[seat] === undefined) {
        const hand = table.game.hands[seat];
        const alreadySelected = []; // In future could track partial selections
        const needed = 3 - alreadySelected.length;
        
        // Randomly select cards from remaining hand
        const available = hand.filter(c => !alreadySelected.some(s => cardEquals(s, c)));
        const shuffled = [...available].sort(() => Math.random() - 0.5);
        const autoCards = [...alreadySelected, ...shuffled.slice(0, needed)];
        
        const result = table.game.submitPass(seat, autoCards);
        if (result.exchangeInfo) {
          exchangeInfo = result.exchangeInfo;
        }
        
        const player = table.getPlayerBySeat(seat);
        if (player) {
          io.to(player.id).emit('autoPassSubmitted', { cards: autoCards });
        }
      }
    }
    
    // After auto-passes, executeCardExchange was called by submitPass (phase is now 'playing')
    if (table.game.phase === 'playing') {
      // Send updated hands to all players with pass/receive info for animation
      for (const p of table.players) {
        io.to(p.id).emit('cardsReceived', {
          hand: table.game.hands[p.seat],
          phase: table.game.phase,
          currentPlayer: table.game.currentPlayer,
          cardsPassed: exchangeInfo?.passedCards[p.seat],
          cardsReceived: exchangeInfo?.receivedCards[p.seat],
        });
      }
      
      // Auto-play 2 of clubs after animation completes (2.5 seconds)
      setTimeout(() => autoPlayTwoOfClubs(table), 2500);
    }
  }, passDuration);
}

function clearPassTimer(table) {
  if (table.passTimer) {
    clearTimeout(table.passTimer);
    table.passTimer = null;
    table.passTimeoutAt = null;
  }
}

// ============================================================================
// START SERVER
// ============================================================================

const PORT = process.env.PORT || 3000;

// Periodic cleanup of empty tables (every 60 seconds)
setInterval(() => {
  for (const [tableId, table] of tables) {
    if (table.players.length === 0 || table.players.every(p => !p.connected)) {
      tables.delete(tableId);
      console.log(`Cleaned up empty table: ${tableId}`);
    }
  }
  broadcastTablesList();
}, 60000);

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
