import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

import { HeartsGame } from './games/HeartsGame.js';
import { KingGame, CONTRACT_TYPES, PENALTY_CONTRACTS, CONTRACT_LABELS, TRUMP_LABELS } from './games/KingGame.js';
import { RANK_VALUES, cardEquals } from './shared/cards.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const httpServer = createServer(app);

// CORS: allow all origins (no credentials)
app.use(cors({ origin: '*', credentials: false }));

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: false,
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
// GAME TYPES
// ============================================================================

export const GAME_TYPES = {
  HEARTS: 'hearts',
  KING: 'king'
};

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
  constructor(id, gameType = GAME_TYPES.HEARTS, options = {}) {
    this.id = id;
    this.gameType = gameType;
    this.options = options; // { initialSelectorSeat: number, endingScore: number } for games
    this.endingScore = options.endingScore || (gameType === GAME_TYPES.HEARTS ? 20 : null);
    this.createdAt = Date.now();
    this.players = [];
    this.spectators = []; // { id: socketId, name: string }
    this.game = null;
    this.cleanupTimer = null;
    this.rematchVotes = {};
    this.turnTimer = null;
    this.turnWarningTimer = null;
    this.passTimer = null;
    this.passTimeoutAt = null;
    this.selectTimer = null;
    this.selectTimeoutAt = null;
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

  // Allow a new player to take over a disconnected player's seat mid-game
  takeOverSeat(socketId, name) {
    // Find a disconnected player
    const disconnectedPlayer = this.players.find(p => !p.connected);
    if (!disconnectedPlayer) {
      return { success: false, error: 'No available seats' };
    }
    
    const seat = disconnectedPlayer.seat;
    
    // Update the player's info
    disconnectedPlayer.id = socketId;
    disconnectedPlayer.name = name;
    disconnectedPlayer.connected = true;
    
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    
    return { success: true, seat, takeover: true };
  }

  // Check if there's a disconnected seat available for takeover
  hasDisconnectedSeat() {
    return this.game && this.players.some(p => !p.connected);
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
    
    if (this.gameType === GAME_TYPES.KING) {
      const initialSelector = this.options.initialSelectorSeat ?? 0;
      this.game = new KingGame(initialSelector);
    } else {
      this.game = new HeartsGame(this.endingScore);
    }
    
    this.game.deal();
    this.rematchVotes = {};
    
    return true;
  }

  getPublicInfo() {
    return {
      id: this.id,
      gameType: this.gameType,
      playerCount: this.players.length,
      playerNames: this.players.map(p => p.name),
      inGame: this.game !== null,
      spectatorCount: this.spectators.length,
      endingScore: this.endingScore,
      createdAt: this.createdAt,
    };
  }

  addSpectator(socketId, name) {
    // Check if already a spectator
    if (this.spectators.find(s => s.id === socketId)) {
      return { success: false, error: 'Already spectating' };
    }
    
    this.spectators.push({ id: socketId, name });
    return { success: true };
  }

  removeSpectator(socketId) {
    const index = this.spectators.findIndex(s => s.id === socketId);
    if (index === -1) return null;
    
    const spectator = this.spectators[index];
    this.spectators.splice(index, 1);
    return spectator;
  }

  getSpectatorIds() {
    return this.spectators.map(s => s.id);
  }
}

// ============================================================================
// SOCKET.IO EVENT HANDLERS
// ============================================================================

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  
  let currentTableId = null;
  let isSpectating = false;

  // -------------------------------------------------------------------------
  // LOBBY EVENTS
  // -------------------------------------------------------------------------

  socket.on('listTables', ({ gameType, includeInProgress = false } = {}) => {
    const tableList = [];
    for (const [id, table] of tables) {
      // Show waiting tables (not full, no game)
      const isWaiting = table.players.length < 4 && !table.game;
      // Show in-progress tables if requested (for spectating)
      const isInProgress = table.game !== null && includeInProgress;
      // Show in-progress tables with disconnected seats (for takeover)
      const hasTakeoverSeat = table.hasDisconnectedSeat();
      
      if (isWaiting || isInProgress || hasTakeoverSeat) {
        // Filter by game type if specified
        if (!gameType || table.gameType === gameType) {
          const info = table.getPublicInfo();
          info.hasTakeoverSeat = hasTakeoverSeat;
          tableList.push(info);
        }
      }
    }
    socket.emit('tablesList', tableList);
  });

  socket.on('createTable', ({ playerName, gameType = GAME_TYPES.HEARTS, options = {} }) => {
    if (!playerName || playerName.trim().length === 0) {
      socket.emit('error', { message: 'Player name is required' });
      return;
    }
    
    const tableId = generateTableId();
    const table = new Table(tableId, gameType, options);
    tables.set(tableId, table);
    
    const result = table.addPlayer(socket.id, playerName.trim());
    
    if (result.success) {
      socket.join(tableId);
      currentTableId = tableId;
      
      socket.emit('tableJoined', {
        tableId,
        gameType: table.gameType,
        seat: result.seat,
        players: table.players.map(p => ({ name: p.name, seat: p.seat, connected: p.connected })),
        endingScore: table.endingScore,
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
    
    let result = table.addPlayer(socket.id, playerName.trim());
    
    // If game in progress but there's a disconnected seat, allow takeover
    if (!result.success && table.hasDisconnectedSeat()) {
      result = table.takeOverSeat(socket.id, playerName.trim());
    }
    
    if (result.success) {
      socket.join(tableId);
      currentTableId = tableId;
      
      socket.emit('tableJoined', {
        tableId,
        gameType: table.gameType,
        seat: result.seat,
        players: table.players.map(p => ({ name: p.name, seat: p.seat, connected: p.connected })),
        endingScore: table.endingScore,
      });
      
      socket.to(tableId).emit('updatePlayers', {
        players: table.players.map(p => ({ name: p.name, seat: p.seat, connected: p.connected })),
      });
      
      // If this was a takeover, send current game state to the new player
      if (result.takeover && table.game) {
        sendGameStateToPlayer(table, socket.id, result.seat);
      }
      
      // Start game if 4 players (only for non-takeover joins when game hasn't started)
      if (table.players.length === 4 && !result.takeover) {
        table.startGame();
        
        if (table.gameType === GAME_TYPES.KING) {
          // King: start with contract selection
          const availableContracts = table.game.getAvailableContracts(table.game.selectorSeat);
          for (const player of table.players) {
            io.to(player.id).emit('contractSelectionStart', {
              gameType: GAME_TYPES.KING,
              hand: table.game.hands[player.seat],
              selector: table.game.selectorSeat,
              availableContracts,
              gameNumber: table.game.gameNumber,
              partyNumber: 1,
              contractsUsed: table.game.contractsUsed[player.seat],
            });
          }
          startSelectTimer(table);
        } else {
          // Hearts: start with passing or playing
          for (const player of table.players) {
            io.to(player.id).emit('startGame', {
              gameType: GAME_TYPES.HEARTS,
              hand: table.game.hands[player.seat],
              passDirection: table.game.passDirection,
              phase: table.game.phase,
              currentPlayer: table.game.currentPlayer,
            });
          }
          
          if (table.game.phase === 'passing') {
            startPassTimer(table);
          } else if (table.game.phase === 'playing') {
            setTimeout(() => autoPlayTwoOfClubs(table), 500);
          }
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

  socket.on('spectateTable', ({ tableId, playerName }) => {
    const table = tables.get(tableId);
    
    if (!table) {
      socket.emit('error', { message: 'Table not found' });
      return;
    }
    
    if (!table.game) {
      socket.emit('error', { message: 'No game in progress to spectate' });
      return;
    }
    
    const result = table.addSpectator(socket.id, playerName?.trim() || 'Spectator');
    
    if (!result.success) {
      socket.emit('error', { message: result.error });
      return;
    }
    
    socket.join(tableId);
    currentTableId = tableId;
    isSpectating = true;
    
    // Build spectator game state - they see all cards face up
    const spectatorState = buildSpectatorState(table);
    
    socket.emit('spectateJoined', {
      tableId,
      gameType: table.gameType,
      players: table.players.map(p => ({ name: p.name, seat: p.seat, connected: p.connected })),
      gameState: spectatorState,
    });
    
    // Notify players that a spectator joined
    socket.to(tableId).emit('spectatorUpdate', {
      spectatorCount: table.spectators.length,
    });
  });

  socket.on('leaveSpectate', () => {
    if (!currentTableId || !isSpectating) return;
    
    const table = tables.get(currentTableId);
    if (table) {
      table.removeSpectator(socket.id);
      socket.leave(currentTableId);
      
      // Notify players
      socket.to(currentTableId).emit('spectatorUpdate', {
        spectatorCount: table.spectators.length,
      });
    }
    
    currentTableId = null;
    isSpectating = false;
  });

  // -------------------------------------------------------------------------
  // HEARTS-SPECIFIC EVENTS
  // -------------------------------------------------------------------------

  socket.on('submitPass', ({ cards }) => {
    if (!currentTableId) return;
    
    const table = tables.get(currentTableId);
    if (!table || !table.game || table.gameType !== GAME_TYPES.HEARTS) return;
    
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
      
      for (const p of table.players) {
        io.to(p.id).emit('cardsReceived', {
          hand: table.game.hands[p.seat],
          phase: table.game.phase,
          currentPlayer: table.game.currentPlayer,
          cardsPassed: result.exchangeInfo.passedCards[p.seat],
          cardsReceived: result.exchangeInfo.receivedCards[p.seat],
        });
      }
      
      setTimeout(() => autoPlayTwoOfClubs(table), 2500);
    }
  });

  // -------------------------------------------------------------------------
  // KING-SPECIFIC EVENTS
  // -------------------------------------------------------------------------

  socket.on('selectContract', ({ contractType, contractName, trumpSuit }) => {
    if (!currentTableId) return;
    
    const table = tables.get(currentTableId);
    if (!table || !table.game || table.gameType !== GAME_TYPES.KING) return;
    
    const player = table.getPlayerBySocketId(socket.id);
    if (!player) return;
    
    clearSelectTimer(table);
    
    const result = table.game.selectContract(player.seat, contractType, contractName, trumpSuit);
    
    if (!result.success) {
      socket.emit('error', { message: result.error });
      startSelectTimer(table);
      return;
    }
    
    // Broadcast contract selection to all players
    io.to(currentTableId).emit('contractSelected', {
      selectorSeat: player.seat,
      contract: result.contract,
      startingPlayer: result.startingPlayer,
    });
    
    // Update game state for all players
    for (const p of table.players) {
      io.to(p.id).emit('updateGame', table.game.getStateForPlayer(p.seat));
    }
    
    // Start turn timer
    startTurnTimer(table);
  });

  // -------------------------------------------------------------------------
  // COMMON GAME EVENTS
  // -------------------------------------------------------------------------

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
    
    // Broadcast card played
    io.to(currentTableId).emit('cardPlayed', {
      seat: player.seat,
      card,
      currentTrick: result.trickComplete ? table.game.lastTrick : table.game.currentTrick,
      trickComplete: result.trickComplete || false,
      winner: result.trickComplete ? result.winner : null,
    });
    
    // Update spectators with all hands visible
    updateSpectators(table);
    
    if (result.trickComplete) {
      setTimeout(() => {
        io.to(currentTableId).emit('trickEnd', {
          winner: result.winner,
          points: result.points || 0,
          lastTrick: table.game.lastTrick,
        });
        
        // Handle game/round completion
        if (table.gameType === GAME_TYPES.KING && result.gameComplete) {
          handleKingGameEnd(table, result);
        } else if (table.gameType === GAME_TYPES.HEARTS && result.roundComplete) {
          handleHeartsRoundEnd(table, result);
        } else {
          // Continue playing
          setTimeout(() => {
            for (const p of table.players) {
              io.to(p.id).emit('updateGame', table.game.getStateForPlayer(p.seat));
            }
            startTurnTimer(table);
          }, 2000);
        }
      }, 500);
    } else {
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
    
    if (table.gameType === GAME_TYPES.KING) {
      table.game.startNextGame();
      
      const availableContracts = table.game.getAvailableContracts(table.game.selectorSeat);
      for (const p of table.players) {
        io.to(p.id).emit('contractSelectionStart', {
          gameType: GAME_TYPES.KING,
          hand: table.game.hands[p.seat],
          selector: table.game.selectorSeat,
          availableContracts,
          gameNumber: table.game.gameNumber,
          partyNumber: 1,
          contractsUsed: table.game.contractsUsed[p.seat],
        });
      }
      startSelectTimer(table);
    } else {
      table.game.startNextRound();
      
      for (const p of table.players) {
        io.to(p.id).emit('startGame', {
          gameType: GAME_TYPES.HEARTS,
          hand: table.game.hands[p.seat],
          passDirection: table.game.passDirection,
          phase: table.game.phase,
          currentPlayer: table.game.currentPlayer,
        });
      }
      
      if (table.game.phase === 'passing') {
        startPassTimer(table);
      } else if (table.game.phase === 'playing') {
        setTimeout(() => autoPlayTwoOfClubs(table), 500);
      }
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
    
    const votes = Object.values(table.rematchVotes);
    if (votes.length === 4 && votes.every(v => v)) {
      // Reset game
      if (table.gameType === GAME_TYPES.KING) {
        table.game = new KingGame();
      } else {
        table.game = new HeartsGame(table.endingScore);
      }
      table.game.deal();
      table.rematchVotes = {};
      
      if (table.gameType === GAME_TYPES.KING) {
        const availableContracts = table.game.getAvailableContracts(table.game.selectorSeat);
        for (const p of table.players) {
          io.to(p.id).emit('contractSelectionStart', {
            gameType: GAME_TYPES.KING,
            hand: table.game.hands[p.seat],
            selector: table.game.selectorSeat,
            availableContracts,
            gameNumber: table.game.gameNumber,
            partyNumber: 1,
            contractsUsed: table.game.contractsUsed[p.seat],
          });
        }
        startSelectTimer(table);
      } else {
        for (const p of table.players) {
          io.to(p.id).emit('startGame', {
            gameType: GAME_TYPES.HEARTS,
            hand: table.game.hands[p.seat],
            passDirection: table.game.passDirection,
            phase: table.game.phase,
            currentPlayer: table.game.currentPlayer,
          });
        }
        
        if (table.game.phase === 'passing') {
          startPassTimer(table);
        } else if (table.game.phase === 'playing') {
          setTimeout(() => autoPlayTwoOfClubs(table), 500);
        }
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
        // Handle spectator disconnect
        if (isSpectating) {
          table.removeSpectator(socket.id);
          socket.to(currentTableId).emit('spectatorUpdate', {
            spectatorCount: table.spectators.length,
          });
          return;
        }
        
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
              clearPassTimer(table);
              clearSelectTimer(table);
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

function buildSpectatorState(table) {
  const game = table.game;
  if (!game) return null;
  
  const state = {
    gameType: table.gameType,
    phase: game.phase,
    currentPlayer: game.currentPlayer,
    currentTrick: game.currentTrick || [],
    trickNumber: game.trickNumber,
    scores: game.scores,
    // Spectators only see played cards, not hands
  };
  
  if (table.gameType === GAME_TYPES.HEARTS) {
    state.passDirection = game.passDirection;
    state.heartsBroken = game.heartsBroken;
    state.roundNumber = game.roundNumber;
    state.cumulativeScores = game.cumulativeScores;
    state.roundScores = game.roundScores;
    state.pointCardsTaken = game.getPointCardsTaken ? game.getPointCardsTaken() : null;
  } else if (table.gameType === GAME_TYPES.KING) {
    state.currentContract = game.contract;
    state.selectorSeat = game.selectorSeat;
    state.trumpSuit = game.contract?.trumpSuit;
    state.gameNumber = game.gameNumber;
    state.partyScores = game.partyScores;
    state.lastTrickCards = game.lastTrick;
    state.tricksTaken = game.tricksTaken?.map(t => t.length);
    state.contractHistory = game.contractHistory;
    state.cumulativeScores = game.cumulativeScores;
    state.pointCardsTaken = game.getPenaltyCardsTaken ? game.getPenaltyCardsTaken() : null;
  }
  
  return state;
}

function updateSpectators(table) {
  if (!table.spectators.length) return;
  
  const spectatorState = buildSpectatorState(table);
  for (const spectator of table.spectators) {
    io.to(spectator.id).emit('spectatorUpdate', {
      gameState: spectatorState,
    });
  }
}

function broadcastTablesList() {
  // Broadcast all tables (waiting and in-progress) so clients can decide what to show
  const tableList = [];
  for (const [id, table] of tables) {
    tableList.push(table.getPublicInfo());
  }
  // Sort by createdAt descending (newest first)
  tableList.sort((a, b) => b.createdAt - a.createdAt);
  io.emit('tablesList', tableList);
}

function handleHeartsRoundEnd(table, result) {
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
    setTimeout(() => {
      if (!table.game || table.game.phase !== 'roundEnd') return;
      
      table.game.startNextRound();
      
      for (const p of table.players) {
        io.to(p.id).emit('startGame', {
          gameType: GAME_TYPES.HEARTS,
          hand: table.game.hands[p.seat],
          passDirection: table.game.passDirection,
          phase: table.game.phase,
          currentPlayer: table.game.currentPlayer,
        });
      }
      
      if (table.game.phase === 'passing') {
        startPassTimer(table);
      } else if (table.game.phase === 'playing') {
        setTimeout(() => autoPlayTwoOfClubs(table), 500);
      }
    }, 8000);
  }
}

function handleKingGameEnd(table, result) {
  io.to(table.id).emit('kingGameEnd', {
    gameScores: result.gameScores,
    cumulativeScores: result.cumulativeScores,
    partyOver: result.partyOver,
    winners: result.winners,
    penaltyCardsTaken: table.game.getPenaltyCardsTaken(),
    contract: table.game.contract,
    gameNumber: table.game.gameNumber,
  });
  
  if (result.partyOver) {
    table.rematchVotes = {};
    io.to(table.id).emit('gameEnd', {
      gameType: GAME_TYPES.KING,
      winners: result.winners,
      finalScores: result.cumulativeScores,
    });
  } else {
    // Auto-advance to next game after delay
    setTimeout(() => {
      if (!table.game || table.game.phase !== 'gameEnd') return;
      
      table.game.startNextGame();
      
      const availableContracts = table.game.getAvailableContracts(table.game.selectorSeat);
      for (const p of table.players) {
        io.to(p.id).emit('contractSelectionStart', {
          gameType: GAME_TYPES.KING,
          hand: table.game.hands[p.seat],
          selector: table.game.selectorSeat,
          availableContracts,
          gameNumber: table.game.gameNumber,
          partyNumber: 1,
          contractsUsed: table.game.contractsUsed[p.seat],
        });
      }
      startSelectTimer(table);
    }, 5000);
  }
}

function autoPlayTwoOfClubs(table) {
  if (!table.game || table.game.phase !== 'playing') return;
  if (table.game.tricksPlayed !== 0 || table.game.currentTrick.length !== 0) return;
  
  const currentPlayer = table.game.currentPlayer;
  const twoOfClubs = { suit: 'clubs', rank: '2', display: '2♣' };
  
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
    
    for (const p of table.players) {
      io.to(p.id).emit('updateGame', table.game.getStateForPlayer(p.seat));
    }
    
    startTurnTimer(table);
  }
}

// Send current game state to a player who is taking over a disconnected seat
function sendGameStateToPlayer(table, socketId, seat) {
  if (!table.game) return;
  
  if (table.gameType === GAME_TYPES.KING) {
    if (table.game.phase === 'selecting') {
      // Contract selection phase
      const availableContracts = table.game.getAvailableContracts(table.game.selectorSeat);
      io.to(socketId).emit('contractSelectionStart', {
        gameType: GAME_TYPES.KING,
        hand: table.game.hands[seat],
        selector: table.game.selectorSeat,
        availableContracts,
        gameNumber: table.game.gameNumber,
        partyNumber: table.game.partyNumber || 1,
        contractsUsed: table.game.contractsUsed[seat],
        timeoutAt: table.selectTimeoutAt,
      });
    } else if (table.game.phase === 'playing') {
      // Playing phase - send full game state
      io.to(socketId).emit('contractSelected', {
        gameType: GAME_TYPES.KING,
        hand: table.game.hands[seat],
        contract: table.game.currentContract.name,
        selector: table.game.selectorSeat,
        trumpSuit: table.game.trumpSuit,
        currentPlayer: table.game.currentPlayer,
        gameNumber: table.game.gameNumber,
        partyNumber: table.game.partyNumber || 1,
        contractsUsed: table.game.contractsUsed[seat],
      });
      // Send current trick/scores state
      io.to(socketId).emit('updateGame', table.game.getStateForPlayer(seat));
      // Send timer if active
      if (table.turnTimeoutAt) {
        io.to(socketId).emit('turnTimerStart', {
          timeoutAt: table.turnTimeoutAt,
          currentPlayer: table.game.currentPlayer,
        });
      }
    }
  } else {
    // Hearts game
    if (table.game.phase === 'passing') {
      io.to(socketId).emit('startGame', {
        gameType: GAME_TYPES.HEARTS,
        hand: table.game.hands[seat],
        passDirection: table.game.passDirection,
        phase: table.game.phase,
        currentPlayer: table.game.currentPlayer,
      });
      if (table.passTimeoutAt) {
        io.to(socketId).emit('passTimerStart', {
          timeoutAt: table.passTimeoutAt,
        });
      }
    } else if (table.game.phase === 'playing') {
      io.to(socketId).emit('startGame', {
        gameType: GAME_TYPES.HEARTS,
        hand: table.game.hands[seat],
        passDirection: table.game.passDirection,
        phase: table.game.phase,
        currentPlayer: table.game.currentPlayer,
      });
      io.to(socketId).emit('updateGame', table.game.getStateForPlayer(seat));
      if (table.turnTimeoutAt) {
        io.to(socketId).emit('turnTimerStart', {
          timeoutAt: table.turnTimeoutAt,
          currentPlayer: table.game.currentPlayer,
        });
      }
    }
  }
}

function startTurnTimer(table) {
  clearTurnTimer(table);
  
  if (!table.game || table.game.phase !== 'playing') return;
  
  const currentPlayer = table.game.currentPlayer;
  const turnStartTime = Date.now();
  const turnDuration = 30000;
  const warningTime = 20000;
  
  io.to(table.id).emit('turnStart', {
    player: currentPlayer,
    timeoutAt: turnStartTime + turnDuration,
  });
  
  table.turnWarningTimer = setTimeout(() => {
    if (!table.game || table.game.phase !== 'playing') return;
    if (table.game.currentPlayer !== currentPlayer) return;
    
    io.to(table.id).emit('timerWarning', { player: currentPlayer });
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
        setTimeout(() => {
          io.to(table.id).emit('trickEnd', {
            winner: result.winner,
            points: result.points || 0,
            lastTrick: table.game.lastTrick,
          });
          
          if (table.gameType === GAME_TYPES.KING && result.gameComplete) {
            handleKingGameEnd(table, result);
          } else if (table.gameType === GAME_TYPES.HEARTS && result.roundComplete) {
            handleHeartsRoundEnd(table, result);
          } else {
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
  
  const passDuration = 30000;
  const passStartTime = Date.now();
  table.passTimeoutAt = passStartTime + passDuration;
  
  io.to(table.id).emit('passTimerStart', {
    timeoutAt: table.passTimeoutAt,
  });
  
  table.passTimer = setTimeout(() => {
    if (!table.game || table.game.phase !== 'passing') return;
    
    let exchangeInfo = null;
    
    for (let seat = 0; seat < 4; seat++) {
      if (table.game.passes[seat] === undefined) {
        const hand = table.game.hands[seat];
        const shuffled = [...hand].sort(() => Math.random() - 0.5);
        const autoCards = shuffled.slice(0, 3);
        
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
    
    if (table.game.phase === 'playing') {
      for (const p of table.players) {
        io.to(p.id).emit('cardsReceived', {
          hand: table.game.hands[p.seat],
          phase: table.game.phase,
          currentPlayer: table.game.currentPlayer,
          cardsPassed: exchangeInfo?.passedCards[p.seat],
          cardsReceived: exchangeInfo?.receivedCards[p.seat],
        });
      }
      
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

function startSelectTimer(table) {
  clearSelectTimer(table);
  
  if (!table.game || table.game.phase !== 'selecting') return;
  
  const selectDuration = 45000;  // 45 seconds for contract selection
  const selectStartTime = Date.now();
  table.selectTimeoutAt = selectStartTime + selectDuration;
  
  io.to(table.id).emit('selectTimerStart', {
    timeoutAt: table.selectTimeoutAt,
    selectorSeat: table.game.selectorSeat,
  });
  
  table.selectTimer = setTimeout(() => {
    if (!table.game || table.game.phase !== 'selecting') return;
    
    const selectorSeat = table.game.selectorSeat;
    const usage = table.game.contractsUsed[selectorSeat];
    
    // Auto-select: prefer penalty if available, otherwise trump
    let contractType, contractName, trumpSuit;
    
    if (usage.penalties < 3) {
      contractType = CONTRACT_TYPES.PENALTY;
      // Pick a random available penalty
      const penalties = Object.values(PENALTY_CONTRACTS);
      contractName = penalties[Math.floor(Math.random() * penalties.length)];
    } else {
      contractType = CONTRACT_TYPES.TRUMP;
      const suits = ['spades', 'hearts', 'diamonds', 'clubs'];
      trumpSuit = suits[Math.floor(Math.random() * suits.length)];
    }
    
    const result = table.game.selectContract(selectorSeat, contractType, contractName, trumpSuit);
    
    if (result.success) {
      io.to(table.id).emit('contractSelected', {
        selectorSeat,
        contract: result.contract,
        startingPlayer: result.startingPlayer,
        autoSelected: true,
      });
      
      for (const p of table.players) {
        io.to(p.id).emit('updateGame', table.game.getStateForPlayer(p.seat));
      }
      
      startTurnTimer(table);
    }
  }, selectDuration);
}

function clearSelectTimer(table) {
  if (table.selectTimer) {
    clearTimeout(table.selectTimer);
    table.selectTimer = null;
    table.selectTimeoutAt = null;
  }
}

// ============================================================================
// START SERVER
// ============================================================================

const PORT = process.env.PORT || 3000;

setInterval(() => {
  for (const [tableId, table] of tables) {
    if (table.players.length === 0 || table.players.every(p => !p.connected)) {
      clearTurnTimer(table);
      clearPassTimer(table);
      clearSelectTimer(table);
      tables.delete(tableId);
      console.log(`Cleaned up empty table: ${tableId}`);
    }
  }
  broadcastTablesList();
}, 60000);

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Export for test-bots
export { tables };
