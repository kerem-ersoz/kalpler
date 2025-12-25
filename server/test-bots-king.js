/**
 * Automated test bots for King game
 * Creates 3 bot players that join a table - you join as the 4th player to watch
 * 
 * Usage:
 *   npm run test:bots:king              - 3 bots, you join as 4th player
 *   npm run test:bots:king -- --auto    - 4 bots, fully automated
 *   npm run test:bots:king -- --fast    - Faster bot play speed
 * 
 * Run with: npm run test:bots:king
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

// Contract types
const PENALTY_CONTRACTS = ['el', 'kupa', 'erkek', 'kiz', 'rifki', 'sonIki'];
const TRUMP_SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];

// Contract labels for display
const CONTRACT_LABELS = {
  el: 'El Almaz',
  kupa: 'Kupa Almaz',
  erkek: 'Erkek Almaz',
  kiz: 'Kız Almaz',
  rifki: 'Rıfkı',
  sonIki: 'Son İki',
  trump: 'Koz'
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

class KingBot {
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
    this.contract = null;
    this.isPlaying = false; // Prevent double plays
    this.isSelecting = false; // Prevent double selections
    this.gameNumber = 0;
    this.contractsUsed = { penalties: 0, trumps: 0 };
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
          console.log(`Table created: ${data.tableId} (King game)`);
        }
      });

      this.socket.on('contractSelectionStart', async (data) => {
        this.hand = data.hand;
        this.phase = 'selecting';
        this.gameNumber = data.gameNumber;
        
        if (this.index === 0) {
          console.log(`\n🎴 Game ${data.gameNumber}/20 - Contract selection`);
        }
        
        if (data.selector === this.seat && !this.isSelecting) {
          if (data.contractsUsed) {
            this.contractsUsed = data.contractsUsed;
          }
          await this.selectContract(data.availableContracts);
        }
      });

      this.socket.on('contractSelected', async (data) => {
        this.contract = data.contract;
        this.phase = 'playing';
        this.isSelecting = false;
        
        if (this.index === 0) {
          const label = CONTRACT_LABELS[data.contract.type] || data.contract.type;
          const trumpLabel = data.contract.trumpSuit ? ` (${data.contract.trumpSuit})` : '';
          console.log(`Contract: ${label}${trumpLabel}`);
        }
      });

      this.socket.on('startGame', async (data) => {
        // King uses contractSelectionStart instead
        this.hand = data.hand;
        this.phase = data.phase;
      });

      this.socket.on('updateGame', async (data) => {
        if (data.hand) this.hand = data.hand;
        if (data.phase) this.phase = data.phase;
        if (data.legalCards) this.legalCards = data.legalCards;
        if (data.contract) this.contract = data.contract;
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
          console.log(`Trick won by ${winnerBot?.name || 'unknown'} (${data.points} points)`);
        }
      });

      this.socket.on('roundEnd', (data) => {
        if (this.index === 0) {
          console.log(`\n📊 Game ended. Scores: ${data.cumulativeScores.join(', ')}`);
        }
      });

      this.socket.on('kingRoundEnd', (data) => {
        this.isSelecting = false;
        this.contract = null;
        if (this.index === 0) {
          console.log(`\n📊 Game ended. Game scores: ${data.roundScores.join(', ')}`);
          console.log(`Cumulative scores: ${data.cumulativeScores.join(', ')}`);
        }
      });

      this.socket.on('gameEnd', (data) => {
        if (this.index === 0) {
          const winnerBot = bots.find(b => b.seat === data.winner);
          console.log(`\n🏆 PARTY OVER! Winner: ${winnerBot?.name || 'unknown'}`);
          console.log(`Final scores: ${data.finalScores.join(', ')}`);
        }
      });

      this.socket.on('error', (err) => {
        if (!err.message.includes('Not your turn') && !err.message.includes('Illegal card') && !err.message.includes('Not your selection')) {
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
      // Create a King game table
      // In 3-bot mode, set initial selector to seat 3 (human seat) so human picks first
      const options = AUTO_MODE ? {} : { initialSelectorSeat: 3 };
      this.socket.emit('createTable', { playerName: this.name, gameType: 'king', options });
    });
  }

  async selectContract(availableContracts) {
    if (this.isSelecting) return;
    this.isSelecting = true;
    
    await delay(BOT_DELAY * 2); // Give a bit more time for contract selection
    
    // Simple strategy: prefer penalty contracts if available, otherwise trump
    // Try to avoid contracts where we have bad hands
    
    let selectedContract = null;
    let trumpSuit = null;
    
    // Check available contracts
    const hasPenalty = availableContracts.some(c => c.type !== 'trump');
    const hasTrump = availableContracts.some(c => c.type === 'trump');
    
    if (hasPenalty) {
      // Pick a random penalty contract
      const penalties = availableContracts.filter(c => c.type !== 'trump');
      selectedContract = penalties[Math.floor(Math.random() * penalties.length)];
    } else if (hasTrump) {
      // Must select trump - pick best suit based on hand
      selectedContract = availableContracts.find(c => c.type === 'trump');
      
      // Count cards in each suit to pick the longest
      const suitCounts = { spades: 0, hearts: 0, diamonds: 0, clubs: 0 };
      for (const card of this.hand) {
        suitCounts[card.suit]++;
      }
      
      // Pick the suit with the most cards
      trumpSuit = Object.entries(suitCounts)
        .sort(([, a], [, b]) => b - a)[0][0];
    }
    
    if (selectedContract) {
      const isPenalty = selectedContract.type !== 'trump';
      console.log(`[${this.name}] Selecting: ${CONTRACT_LABELS[selectedContract.type] || selectedContract.type}${trumpSuit ? ` (${trumpSuit})` : ''}`);
      
      this.socket.emit('selectContract', { 
        contractType: isPenalty ? 'penalty' : 'trump',
        contractName: isPenalty ? selectedContract.type : undefined,
        trumpSuit 
      });
    }
  }

  async playTurn() {
    if (this.isPlaying || this.phase !== 'playing') return;
    if (this.legalCards.length === 0) return;
    
    this.isPlaying = true;
    
    await delay(BOT_DELAY);
    
    // Get fresh legal cards
    const legalCards = this.legalCards;
    if (legalCards.length === 0) {
      this.isPlaying = false;
      return;
    }
    
    // Simple strategy based on contract type
    let cardToPlay;
    
    if (this.contract?.type === 'el') {
      // El Almaz: Try to lose tricks - play lowest card
      cardToPlay = this.getLowestCard(legalCards);
    } else if (this.contract?.type === 'kupa') {
      // Kupa Almaz: Avoid hearts - dump hearts when possible, else play low
      cardToPlay = this.avoidSuit(legalCards, 'hearts');
    } else if (this.contract?.type === 'erkek') {
      // Erkek Almaz: Avoid Jacks and Kings
      cardToPlay = this.avoidRanks(legalCards, ['J', 'K']);
    } else if (this.contract?.type === 'kiz') {
      // Kız Almaz: Avoid Queens
      cardToPlay = this.avoidRanks(legalCards, ['Q']);
    } else if (this.contract?.type === 'rifki') {
      // Rıfkı: Avoid King of Hearts specifically
      cardToPlay = this.avoidSpecificCard(legalCards, 'hearts', 'K');
    } else if (this.contract?.type === 'sonIki') {
      // Son İki: Try to lose the last 2 tricks
      cardToPlay = this.getLowestCard(legalCards);
    } else if (this.contract?.type === 'trump') {
      // Trump: Try to win tricks - play high
      cardToPlay = this.getHighestCard(legalCards);
    } else {
      // Default: play lowest card
      cardToPlay = this.getLowestCard(legalCards);
    }
    
    console.log(`[${this.name}] plays ${cardToPlay.display}`);
    this.socket.emit('playCard', { card: cardToPlay });
    
    this.isPlaying = false;
    this.isMyTurn = false;
  }

  getLowestCard(cards) {
    const rankOrder = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    return cards.sort((a, b) => rankOrder.indexOf(a.rank) - rankOrder.indexOf(b.rank))[0];
  }

  getHighestCard(cards) {
    const rankOrder = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    return cards.sort((a, b) => rankOrder.indexOf(b.rank) - rankOrder.indexOf(a.rank))[0];
  }

  avoidSuit(cards, suit) {
    // If we can play non-hearts, play the lowest of those
    const nonSuit = cards.filter(c => c.suit !== suit);
    if (nonSuit.length > 0) {
      return this.getLowestCard(nonSuit);
    }
    // Must play the suit - play the lowest
    return this.getLowestCard(cards);
  }

  avoidRanks(cards, ranks) {
    // Avoid specific ranks if possible
    const safe = cards.filter(c => !ranks.includes(c.rank));
    if (safe.length > 0) {
      return this.getLowestCard(safe);
    }
    // Must play a dangerous card - play lowest of them
    return this.getLowestCard(cards);
  }

  avoidSpecificCard(cards, suit, rank) {
    // Avoid a specific card (King of Hearts)
    const safe = cards.filter(c => !(c.suit === suit && c.rank === rank));
    if (safe.length > 0) {
      return this.getLowestCard(safe);
    }
    // Must play the dangerous card
    return cards[0];
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}

async function main() {
  console.log('🃏 King Bot Test');
  console.log(`Mode: ${AUTO_MODE ? 'Full Auto (4 bots)' : '3 bots + 1 human slot'}`);
  console.log(`Speed: ${FAST_MODE ? 'Fast' : 'Normal'}`);
  console.log('');
  
  // Create bots
  for (let i = 0; i < NUM_BOTS; i++) {
    const bot = new KingBot(BOT_NAMES[i], i);
    bots.push(bot);
  }
  
  // Connect all bots
  console.log('Connecting bots...');
  await Promise.all(bots.map(b => b.connect()));
  console.log('All bots connected!');
  
  // First bot creates the table
  tableId = await bots[0].createTable();
  console.log(`Table created: ${tableId}`);
  
  // Wait a bit then join other bots
  await delay(500);
  
  for (let i = 1; i < NUM_BOTS; i++) {
    bots[i].joinTable(tableId);
    console.log(`${bots[i].name} joining...`);
    await delay(300);
  }
  
  if (!AUTO_MODE) {
    console.log(`\n⏳ Waiting for human player...`);
    console.log(`Join table: ${tableId}`);
    console.log(`Or run with --auto for fully automated mode`);
  }
  
  // Keep process running
  process.on('SIGINT', () => {
    console.log('\nShutting down bots...');
    bots.forEach(b => b.disconnect());
    process.exit(0);
  });
}

main().catch(console.error);
