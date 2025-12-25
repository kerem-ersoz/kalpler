/**
 * Shared card utilities for all card games
 */

export const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
export const RANK_VALUES = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
};
export const SUIT_SYMBOLS = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };

export function createDeck() {
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

export function shuffleDeck(deck) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function cardEquals(a, b) {
  return a.suit === b.suit && a.rank === b.rank;
}

export function sortHand(hand, suitOrder = { clubs: 0, diamonds: 1, spades: 2, hearts: 3 }) {
  return [...hand].sort((a, b) => {
    if (suitOrder[a.suit] !== suitOrder[b.suit]) {
      return suitOrder[a.suit] - suitOrder[b.suit];
    }
    return RANK_VALUES[a.rank] - RANK_VALUES[b.rank];
  });
}

export function dealCards(numPlayers = 4, cardsPerPlayer = 13) {
  const deck = shuffleDeck(createDeck());
  const hands = Array.from({ length: numPlayers }, () => []);
  
  for (let i = 0; i < numPlayers * cardsPerPlayer; i++) {
    hands[i % numPlayers].push(deck[i]);
  }
  
  // Sort each hand
  return hands.map(hand => sortHand(hand));
}

export function findCardInHand(hand, suit, rank) {
  return hand.find(c => c.suit === suit && c.rank === rank);
}

export function hasCard(hand, suit, rank) {
  return hand.some(c => c.suit === suit && c.rank === rank);
}

export function getCardsOfSuit(hand, suit) {
  return hand.filter(c => c.suit === suit);
}

export function removeCard(hand, card) {
  return hand.filter(c => !cardEquals(c, card));
}

/**
 * Determine trick winner (no trump version - Hearts style)
 */
export function determineTrickWinner(trick) {
  const ledSuit = trick[0].card.suit;
  let winningPlay = trick[0];
  
  for (const play of trick) {
    if (play.card.suit === ledSuit && 
        RANK_VALUES[play.card.rank] > RANK_VALUES[winningPlay.card.rank]) {
      winningPlay = play;
    }
  }
  
  return winningPlay.seat;
}

/**
 * Determine trick winner with trump suit (King/Spades style)
 */
export function determineTrickWinnerWithTrump(trick, trumpSuit) {
  const ledSuit = trick[0].card.suit;
  let winningPlay = trick[0];
  let winnerHasTrump = trick[0].card.suit === trumpSuit;
  
  for (const play of trick.slice(1)) {
    const playHasTrump = play.card.suit === trumpSuit;
    
    if (playHasTrump && !winnerHasTrump) {
      // Trump beats non-trump
      winningPlay = play;
      winnerHasTrump = true;
    } else if (playHasTrump && winnerHasTrump) {
      // Both have trump, higher trump wins
      if (RANK_VALUES[play.card.rank] > RANK_VALUES[winningPlay.card.rank]) {
        winningPlay = play;
      }
    } else if (!playHasTrump && !winnerHasTrump) {
      // Neither has trump, must follow led suit
      if (play.card.suit === ledSuit && 
          RANK_VALUES[play.card.rank] > RANK_VALUES[winningPlay.card.rank]) {
        winningPlay = play;
      }
    }
    // If winner has trump and player doesn't, winner stays
  }
  
  return winningPlay.seat;
}
