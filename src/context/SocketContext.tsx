import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { useGame } from './GameContext';
import type { Card, TrickCard, Player, ChatMessage, PassDirection, GamePhase } from '../types/game';
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

// Play the appropriate trick win sound based on cards in the trick
function playTrickWinSound(trick: TrickCard[]) {
  const hasQueenOfSpades = trick.some(t => t.card.suit === 'spades' && t.card.rank === 'Q');
  const hasHearts = trick.some(t => t.card.suit === 'hearts');
  
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

// Track if this is the first game start (for playing game start fanfare)
let isFirstRound = true;

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  createTable: (playerName: string) => void;
  joinTable: (tableId: string, playerName: string) => void;
  leaveTable: () => void;
  listTables: () => void;
  submitPass: (cards: Card[]) => void;
  playCard: (card: Card) => void;
  nextRound: () => void;
  rematch: (vote: boolean) => void;
  sendChatMessage: (text: string) => void;
  setTyping: (isTyping: boolean) => void;
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
    const socketUrl = import.meta.env.PROD ? window.location.origin : 'http://localhost:3000';
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
    newSocket.on('tableJoined', (data: { tableId: string; seat: number; players: Player[] }) => {
      dispatch({ type: 'JOIN_TABLE', payload: data });
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
      
      // Play trick win sound only for the winner
      const currentState = stateRef.current;
      if (data.winner === currentState.mySeat) {
        playTrickWinSound(data.lastTrick);
      }
    });

    newSocket.on('roundEnd', (data: { roundScores: number[]; cumulativeScores: number[]; moonShooter: number | null; gameOver: boolean; gameWinner: number | null; pointCardsTaken: Card[][] }) => {
      dispatch({ type: 'ROUND_END', payload: data });
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

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [dispatch]);

  const createTable = (playerName: string) => {
    socket?.emit('createTable', { playerName });
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

  const listTables = () => {
    socket?.emit('listTables');
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

  return (
    <SocketContext.Provider value={{
      socket,
      isConnected,
      createTable,
      joinTable,
      leaveTable,
      listTables,
      submitPass,
      playCard,
      nextRound,
      rematch,
      sendChatMessage,
      setTyping,
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
