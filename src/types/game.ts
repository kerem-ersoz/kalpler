export interface Card {
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades';
  rank: '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';
  display: string;
}

export interface TrickCard {
  seat: number;
  card: Card;
}

export interface Player {
  name: string;
  seat: number;
  connected: boolean;
}

export interface ChatMessage {
  from: string;
  seat: number;
  text: string;
  timestamp: number;
}

export type GamePhase = 'waiting' | 'passing' | 'playing' | 'roundEnd' | 'gameEnd';

export type PassDirection = 'left' | 'right' | 'across' | 'hold';

export interface GameState {
  // Connection
  connectionStatus: 'connecting' | 'connected' | 'disconnected';
  tableId: string | null;
  mySeat: number | null;
  
  // Players
  players: Player[];
  
  // Game state
  phase: GamePhase;
  roundNumber: number;
  hand: Card[];
  currentTrick: TrickCard[];
  currentPlayer: number;
  isMyTurn: boolean;
  legalCards: Card[];
  heartsBroken: boolean;
  
  // Passing
  passDirection: PassDirection | null;
  passSubmitted: boolean;
  selectedPassCards: Card[];
  
  // Scores
  roundScores: number[];
  cumulativeScores: number[];
  pointCardsTaken: Card[][];
  
  // UI state
  lastTrick: TrickCard[] | null;
  lastTrickWinner: number | null;
  previousLastTrick: TrickCard[] | null; // Keep previous trick during animation
  trickAnimation: {
    active: boolean;
    trick: TrickCard[];
    winner: number | null;
    phase: 'showing' | 'stacking' | 'sliding' | 'done';
  } | null;
  // Pending trick animation - set when 4th card played, cleared when animation starts
  pendingTrickAnimation: {
    trick: TrickCard[];
    winner: number | null;
  } | null;
  passAnimation: {
    active: boolean;
    cardsPassed: Card[];
    cardsReceived: Card[];
    targetDirection: PassDirection;
    phase: 'passing' | 'receiving' | 'done';
  } | null;
  // Dealing animation - shows hand appearing at start of round
  dealingAnimation: boolean;
  // Track cards that are animating (newly received or just played)
  animatingCards: Card[];
  // Cards waiting to be added to hand after animation
  pendingReceivedCards: Card[];
  lastPlayedCard: { seat: number; card: Card } | null;
  
  // Chat
  messages: ChatMessage[];
  typingPlayers: string[];
  
  // Rematch
  rematchVotes: Record<number, boolean>;
  
  // Turn timer
  turnTimeoutAt: number | null;
  
  // Pass timer
  passTimeoutAt: number | null;
  
  // Moon shooter animation
  moonShooter: number | null;
}

export type GameAction =
  | { type: 'SET_CONNECTION_STATUS'; payload: 'connecting' | 'connected' | 'disconnected' }
  | { type: 'JOIN_TABLE'; payload: { tableId: string; seat: number; players: Player[] } }
  | { type: 'LEAVE_TABLE' }
  | { type: 'UPDATE_PLAYERS'; payload: Player[] }
  | { type: 'START_GAME'; payload: { hand: Card[]; passDirection: PassDirection; phase: GamePhase; currentPlayer: number } }
  | { type: 'UPDATE_GAME'; payload: Partial<GameState> }
  | { type: 'CARDS_RECEIVED'; payload: { hand: Card[]; phase: GamePhase; currentPlayer: number; cardsPassed?: Card[]; cardsReceived?: Card[] } }
  | { type: 'SET_PASS_ANIMATION'; payload: GameState['passAnimation'] }
  | { type: 'SET_DEALING_ANIMATION'; payload: boolean }
  | { type: 'SELECT_PASS_CARD'; payload: Card }
  | { type: 'PASS_SUBMITTED' }
  | { type: 'CARD_PLAYED'; payload: { seat: number; card: Card; currentTrick: TrickCard[]; trickComplete?: boolean; winner?: number | null } }
  | { type: 'TRICK_END'; payload: { winner: number; points: number; lastTrick: TrickCard[] } }
  | { type: 'SET_TRICK_ANIMATION'; payload: GameState['trickAnimation'] }
  | { type: 'ROUND_END'; payload: { roundScores: number[]; cumulativeScores: number[]; moonShooter: number | null; gameOver: boolean; gameWinner: number | null; pointCardsTaken: Card[][] } }
  | { type: 'GAME_END'; payload: { winner: number; finalScores: number[] } }
  | { type: 'TURN_START'; payload: { player: number; timeoutAt: number } }
  | { type: 'PASS_TIMER_START'; payload: { timeoutAt: number } }
  | { type: 'ADD_CHAT_MESSAGE'; payload: ChatMessage }
  | { type: 'UPDATE_TYPING'; payload: string[] }
  | { type: 'REMATCH_STATUS'; payload: Record<number, boolean> }
  | { type: 'RESET' };

export interface TableInfo {
  id: string;
  playerCount: number;
  playerNames: string[];
  inGame: boolean;
}
