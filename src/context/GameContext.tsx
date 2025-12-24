import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react';
import type { GameState, GameAction, Card } from '../types/game';

const initialState: GameState = {
  connectionStatus: 'connecting',
  tableId: null,
  mySeat: null,
  players: [],
  phase: 'waiting',
  roundNumber: 1,
  hand: [],
  currentTrick: [],
  currentPlayer: 0,
  isMyTurn: false,
  legalCards: [],
  heartsBroken: false,
  passDirection: null,
  passSubmitted: false,
  selectedPassCards: [],
  roundScores: [0, 0, 0, 0],
  cumulativeScores: [0, 0, 0, 0],
  pointCardsTaken: [[], [], [], []],
  lastTrick: null,
  lastTrickWinner: null,
  previousLastTrick: null,
  trickAnimation: null,
  pendingTrickAnimation: null,
  passAnimation: null,
  dealingAnimation: false,
  animatingCards: [],
  pendingReceivedCards: [],
  lastPlayedCard: null,
  messages: [],
  typingPlayers: [],
  rematchVotes: {},
  turnTimeoutAt: null,
  passTimeoutAt: null,
  moonShooter: null,
};

function cardEquals(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'SET_CONNECTION_STATUS':
      return { ...state, connectionStatus: action.payload };
    
    case 'JOIN_TABLE':
      return {
        ...state,
        tableId: action.payload.tableId,
        mySeat: action.payload.seat,
        players: action.payload.players,
        phase: 'waiting',
      };
    
    case 'LEAVE_TABLE':
      return { ...initialState, connectionStatus: state.connectionStatus };
    
    case 'UPDATE_PLAYERS':
      return { ...state, players: action.payload };
    
    case 'START_GAME':
      return {
        ...state,
        hand: action.payload.hand,
        passDirection: action.payload.passDirection,
        phase: action.payload.phase,
        currentPlayer: action.payload.currentPlayer,
        isMyTurn: action.payload.phase === 'playing' && action.payload.currentPlayer === state.mySeat,
        selectedPassCards: [],
        passSubmitted: false,
        currentTrick: [],
        roundScores: [0, 0, 0, 0],
        pointCardsTaken: [[], [], [], []],
        lastTrick: null,
        heartsBroken: false,
        rematchVotes: {},
        passTimeoutAt: null,
        dealingAnimation: true, // Start dealing animation
        moonShooter: null, // Clear moon shooter from previous round
      };
    
    case 'UPDATE_GAME': {
      // Don't let updateGame override currentTrick/lastTrick during animation
      const payload = action.payload;
      if (state.trickAnimation) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { currentTrick: _ct, lastTrick: _lt, ...safePayload } = payload;
        return {
          ...state,
          ...safePayload,
          isMyTurn: payload.phase === 'playing' && 
            payload.currentPlayer === state.mySeat,
        };
      }
      return {
        ...state,
        ...payload,
        isMyTurn: payload.phase === 'playing' && 
          payload.currentPlayer === state.mySeat,
      };
    }
    
    case 'CARDS_RECEIVED': {
      // Store received cards separately - they won't be shown in hand until animation completes
      const receivedCards = action.payload.cardsReceived || [];
      return {
        ...state,
        hand: action.payload.hand,
        phase: action.payload.phase,
        currentPlayer: action.payload.currentPlayer,
        isMyTurn: action.payload.phase === 'playing' && action.payload.currentPlayer === state.mySeat,
        // Store pass info for animation
        passAnimation: action.payload.cardsPassed && action.payload.cardsReceived ? {
          active: true,
          cardsPassed: action.payload.cardsPassed,
          cardsReceived: action.payload.cardsReceived,
          targetDirection: state.passDirection || 'left',
          phase: 'passing',
        } : null,
        // Track the received cards - these will be hidden from hand during animation
        pendingReceivedCards: receivedCards,
        animatingCards: receivedCards,
      };
    }
    
    case 'SET_PASS_ANIMATION':
      return {
        ...state,
        passAnimation: action.payload,
        // Clear animation state when done (when payload is null)
        ...(action.payload === null ? { 
          selectedPassCards: [], 
          passSubmitted: false,
          animatingCards: [],
          pendingReceivedCards: [], // Cards are now visible in hand
        } : {}),
      };
    
    case 'SET_DEALING_ANIMATION':
      return {
        ...state,
        dealingAnimation: action.payload,
      };
    
    case 'SELECT_PASS_CARD': {
      const card = action.payload;
      const isSelected = state.selectedPassCards.some(c => cardEquals(c, card));
      
      if (isSelected) {
        return {
          ...state,
          selectedPassCards: state.selectedPassCards.filter(c => !cardEquals(c, card)),
        };
      } else if (state.selectedPassCards.length < 3) {
        return {
          ...state,
          selectedPassCards: [...state.selectedPassCards, card],
        };
      }
      return state;
    }
    
    case 'PASS_SUBMITTED':
      return { ...state, passSubmitted: true };
    
    case 'CARD_PLAYED': {
      const newState = {
        ...state,
        currentTrick: action.payload.currentTrick,
        hand: state.mySeat === action.payload.seat
          ? state.hand.filter(c => !cardEquals(c, action.payload.card))
          : state.hand,
        lastPlayedCard: { seat: action.payload.seat, card: action.payload.card },
      };
      
      // If trick is complete, mark it but don't start animation yet
      // This allows the 4th card slide-in animation to play first
      if (action.payload.trickComplete && action.payload.winner !== undefined) {
        return {
          ...newState,
          lastTrickWinner: action.payload.winner,
          // Mark that trick animation should start (handled by useEffect in Game.tsx)
          pendingTrickAnimation: {
            trick: action.payload.currentTrick,
            winner: action.payload.winner,
          }
        };
      }
      
      return newState;
    }
    
    case 'TRICK_END':
      return {
        ...state,
        // Store previous lastTrick before replacing (for display during animation)
        previousLastTrick: state.lastTrick,
        lastTrick: action.payload.lastTrick,
        lastTrickWinner: action.payload.winner,
      };
    
    case 'SET_TRICK_ANIMATION':
      return {
        ...state,
        trickAnimation: action.payload,
        // Clear pending when animation starts
        ...(action.payload !== null ? { pendingTrickAnimation: null } : {}),
        // Clear currentTrick and lastPlayedCard when animation ends
        ...(action.payload === null ? { currentTrick: [], lastPlayedCard: null } : {}),
      };
    
    case 'ROUND_END':
      return {
        ...state,
        phase: action.payload.gameOver ? 'gameEnd' : 'roundEnd',
        roundScores: action.payload.roundScores,
        cumulativeScores: action.payload.cumulativeScores,
        pointCardsTaken: action.payload.pointCardsTaken,
        currentTrick: [],
        lastPlayedCard: null,
        moonShooter: action.payload.moonShooter,
      };
    
    case 'GAME_END':
      return {
        ...state,
        phase: 'gameEnd',
        cumulativeScores: action.payload.finalScores,
      };
    
    case 'TURN_START':
      return {
        ...state,
        currentPlayer: action.payload.player,
        isMyTurn: action.payload.player === state.mySeat,
        turnTimeoutAt: action.payload.timeoutAt,
      };
    
    case 'PASS_TIMER_START':
      return {
        ...state,
        passTimeoutAt: action.payload.timeoutAt,
      };
    
    case 'ADD_CHAT_MESSAGE':
      return {
        ...state,
        messages: [...state.messages, action.payload],
      };
    
    case 'UPDATE_TYPING':
      return { ...state, typingPlayers: action.payload };
    
    case 'REMATCH_STATUS':
      return { ...state, rematchVotes: action.payload };
    
    case 'RESET':
      return { ...initialState, connectionStatus: state.connectionStatus };
    
    default:
      return state;
  }
}

interface GameContextType {
  state: GameState;
  dispatch: Dispatch<GameAction>;
}

const GameContext = createContext<GameContextType | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(gameReducer, initialState);
  
  return (
    <GameContext.Provider value={{ state, dispatch }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return context;
}
