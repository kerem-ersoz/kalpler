import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { useGame } from './GameContext';
import type { Card, TrickCard, Player, PassDirection, GamePhase, GameType, KingContract } from '../types/game';
import { playAssetSound, preloadSoundAssets } from '../utils/sounds';

// Preload sound assets on module load
preloadSoundAssets();

// Shared AudioContext for programmatic sounds (reuse to avoid creating too many)
let sharedAudioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!sharedAudioContext) {
      sharedAudioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    // Resume if suspended (browser autoplay policy)
    if (sharedAudioContext.state === 'suspended') {
      sharedAudioContext.resume();
    }
    return sharedAudioContext;
  } catch (e) {
    console.warn('Could not create AudioContext:', e);
    return null;
  }
}

// Programmatic fallback for timer warning beep
function playTimerWarningSoundFallback() {
  const audioContext = getAudioContext();
  if (!audioContext) return;
  
  try {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 880; // A5 note
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
  } catch (e) {
    console.warn('Could not play timer warning sound:', e);
  }
}

// Play timer warning - tries asset first, falls back to programmatic
function playTimerWarningSound() {
  playAssetSound('timerWarning', 0.5).then(played => {
    if (!played) playTimerWarningSoundFallback();
  });
}

// Programmatic fallback for card flip sound
function playCardFlipSoundFallback() {
  const audioContext = getAudioContext();
  if (!audioContext) return;
  
  try {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 220; // Lower pitch for card flip
    oscillator.type = 'triangle';
    
    gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.1);
  } catch (e) {
    console.warn('Could not play card flip sound:', e);
  }
}

// Play card flip - tries asset first, falls back to programmatic
export function playCardFlipSound() {
  playAssetSound('cardFlip', 0.3).then(played => {
    if (!played) playCardFlipSoundFallback();
  });
}

// Programmatic fallback for point counter sound (used in round end animation)
function playPointCounterSoundFallback() {
  const audioContext = getAudioContext();
  if (!audioContext) return;
  
  try {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // Quick "tick" sound - higher pitched than card flip, shorter
    oscillator.frequency.value = 600;
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.12, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.08);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.08);
  } catch (e) {
    console.warn('Could not play point counter sound:', e);
  }
}

// Play point counter sound - tries asset first, falls back to programmatic
export function playPointCounterSound() {
  playAssetSound('pointCounter', 0.3).then(played => {
    if (!played) playPointCounterSoundFallback();
  });
}

// Programmatic fallback for card flick sound
function playCardFlickSoundFallback() {
  const audioContext = getAudioContext();
  if (!audioContext) return;
  
  try {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // Higher pitch, shorter duration for a "flick" sound
    oscillator.frequency.value = 800;
    oscillator.type = 'square';
    
    gainNode.gain.setValueAtTime(0.12, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.05);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.05);
  } catch (e) {
    console.warn('Could not play card flick sound:', e);
  }
}

// Play card flick - tries asset first, falls back to programmatic
export function playCardFlickSound() {
  playAssetSound('cardFlick', 0.3).then(played => {
    if (!played) playCardFlickSoundFallback();
  });
}

// Programmatic fallback for clean trick sound
function playCleanTrickSoundFallback() {
  const audioContext = getAudioContext();
  if (!audioContext) return;
  
  try {
    // Play a pleasant ascending two-note chime
    const osc1 = audioContext.createOscillator();
    const osc2 = audioContext.createOscillator();
    const gain1 = audioContext.createGain();
    const gain2 = audioContext.createGain();
    
    osc1.connect(gain1);
    osc2.connect(gain2);
    gain1.connect(audioContext.destination);
    gain2.connect(audioContext.destination);
    
    osc1.frequency.value = 523; // C5
    osc2.frequency.value = 659; // E5
    osc1.type = 'sine';
    osc2.type = 'sine';
    
    const now = audioContext.currentTime;
    gain1.gain.setValueAtTime(0.2, now);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
    gain2.gain.setValueAtTime(0.0001, now);
    gain2.gain.setValueAtTime(0.2, now + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    
    osc1.start(now);
    osc1.stop(now + 0.2);
    osc2.start(now + 0.1);
    osc2.stop(now + 0.3);
  } catch (e) {
    console.warn('Could not play clean trick sound:', e);
  }
}

// Programmatic fallback for hearts trick sound
function playHeartsTrickSoundFallback() {
  const audioContext = getAudioContext();
  if (!audioContext) return;
  
  try {
    // Play descending minor notes - slightly ominous
    const osc1 = audioContext.createOscillator();
    const osc2 = audioContext.createOscillator();
    const gain1 = audioContext.createGain();
    const gain2 = audioContext.createGain();
    
    osc1.connect(gain1);
    osc2.connect(gain2);
    gain1.connect(audioContext.destination);
    gain2.connect(audioContext.destination);
    
    osc1.frequency.value = 440; // A4
    osc2.frequency.value = 349; // F4 (minor third below)
    osc1.type = 'triangle';
    osc2.type = 'triangle';
    
    const now = audioContext.currentTime;
    gain1.gain.setValueAtTime(0.2, now);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    gain2.gain.setValueAtTime(0.0001, now);
    gain2.gain.setValueAtTime(0.2, now + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
    
    osc1.start(now);
    osc1.stop(now + 0.15);
    osc2.start(now + 0.1);
    osc2.stop(now + 0.25);
  } catch (e) {
    console.warn('Could not play hearts trick sound:', e);
  }
}

// Programmatic fallback for Queen of Spades trick sound
function playQueenOfSpadesTrickSoundFallback() {
  const audioContext = getAudioContext();
  if (!audioContext) return;
  
  try {
    // Play a dramatic low chord
    const osc1 = audioContext.createOscillator();
    const osc2 = audioContext.createOscillator();
    const osc3 = audioContext.createOscillator();
    const gain = audioContext.createGain();
    
    osc1.connect(gain);
    osc2.connect(gain);
    osc3.connect(gain);
    gain.connect(audioContext.destination);
    
    osc1.frequency.value = 147; // D3
    osc2.frequency.value = 175; // F3
    osc3.frequency.value = 220; // A3 (D minor chord)
    osc1.type = 'sawtooth';
    osc2.type = 'sawtooth';
    osc3.type = 'sawtooth';
    
    const now = audioContext.currentTime;
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
    
    osc1.start(now);
    osc2.start(now);
    osc3.start(now);
    osc1.stop(now + 0.5);
    osc2.stop(now + 0.5);
    osc3.stop(now + 0.5);
  } catch (e) {
    console.warn('Could not play Queen of Spades trick sound:', e);
  }
}

// Play the appropriate trick win sound based on cards in the trick and game context
interface TrickSoundContext {
  gameType: 'hearts' | 'king';
  contract?: { type: string; name?: string; trumpSuit?: string } | null;
}

function playTrickWinSound(trick: TrickCard[], context?: TrickSoundContext) {
  const hasQueenOfSpades = trick.some(t => t.card.suit === 'spades' && t.card.rank === 'Q');
  const hasHearts = trick.some(t => t.card.suit === 'hearts');
  const hasKings = trick.some(t => t.card.rank === 'K');
  const hasJacks = trick.some(t => t.card.rank === 'J');
  const hasQueens = trick.some(t => t.card.rank === 'Q');
  const hasKingOfHearts = trick.some(t => t.card.suit === 'hearts' && t.card.rank === 'K');
  
  // King game - check contract type for appropriate sound
  if (context?.gameType === 'king' && context.contract) {
    const contractName = context.contract.name || context.contract.type;
    
    // Trump contracts - always play clean sound (positive to win tricks)
    if (context.contract.type === 'trump') {
      playAssetSound('trickWinClean', 0.5).then(played => {
        if (!played) playCleanTrickSoundFallback();
      });
      return;
    }
    
    // Penalty contracts - check if trick contains penalty cards
    let hasPenalty = false;
    switch (contractName) {
      case 'el':
        // All tricks are penalty in 'el' contract
        hasPenalty = true;
        break;
      case 'kupa':
        hasPenalty = hasHearts;
        break;
      case 'erkek':
        hasPenalty = hasKings || hasJacks;
        break;
      case 'kiz':
        hasPenalty = hasQueens;
        break;
      case 'rifki':
        // King of Hearts in rifki gets the dramatic queen sound
        if (hasKingOfHearts) {
          playAssetSound('trickWinQueen', 0.5).then(played => {
            if (!played) playQueenOfSpadesTrickSoundFallback();
          });
          return;
        }
        hasPenalty = false; // Other tricks are clean
        break;
      case 'sonIki':
        // Son İki - penalty only matters for tricks 12 and 13
        // For now, treat all tricks as clean unless it's a late trick
        hasPenalty = false;
        break;
    }
    
    if (hasPenalty) {
      // For penalty contracts in King, play the points sound
      playAssetSound('trickWinPoints', 0.5).then(played => {
        if (!played) playHeartsTrickSoundFallback();
      });
    } else {
      playAssetSound('trickWinClean', 0.5).then(played => {
        if (!played) playCleanTrickSoundFallback();
      });
    }
    return;
  }
  
  // Hearts game (default behavior)
  if (hasQueenOfSpades) {
    playAssetSound('trickWinQueen', 0.5).then(played => {
      if (!played) playQueenOfSpadesTrickSoundFallback();
    });
  } else if (hasHearts) {
    playAssetSound('trickWinPoints', 0.5).then(played => {
      if (!played) playHeartsTrickSoundFallback();
    });
  } else {
    playAssetSound('trickWinClean', 0.5).then(played => {
      if (!played) playCleanTrickSoundFallback();
    });
  }
}

// Programmatic fallback for game start fanfare
function playGameStartSoundFallback() {
  const audioContext = getAudioContext();
  if (!audioContext) return;
  
  try {
    // Play a bright ascending major arpeggio (C-E-G-C)
    const notes = [262, 330, 392, 523]; // C4, E4, G4, C5
    const now = audioContext.currentTime;
    
    notes.forEach((freq, i) => {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      
      osc.connect(gain);
      gain.connect(audioContext.destination);
      
      osc.frequency.value = freq;
      osc.type = 'sine';
      
      const startTime = now + i * 0.1;
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.setValueAtTime(0.2, startTime);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.3);
      
      osc.start(startTime);
      osc.stop(startTime + 0.3);
    });
  } catch (e) {
    console.warn('Could not play game start sound:', e);
  }
}

// Play game start - tries asset first, falls back to programmatic
function playGameStartSound() {
  playAssetSound('gameStart', 0.5).then(played => {
    if (!played) playGameStartSoundFallback();
  });
}

// Programmatic fallback for card dealing sound
function playCardDealingSoundFallback() {
  const audioContext = getAudioContext();
  if (!audioContext) return;
  
  try {
    const now = audioContext.currentTime;
    // Simulate dealing 13 cards with quick "flick" sounds
    for (let i = 0; i < 13; i++) {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const filter = audioContext.createBiquadFilter();
      
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(audioContext.destination);
      
      // Use noise-like high frequency with filter for card sound
      osc.frequency.value = 600 + Math.random() * 200;
      osc.type = 'square';
      filter.type = 'highpass';
      filter.frequency.value = 400;
      
      const startTime = now + i * 0.06; // 60ms between each card
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.setValueAtTime(0.08, startTime);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.04);
      
      osc.start(startTime);
      osc.stop(startTime + 0.04);
    }
  } catch (e) {
    console.warn('Could not play card dealing sound:', e);
  }
}

// Play card dealing - tries asset first, falls back to programmatic
function playCardDealingSound() {
  playAssetSound('cardDeal', 0.5).then(played => {
    if (!played) playCardDealingSoundFallback();
  });
}

// Programmatic fallback for victory fanfare
function playVictorySoundFallback() {
  const audioContext = getAudioContext();
  if (!audioContext) return;
  
  try {
    const now = audioContext.currentTime;
    // Triumphant ascending fanfare: C-E-G-C (higher octave) with flourish
    const notes = [
      { freq: 262, time: 0, duration: 0.15 },      // C4
      { freq: 330, time: 0.12, duration: 0.15 },   // E4
      { freq: 392, time: 0.24, duration: 0.15 },   // G4
      { freq: 523, time: 0.36, duration: 0.4 },    // C5 (held)
      { freq: 659, time: 0.5, duration: 0.3 },     // E5
      { freq: 784, time: 0.65, duration: 0.5 },    // G5 (finale)
    ];
    
    notes.forEach(({ freq, time, duration }) => {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      
      osc.connect(gain);
      gain.connect(audioContext.destination);
      
      osc.frequency.value = freq;
      osc.type = 'sine';
      
      const startTime = now + time;
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.linearRampToValueAtTime(0.25, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
      
      osc.start(startTime);
      osc.stop(startTime + duration);
    });
  } catch (e) {
    console.warn('Could not play victory sound:', e);
  }
}

// Play victory sound - tries asset first, falls back to programmatic
function playVictorySound() {
  playAssetSound('victory', 0.5).then(played => {
    if (!played) playVictorySoundFallback();
  });
}

// Programmatic fallback for defeat sound
function playDefeatSoundFallback() {
  const audioContext = getAudioContext();
  if (!audioContext) return;
  
  try {
    const now = audioContext.currentTime;
    // Descending minor notes: sad "wah wah" sound
    const notes = [
      { freq: 392, time: 0, duration: 0.3 },      // G4
      { freq: 349, time: 0.25, duration: 0.3 },   // F4
      { freq: 330, time: 0.5, duration: 0.3 },    // E4
      { freq: 262, time: 0.75, duration: 0.5 },   // C4 (low ending)
    ];
    
    notes.forEach(({ freq, time, duration }) => {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      
      osc.connect(gain);
      gain.connect(audioContext.destination);
      
      osc.frequency.value = freq;
      osc.type = 'triangle'; // Softer, sadder tone
      
      const startTime = now + time;
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.linearRampToValueAtTime(0.15, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
      
      osc.start(startTime);
      osc.stop(startTime + duration);
    });
  } catch (e) {
    console.warn('Could not play defeat sound:', e);
  }
}

// Play defeat sound - tries asset first, falls back to programmatic
function playDefeatSound() {
  playAssetSound('defeat', 0.5).then(played => {
    if (!played) playDefeatSoundFallback();
  });
}

// Programmatic fallback for moon shot sound (dramatic fanfare)
function playMoonShotSoundFallback() {
  const audioContext = getAudioContext();
  if (!audioContext) return;
  
  try {
    const now = audioContext.currentTime;
    // Triumphant ascending arpeggio with a flourish
    const notes = [
      { freq: 262, time: 0, duration: 0.15 },     // C4
      { freq: 330, time: 0.1, duration: 0.15 },   // E4
      { freq: 392, time: 0.2, duration: 0.15 },   // G4
      { freq: 523, time: 0.3, duration: 0.3 },    // C5
      { freq: 659, time: 0.5, duration: 0.4 },    // E5
      { freq: 784, time: 0.7, duration: 0.6 },    // G5 (held)
    ];
    
    notes.forEach(({ freq, time, duration }) => {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      
      osc.connect(gain);
      gain.connect(audioContext.destination);
      
      osc.frequency.value = freq;
      osc.type = 'triangle';
      
      const startTime = now + time;
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.linearRampToValueAtTime(0.2, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
      
      osc.start(startTime);
      osc.stop(startTime + duration);
    });
  } catch (e) {
    console.warn('Could not play moon shot sound:', e);
  }
}

// Play moon shot sound - tries asset first, falls back to programmatic
export function playMoonShotSound() {
  playAssetSound('moonShot', 0.6).then(played => {
    if (!played) playMoonShotSoundFallback();
  });
}

// Track if this is the first game start (for playing game start fanfare)
let isFirstRound = true;

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  createTable: (playerName: string, gameType?: GameType, options?: { endingScore?: number }) => void;
  joinTable: (tableId: string, playerName: string) => void;
  leaveTable: () => void;
  listTables: (includeInProgress?: boolean) => void;
  spectateTable: (tableId: string, playerName?: string) => void;
  leaveSpectate: () => void;
  submitPass: (cards: Card[]) => void;
  playCard: (card: Card) => void;
  nextRound: () => void;
  rematch: (vote: boolean) => void;
  sendChatMessage: (text: string) => void;
  setTyping: (isTyping: boolean) => void;
  // King-specific
  selectContract: (contractType: string, trumpSuit?: string) => void;
  // Spades-specific
  submitBid: (bid: number | 'nil' | 'blind_nil') => void;
}

const SocketContext = createContext<SocketContextType | null>(null);

export function SocketProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const { state, dispatch } = useGame();
  
  // Use ref to track current state for event handlers
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    // In production, use VITE_SOCKET_URL env var (for separate backend), fallback to window.location.origin
    // In development, use localhost:3000
    const socketUrl = import.meta.env.PROD 
      ? (import.meta.env.VITE_SOCKET_URL || window.location.origin)
      : 'http://localhost:3000';
    const newSocket = io(socketUrl);
    
    newSocket.on('connect', () => {
      setIsConnected(true);
      dispatch({ type: 'SET_CONNECTION_STATUS', payload: 'connected' });
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
      dispatch({ type: 'SET_CONNECTION_STATUS', payload: 'disconnected' });
    });

    newSocket.on('error', (data: { message: string }) => {
      console.error('Socket error:', data.message);
    });

    // Table events
    newSocket.on('tableJoined', (data: { tableId: string; seat: number; players: Player[]; gameType?: GameType }) => {
      dispatch({ type: 'JOIN_TABLE', payload: data });
    });

    newSocket.on('spectateJoined', (data: { tableId: string; players: Player[]; gameType: GameType; gameState: import('../types/game').SpectatorGameState }) => {
      dispatch({ type: 'SPECTATE_JOIN', payload: data });
    });

    newSocket.on('spectatorUpdate', (data: { gameState?: import('../types/game').SpectatorGameState; spectatorCount?: number }) => {
      if (stateRef.current.isSpectating && data.gameState) {
        dispatch({ type: 'SPECTATE_UPDATE', payload: data });
      }
    });

    newSocket.on('updatePlayers', (data: { players: Player[] }) => {
      dispatch({ type: 'UPDATE_PLAYERS', payload: data.players });
    });

    newSocket.on('tableClosed', () => {
      dispatch({ type: 'LEAVE_TABLE' });
    });

    // Game events
    newSocket.on('startGame', (data: { hand: Card[]; passDirection: PassDirection; phase: GamePhase; currentPlayer: number }) => {
      dispatch({ type: 'START_GAME', payload: data });
      // Play fanfare only on first round of a fresh game, then dealing sound
      if (isFirstRound) {
        playGameStartSound();
        isFirstRound = false;
        // Delay dealing sound to play after fanfare
        setTimeout(() => playCardDealingSound(), 500);
      } else {
        // Just play dealing sound on subsequent rounds
        playCardDealingSound();
      }
    });

    newSocket.on('updateGame', (data: Partial<import('../types/game').GameState>) => {
      dispatch({ type: 'UPDATE_GAME', payload: data });
    });

    newSocket.on('passSubmitted', () => {
      dispatch({ type: 'PASS_SUBMITTED' });
    });

    newSocket.on('cardsReceived', (data: { hand: Card[]; phase: GamePhase; currentPlayer: number; cardsPassed?: Card[]; cardsReceived?: Card[] }) => {
      dispatch({ type: 'CARDS_RECEIVED', payload: data });
    });

    newSocket.on('cardPlayed', (data: { seat: number; card: Card; currentTrick: TrickCard[]; trickComplete?: boolean; winner?: number | null }) => {
      dispatch({ type: 'CARD_PLAYED', payload: data });
      playCardFlickSound();
    });

    newSocket.on('trickEnd', (data: { winner: number; points: number; lastTrick: TrickCard[] }) => {
      dispatch({ type: 'TRICK_END', payload: data });
      
      // Play trick win sound only for the winner (not in Spades)
      const currentState = stateRef.current;
      if (data.winner === currentState.mySeat && currentState.gameType !== 'spades') {
        const context: TrickSoundContext = {
          gameType: currentState.gameType as 'hearts' | 'king',
          contract: currentState.kingState?.selectedContract || null,
        };
        playTrickWinSound(data.lastTrick, context);
      }
    });

    newSocket.on('roundEnd', (data: { roundScores: number[]; cumulativeScores: number[]; moonShooter: number | null; gameOver: boolean; gameWinner: number | null; pointCardsTaken: Card[][] }) => {
      dispatch({ type: 'ROUND_END', payload: data });
      
      // Play moon shot sound if someone shot the moon
      if (data.moonShooter !== null) {
        // Delay slightly to sync with the animation
        setTimeout(() => {
          playMoonShotSound();
        }, 1500);
      }
    });

    newSocket.on('gameEnd', (data: { winner: number; finalScores: number[] }) => {
      dispatch({ type: 'GAME_END', payload: data });
      // Reset flag so next game gets the fanfare
      isFirstRound = true;
      
      // Play victory or defeat sound based on whether this player tied for lowest score
      const currentState = stateRef.current;
      const lowestScore = Math.min(...data.finalScores);
      if (currentState.mySeat !== null) {
        const myScore = data.finalScores[currentState.mySeat];
        if (myScore === lowestScore) {
          playVictorySound();
        } else {
          playDefeatSound();
        }
      }
    });

    newSocket.on('turnStart', (data: { player: number; timeoutAt: number }) => {
      dispatch({ type: 'TURN_START', payload: data });
    });

    newSocket.on('passTimerStart', (data: { timeoutAt: number }) => {
      dispatch({ type: 'PASS_TIMER_START', payload: data });
    });

    newSocket.on('selectTimerStart', (data: { timeoutAt: number; selectorSeat: number }) => {
      dispatch({ type: 'CONTRACT_TIMER_START', payload: { timeoutAt: data.timeoutAt } });
    });

    newSocket.on('bidTimerStart', (data: { player: number; timeoutAt: number }) => {
      dispatch({ type: 'BIDDING_TIMER_START', payload: { timeoutAt: data.timeoutAt } });
    });

    newSocket.on('autoPlay', (data: { card: Card }) => {
      console.log('Auto-played card:', data.card);
    });

    newSocket.on('autoPassSubmitted', (data: { cards: Card[] }) => {
      console.log('Auto-pass submitted:', data.cards);
      dispatch({ type: 'PASS_SUBMITTED' });
    });

    // Timer warning - play sound when 10 seconds remaining
    newSocket.on('timerWarning', () => {
      playTimerWarningSound();
    });

    // Rematch events
    newSocket.on('rematchStatus', (data: { votes: Record<number, boolean> }) => {
      dispatch({ type: 'REMATCH_STATUS', payload: data.votes });
    });

    // King-specific events
    newSocket.on('contractSelectionStart', (data: { 
      selector: number; 
      availableContracts: KingContract[]; 
      gameNumber: number; 
      partyNumber: number;
      hand: Card[];
    }) => {
      // First update hand, then start contract selection
      dispatch({ type: 'UPDATE_GAME', payload: { hand: data.hand } });
      dispatch({ 
        type: 'CONTRACT_SELECTION_START', 
        payload: {
          selector: data.selector,
          availableContracts: data.availableContracts,
          gameNumber: data.gameNumber,
          partyNumber: data.partyNumber,
        }
      });
      // Play dealing sound on first game
      if (data.gameNumber === 1 && isFirstRound) {
        // Just play dealing sound, game start sound plays after contract is selected
        playCardDealingSound();
      } else {
        playCardDealingSound();
      }
    });

    newSocket.on('contractSelected', (data: { 
      contract: KingContract;
      gameNumber?: number;
    }) => {
      dispatch({ type: 'CONTRACT_SELECTED', payload: data });
      // Play game start sound only after the very first contract is selected
      if (data.gameNumber === 1 && isFirstRound) {
        playGameStartSound();
        isFirstRound = false;
      }
    });

    newSocket.on('kingGameStart', (data: { 
      currentPlayer: number; 
      legalCards: Card[];
      contract: KingContract;
    }) => {
      dispatch({ 
        type: 'UPDATE_GAME', 
        payload: { 
          phase: 'playing', 
          currentPlayer: data.currentPlayer,
          legalCards: data.legalCards,
        } 
      });
      dispatch({ type: 'CONTRACT_SELECTED', payload: { contract: data.contract } });
    });

    newSocket.on('kingRoundEnd', (data: { 
      roundScores: number[]; 
      cumulativeScores: number[]; 
      gameOver: boolean;
      partyScores?: number[];
      pointCardsTaken: Card[][];
    }) => {
      dispatch({ type: 'ROUND_END', payload: { ...data, moonShooter: null, gameWinner: null } });
      if (data.partyScores) {
        dispatch({ type: 'UPDATE_KING_STATE', payload: { partyScores: data.partyScores } });
      }
    });

    newSocket.on('kingGameEnd', (data: {
      gameScores: number[];
      cumulativeScores: number[];
      partyOver: boolean;
      winners?: number[];
      penaltyCardsTaken: Card[][];
      contract: { type: string; name?: string; trumpSuit?: string };
      gameNumber: number;
    }) => {
      dispatch({ 
        type: 'ROUND_END', 
        payload: { 
          roundScores: data.gameScores,
          cumulativeScores: data.cumulativeScores,
          pointCardsTaken: data.penaltyCardsTaken,
          gameOver: data.partyOver,
          moonShooter: null,
          gameWinner: data.winners?.[0] ?? null,
        } 
      });
      dispatch({ 
        type: 'UPDATE_KING_STATE', 
        payload: { 
          gameNumber: data.gameNumber,
          selectedContract: {
            type: data.contract.type as KingContract['type'],
            trumpSuit: data.contract.trumpSuit as KingContract['trumpSuit'],
            name: data.contract.name,
            label: data.contract.name || data.contract.type,
          },
        } 
      });
    });

    // Spades-specific events
    newSocket.on('biddingStart', (data: {
      hand: Card[];
      currentBidder: number;
      roundNumber: number;
    }) => {
      dispatch({ type: 'START_GAME', payload: { 
        hand: data.hand, 
        passDirection: 'hold', 
        phase: 'bidding', 
        currentPlayer: data.currentBidder 
      }});
      dispatch({ type: 'BIDDING_START', payload: { currentBidder: data.currentBidder } });
      // Play dealing sound on all rounds
      playCardDealingSound();
    });

    newSocket.on('bidSubmitted', (data: {
      seat: number;
      bid: number | 'nil' | 'blind_nil';
      bids: (number | 'nil' | 'blind_nil' | null)[];
      nextBidder: number | null;
    }) => {
      dispatch({ type: 'BID_SUBMITTED', payload: data });
    });

    newSocket.on('bidsUpdate', (data: {
      bids: (number | 'nil' | 'blind_nil' | null)[];
      currentBidder: number | null;
      teamBids?: number[];
    }) => {
      dispatch({ type: 'BID_SUBMITTED', payload: {
        seat: data.currentBidder ?? 0,
        bid: 0,
        bids: data.bids,
        nextBidder: data.currentBidder,
      }});
      // Update team bids if provided
      if (data.teamBids) {
        dispatch({ type: 'UPDATE_SPADES_STATE', payload: {
          teamBids: data.teamBids as [number, number],
        }});
      }
    });

    newSocket.on('spadesGameStart', (data: {
      currentPlayer: number;
      legalCards: Card[];
      bids: (number | 'nil' | 'blind_nil' | null)[];
      teamBids: number[];
      cumulativeScores: number[];
    }) => {
      console.log('spadesGameStart received:', data);
      dispatch({ type: 'UPDATE_GAME', payload: {
        phase: 'playing',
        currentPlayer: data.currentPlayer,
        legalCards: data.legalCards,
        cumulativeScores: data.cumulativeScores,
      }});
      dispatch({ type: 'UPDATE_SPADES_STATE', payload: {
        bids: data.bids,
        teamBids: data.teamBids as [number, number],
      }});
      // Play game start sound only on first round
      if (isFirstRound) {
        playGameStartSound();
        isFirstRound = false;
      }
    });

    newSocket.on('spadesRoundEnd', (data: {
      roundScores: number[];
      teamScores: number[];
      bags: number[];
      tricksTaken: number[];
      bids: (number | 'nil' | 'blind_nil' | null)[];
      gameOver: boolean;
      winners?: number[];
      roundNumber: number;
    }) => {
      dispatch({ type: 'ROUND_END', payload: {
        roundScores: data.roundScores,
        cumulativeScores: data.teamScores,
        pointCardsTaken: [[], [], [], []],
        moonShooter: null,
        gameOver: data.gameOver,
        gameWinner: data.winners?.[0] ?? null,
      }});
      dispatch({ type: 'UPDATE_SPADES_STATE', payload: {
        bags: data.bags as [number, number],
        tricksTakenBySeat: data.tricksTaken,
      }});
      // Reset flag if game over
      if (data.gameOver) {
        isFirstRound = true;
        // Play victory or defeat sound
        const currentState = stateRef.current;
        if (currentState.mySeat !== null) {
          const myTeam = currentState.mySeat % 2;
          const otherTeam = 1 - myTeam;
          if (data.teamScores[myTeam] > data.teamScores[otherTeam]) {
            playVictorySound();
          } else {
            playDefeatSound();
          }
        }
      }
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [dispatch]);

  const createTable = (playerName: string, gameType: GameType = 'hearts', options: { endingScore?: number } = {}) => {
    socket?.emit('createTable', { playerName, gameType, options });
  };

  const joinTable = (tableId: string, playerName: string) => {
    socket?.emit('joinTable', { tableId, playerName });
  };

  const leaveTable = () => {
    socket?.emit('leaveTable');
    dispatch({ type: 'LEAVE_TABLE' });
    // Reset flag so next game gets the fanfare
    isFirstRound = true;
  };

  const listTables = (includeInProgress = false) => {
    socket?.emit('listTables', { includeInProgress });
  };

  const spectateTable = (tableId: string, playerName?: string) => {
    socket?.emit('spectateTable', { tableId, playerName });
  };

  const leaveSpectate = () => {
    socket?.emit('leaveSpectate');
    dispatch({ type: 'LEAVE_SPECTATE' });
  };

  const submitPass = (cards: Card[]) => {
    socket?.emit('submitPass', { cards });
  };

  const playCard = (card: Card) => {
    socket?.emit('playCard', { card });
  };

  const nextRound = () => {
    socket?.emit('nextRound');
  };

  const rematch = (vote: boolean) => {
    socket?.emit('rematch', { vote });
  };

  const sendChatMessage = (text: string) => {
    socket?.emit('chatMessage', { text });
  };

  const setTyping = (isTyping: boolean) => {
    socket?.emit('typing', { isTyping });
  };

  // King-specific
  const selectContract = (contractType: string, trumpSuit?: string) => {
    // If it's 'trump', send as trump type; otherwise it's a penalty contract name
    if (contractType === 'trump') {
      socket?.emit('selectContract', { contractType: 'trump', trumpSuit });
    } else {
      socket?.emit('selectContract', { contractType: 'penalty', contractName: contractType });
    }
  };

  // Spades-specific
  const submitBid = (bid: number | 'nil' | 'blind_nil') => {
    socket?.emit('submitBid', { bid });
  };

  return (
    <SocketContext.Provider value={{
      socket,
      isConnected,
      createTable,
      joinTable,
      leaveTable,
      listTables,
      spectateTable,
      leaveSpectate,
      submitPass,
      playCard,
      nextRound,
      rematch,
      sendChatMessage,
      setTyping,
      selectContract,
      submitBid,
    }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
}
