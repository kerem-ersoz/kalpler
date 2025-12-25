/**
 * Spades Game Logic
 * 4-player partnership game with bidding, spades as trump, and bag penalties
 */

import { 
  RANK_VALUES, 
  cardEquals, 
  sortHand, 
  shuffleDeck, 
  createDeck,
  determineTrickWinnerWithTrump,
  getCardsOfSuit
} from '../shared/cards.js';

// Scoring constants
const SCORING = {
  BID_SUCCESS_MULTIPLIER: 10,  // Points per bid when team makes their bid
  BID_FAILURE_MULTIPLIER: -10, // Points per bid when team fails
  OVERTRICK_VALUE: 1,          // Points per overtrick (bag)
  BAG_PENALTY_THRESHOLD: 10,   // Bags before penalty
  BAG_PENALTY_AMOUNT: -100,    // Penalty for every 10 bags
  NIL_SUCCESS: 50,             // Bonus for successful nil
  NIL_FAILURE: -50,            // Penalty for failed nil
  BLIND_NIL_SUCCESS: 100,      // Bonus for successful blind nil
  BLIND_NIL_FAILURE: -100,     // Penalty for failed blind nil
};

// Default win threshold
const DEFAULT_WIN_THRESHOLD = 300;

export class SpadesGame {
  constructor(winThreshold = DEFAULT_WIN_THRESHOLD) {
    this.winThreshold = winThreshold;
    this.reset();
  }

  reset() {
    this.hands = [[], [], [], []];
    this.roundNumber = 1;
    this.phase = 'dealing';
    this.bids = [null, null, null, null]; // null = not yet bid, number = bid amount, 'nil' or 'blind_nil'
    this.bidsSubmitted = 0;
    this.currentTrick = [];
    this.currentPlayer = 0;
    this.spadesBroken = false;
    this.tricksTakenBySeat = [0, 0, 0, 0]; // Individual tricks this round
    this.teamTricks = [0, 0]; // Team tricks this round (team0: seats 0+2, team1: seats 1+3)
    this.roundScores = [0, 0]; // Per team this round
    this.cumulativeScores = [0, 0]; // Per team cumulative
    this.bags = [0, 0]; // Cumulative bags per team
    this.turnTimer = null;
    this.lastTrick = null;
    this.tricksPlayed = 0;
    this.blindNilCards = {}; // Cards to exchange for blind nil (seat -> cards)
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
    
    // Reset round state
    this.bids = [null, null, null, null];
    this.bidsSubmitted = 0;
    this.currentTrick = [];
    this.spadesBroken = false;
    this.tricksTakenBySeat = [0, 0, 0, 0];
    this.teamTricks = [0, 0];
    this.roundScores = [0, 0];
    this.lastTrick = null;
    this.tricksPlayed = 0;
    this.blindNilCards = {};
    
    // Start bidding phase
    this.phase = 'bidding';
    this.currentPlayer = 0; // First player to bid
    
    return this.phase;
  }

  /**
   * Get the team index for a seat (0 or 1)
   */
  getTeamForSeat(seat) {
    return seat % 2; // seats 0,2 = team 0; seats 1,3 = team 1
  }

  /**
   * Get partner seat for a given seat
   */
  getPartnerSeat(seat) {
    return (seat + 2) % 4;
  }

  /**
   * Check if a team can declare blind nil (must be behind by 100+ points)
   */
  canDeclareBlindNil(seat) {
    const team = this.getTeamForSeat(seat);
    const otherTeam = 1 - team;
    const behindBy = this.cumulativeScores[otherTeam] - this.cumulativeScores[team];
    
    // Must be behind by at least 100 points
    if (behindBy < 100) return false;
    
    // Partner cannot have already bid blind nil this round
    const partnerSeat = this.getPartnerSeat(seat);
    if (this.bids[partnerSeat] === 'blind_nil') return false;
    
    return true;
  }

  /**
   * Submit a bid for a player
   */
  submitBid(playerIndex, bid) {
    if (this.phase !== 'bidding') {
      return { success: false, error: 'Not in bidding phase' };
    }
    
    if (this.bids[playerIndex] !== null) {
      return { success: false, error: 'Already submitted bid' };
    }
    
    // Validate bid
    if (bid === 'blind_nil') {
      if (!this.canDeclareBlindNil(playerIndex)) {
        return { success: false, error: 'Cannot declare blind nil - team not behind by 100+ points or partner already bid blind nil' };
      }
    } else if (bid === 'nil') {
      // Nil is always allowed (0 bid)
    } else if (typeof bid !== 'number' || bid < 0 || bid > 13) {
      return { success: false, error: 'Invalid bid - must be 0-13, nil, or blind_nil' };
    }
    
    this.bids[playerIndex] = bid;
    this.bidsSubmitted++;
    
    // Check if all bids submitted
    if (this.bidsSubmitted === 4) {
      this.phase = 'playing';
      // Dealer's left starts (seat 1 if seat 0 dealt, but we use seat 0 as first bidder/leader)
      this.currentPlayer = 0;
      return { success: true, allBidsIn: true };
    }
    
    // Move to next bidder
    this.currentPlayer = (this.currentPlayer + 1) % 4;
    
    return { success: true, allBidsIn: false };
  }

  /**
   * Get the effective bid number for a player (nil/blind_nil count as 0 for team total)
   */
  getEffectiveBid(bid) {
    if (bid === 'nil' || bid === 'blind_nil') return 0;
    return bid || 0;
  }

  /**
   * Get team bid total
   */
  getTeamBid(team) {
    const seat1 = team === 0 ? 0 : 1;
    const seat2 = team === 0 ? 2 : 3;
    return this.getEffectiveBid(this.bids[seat1]) + this.getEffectiveBid(this.bids[seat2]);
  }

  getLegalCards(playerIndex) {
    const hand = this.hands[playerIndex];
    const isLeading = this.currentTrick.length === 0;
    
    if (isLeading) {
      // Can't lead spades until broken (unless only spades in hand)
      if (!this.spadesBroken) {
        const nonSpades = hand.filter(c => c.suit !== 'spades');
        if (nonSpades.length > 0) return nonSpades;
      }
      return hand;
    }
    
    // Must follow suit if possible
    const ledSuit = this.currentTrick[0].card.suit;
    const sameSuit = getCardsOfSuit(hand, ledSuit);
    
    if (sameSuit.length > 0) return sameSuit;
    
    // Can play any card including spades (which breaks spades)
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
    
    // Check if spades broken
    if (card.suit === 'spades') {
      this.spadesBroken = true;
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
    // Determine winner with spades as trump
    const winner = determineTrickWinnerWithTrump(this.currentTrick, 'spades');
    const winnerTeam = this.getTeamForSeat(winner);
    
    this.tricksTakenBySeat[winner]++;
    this.teamTricks[winnerTeam]++;
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
      winnerTeam,
      roundComplete: false 
    };
  }

  completeRound(lastTrickWinner) {
    // Calculate scores for each team
    const roundScores = [0, 0];
    const newBags = [0, 0];
    
    for (let team = 0; team < 2; team++) {
      const seat1 = team === 0 ? 0 : 1;
      const seat2 = team === 0 ? 2 : 3;
      const teamBid = this.getTeamBid(team);
      const teamTricks = this.teamTricks[team];
      
      // Handle nil bids first
      for (const seat of [seat1, seat2]) {
        const bid = this.bids[seat];
        const tricksTaken = this.tricksTakenBySeat[seat];
        
        if (bid === 'nil') {
          if (tricksTaken === 0) {
            roundScores[team] += SCORING.NIL_SUCCESS;
          } else {
            roundScores[team] += SCORING.NIL_FAILURE;
          }
        } else if (bid === 'blind_nil') {
          if (tricksTaken === 0) {
            roundScores[team] += SCORING.BLIND_NIL_SUCCESS;
          } else {
            roundScores[team] += SCORING.BLIND_NIL_FAILURE;
          }
        }
      }
      
      // Calculate team bid score (excluding nil bidders)
      if (teamTricks >= teamBid) {
        // Made the bid
        roundScores[team] += teamBid * SCORING.BID_SUCCESS_MULTIPLIER;
        
        // Calculate overtricks (bags) - only from non-nil bidders
        const overtricks = teamTricks - teamBid;
        roundScores[team] += overtricks * SCORING.OVERTRICK_VALUE;
        newBags[team] = overtricks;
      } else {
        // Failed to make the bid
        roundScores[team] += teamBid * SCORING.BID_FAILURE_MULTIPLIER;
      }
    }
    
    // Update cumulative scores
    for (let team = 0; team < 2; team++) {
      this.cumulativeScores[team] += roundScores[team];
      this.bags[team] += newBags[team];
      
      // Check for bag penalty (every 10 bags)
      while (this.bags[team] >= SCORING.BAG_PENALTY_THRESHOLD) {
        this.cumulativeScores[team] += SCORING.BAG_PENALTY_AMOUNT;
        this.bags[team] -= SCORING.BAG_PENALTY_THRESHOLD;
      }
    }
    
    this.roundScores = roundScores;
    
    // Check for game end
    const maxScore = Math.max(...this.cumulativeScores);
    const gameOver = maxScore >= this.winThreshold;
    
    let winnerTeam = null;
    if (gameOver) {
      // Higher score wins
      winnerTeam = this.cumulativeScores[0] > this.cumulativeScores[1] ? 0 : 
                   this.cumulativeScores[1] > this.cumulativeScores[0] ? 1 : null; // null = tie
    }
    
    this.currentTrick = [];
    this.phase = 'roundEnd';
    
    return {
      success: true,
      trickComplete: true,
      winner: lastTrickWinner,
      winnerTeam: this.getTeamForSeat(lastTrickWinner),
      roundComplete: true,
      roundScores: [...this.roundScores],
      cumulativeScores: [...this.cumulativeScores],
      bags: [...this.bags],
      teamTricks: [...this.teamTricks],
      bids: [...this.bids],
      gameOver,
      gameWinnerTeam: winnerTeam,
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
      spadesBroken: this.spadesBroken,
      bids: this.bids,
      teamTricks: this.teamTricks,
      tricksTakenBySeat: this.tricksTakenBySeat,
      roundScores: this.roundScores,
      cumulativeScores: this.cumulativeScores,
      bags: this.bags,
      bidSubmitted: this.bids[playerIndex] !== null,
      lastTrick: this.lastTrick,
      legalCards: this.phase === 'playing' && playerIndex === this.currentPlayer
        ? this.getLegalCards(playerIndex)
        : [],
      canDeclareBlindNil: this.phase === 'bidding' && this.bids[playerIndex] === null 
        ? this.canDeclareBlindNil(playerIndex) 
        : false,
    };
  }

  /**
   * Get state for spectators (no hands visible)
   */
  getSpectatorState() {
    return {
      phase: this.phase,
      roundNumber: this.roundNumber,
      currentTrick: this.currentTrick,
      currentPlayer: this.currentPlayer,
      spadesBroken: this.spadesBroken,
      bids: this.bids,
      teamTricks: this.teamTricks,
      tricksTakenBySeat: this.tricksTakenBySeat,
      roundScores: this.roundScores,
      cumulativeScores: this.cumulativeScores,
      bags: this.bags,
      lastTrick: this.lastTrick,
      tricksPlayed: this.tricksPlayed,
    };
  }
}
