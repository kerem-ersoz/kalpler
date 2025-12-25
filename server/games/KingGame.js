/**
 * King Game Logic
 * 
 * Implements the Turkish King card game with:
 * - 6 penalty contracts (El Almaz, Kupa Almaz, Erkek Almaz, Kız Almaz, Rıfkı, Son İki)
 * - Trump contracts (any suit can be declared trump)
 * - 20 games per party (12 penalty + 8 trump in dejenere mode)
 */

import { 
  RANK_VALUES, 
  cardEquals, 
  sortHand, 
  shuffleDeck, 
  createDeck,
  determineTrickWinner,
  determineTrickWinnerWithTrump,
  getCardsOfSuit
} from '../shared/cards.js';

// Contract types
export const CONTRACT_TYPES = {
  PENALTY: 'penalty',
  TRUMP: 'trump'
};

// Penalty contract names
export const PENALTY_CONTRACTS = {
  EL_ALMAZ: 'el',       // No tricks - 50 points per trick
  KUPA_ALMAZ: 'kupa',   // No hearts - 30 points per heart
  ERKEK_ALMAZ: 'erkek', // No Kings/Jacks - 60 points per K or J
  KIZ_ALMAZ: 'kiz',     // No Queens - 100 points per Queen
  RIFKI: 'rifki',       // Avoid King of Hearts - 320 points
  SON_IKI: 'sonIki'     // Avoid last two tricks - 180 points per trick
};

// Point values for each contract
export const PENALTY_VALUES = {
  el: { perTrick: 50, maxPoints: 650 },
  kupa: { perHeart: 30, maxPoints: 390 },
  erkek: { perCard: 60, maxPoints: 480 },  // 8 cards (4K + 4J)
  kiz: { perCard: 100, maxPoints: 400 },   // 4 queens
  rifki: { fixed: 320, maxPoints: 320 },   // Single card (K♥)
  sonIki: { perTrick: 180, maxPoints: 360 } // Last 2 tricks
};

export const TRUMP_VALUES = {
  perTrick: 50,
  maxPoints: 650
};

// Contract labels for UI
export const CONTRACT_LABELS = {
  el: 'El Almaz',
  kupa: 'Kupa Almaz',
  erkek: 'Erkek Almaz',
  kiz: 'Kız Almaz',
  rifki: 'Rıfkı',
  sonIki: 'Son iki'
};

export const TRUMP_LABELS = {
  spades: 'Maça Koz',
  hearts: 'Kupa Koz',
  diamonds: 'Karo Koz',
  clubs: 'Sinek Koz'
};

export class KingGame {
  constructor(initialSelectorSeat = 0) {
    this.hands = [[], [], [], []];
    this.gameNumber = 1;  // 1-20 within a party
    this.phase = 'dealing';
    this.selectorSeat = initialSelectorSeat;  // Who selects the contract this game
    
    // Current contract
    this.contract = null;  // { type: 'penalty'|'trump', name?: string, trumpSuit?: string }
    
    // Trick state
    this.currentTrick = [];
    this.currentPlayer = 0;
    this.tricksPlayed = 0;
    this.tricksTaken = [[], [], [], []];  // Tricks won by each player
    this.lastTrick = null;
    
    // Contract-specific state
    this.heartsBroken = false;  // For kupa and rifki
    this.trumpBroken = false;   // For trump games
    
    // Scoring
    this.gameScores = [0, 0, 0, 0];       // Current game scores
    this.cumulativeScores = [0, 0, 0, 0]; // Party cumulative scores
    
    // Contract usage tracking (dejenere mode)
    // Each player gets 3 penalty selections and 2 trump selections per party
    this.contractsUsed = [
      { penalties: 0, trumps: 0 },
      { penalties: 0, trumps: 0 },
      { penalties: 0, trumps: 0 },
      { penalties: 0, trumps: 0 }
    ];
    
    // Global contract usage - each contract can only be selected 2 times per party
    this.globalContractUsage = {
      el: 0,
      kupa: 0,
      erkek: 0,
      kiz: 0,
      rifki: 0,
      sonIki: 0,
      trump_spades: 0,
      trump_hearts: 0,
      trump_diamonds: 0,
      trump_clubs: 0,
    };
    
    // Contract history
    this.contractHistory = [];
    
    // Party scores (accumulated across all games in party)
    this.partyScores = [0, 0, 0, 0];
    
    // Timers (managed externally)
    this.turnTimer = null;
    this.selectTimer = null;
  }

  deal() {
    const deck = shuffleDeck(createDeck());
    this.hands = [[], [], [], []];
    
    for (let i = 0; i < 52; i++) {
      this.hands[i % 4].push(deck[i]);
    }
    
    // Sort hands
    for (let i = 0; i < 4; i++) {
      this.hands[i] = sortHand(this.hands[i]);
    }
    
    this.phase = 'selecting';
    this.contract = null;
    this.currentTrick = [];
    this.heartsBroken = false;
    this.trumpBroken = false;
    this.tricksTaken = [[], [], [], []];
    this.gameScores = [0, 0, 0, 0];
    this.lastTrick = null;
    this.tricksPlayed = 0;
    
    return { selectorSeat: this.selectorSeat };
  }

  /**
   * Check if a contract selection is valid
   */
  canSelectContract(playerSeat, contractType, contractName, trumpSuit) {
    if (playerSeat !== this.selectorSeat) {
      return { valid: false, error: 'Not your turn to select' };
    }
    
    if (this.phase !== 'selecting') {
      return { valid: false, error: 'Not in selection phase' };
    }
    
    const usage = this.contractsUsed[playerSeat];
    
    if (contractType === CONTRACT_TYPES.PENALTY) {
      if (usage.penalties >= 3) {
        return { valid: false, error: 'No penalty selections remaining' };
      }
      if (!PENALTY_CONTRACTS[contractName.toUpperCase()] && !Object.values(PENALTY_CONTRACTS).includes(contractName)) {
        return { valid: false, error: 'Invalid penalty contract' };
      }
      // Check global usage for this specific penalty contract
      const normalizedName = contractName.toLowerCase();
      if (this.globalContractUsage[normalizedName] >= 2) {
        return { valid: false, error: 'This contract has been used twice already' };
      }
    } else if (contractType === CONTRACT_TYPES.TRUMP) {
      if (usage.trumps >= 2) {
        return { valid: false, error: 'No trump selections remaining' };
      }
      if (!['spades', 'hearts', 'diamonds', 'clubs'].includes(trumpSuit)) {
        return { valid: false, error: 'Invalid trump suit' };
      }
      // Check global usage for this specific trump suit
      const trumpKey = `trump_${trumpSuit}`;
      if (this.globalContractUsage[trumpKey] >= 2) {
        return { valid: false, error: 'This trump suit has been used twice already' };
      }
    } else {
      return { valid: false, error: 'Invalid contract type' };
    }
    
    return { valid: true };
  }

  /**
   * Select a contract for this game
   */
  selectContract(playerSeat, contractType, contractName, trumpSuit) {
    const validation = this.canSelectContract(playerSeat, contractType, contractName, trumpSuit);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }
    
    // Normalize contract name
    const normalizedName = contractName?.toLowerCase();
    
    if (contractType === CONTRACT_TYPES.PENALTY) {
      this.contract = { type: CONTRACT_TYPES.PENALTY, name: normalizedName };
      this.contractsUsed[playerSeat].penalties++;
      // Track global usage
      this.globalContractUsage[normalizedName]++;
    } else {
      this.contract = { type: CONTRACT_TYPES.TRUMP, trumpSuit };
      this.contractsUsed[playerSeat].trumps++;
      // Track global usage
      this.globalContractUsage[`trump_${trumpSuit}`]++;
    }
    
    // Add to contract history
    this.contractHistory.push({
      gameNumber: this.gameNumber,
      selector: playerSeat,
      contract: this.contract
    });
    
    this.phase = 'playing';
    
    // Contract selector starts the hand
    this.currentPlayer = playerSeat;
    
    return { 
      success: true, 
      contract: this.contract,
      startingPlayer: this.currentPlayer
    };
  }
  /**
   * Get available contracts for a player based on their usage
   */
  getAvailableContracts(playerSeat) {
    const usage = this.contractsUsed[playerSeat];
    const contracts = [];
    
    // Add penalty contracts if available (player has remaining selections)
    if (usage.penalties < 3) {
      for (const [key, name] of Object.entries(PENALTY_CONTRACTS)) {
        const globalUsage = this.globalContractUsage[name] || 0;
        contracts.push({
          type: name,
          label: CONTRACT_LABELS[name] || name,
          usageCount: globalUsage,
          disabled: globalUsage >= 2,
        });
      }
    }
    
    // Add trump contracts if available (player has remaining selections)
    if (usage.trumps < 2) {
      for (const suit of ['spades', 'hearts', 'clubs', 'diamonds']) {
        const trumpKey = `trump_${suit}`;
        const globalUsage = this.globalContractUsage[trumpKey] || 0;
        contracts.push({
          type: 'trump',
          trumpSuit: suit,
          label: TRUMP_LABELS[suit] || `${suit} Koz`,
          usageCount: globalUsage,
          disabled: globalUsage >= 2,
        });
      }
    }
    
    return contracts;
  }

  findTwoOfDiamondsPlayer() {
    for (let i = 0; i < 4; i++) {
      if (this.hands[i].some(c => c.suit === 'diamonds' && c.rank === '2')) {
        return i;
      }
    }
    return this.selectorSeat;  // Fallback
  }

  /**
   * Get legal cards for the current player
   */
  getLegalCards(playerIndex) {
    const hand = this.hands[playerIndex];
    const isLeading = this.currentTrick.length === 0;
    const ledSuit = this.currentTrick[0]?.card.suit;
    
    if (this.contract.type === CONTRACT_TYPES.TRUMP) {
      return this.getLegalCardsForTrump(hand, isLeading, ledSuit);
    } else {
      return this.getLegalCardsForPenalty(hand, isLeading, ledSuit, playerIndex);
    }
  }

  getLegalCardsForTrump(hand, isLeading, ledSuit) {
    const trumpSuit = this.contract.trumpSuit;
    
    if (isLeading) {
      // Can't lead trump until broken (unless only trump remains)
      if (!this.trumpBroken) {
        const nonTrump = hand.filter(c => c.suit !== trumpSuit);
        if (nonTrump.length > 0) return nonTrump;
      }
      return hand;
    }
    
    // Must follow suit if possible
    const sameSuit = getCardsOfSuit(hand, ledSuit);
    if (sameSuit.length > 0) return sameSuit;
    
    // Void in suit - can play anything (trump will break if played)
    return hand;
  }

  getLegalCardsForPenalty(hand, isLeading, ledSuit, playerIndex) {
    const contractName = this.contract.name;
    
    // Special rules for kupa and rifki - can't lead hearts until broken
    if (isLeading && (contractName === 'kupa' || contractName === 'rifki')) {
      if (!this.heartsBroken) {
        const nonHearts = hand.filter(c => c.suit !== 'hearts');
        if (nonHearts.length > 0) return nonHearts;
      }
      return hand;
    }
    
    if (isLeading) {
      return hand;  // Can lead anything for other penalties
    }
    
    // Must follow suit if possible
    const sameSuit = getCardsOfSuit(hand, ledSuit);
    if (sameSuit.length > 0) {
      // Additional constraints for erkek, kiz, rifki when following suit
      return this.applyPenaltyConstraints(sameSuit, hand, contractName, ledSuit);
    }
    
    // Void in suit - apply penalty discard rules
    return this.getPenaltyDiscards(hand, contractName);
  }

  applyPenaltyConstraints(sameSuitCards, fullHand, contractName, ledSuit) {
    // Erkek Almaz: If higher card in led suit is on table and you hold K or J in that suit, must play it
    if (contractName === 'erkek') {
      const highestOnTable = Math.max(...this.currentTrick
        .filter(t => t.card.suit === ledSuit)
        .map(t => RANK_VALUES[t.card.rank]));
      
      const mustPlay = sameSuitCards.filter(c => 
        (c.rank === 'K' || c.rank === 'J') && RANK_VALUES[c.rank] < highestOnTable
      );
      if (mustPlay.length > 0) return mustPlay;
    }
    
    // Kız Almaz: Similar for Queens
    if (contractName === 'kiz') {
      const highestOnTable = Math.max(...this.currentTrick
        .filter(t => t.card.suit === ledSuit)
        .map(t => RANK_VALUES[t.card.rank]));
      
      const mustPlay = sameSuitCards.filter(c => 
        c.rank === 'Q' && RANK_VALUES[c.rank] < highestOnTable
      );
      if (mustPlay.length > 0) return mustPlay;
    }
    
    return sameSuitCards;
  }

  getPenaltyDiscards(hand, contractName) {
    // When void in led suit, special discard rules apply
    
    if (contractName === 'erkek') {
      // Must play K or J from other suits if holding any
      const erkekCards = hand.filter(c => c.rank === 'K' || c.rank === 'J');
      if (erkekCards.length > 0) return erkekCards;
    }
    
    if (contractName === 'kiz') {
      // Must play Q from other suits if holding any
      const queens = hand.filter(c => c.rank === 'Q');
      if (queens.length > 0) return queens;
    }
    
    if (contractName === 'rifki') {
      // Must play K♥ if holding it, else any heart
      const kingOfHearts = hand.find(c => c.suit === 'hearts' && c.rank === 'K');
      if (kingOfHearts) return [kingOfHearts];
      
      const hearts = getCardsOfSuit(hand, 'hearts');
      if (hearts.length > 0) return hearts;
    }
    
    if (contractName === 'kupa') {
      // Must play hearts if holding any (hearts go out)
      const hearts = getCardsOfSuit(hand, 'hearts');
      if (hearts.length > 0) return hearts;
    }
    
    // No special constraints - can play anything
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
    
    // Check for hearts/trump broken
    if (card.suit === 'hearts' && (this.contract.name === 'kupa' || this.contract.name === 'rifki')) {
      this.heartsBroken = true;
    }
    if (this.contract.type === CONTRACT_TYPES.TRUMP && card.suit === this.contract.trumpSuit) {
      this.trumpBroken = true;
    }
    
    // Check if trick is complete
    if (this.currentTrick.length === 4) {
      return this.completeTrick();
    }
    
    // Move to next player (counterclockwise)
    this.currentPlayer = (this.currentPlayer + 3) % 4;
    
    return { success: true, trickComplete: false };
  }

  completeTrick() {
    // Save the current trick cards before completing (for Son İki display)
    const trickCards = this.currentTrick.map(t => t.card);
    
    let winner;
    
    if (this.contract.type === CONTRACT_TYPES.TRUMP) {
      winner = determineTrickWinnerWithTrump(this.currentTrick, this.contract.trumpSuit);
    } else {
      winner = determineTrickWinner(this.currentTrick);
    }
    
    this.tricksTaken[winner].push([...this.currentTrick]);
    this.lastTrick = [...this.currentTrick];
    this.tricksPlayed++;
    
    // Track winners of tricks 12 and 13 for Son İki scoring
    if (this.contract.name === 'sonIki') {
      if (this.tricksPlayed === 12) {
        this._trick12Winner = winner;
        this._trick12Cards = trickCards;
      } else if (this.tricksPlayed === 13) {
        this._trick13Winner = winner;
        this._trick13Cards = trickCards;
      }
    }
    
    // Check for early game completion based on contract
    const earlyEnd = this.checkEarlyGameEnd(trickCards, winner);
    
    // Check if game is complete
    if (this.tricksPlayed === 13 || earlyEnd) {
      return this.completeGame(winner);
    }
    
    this.currentTrick = [];
    this.currentPlayer = winner;
    
    return {
      success: true,
      trickComplete: true,
      winner,
      gameComplete: false
    };
  }

  /**
   * Check if the game should end early based on contract-specific conditions
   */
  checkEarlyGameEnd(lastTrickCards, winner) {
    const contractName = this.contract.name;
    
    // Rifki: End when King of Hearts has been played
    if (contractName === 'rifki') {
      const kingOfHeartsPlayed = lastTrickCards.some(c => c.suit === 'hearts' && c.rank === 'K');
      if (kingOfHeartsPlayed) {
        return true;
      }
    }
    
    // For other contracts, check if any penalty cards remain to be played
    // by looking at all 4 hands
    const allRemainingCards = [...this.hands[0], ...this.hands[1], ...this.hands[2], ...this.hands[3]];
    
    // Kupa Almaz: End when no hearts remain
    if (contractName === 'kupa') {
      const remainingHearts = allRemainingCards.filter(c => c.suit === 'hearts');
      if (remainingHearts.length === 0) {
        return true;
      }
    }
    
    // Erkek Almaz: End when no Kings or Jacks remain
    if (contractName === 'erkek') {
      const remainingErkek = allRemainingCards.filter(c => c.rank === 'K' || c.rank === 'J');
      if (remainingErkek.length === 0) {
        return true;
      }
    }
    
    // Kız Almaz: End when no Queens remain
    if (contractName === 'kiz') {
      const remainingQueens = allRemainingCards.filter(c => c.rank === 'Q');
      if (remainingQueens.length === 0) {
        return true;
      }
    }
    
    return false;
  }

  completeGame(lastTrickWinner) {
    // Calculate scores for this game
    this.calculateGameScores();
    
    // Add to cumulative (penalties negative, trump positive)
    for (let i = 0; i < 4; i++) {
      this.cumulativeScores[i] += this.gameScores[i];
    }
    
    // Check for party end (20 games)
    const partyOver = this.gameNumber >= 20;
    
    // Clear all player hands when game ends
    this.hands = [[], [], [], []];
    this.currentTrick = [];
    this.phase = 'gameEnd';
    
    return {
      success: true,
      trickComplete: true,
      winner: lastTrickWinner,
      gameComplete: true,
      gameScores: [...this.gameScores],
      cumulativeScores: [...this.cumulativeScores],
      partyOver,
      winners: partyOver ? this.determineWinners() : null
    };
  }

  calculateGameScores() {
    const contractName = this.contract.name;
    const contractType = this.contract.type;
    
    if (contractType === CONTRACT_TYPES.TRUMP) {
      // Trump: +50 per trick
      for (let i = 0; i < 4; i++) {
        this.gameScores[i] = this.tricksTaken[i].length * TRUMP_VALUES.perTrick;
      }
    } else {
      // Penalty contracts - negative scores
      switch (contractName) {
        case 'el':
          // -50 per trick taken
          for (let i = 0; i < 4; i++) {
            this.gameScores[i] = -this.tricksTaken[i].length * PENALTY_VALUES.el.perTrick;
          }
          break;
          
        case 'kupa':
          // -30 per heart captured
          for (let i = 0; i < 4; i++) {
            let hearts = 0;
            for (const trick of this.tricksTaken[i]) {
              for (const { card } of trick) {
                if (card.suit === 'hearts') hearts++;
              }
            }
            this.gameScores[i] = -hearts * PENALTY_VALUES.kupa.perHeart;
          }
          break;
          
        case 'erkek':
          // -60 per King or Jack captured
          for (let i = 0; i < 4; i++) {
            let count = 0;
            for (const trick of this.tricksTaken[i]) {
              for (const { card } of trick) {
                if (card.rank === 'K' || card.rank === 'J') count++;
              }
            }
            this.gameScores[i] = -count * PENALTY_VALUES.erkek.perCard;
          }
          break;
          
        case 'kiz':
          // -100 per Queen captured
          for (let i = 0; i < 4; i++) {
            let count = 0;
            for (const trick of this.tricksTaken[i]) {
              for (const { card } of trick) {
                if (card.rank === 'Q') count++;
              }
            }
            this.gameScores[i] = -count * PENALTY_VALUES.kiz.perCard;
          }
          break;
          
        case 'rifki':
          // -320 for capturing King of Hearts
          for (let i = 0; i < 4; i++) {
            let hasRifki = false;
            for (const trick of this.tricksTaken[i]) {
              for (const { card } of trick) {
                if (card.suit === 'hearts' && card.rank === 'K') hasRifki = true;
              }
            }
            this.gameScores[i] = hasRifki ? -PENALTY_VALUES.rifki.fixed : 0;
          }
          break;
          
        case 'sonIki':
          // -180 for each of the last two tricks
          for (let i = 0; i < 4; i++) {
            const lastTwoTricks = this.tricksTaken[i].filter((_, idx, arr) => {
              // Check if this trick was one of the last two in the game
              const trickNum = this.getTrickNumber(i, idx);
              return trickNum >= 12;  // Tricks 12 and 13 (0-indexed 11 and 12)
            });
            // Actually need to track which global trick numbers each player won
            // Simpler: count tricks won in positions 12 and 13
            this.gameScores[i] = 0;  // Will be set below
          }
          // Special handling for Son İki - need to track global trick order
          this.calculateSonIkiScores();
          break;
      }
    }
  }

  getTrickNumber(playerIndex, localIndex) {
    // This is a placeholder - we need to track global trick order
    // For now, approximate based on position
    return localIndex;
  }

  calculateSonIkiScores() {
    // Track who won trick 12 and 13 (last two)
    // We need to reconstruct from tricksTaken order
    // Since tricks are added in order, we can count total tricks to find the last two winners
    
    // Reset scores
    for (let i = 0; i < 4; i++) {
      this.gameScores[i] = 0;
    }
    
    // Build ordered list of trick winners
    const trickWinners = [];
    const trickCounts = [0, 0, 0, 0];
    
    // Reconstruct order by simulating
    // Actually, we don't have the global order stored directly
    // Let's use lastTrick tracking - but for Son İki we need to track during play
    
    // Simpler approach: store trick winners during play
    // For now, use the total counts and assume last two are distributed
    // This is a simplification - proper implementation would track during completeTrick
    
    // Actually track winner of tricks 12 and 13 separately in the game
    if (this._trick12Winner !== undefined) {
      this.gameScores[this._trick12Winner] -= PENALTY_VALUES.sonIki.perTrick;
    }
    if (this._trick13Winner !== undefined) {
      this.gameScores[this._trick13Winner] -= PENALTY_VALUES.sonIki.perTrick;
    }
  }

  determineWinners() {
    // Players with score >= 0 are winners (çıkmış)
    // Players with score < -10 are losers (batmış)
    const winners = [];
    for (let i = 0; i < 4; i++) {
      if (this.cumulativeScores[i] >= 0) {
        winners.push(i);
      }
    }
    return winners;
  }

  startNextGame() {
    this.gameNumber++;
    this.selectorSeat = (this.selectorSeat + 3) % 4;  // Rotate selector counterclockwise
    this.deal();
  }

  getStateForPlayer(playerIndex) {
    return {
      phase: this.phase,
      gameNumber: this.gameNumber,
      hand: this.hands[playerIndex],
      currentTrick: this.currentTrick,
      currentPlayer: this.currentPlayer,
      contract: this.contract,
      selectorSeat: this.selectorSeat,
      heartsBroken: this.heartsBroken,
      trumpBroken: this.trumpBroken,
      gameScores: this.gameScores,
      cumulativeScores: this.cumulativeScores,
      contractsUsed: this.contractsUsed[playerIndex],
      lastTrick: this.lastTrick,
      legalCards: this.phase === 'playing' && playerIndex === this.currentPlayer
        ? this.getLegalCards(playerIndex)
        : [],
      tricksWon: this.tricksTaken.map(t => t.length),
    };
  }

  // Get penalty cards taken by each player for round-end display
  getPenaltyCardsTaken() {
    if (this.contract.type === CONTRACT_TYPES.TRUMP) {
      return [[], [], [], []];  // No penalty cards in trump games
    }
    
    const contractName = this.contract.name;
    
    return this.tricksTaken.map((tricks, playerIndex) => {
      const penaltyCards = [];
      
      // For 'el' contract, show one card per trick taken (to represent the trick)
      if (contractName === 'el') {
        for (const trick of tricks) {
          // Just take the first card of each trick as representative
          if (trick.length > 0) {
            penaltyCards.push(trick[0].card);
          }
        }
        return penaltyCards;
      }
      
      // For Son İki, specifically add cards from the last two tricks for the winners
      if (contractName === 'sonIki') {
        if (this._trick12Winner === playerIndex && this._trick12Cards) {
          penaltyCards.push(...this._trick12Cards);
        }
        if (this._trick13Winner === playerIndex && this._trick13Cards) {
          penaltyCards.push(...this._trick13Cards);
        }
        return penaltyCards;
      }
      
      // For other contracts, find specific penalty cards
      for (const trick of tricks) {
        for (const { card } of trick) {
          let isPenalty = false;
          
          switch (contractName) {
            case 'kupa':
              isPenalty = card.suit === 'hearts';
              break;
            case 'erkek':
              isPenalty = card.rank === 'K' || card.rank === 'J';
              break;
            case 'kiz':
              isPenalty = card.rank === 'Q';
              break;
            case 'rifki':
              isPenalty = card.suit === 'hearts' && card.rank === 'K';
              break;
          }
          
          if (isPenalty) {
            penaltyCards.push(card);
          }
        }
      }
      
      return penaltyCards;
    });
  }
}
