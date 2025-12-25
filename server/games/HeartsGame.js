/**
 * Hearts Game Logic (refactored to use shared cards module)
 */

import { 
  RANK_VALUES, 
  cardEquals, 
  sortHand, 
  shuffleDeck, 
  createDeck,
  determineTrickWinner,
  getCardsOfSuit
} from '../shared/cards.js';

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

export class HeartsGame {
  constructor(endingScore = 20) {
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
    this.endingScore = endingScore;
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
    const passedCards = { ...this.passes };
    
    // Calculate what each player receives
    for (let i = 0; i < 4; i++) {
      const receiverIndex = getReceiverIndex(i, direction);
      receivedCards[receiverIndex] = this.passes[i];
    }
    
    // Remove passed cards and add received cards
    for (let i = 0; i < 4; i++) {
      this.hands[i] = this.hands[i].filter(
        c => !this.passes[i].some(p => cardEquals(c, p))
      );
      this.hands[i].push(...receivedCards[i]);
      this.hands[i] = sortHand(this.hands[i]);
    }
    
    this.phase = 'playing';
    this.currentPlayer = this.findTwoOfClubsPlayer();
    this.passes = {};
    
    return { passedCards, receivedCards };
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
        if (nonHearts.length > 0) return nonHearts;
      }
      return hand;
    }
    
    // Must follow suit if possible
    const ledSuit = this.currentTrick[0].card.suit;
    const sameSuit = getCardsOfSuit(hand, ledSuit);
    
    if (sameSuit.length > 0) return sameSuit;
    
    // Can't play on first trick: hearts or Q♠
    if (this.tricksPlayed === 0) {
      const safe = hand.filter(c => 
        c.suit !== 'hearts' && 
        !(c.suit === 'spades' && c.rank === 'Q')
      );
      if (safe.length > 0) return safe;
    }
    
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
    const winner = determineTrickWinner(this.currentTrick);
    
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
    let moonShotType = null;
    
    if (moonShooter !== -1) {
      const hypotheticalScores = this.cumulativeScores.map((score, i) => 
        i === moonShooter ? score : score + 26
      );
      
      const shooterHypotheticalScore = hypotheticalScores[moonShooter];
      const othersMinScore = Math.min(...hypotheticalScores.filter((_, i) => i !== moonShooter));
      const shooterWouldWin = shooterHypotheticalScore <= othersMinScore;
      
      if (shooterWouldWin) {
        moonShotType = 'gave';
        for (let i = 0; i < 4; i++) {
          this.roundScores[i] = i === moonShooter ? 0 : 26;
        }
      } else {
        moonShotType = 'took';
        for (let i = 0; i < 4; i++) {
          this.roundScores[i] = i === moonShooter ? 26 : 0;
        }
      }
    }
    
    // Add to cumulative scores
    for (let i = 0; i < 4; i++) {
      this.cumulativeScores[i] += this.roundScores[i];
    }
    
    // Check for game end
    const maxScore = Math.max(...this.cumulativeScores);
    const gameOver = maxScore >= this.endingScore;
    
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
      moonShotType,
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

  getPointCardsTaken() {
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
      return pointCards.sort((a, b) => {
        if (a.suit !== b.suit) return suitOrder[a.suit] - suitOrder[b.suit];
        return RANK_VALUES[a.rank] - RANK_VALUES[b.rank];
      });
    });
  }
}
