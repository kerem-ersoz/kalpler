/**
 * Automated test bots for Hearts game
 * Creates 3 bot players that join a table - you join as the 4th player to watch
 * 
 * Usage:
 *   npm run test:bots              - 3 bots, you join as 4th player
 *   npm run test:bots -- --auto    - 4 bots, fully automated
 *   npm run test:bots -- --fast    - Faster bot play speed
 * 
 * Run with: npm run test:bots
 */

import { io } from 'socket.io-client';

const SERVER_URL = 'http://localhost:3000';
const BOT_NAMES = ['Bot-Ahmet', 'Bot-Mehmet', 'Bot-Ayşe', 'Bot-Fatma'];

// Parse command line args
const args = process.argv.slice(2);
const AUTO_MODE = args.includes('--auto');
const FAST_MODE = args.includes('--fast');
const BOT_DELAY = FAST_MODE ? 200 : 800; // ms between actions
const NUM_BOTS = AUTO_MODE ? 4 : 3; // Leave one slot for human player

// Store bot state
const bots = [];
let tableId = null;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cardEquals(a, b) {
  return a.suit === b.suit && a.rank === b.rank;
}

class Bot {
  constructor(name, index) {
    this.name = name;
    this.index = index;
    this.socket = null;
    this.seat = null;
    this.tableId = null;
    this.hand = [];
    this.phase = 'waiting';
    this.isMyTurn = false;
    this.legalCards = [];
    this.passDirection = null;
    this.passSubmitted = false;
    this.selectedPassCards = [];
    this.isPlaying = false; // Prevent double plays
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.socket = io(SERVER_URL, {
        reconnection: false,
      });
      
      this.socket.on('connect', () => {
        resolve();
      });

      this.socket.on('connect_error', (err) => {
        console.error(`[${this.name}] Connection error:`, err.message);
        reject(err);
      });

      this.socket.on('disconnect', () => {
        console.log(`[${this.name}] Disconnected`);
      });

      this.socket.on('tableJoined', (data) => {
        this.tableId = data.tableId;
        this.seat = data.seat;
      });

      this.socket.on('startGame', async (data) => {
        if (this.index === 0) {
          console.log(`\n🎴 Game started! Phase: ${data.phase}, Pass direction: ${data.passDirection}`);
        }
        this.hand = data.hand;
        this.phase = data.phase;
        this.passDirection = data.passDirection;
        this.passSubmitted = false;
        this.selectedPassCards = [];
        
        if (this.phase === 'passing') {
          await this.handlePassing();
        }
      });

      this.socket.on('updateGame', async (data) => {
        if (data.hand) this.hand = data.hand;
        if (data.phase) this.phase = data.phase;
        if (data.legalCards) this.legalCards = data.legalCards;
        if (data.currentPlayer !== undefined) {
          const wasMyTurn = this.isMyTurn;
          this.isMyTurn = data.currentPlayer === this.seat;
          if (this.isMyTurn && !wasMyTurn && this.phase === 'playing' && this.legalCards.length > 0) {
            await this.playTurn();
          }
        }
      });

      this.socket.on('cardsReceived', async (data) => {
        this.hand = data.hand;
        this.phase = data.phase;
        this.passSubmitted = false;
        this.selectedPassCards = [];
        
        // Check if it's our turn to play
        if (data.currentPlayer === this.seat) {
          this.isMyTurn = true;
        }
      });

      this.socket.on('passSubmitted', () => {
        this.passSubmitted = true;
      });

      this.socket.on('cardPlayed', (data) => {
        if (data.seat === this.seat) {
          // Remove played card from hand
          this.hand = this.hand.filter(c => !cardEquals(c, data.card));
        }
      });

      this.socket.on('turnStart', async (data) => {
        if (data.player === this.seat && !this.isMyTurn) {
          this.isMyTurn = true;
          await this.playTurn();
        }
      });

      this.socket.on('trickEnd', (data) => {
        const winnerBot = bots.find(b => b.seat === data.winner);
        if (this.index === 0) { // Only log from first bot
          console.log(`Trick won by ${winnerBot?.name || 'unknown'} (${data.points} points)`);
        }
      });

      this.socket.on('roundEnd', (data) => {
        if (this.index === 0) { // Only log from first bot
          console.log(`\n📊 Round ended. Scores: ${data.cumulativeScores.join(', ')}`);
          if (data.moonShooter !== null) {
            const shooterBot = bots.find(b => b.seat === data.moonShooter);
            console.log(`🌙 ${shooterBot?.name || 'unknown'} shot the moon!`);
          }
        }
      });

      this.socket.on('gameEnd', (data) => {
        if (this.index === 0) { // Only log from first bot
          const winnerBot = bots.find(b => b.seat === data.winner);
          console.log(`\n🏆 GAME OVER! Winner: ${winnerBot?.name || 'unknown'}`);
          console.log(`Final scores: ${data.finalScores.join(', ')}`);
        }
      });

      this.socket.on('chatMessage', (msg) => {
        if (msg.isSystem && this.index === 0) {
          console.log(`[SYSTEM] ${msg.text}`);
        }
      });

      this.socket.on('error', (err) => {
        // Silently ignore "Not your turn" errors
        if (!err.message.includes('Not your turn') && !err.message.includes('Illegal card')) {
          console.error(`[${this.name}] Error:`, err.message);
        }
      });
    });
  }

  joinTable(tableId) {
    this.socket.emit('joinTable', { tableId, playerName: this.name });
  }

  createTable() {
    return new Promise((resolve) => {
      this.socket.once('tableJoined', (data) => {
        this.tableId = data.tableId;
        this.seat = data.seat;
        resolve(data.tableId);
      });
      this.socket.emit('createTable', { playerName: this.name, options: { endingScore: AUTO_MODE ? 50 : 20 } });
    });
  }

  async handlePassing() {
    if (this.passDirection === 'hold') {
      return;
    }

    await delay(BOT_DELAY);
    
    // Simple strategy: pass highest cards (prioritize dangerous cards)
    const sortedHand = [...this.hand].sort((a, b) => {
      // Prioritize Q♠
      if (a.suit === 'spades' && a.rank === 'Q') return -1;
      if (b.suit === 'spades' && b.rank === 'Q') return 1;
      // Then high hearts
      if (a.suit === 'hearts' && b.suit !== 'hearts') return -1;
      if (b.suit === 'hearts' && a.suit !== 'hearts') return 1;
      // Then by rank
      const rankOrder = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
      return rankOrder.indexOf(a.rank) - rankOrder.indexOf(b.rank);
    });

    this.selectedPassCards = sortedHand.slice(0, 3);
    
    console.log(`[${this.name}] Passing: ${this.selectedPassCards.map(c => c.display).join(', ')}`);
    this.socket.emit('submitPass', { cards: this.selectedPassCards });
  }

  async playTurn() {
    if (!this.isMyTurn || this.legalCards.length === 0 || this.isPlaying) {
      return;
    }

    this.isPlaying = true;
    await delay(BOT_DELAY);
    
    if (this.legalCards.length === 0) {
      this.isPlaying = false;
      return;
    }

    const cardToPlay = this.selectCard();
    
    if (!cardToPlay) {
      this.isPlaying = false;
      return;
    }

    console.log(`[${this.name}] plays ${cardToPlay.display}`);
    this.socket.emit('playCard', { card: cardToPlay });
    this.isMyTurn = false;
    this.isPlaying = false;
  }

  selectCard() {
    // Filter legal cards to only those in hand
    const playable = this.legalCards.filter(lc => 
      this.hand.some(hc => cardEquals(hc, lc))
    );

    if (playable.length === 0) {
      // Fallback to any card in hand
      return this.hand[0];
    }

    // Avoid Q♠ if possible
    const withoutQueenSpades = playable.filter(c => 
      !(c.suit === 'spades' && c.rank === 'Q')
    );
    
    const candidates = withoutQueenSpades.length > 0 ? withoutQueenSpades : playable;

    // Avoid hearts if possible
    const withoutHearts = candidates.filter(c => c.suit !== 'hearts');
    const finalCandidates = withoutHearts.length > 0 ? withoutHearts : candidates;

    // Play lowest card
    const rankOrder = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    finalCandidates.sort((a, b) => rankOrder.indexOf(a.rank) - rankOrder.indexOf(b.rank));
    
    return finalCandidates[0];
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}

async function main() {
  console.log('🤖 Starting Hearts Test Bots...\n');
  console.log(`Mode: ${AUTO_MODE ? 'Fully automated (4 bots)' : 'Watch mode (3 bots + you)'}`);
  console.log(`Speed: ${FAST_MODE ? 'Fast' : 'Normal'}\n`);

  // Create bots
  for (let i = 0; i < NUM_BOTS; i++) {
    bots.push(new Bot(BOT_NAMES[i], i));
  }

  // Connect all bots
  try {
    await Promise.all(bots.map(bot => bot.connect()));
    console.log('✅ All bots connected');
  } catch (err) {
    console.error('Failed to connect bots:', err);
    process.exit(1);
  }

  // First bot creates a table (and automatically joins)
  await delay(500);
  tableId = await bots[0].createTable();
  console.log(`📋 Table created: ${tableId}`);

  // Other bots join the same table
  for (let i = 1; i < NUM_BOTS; i++) {
    await delay(200);
    bots[i].joinTable(tableId);
  }
  
  await delay(500);
  
  if (AUTO_MODE) {
    console.log(`👥 Players: ${BOT_NAMES.slice(0, NUM_BOTS).join(', ')}\n`);
  } else {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`👉 Open http://localhost:5173 in your browser`);
    console.log(`👉 Join table: "${tableId}"`);
    console.log(`👉 The game will start when you join!`);
    console.log(`${'='.repeat(50)}\n`);
  }

  // Keep the process running
  process.on('SIGINT', () => {
    console.log('\n\n👋 Shutting down bots...');
    bots.forEach(bot => bot.disconnect());
    process.exit(0);
  });
}

main().catch(console.error);
