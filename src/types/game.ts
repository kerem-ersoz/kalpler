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

export type GameType = 'hearts' | 'king';

export type GamePhase = 'waiting' | 'passing' | 'contractSelection' | 'playing' | 'roundEnd' | 'gameEnd';

export type PassDirection = 'left' | 'right' | 'across' | 'hold';

// King-specific types
export type KingContractType = 
  | 'elAlmaz' 
  | 'kupaAlmaz' 
  | 'erkekAlmaz' 
  | 'kizAlmaz' 
  | 'rifki' 
  | 'sonIki' 
  | 'trump';

export interface KingContract {
  type: KingContractType;
  trumpSuit?: 'hearts' | 'diamonds' | 'clubs' | 'spades';
  label: string;
  name?: string; // Contract name from backend
  usageCount?: number; // How many times this contract has been used this party
  disabled?: boolean; // Whether this contract is available for selection
}

export interface KingGameState {
  // Contract selection
  currentContractSelector: number | null;
  availableContracts: KingContract[];
  selectedContract: KingContract | null;
  
  // Game progress
  gameNumber: number; // 1-20 within party
  partyNumber: number;
  contractHistory: { selector: number; contract: KingContract }[];
  
  // Scores
  partyScores: number[];
}

export interface GameState {
  // Connection
  connectionStatus: 'connecting' | 'connected' | 'disconnected';
  tableId: string | null;
  mySeat: number | null;
  
  // Spectating
  isSpectating: boolean;
  spectatorState: SpectatorGameState | null;
  
  // Game type
  gameType: GameType;
  endingScore: number | null;
  
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
  
  // Passing (Hearts only)
  passDirection: PassDirection | null;
  passSubmitted: boolean;
  selectedPassCards: Card[];
  
  // King-specific state
  kingState: KingGameState | null;
  
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
  | { type: 'JOIN_TABLE'; payload: { tableId: string; seat: number; players: Player[]; gameType?: GameType; endingScore?: number } }
  | { type: 'LEAVE_TABLE' }
  | { type: 'UPDATE_PLAYERS'; payload: Player[] }
  | { type: 'START_GAME'; payload: { hand: Card[]; passDirection: PassDirection; phase: GamePhase; currentPlayer: number; gameType?: GameType } }
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
  | { type: 'RESET' }
  // King-specific actions
  | { type: 'CONTRACT_SELECTION_START'; payload: { selector: number; availableContracts: KingContract[]; gameNumber: number; partyNumber: number } }
  | { type: 'CONTRACT_SELECTED'; payload: { contract: KingContract } }
  | { type: 'UPDATE_KING_STATE'; payload: Partial<KingGameState> }
  // Spectating actions
  | { type: 'SPECTATE_JOIN'; payload: { tableId: string; players: Player[]; gameType: GameType; gameState: SpectatorGameState } }
  | { type: 'SPECTATE_UPDATE'; payload: { gameState?: SpectatorGameState; spectatorCount?: number } }
  | { type: 'LEAVE_SPECTATE' };

export interface TableInfo {
  id: string;
  playerCount: number;
  playerNames: string[];
  inGame: boolean;
  gameType: GameType;
  spectatorCount: number;
  hasTakeoverSeat?: boolean;
  endingScore?: number;
  createdAt?: number;
}

// Spectator-specific state (sees played cards only, not hands)
export interface SpectatorGameState {
  gameType: GameType;
  phase: GamePhase;
  currentPlayer: number;
  currentTrick: TrickCard[];
  trickNumber: number;
  scores: number[];
  
  // Hearts-specific
  passDirection?: PassDirection;
  heartsBroken?: boolean;
  roundNumber?: number;
  cumulativeScores?: number[];
  pointCardsTaken?: Card[][] | null;
  roundScores?: number[]; // Round scores for floating animation
  
  // King-specific
  currentContract?: KingContract | null;
  selectorSeat?: number;
  trumpSuit?: string | null;
  gameNumber?: number;
  partyScores?: number[];
  lastTrickCards?: TrickCard[] | null;
  tricksTaken?: number[];
  contractHistory?: { selector: number; contract: KingContract }[];
}
