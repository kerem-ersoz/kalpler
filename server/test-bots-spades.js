/**
 * Automated test bots for Spades game
 * Creates 3 bot players that join a table - you join as the 4th player to watch
 * 
 * Usage:
 *   npm run test:bots:spades              - 3 bots, you join as 4th player
 *   npm run test:bots:spades -- --auto    - 4 bots, fully automated
 *   npm run test:bots:spades -- --fast    - Faster bot play speed
 * 
 * Run with: npm run test:bots:spades
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

// Card values for evaluating hand strength
const RANK_VALUES = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, 
  '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
};

// Store bot state
const bots = [];
let tableId = null;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cardEquals(a, b) {
  return a.suit === b.suit && a.rank === b.rank;
}

class SpadesBot {
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
    this.isPlaying = false; // Prevent double plays
    this.isBidding = false; // Prevent double bids
    this.bids = [null, null, null, null];
    this.teamScores = [0, 0];
    this.bags = [0, 0];
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
        if (this.index === 0) {
          console.log(`Table created: ${data.tableId} (Spades game)`);
        }
      });

      this.socket.on('biddingStart', async (data) => {
        this.hand = data.hand;
        this.phase = 'bidding';
        this.bids = [null, null, null, null];
        
        if (this.index === 0) {
          console.log(`\n🃏 Round ${data.roundNumber} - Bidding phase`);
        }
        
        if (data.currentBidder === this.seat && !this.isBidding) {
          await this.makeBid();
        }
      });

      this.socket.on('bidSubmitted', async (data) => {
        this.bids = data.bids;
        this.isBidding = false;
        
        if (this.index === 0) {
          const bidderBot = bots.find(b => b.seat === data.seat);
          const bidLabel = data.bid === 'nil' ? 'Nil' : data.bid === 'blind_nil' ? 'Blind Nil' : data.bid;
          console.log(`${bidderBot?.name || 'Player'} bids: ${bidLabel}`);
        }
        
        // Check if it's now our turn to bid
        if (data.nextBidder === this.seat && !this.isBidding) {
          await this.makeBid();
        }
      });

      this.socket.on('spadesGameStart', async (data) => {
        this.phase = 'playing';
        this.legalCards = data.legalCards || [];
        this.bids = data.bids;
        
        if (this.index === 0) {
          console.log(`\n♠ Playing begins! Team bids: ${data.teamBids.join(' vs ')}`);
        }
      });

      this.socket.on('startGame', async (data) => {
        this.hand = data.hand;
        this.phase = data.phase;
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

      this.socket.on('cardPlayed', (data) => {
        if (data.seat === this.seat) {
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
        if (this.index === 0) {
          console.log(`Trick won by ${winnerBot?.name || 'unknown'}`);
        }
      });

      this.socket.on('spadesRoundEnd', (data) => {
        this.isBidding = false;
        this.teamScores = data.teamScores;
        this.bags = data.bags;
        
        if (this.index === 0) {
          console.log(`\n📊 Round ${data.roundNumber} ended`);
          console.log(`Round scores: ${data.roundScores.join(', ')}`);
          console.log(`Team scores: ${data.teamScores[0]} vs ${data.teamScores[1]}`);
          console.log(`Bags: ${data.bags[0]} vs ${data.bags[1]}`);
          
          if (data.gameOver) {
            console.log(`\n🏆 GAME OVER!`);
            if (data.winners) {
              const winningTeam = data.winners[0] % 2;
              console.log(`Winning team: ${winningTeam === 0 ? 'Team 0+2' : 'Team 1+3'}`);
            }
          }
        }
      });

      this.socket.on('gameEnd', (data) => {
        if (this.index === 0) {
          console.log(`\n🏆 GAME OVER!`);
          console.log(`Final scores: ${data.finalScores.join(', ')}`);
        }
      });

      this.socket.on('error', (err) => {
        if (!err.message.includes('Not your turn') && !err.message.includes('Illegal card') && !err.message.includes('Not your bid')) {
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
      // Create a Spades game table
      this.socket.emit('createTable', { playerName: this.name, gameType: 'spades', options: { endingScore: 300 } });
    });
  }

  async makeBid() {
    if (this.isBidding) return;
    this.isBidding = true;
    
    await delay(BOT_DELAY);
    
    // Simple bidding strategy based on hand strength
    // Count spades and high cards
    let spadesCount = 0;
    let highCards = 0; // A, K, Q
    let veryHighCards = 0; // A, K
    
    for (const card of this.hand) {
      if (card.suit === 'spades') {
        spadesCount++;
        if (RANK_VALUES[card.rank] >= 12) highCards++; // Q, K, A
        if (RANK_VALUES[card.rank] >= 13) veryHighCards++; // K, A
      } else {
        if (RANK_VALUES[card.rank] === 14) highCards++; // Aces in other suits
      }
    }
    
    // Estimate tricks
    // Spades usually win tricks, plus high cards in other suits
    let estimatedTricks = Math.floor(spadesCount * 0.7) + Math.floor(highCards * 0.5);
    
    // Clamp between 1 and 13
    let bid = Math.max(1, Math.min(13, estimatedTricks));
    
    // Occasionally bid nil if we have very weak hand (no high cards)
    if (highCards === 0 && spadesCount <= 2 && Math.random() < 0.3) {
      bid = 'nil';
    }
    
    if (this.index === 0) {
      console.log(`[${this.name}] Making bid: ${bid} (spades: ${spadesCount}, high cards: ${highCards})`);
    }
    
    this.socket.emit('submitBid', { bid });
  }

  async playTurn() {
    if (!this.isMyTurn || this.phase !== 'playing' || this.isPlaying) return;
    if (this.legalCards.length === 0) return;
    
    this.isPlaying = true;
    
    await delay(BOT_DELAY);
    
    // Simple Spades strategy:
    // 1. If leading, play highest non-spade or lowest spade
    // 2. If following, try to win if we can beat what's played
    // 3. If can't follow suit, play lowest spade or lowest card
    
    let cardToPlay = this.legalCards[0];
    
    // Sort legal cards by value
    const sortedCards = [...this.legalCards].sort((a, b) => {
      // Spades are higher than non-spades
      if (a.suit === 'spades' && b.suit !== 'spades') return 1;
      if (b.suit === 'spades' && a.suit !== 'spades') return -1;
      return RANK_VALUES[a.rank] - RANK_VALUES[b.rank];
    });
    
    // Check if we have spades in our legal cards
    const hasSpades = this.legalCards.some(c => c.suit === 'spades');
    const allSpades = this.legalCards.every(c => c.suit === 'spades');
    
    if (allSpades) {
      // Must play spade, play lowest
      cardToPlay = sortedCards[0];
    } else if (!hasSpades) {
      // Play highest non-spade
      cardToPlay = sortedCards[sortedCards.length - 1];
    } else {
      // Mixed - prefer non-spades unless it's beneficial
      const nonSpades = sortedCards.filter(c => c.suit !== 'spades');
      if (nonSpades.length > 0) {
        // Play highest non-spade
        cardToPlay = nonSpades[nonSpades.length - 1];
      } else {
        // Play lowest spade
        cardToPlay = sortedCards[0];
      }
    }
    
    if (this.index === 0) {
      console.log(`[${this.name}] Playing: ${cardToPlay.rank}${cardToPlay.suit[0].toUpperCase()}`);
    }
    
    this.socket.emit('playCard', { card: cardToPlay });
    this.isPlaying = false;
    this.isMyTurn = false;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}

async function main() {
  console.log('🎴 Starting Spades Test Bots');
  console.log(`Mode: ${AUTO_MODE ? 'Auto (4 bots)' : '3 bots + human'}`);
  console.log(`Speed: ${FAST_MODE ? 'Fast' : 'Normal'}\n`);
  
  // Create bots
  for (let i = 0; i < NUM_BOTS; i++) {
    bots.push(new SpadesBot(BOT_NAMES[i], i));
  }
  
  // Connect all bots
  for (const bot of bots) {
    await bot.connect();
    console.log(`[${bot.name}] Connected`);
  }
  
  // First bot creates the table
  tableId = await bots[0].createTable();
  
  await delay(500);
  
  // Other bots join
  for (let i = 1; i < bots.length; i++) {
    bots[i].joinTable(tableId);
    await delay(300);
    console.log(`[${bots[i].name}] Joined table`);
  }
  
  if (!AUTO_MODE) {
    console.log(`\n👤 Join table: ${tableId}`);
    console.log('Open http://localhost:5173 and join the game!\n');
  }
  
  // Keep process running
  process.on('SIGINT', () => {
    console.log('\nShutting down bots...');
    for (const bot of bots) {
      bot.disconnect();
    }
    process.exit(0);
  });
}

main().catch(console.error);
