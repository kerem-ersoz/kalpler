import { useState, useEffect, useMemo, useRef } from 'react';
import { useGame } from '../../context/GameContext';
import { useSocket, playCardFlipSound, playPointCounterSound } from '../../context/SocketContext';
import { Card } from './Card';
import type { Card as CardType, TrickCard, KingContract } from '../../types/game';
import { APP_VERSION } from '../../constants/version';
import styles from './Game.module.css';

const DIRECTION_LABELS: Record<string, string> = {
  left: '← Sola',
  right: '→ Sağa',
  across: '↑ Karşıya',
  hold: 'Pas yok',
};

// Contract labels for King
const CONTRACT_LABELS: Record<string, string> = {
  el: 'El Almaz',
  kupa: 'Kupa Almaz',
  erkek: 'Erkek Almaz',
  kiz: 'Kız Almaz',
  rifki: 'Rıfkı',
  sonIki: 'Son iki',
  trump: 'Koz',
};

const CONTRACT_DESCRIPTIONS: Record<string, string> = {
  el: '(-50/el)',
  kupa: '(-30/kupa)',
  erkek: '(-60/erkek)',
  kiz: '(-100/kız)',
  rifki: '(-320)',
  sonIki: '(-180/el)',
  trump: '(+50/el)',
};

const SUIT_LABELS: Record<string, string> = {
  hearts: '♥ Kupa',
  diamonds: '♦ Karo',
  clubs: '♣ Sinek',
  spades: '♠ Maça',
};

// Suit order: spades, hearts, clubs, diamonds
const SUIT_ORDER: Record<string, number> = {
  spades: 0,
  hearts: 1,
  clubs: 2,
  diamonds: 3,
};

// Rank values for sorting (ascending)
const RANK_ORDER: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};

function sortHand(hand: CardType[]): CardType[] {
  return [...hand].sort((a, b) => {
    // First by suit
    const suitDiff = SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
    if (suitDiff !== 0) return suitDiff;
    // Then by rank (ascending)
    return RANK_ORDER[a.rank] - RANK_ORDER[b.rank];
  });
}

function cardEquals(a: CardType, b: CardType): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

export function Game() {
  const { state, dispatch } = useGame();
  const { leaveTable, leaveSpectate, submitPass, playCard, rematch, selectContract, submitBid } = useSocket();
  const [timerProgress, setTimerProgress] = useState(100);
  const [passTimerProgress, setPassTimerProgress] = useState(100);
  const [contractTimerProgress, setContractTimerProgress] = useState(100);
  const [biddingTimerProgress, setBiddingTimerProgress] = useState(100);
  const [animatingSeats, setAnimatingSeats] = useState<Set<number>>(new Set());
  // Track how many cards to show per seat during round end animation
  const [visibleCardCounts, setVisibleCardCounts] = useState<Record<number, number>>({});
  // Track cards being animated during pass phase
  const [passingCards, setPassingCards] = useState<CardType[]>([]); // Cards currently rising out
  const [receivingCards, setReceivedCards] = useState<CardType[]>([]); // Cards currently dropping in
  // During pass animation, we need to show different cards than state.hand
  const [displayHand, setDisplayHand] = useState<CardType[] | null>(null); // Override hand display during animation
  // Track what's displayed in the last trick box (updates only after animation ends)
  const [displayedLastTrick, setDisplayedLastTrick] = useState<TrickCard[] | null>(null);
  // Track if we're currently in a trick animation
  const wasAnimatingRef = useRef(false);
  // Track dealing animation state locally to trigger CSS animation
  const [isDealing, setIsDealing] = useState(false);
  // King: selected trump suit for trump contract
  const [selectedTrumpSuit, setSelectedTrumpSuit] = useState<string | null>(null);
  // Floating score animation state
  const [floatingScores, setFloatingScores] = useState<Record<number, number | null>>({});
  // Displayed scores (delayed update during animation)
  const [displayedScores, setDisplayedScores] = useState<number[]>([0, 0, 0, 0]);
  // Spades: selected bid value
  const [selectedBid, setSelectedBid] = useState<number>(1);

  // Calculate player positions relative to current player
  const positions = useMemo(() => {
    const pos = ['bottom', 'left', 'top', 'right'];
    const result: Record<number, string> = {};
    
    if (state.mySeat !== null) {
      for (let i = 0; i < 4; i++) {
        const relativePosition = (i - state.mySeat + 4) % 4;
        result[i] = pos[relativePosition];
      }
    }
    
    return result;
  }, [state.mySeat]);

  // Timer progress
  useEffect(() => {
    if (!state.turnTimeoutAt) {
      setTimerProgress(100);
      return;
    }

    const updateTimer = () => {
      const now = Date.now();
      const remaining = Math.max(0, state.turnTimeoutAt! - now);
      const total = 30000;
      setTimerProgress((remaining / total) * 100);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 100);

    return () => clearInterval(interval);
  }, [state.turnTimeoutAt]);

  // Pass timer progress
  useEffect(() => {
    if (!state.passTimeoutAt) {
      setPassTimerProgress(100);
      return;
    }

    const updateTimer = () => {
      const now = Date.now();
      const remaining = Math.max(0, state.passTimeoutAt! - now);
      const total = 30000;
      setPassTimerProgress((remaining / total) * 100);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 100);

    return () => clearInterval(interval);
  }, [state.passTimeoutAt]);

  // Contract selection timer progress
  useEffect(() => {
    if (!state.contractTimeoutAt) {
      setContractTimerProgress(100);
      return;
    }

    const updateTimer = () => {
      const now = Date.now();
      const remaining = Math.max(0, state.contractTimeoutAt! - now);
      const total = 45000; // 45 seconds for contract selection
      setContractTimerProgress((remaining / total) * 100);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 100);

    return () => clearInterval(interval);
  }, [state.contractTimeoutAt]);

  // Bidding timer progress
  useEffect(() => {
    if (!state.biddingTimeoutAt) {
      setBiddingTimerProgress(100);
      return;
    }

    const updateTimer = () => {
      const now = Date.now();
      const remaining = Math.max(0, state.biddingTimeoutAt! - now);
      const total = 30000;
      setBiddingTimerProgress((remaining / total) * 100);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 100);

    return () => clearInterval(interval);
  }, [state.biddingTimeoutAt]);

  // Dealing animation - when cards are dealt at the start of a round
  useEffect(() => {
    if (state.dealingAnimation) {
      // Start the CSS animation
      setIsDealing(true);
      
      // Clear the animation state after animation completes (matches 0.78s in CSS)
      const timer = setTimeout(() => {
        setIsDealing(false);
        dispatch({ type: 'SET_DEALING_ANIMATION', payload: false });
      }, 780);
      
      return () => clearTimeout(timer);
    }
  }, [state.dealingAnimation, dispatch]);

  // Pending trick animation - start after delay to allow 4th card slide-in
  useEffect(() => {
    if (!state.pendingTrickAnimation) return;
    
    const { trick, winner } = state.pendingTrickAnimation;
    
    // Delay to allow slide-in animation to complete (300ms animation + small buffer)
    const timer = setTimeout(() => {
      dispatch({
        type: 'SET_TRICK_ANIMATION',
        payload: { active: true, trick, winner, phase: 'showing' }
      });
    }, 350);
    
    return () => clearTimeout(timer);
  }, [state.pendingTrickAnimation, dispatch]);

  // Trick animation - handles phase transitions
  useEffect(() => {
    if (!state.trickAnimation?.active) return;
    
    const { trick, winner, phase } = state.trickAnimation;
    
    if (phase === 'showing') {
      // Phase 1 -> Phase 2: Stack cards in center after 600ms
      const timer = setTimeout(() => {
        dispatch({
          type: 'SET_TRICK_ANIMATION',
          payload: { active: true, trick, winner, phase: 'stacking' }
        });
      }, 600);
      return () => clearTimeout(timer);
    }
    
    if (phase === 'stacking') {
      // Phase 2 -> Phase 3: Slide to winner after 400ms
      const timer = setTimeout(() => {
        dispatch({
          type: 'SET_TRICK_ANIMATION',
          payload: { active: true, trick, winner, phase: 'sliding' }
        });
      }, 400);
      return () => clearTimeout(timer);
    }
    
    if (phase === 'sliding') {
      // Phase 3 -> Done: Clear animation after 600ms
      const timer = setTimeout(() => {
        dispatch({
          type: 'SET_TRICK_ANIMATION',
          payload: null
        });
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [state.trickAnimation, dispatch]);

  // Update displayed last trick only when animation ends
  useEffect(() => {
    const isAnimating = !!state.trickAnimation;
    
    // When animation ends (was animating, now not), update the displayed trick
    if (wasAnimatingRef.current && !isAnimating) {
      setDisplayedLastTrick(state.lastTrick);
    }
    
    // Also update when lastTrick changes and we're not animating (e.g., initial state)
    if (!isAnimating && !wasAnimatingRef.current && state.lastTrick !== displayedLastTrick) {
      setDisplayedLastTrick(state.lastTrick);
    }
    
    wasAnimatingRef.current = isAnimating;
  }, [state.trickAnimation, state.lastTrick]);

  // Pass animation - animate cards being passed then received
  useEffect(() => {
    if (state.passAnimation?.active) {
      const { cardsPassed, cardsReceived } = state.passAnimation;
      const cardDelay = 200; // ms between each card
      const animationDuration = 300; // duration of rise/drop animation
      const pauseBetweenPhases = 400; // ms pause between pass and receive phases
      
      // Reconstruct the "old hand" (before pass):
      // new hand - received cards + passed cards
      const oldHand = [
        ...state.hand.filter(c => !cardsReceived.some(r => cardEquals(r, c))),
        ...cardsPassed
      ];
      
      // Phase 1: Show old hand and animate cards passing out
      setDisplayHand(oldHand);
      
      // Animate cards rising out one at a time
      cardsPassed.forEach((card, index) => {
        setTimeout(() => {
          setPassingCards(prev => [...prev, card]);
          playCardFlipSound();
        }, index * cardDelay);
      });
      
      // After all pass animations complete, wait for last animation to finish
      const passPhaseEndTime = cardsPassed.length * cardDelay + animationDuration;
      setTimeout(() => {
        // Cards have risen and disappeared - show hand without passed cards
        setPassingCards([]);
        // Hand without passed cards = new hand without received cards
        const handWithoutPassed = state.hand.filter(c => !cardsReceived.some(r => cardEquals(r, c)));
        setDisplayHand(handWithoutPassed);
      }, passPhaseEndTime);
      
      // Phase 2: Start receiving cards
      const receiveStartTime = passPhaseEndTime + pauseBetweenPhases;
      setTimeout(() => {
        // Now show the full new hand (with received cards) for drop animation
        setDisplayHand(state.hand);
      }, receiveStartTime);
      
      // Animate received cards dropping in one at a time
      cardsReceived.forEach((card, index) => {
        setTimeout(() => {
          setReceivedCards(prev => [...prev, card]);
          playCardFlipSound();
        }, receiveStartTime + index * cardDelay);
      });
      
      // Final cleanup
      const totalTime = receiveStartTime + cardsReceived.length * cardDelay + animationDuration + 100;
      setTimeout(() => {
        setPassingCards([]);
        setReceivedCards([]);
        setDisplayHand(null); // Use state.hand directly again
        dispatch({
          type: 'SET_PASS_ANIMATION',
          payload: null
        });
      }, totalTime);
    }
  }, [state.passAnimation?.active, dispatch, state.hand]);

  // Point cards animation on round end - animate each player sequentially (most recent → least recent joiner)
  // with 700ms delay between players and 300ms per card
  // Works for both players and spectators
  useEffect(() => {
    const pointCards = state.isSpectating && state.spectatorState?.pointCardsTaken 
      ? state.spectatorState.pointCardsTaken 
      : state.pointCardsTaken;
    const currentPhase = state.isSpectating && state.spectatorState 
      ? state.spectatorState.phase 
      : state.phase;
    
    if (currentPhase === 'roundEnd' && pointCards) {
      // Animation order: most recently joined (seat 3) to least recently joined (seat 0)
      const animationOrder = [3, 2, 1, 0];
      
      // Build a sequence of animation steps with delays
      // Each step: { seat, cardIndex, delayFromStart }
      const steps: { seat: number; cardIndex: number; delayFromStart: number }[] = [];
      // Start with 1500ms delay to let the last trick take animation complete
      let currentDelay = 1500;
      let isFirstPlayerWithCards = true;
      
      for (const seat of animationOrder) {
        const cards = pointCards[seat] || [];
        if (cards.length > 0) {
          // Add 700ms delay before starting this player's cards (except for first player)
          if (!isFirstPlayerWithCards) {
            currentDelay += 700;
          }
          isFirstPlayerWithCards = false;
          
          for (let i = 0; i < cards.length; i++) {
            steps.push({ seat, cardIndex: i + 1, delayFromStart: currentDelay });
            currentDelay += 300; // 300ms between each card
          }
          
          // Remove the last 300ms increment so the player delay is exactly 700ms
          currentDelay -= 300;
        }
      }
      
      // Initialize all seats with 0 visible cards
      const initialCounts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
      setVisibleCardCounts(initialCounts);
      setAnimatingSeats(new Set());
      
      // Schedule each step with its specific delay
      const timeouts: NodeJS.Timeout[] = [];
      
      steps.forEach((step) => {
        const timeout = setTimeout(() => {
          setVisibleCardCounts(prev => ({ ...prev, [step.seat]: step.cardIndex }));
          setAnimatingSeats(prev => new Set([...prev, step.seat]));
          playPointCounterSound();
        }, step.delayFromStart);
        timeouts.push(timeout);
      });
      
      // Trigger floating score animation immediately (after initial 1500ms delay for last trick)
      // For spectators, use spectatorState.roundScores; for players, use state.roundScores
      const roundScores = state.isSpectating && state.spectatorState?.roundScores
        ? state.spectatorState.roundScores
        : state.roundScores;
      
      // Get cumulative scores for delayed display update
      const cumulativeScores = state.isSpectating && state.spectatorState?.cumulativeScores
        ? state.spectatorState.cumulativeScores
        : state.cumulativeScores;
      
      // Calculate total animation time: last step delay + 300ms for last card + 1000ms buffer
      const totalAnimationTime = steps.length > 0 ? steps[steps.length - 1].delayFromStart + 1300 : 1500;
      
      const scoreTimeout = setTimeout(() => {
        // Show floating scores for each seat
        if (roundScores) {
          const scores: Record<number, number | null> = {};
          for (let seat = 0; seat < 4; seat++) {
            const score = roundScores[seat];
            if (score !== undefined && score !== 0) {
              scores[seat] = score;
            }
          }
          setFloatingScores(scores);
          // Clear after animation (4000ms)
          setTimeout(() => setFloatingScores({}), 4000);
        }
      }, 1500); // Start at same time as card animation
      timeouts.push(scoreTimeout);
      
      // Update displayed scores after all animations complete
      const displayScoreTimeout = setTimeout(() => {
        if (cumulativeScores) {
          setDisplayedScores([...cumulativeScores]);
        }
      }, totalAnimationTime + 4000); // After card animation + floating score animation
      timeouts.push(displayScoreTimeout);
      
      // Clear point cards 300ms before score update
      const clearCardsTimeout = setTimeout(() => {
        setAnimatingSeats(new Set());
        setVisibleCardCounts({});
      }, totalAnimationTime + 4000 - 300);
      timeouts.push(clearCardsTimeout);
      
      return () => {
        timeouts.forEach(t => clearTimeout(t));
      };
    } else {
      setAnimatingSeats(new Set());
      setVisibleCardCounts({});
      setFloatingScores({});
      // When not in roundEnd, immediately update displayed scores
      const cumulativeScores = state.isSpectating && state.spectatorState?.cumulativeScores
        ? state.spectatorState.cumulativeScores
        : state.cumulativeScores;
      if (cumulativeScores) {
        setDisplayedScores([...cumulativeScores]);
      }
    }
  }, [state.phase, state.pointCardsTaken, state.roundScores, state.isSpectating, state.spectatorState?.phase, state.spectatorState?.pointCardsTaken, state.cumulativeScores, state.spectatorState?.cumulativeScores]);

  const handleCardClick = (card: CardType) => {
    if (state.phase === 'passing' && !state.passSubmitted) {
      dispatch({ type: 'SELECT_PASS_CARD', payload: card });
    } else if (state.phase === 'playing' && state.isMyTurn) {
      const isLegal = state.legalCards.some(c => cardEquals(c, card));
      if (isLegal) {
        playCard(card);
      }
    }
  };

  const handleSubmitPass = () => {
    if (state.selectedPassCards.length === 3) {
      submitPass(state.selectedPassCards);
    }
  };

  const handleSelectContract = (contract: KingContract) => {
    if (contract.type === 'trump') {
      // For trump contract, need to select suit first
      if (selectedTrumpSuit) {
        selectContract(contract.type, selectedTrumpSuit);
        setSelectedTrumpSuit(null);
      }
    } else {
      selectContract(contract.type);
    }
  };

  const getPlayerName = (seat: number) => {
    const player = state.players.find(p => p.seat === seat);
    return player?.name || 'Bekleniyor...';
  };

  // Available avatar images (0-11.png)
  const AVATAR_COUNT = 12;
  
  // Generate a deterministic random avatar index based on table+player info
  // This ensures the same player gets the same avatar within a game session
  // but different tables will have different assignments
  const getAvatarIndex = useMemo(() => {
    // Create a seeded random for this table
    const tableHash = (state.tableId || '').split('').reduce((acc, char) => {
      return ((acc << 5) - acc) + char.charCodeAt(0);
    }, 0);
    
    // Assign avatars to seats, ensuring no duplicates
    const assignments: number[] = [];
    const usedAvatars = new Set<number>();
    
    for (let seat = 0; seat < 4; seat++) {
      const player = state.players.find(p => p.seat === seat);
      if (player) {
        // Create a seed from table + player name for consistency
        const playerSeed = `${state.tableId}-${player.name}`.split('').reduce((acc, char) => {
          return ((acc << 5) - acc) + char.charCodeAt(0);
        }, 0);
        
        // Find an available avatar
        let avatarIndex = Math.abs(playerSeed) % AVATAR_COUNT;
        let attempts = 0;
        while (usedAvatars.has(avatarIndex) && attempts < AVATAR_COUNT) {
          avatarIndex = (avatarIndex + 1) % AVATAR_COUNT;
          attempts++;
        }
        usedAvatars.add(avatarIndex);
        assignments[seat] = avatarIndex;
      } else {
        // No player at this seat yet, use seat-based default
        let avatarIndex = (Math.abs(tableHash) + seat) % AVATAR_COUNT;
        while (usedAvatars.has(avatarIndex)) {
          avatarIndex = (avatarIndex + 1) % AVATAR_COUNT;
        }
        usedAvatars.add(avatarIndex);
        assignments[seat] = avatarIndex;
      }
    }
    
    return assignments;
  }, [state.tableId, state.players]);

  // Get avatar URL for a seat
  const getAvatarUrl = (seat: number): string | null => {
    const avatarIndex = getAvatarIndex[seat];
    if (avatarIndex === undefined) return null;
    // Use import.meta.env.BASE_URL to handle base path correctly
    const basePath = import.meta.env.BASE_URL || '/';
    return `${basePath}assets/avatars/${avatarIndex}.png`;
  };

  const isPlayerConnected = (seat: number) => {
    const player = state.players.find(p => p.seat === seat);
    return player?.connected ?? false;
  };

  const isCardSelected = (card: CardType) => {
    return state.selectedPassCards.some(c => cardEquals(c, card));
  };

  const isCardPlayable = (card: CardType) => {
    if (state.phase !== 'playing' || !state.isMyTurn) return false;
    return state.legalCards.some(c => cardEquals(c, card));
  };

  // Spectator view - simplified read-only view
  if (state.isSpectating && state.spectatorState) {
    const spectatorState = state.spectatorState;
    // Use state.currentTrick which updates via cardPlayed events, fall back to spectatorState
    const trickToDisplay = state.trickAnimation?.trick || state.currentTrick || spectatorState.currentTrick || [];
    const isAnimating = !!state.trickAnimation;
    const phase = state.trickAnimation?.phase || 'showing';
    const winnerSeat = state.trickAnimation?.winner || 0;
    
    return (
      <div className={styles.game}>
        <div className={styles.tableCornerInfo}>
          <span className={styles.spectatorBadge}>iZLEYiCi</span>
          <span className={styles.tableId}>Masa: {state.tableId}</span>
          <span className={styles.versionInfo}>{APP_VERSION}</span>
        </div>

        <div className={styles.mainArea}>
          <div className={styles.tableArea}>
            <div className={styles.table}>
              {/* Current contract for King - above game number */}
              {state.gameType === 'king' && spectatorState.currentContract && (
                <div className={styles.spectatorContractDisplay}>
                  <span className={styles.contractLabel}>
                    {spectatorState.currentContract.type === 'trump'
                      ? SUIT_LABELS[spectatorState.currentContract.trumpSuit!]
                      : CONTRACT_LABELS[(spectatorState.currentContract as { name?: string }).name || spectatorState.currentContract.type]}
                  </span>
                </div>
              )}

              {/* Game info */}
              <div className={styles.endingScoreCenter}>
                {state.gameType === 'king' ? (
                  <>Parti: {spectatorState.gameNumber || 1}/20</>
                ) : (
                  <>Bitiş: {state.endingScore || 20}</>
                )}
              </div>

              {/* Leave button */}
              <div className={styles.tableCornerActions}>
                <button className={styles.tableLeaveButton} onClick={leaveSpectate}>
                  Ayrıl
                </button>
              </div>

              {/* Player areas */}
              {[0, 1, 2, 3].map(seat => {
                const position = ['bottom', 'left', 'top', 'right'][seat];
                const isCurrent = state.currentPlayer === seat || spectatorState.currentPlayer === seat;
                const player = state.players.find(p => p.seat === seat);
                const spectatorPointCards = spectatorState.pointCardsTaken?.[seat] || [];
                const isAnimatingSeat = animatingSeats.has(seat);
                const showPointCards = (state.phase === 'roundEnd' || spectatorState.phase === 'roundEnd') && isAnimatingSeat && spectatorPointCards.length > 0;
                const avatarUrl = getAvatarUrl(seat);
                const floatingScore = floatingScores[seat];
                
                return (
                  <div 
                    key={seat} 
                    className={`${styles.playerArea} ${styles[position]}`}
                  >
                    <div className={styles.playerContainer}>
                      <div className={styles.playerNameRow}>
                        <div className={styles.playerNameBox}>
                          <span className={`${styles.playerName} ${isCurrent ? styles.currentTurn : ''}`}>
                            {player?.name || `Oyuncu ${seat + 1}`}
                          </span>
                          {avatarUrl && (
                            <img 
                              src={avatarUrl} 
                              alt="" 
                              className={styles.playerAvatar}
                              style={{ transform: (position === 'right' || position === 'bottom') ? 'scaleX(-1)' : 'none' }}
                            />
                          )}
                          <span className={styles.playerScore}>
                            Puan: {displayedScores[seat]}
                          </span>
                          {/* Floating score animation for spectators */}
                          {floatingScore !== null && floatingScore !== undefined && (
                            <div className={`${styles.floatingScore} ${styles.floatingScoreActive}`}>
                              {floatingScore > 0 ? `+${floatingScore}` : floatingScore}
                            </div>
                          )}
                        </div>
                      </div>
                      {/* Point cards for spectators during round end - animated */}
                      {showPointCards && (
                        <div className={`${styles.playerPointCards} ${styles.animating}`}>
                          {spectatorPointCards.slice(0, visibleCardCounts[seat] || 0).map((card) => (
                            <div key={`${card.suit}-${card.rank}`} className={styles.playerPointCard}>
                              <Card card={card} small />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Trick area with animations */}
              <div className={styles.trickArea}>
                {trickToDisplay.map(({ seat, card }, index) => {
                  // For spectators, seat 0 is at bottom position
                  const relSeat = seat;
                  // Show slide animation if this is the last played card and we're not in trick animation
                  const shouldSlideIn = !isAnimating && state.lastPlayedCard && 
                    cardEquals(state.lastPlayedCard.card, card) && 
                    state.lastPlayedCard.seat === seat;
                  const isNewest = index === trickToDisplay.length - 1;
                  const zIndex = index + 1;
                  
                  return (
                    <div 
                      key={`${card.suit}-${card.rank}`} 
                      className={`
                        ${styles.trickCard} 
                        ${styles[`seat${relSeat}`]}
                        ${shouldSlideIn && isNewest ? styles.slideIn : ''}
                        ${shouldSlideIn && isNewest ? styles[`slideFrom${['Bottom', 'Left', 'Top', 'Right'][relSeat]}`] : ''}
                        ${isAnimating && phase === 'stacking' ? styles.stacking : ''}
                        ${isAnimating && phase === 'sliding' ? styles.sliding : ''}
                        ${isAnimating && phase === 'sliding' ? styles[`slideTo${['Bottom', 'Left', 'Top', 'Right'][winnerSeat]}`] : ''}
                      `}
                      style={{ zIndex }}
                    >
                      <Card card={card} small />
                    </div>
                  );
                })}
              </div>

              {/* Phase indicator */}
              {(state.phase === 'passing' || spectatorState.phase === 'passing') && (
                <div className={styles.passDirectionCenter}>
                  Pas: {DIRECTION_LABELS[spectatorState.passDirection || 'hold']}
                </div>
              )}
              
              {(state.phase === 'contractSelection' || spectatorState.phase === 'contractSelection') && (
                <div className={styles.passDirectionCenter}>
                  Kontrat seçiliyor...
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Waiting for players
  if (state.phase === 'waiting') {
    return (
      <div className={styles.game}>
        <div className={styles.header}>
          <div className={styles.tableInfo}>
            <span className={styles.tableId}>Masa: {state.tableId}</span>
          </div>
          <button className={styles.leaveButton} onClick={leaveTable}>
            Ayrıl
          </button>
        </div>
        <div className={styles.waitingRoom}>
          <h2 className={styles.waitingTitle}>Oyuncular Bekleniyor</h2>
          <div className={styles.playersList}>
            {[0, 1, 2, 3].map(seat => {
              const player = state.players.find(p => p.seat === seat);
              return (
                <div key={seat} className={styles.playerSlot}>
                  <span className={styles.seatNumber}>{seat + 1}</span>
                  {player ? (
                    <span className={styles.playerName}>{player.name}</span>
                  ) : (
                    <span className={styles.emptySlot}>Boş</span>
                  )}
                </div>
              );
            })}
          </div>
          <p className={styles.waitingMessage}>
            {4 - state.players.length} oyuncu daha bekleniyor...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.game}>
      {/* Table info - lower left corner of screen */}
      <div className={styles.tableCornerInfo}>
        <span className={styles.tableId}>Masa: {state.tableId}</span>
        <span className={styles.versionInfo}>{APP_VERSION}</span>
      </div>

      <div className={styles.mainArea}>
        <div className={styles.tableArea}>
          <div className={styles.table}>
            {/* Ending score - centered on table */}
            <div className={styles.endingScoreCenter}>
              {state.gameType === 'king' ? (
                <>Parti: {state.kingState?.gameNumber || 1}/20</>
              ) : (
                <>Bitiş: {state.endingScore || 20}</>
              )}
            </div>

            {/* Contract selection UI for King */}
            {state.phase === 'contractSelection' && state.gameType === 'king' && state.kingState && (
              state.isMyTurn ? (
                <div className={styles.contractSelectionOverlay}>
                  <div className={styles.contractSelectionBox}>
                    <h3>Ceza Seç</h3>
                    <div className={styles.contractGrid}>
                      {state.kingState.availableContracts
                        .filter(contract => contract.type !== 'trump')
                        .map((contract) => (
                        <button
                          key={contract.type}
                          className={`${styles.contractButton} ${contract.disabled ? styles.contractDisabled : ''}`}
                          onClick={() => !contract.disabled && handleSelectContract(contract)}
                          disabled={contract.disabled}
                        >
                          <span className={styles.contractName}>{CONTRACT_LABELS[contract.type]}</span>
                          <span className={styles.contractDesc}>{CONTRACT_DESCRIPTIONS[contract.type]}</span>
                          <span className={styles.contractUsage}>{contract.usageCount || 0}/2</span>
                        </button>
                      ))}
                    </div>
                    {state.kingState.availableContracts.some(c => c.type === 'trump') && (
                      <div className={styles.trumpSuitSelection}>
                        <h4>Koz Seç</h4>
                        <div className={styles.suitButtons}>
                          {state.kingState.availableContracts
                            .filter(c => c.type === 'trump')
                            .map(contract => (
                            <button
                              key={contract.trumpSuit}
                              className={`${styles.suitButton} ${contract.trumpSuit === 'hearts' || contract.trumpSuit === 'diamonds' ? styles.redSuit : ''} ${contract.disabled ? styles.suitDisabled : ''}`}
                              onClick={() => !contract.disabled && selectContract('trump', contract.trumpSuit!)}
                              disabled={contract.disabled}
                            >
                              {SUIT_LABELS[contract.trumpSuit!]}
                              <span className={styles.suitUsage}>{contract.usageCount || 0}/2</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className={styles.waitingForContractOverlay}>
                  <div className={styles.waitingForContractText}>
                    {getPlayerName(state.kingState.currentContractSelector!)} ihale seçiyor...
                  </div>
                </div>
              )
            )}

            {/* Current contract display for King */}
            {state.gameType === 'king' && state.kingState?.selectedContract && (state.phase === 'playing' || state.phase === 'roundEnd') && (
              <div className={styles.currentContractDisplay}>
                <span className={styles.contractLabel}>
                  {state.kingState.selectedContract.type === 'trump' 
                    ? SUIT_LABELS[state.kingState.selectedContract.trumpSuit!]
                    : CONTRACT_LABELS[(state.kingState.selectedContract as { name?: string }).name || state.kingState.selectedContract.type]}
                </span>
              </div>
            )}

            {/* Bidding UI for Spades */}
            {state.phase === 'bidding' && state.gameType === 'spades' && state.spadesState && (
              state.isMyTurn ? (
                <div className={styles.contractSelectionOverlay}>
                  <div className={styles.biddingBox}>
                    <h3>ihale Ver</h3>
                    <div className={styles.biddingControls}>
                      <div className={styles.bidSliderRow}>
                        <button
                          className={styles.bidAdjustButton}
                          onClick={() => setSelectedBid(Math.max(0, selectedBid - 1))}
                          disabled={selectedBid <= 0}
                        >
                          −
                        </button>
                        <input
                          type="range"
                          min="0"
                          max="13"
                          value={selectedBid}
                          onChange={(e) => setSelectedBid(Number(e.target.value))}
                          className={styles.bidSlider}
                        />
                        <button
                          className={styles.bidAdjustButton}
                          onClick={() => setSelectedBid(Math.min(13, selectedBid + 1))}
                          disabled={selectedBid >= 13}
                        >
                          +
                        </button>
                        {/* Timer for bidding - inline with slider */}
                        <div className={styles.bidTimer}>
                          <div 
                            className={`${styles.bidTimerProgress} ${biddingTimerProgress < 30 ? styles.danger : biddingTimerProgress < 60 ? styles.warning : ''}`}
                            style={{ height: `${biddingTimerProgress}%` }}
                          />
                        </div>
                      </div>
                      <div className={styles.bidValueDisplay}>{selectedBid === 0 ? 'Nil' : selectedBid}</div>
                      <div className={styles.bidButtons}>
                        <button
                          className={styles.bidSubmitButton}
                          onClick={() => submitBid(selectedBid === 0 ? 'nil' : selectedBid)}
                        >
                          Tamam
                        </button>
                        <button
                          className={`${styles.bidSubmitButton} ${styles.blindNilBid}`}
                          onClick={() => submitBid('blind_nil')}
                          disabled={(() => {
                            const mySeat = state.mySeat ?? 0;
                            const myTeam = mySeat % 2;
                            const partnerSeat = (mySeat + 2) % 4;
                            const teamScore = state.cumulativeScores[myTeam] || 0;
                            const opponentTeam = (myTeam + 1) % 2;
                            const opponentScore = state.cumulativeScores[opponentTeam] || 0;
                            const partnerBid = state.spadesState?.bids[partnerSeat];
                            const isBehind = opponentScore - teamScore >= 100;
                            const partnerHasBlindNil = partnerBid === 'blind_nil';
                            return !isBehind || partnerHasBlindNil;
                          })()}
                        >
                          Kör Nil
                        </button>
                      </div>
                    </div>
                    {/* Show other players' bids */}
                    <div className={styles.bidsDisplayTeams}>
                      <div className={styles.bidsTeam}>
                        <div className={styles.bidsTeamLabelActive}>Takım 1</div>
                        {[0, 2].map(seat => {
                          const bid = state.spadesState?.bids[seat];
                          return (
                            <div key={seat} className={styles.bidEntry}>
                              <span className={styles.bidPlayerName}>{getPlayerName(seat)}</span>
                              <span className={styles.bidValue}>
                                {bid === null ? '...' : bid === 'nil' ? 'Nil' : bid === 'blind_nil' ? 'Kör Nil' : bid}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      <div className={styles.bidsTeam}>
                        <div className={styles.bidsTeamLabelActive}>Takım 2</div>
                        {[1, 3].map(seat => {
                          const bid = state.spadesState?.bids[seat];
                          return (
                            <div key={seat} className={styles.bidEntry}>
                              <span className={styles.bidPlayerName}>{getPlayerName(seat)}</span>
                              <span className={styles.bidValue}>
                                {bid === null ? '...' : bid === 'nil' ? 'Nil' : bid === 'blind_nil' ? 'Kör Nil' : bid}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className={styles.waitingForContractOverlay}>
                  <div className={styles.waitingForContractText}>
                    {getPlayerName(state.spadesState.currentBidder ?? 0)} ihale veriyor...
                    <div className={styles.bidsDisplayTeams}>
                      <div className={styles.bidsTeam}>
                        <div className={styles.bidsTeamLabelWaiting}>Takım 1</div>
                        {[0, 2].map(seat => {
                          const bid = state.spadesState?.bids[seat];
                          return (
                            <div key={seat} className={styles.bidEntry}>
                              <span className={styles.bidPlayerName}>{getPlayerName(seat)}</span>
                              <span className={styles.bidValue}>
                                {bid === null ? '...' : bid === 'nil' ? 'Nil' : bid === 'blind_nil' ? 'Kör Nil' : bid}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      <div className={styles.bidsTeam}>
                        <div className={styles.bidsTeamLabelWaiting}>Takım 2</div>
                        {[1, 3].map(seat => {
                          const bid = state.spadesState?.bids[seat];
                          return (
                            <div key={seat} className={styles.bidEntry}>
                              <span className={styles.bidPlayerName}>{getPlayerName(seat)}</span>
                              <span className={styles.bidValue}>
                                {bid === null ? '...' : bid === 'nil' ? 'Nil' : bid === 'blind_nil' ? 'Kör Nil' : bid}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )
            )}

            {/* Spades team scores and bids display during play */}
            {state.gameType === 'spades' && state.spadesState && (state.phase === 'playing' || state.phase === 'roundEnd') && (
              <div className={styles.spadesInfoDisplay}>
                <div className={styles.teamInfo}>
                  <div className={styles.teamLabel}>Takım 1</div>
                  <div className={styles.teamScore}>{state.cumulativeScores[0] || 0}</div>
                  <div className={styles.teamTricks}>
                    El: {state.spadesState.teamTricks[0] || 0}/{state.spadesState.teamBids[0] || 0}
                  </div>
                  <div className={styles.teamBags}>Ceza: {state.spadesState.bags[0]}</div>
                </div>
                <div className={styles.teamInfo}>
                  <div className={styles.teamLabel}>Takım 2</div>
                  <div className={styles.teamScore}>{state.cumulativeScores[1] || 0}</div>
                  <div className={styles.teamTricks}>
                    El: {state.spadesState.teamTricks[1] || 0}/{state.spadesState.teamBids[1] || 0}
                  </div>
                  <div className={styles.teamBags}>Ceza: {state.spadesState.bags[1]}</div>
                </div>
              </div>
            )}

            {/* Leave button - southeast corner */}
            <div className={styles.tableCornerActions}>
              <button className={styles.tableLeaveButton} onClick={leaveTable}>
                Ayrıl
              </button>
            </div>

            {/* Player areas inside table */}
            {[0, 1, 2, 3].map(seat => {
              const position = positions[seat];
              const isCurrent = state.currentPlayer === seat;
              const connected = isPlayerConnected(seat);
              const pointCards = state.pointCardsTaken[seat] || [];
              const isAnimating = animatingSeats.has(seat);
              const avatarUrl = getAvatarUrl(seat);
              const floatingScore = floatingScores[seat];
              
              return (
                <div 
                  key={seat} 
                  className={`${styles.playerArea} ${styles[position]}`}
                >
                  <div className={styles.playerContainer}>
                    <div className={styles.playerNameRow}>
                      <div className={`${styles.playerNameBox} ${!connected ? styles.disconnected : ''}`}>
                        <span className={`${styles.playerName} ${isCurrent ? styles.currentTurn : ''}`}>
                          {getPlayerName(seat)}
                        </span>
                        {avatarUrl && (
                          <img 
                            src={avatarUrl} 
                            alt="" 
                            className={styles.playerAvatar}
                            style={{ transform: (position === 'right' || position === 'bottom') ? 'scaleX(-1)' : 'none' }}
                          />
                        )}
                        {state.gameType !== 'spades' && (
                          <span className={styles.playerScore}>
                            Puan: {displayedScores[seat]}
                          </span>
                        )}
                        {/* Spades bid indicator */}
                        {state.gameType === 'spades' && state.spadesState && (state.phase === 'playing' || state.phase === 'roundEnd') && (() => {
                          const bid = state.spadesState.bids[seat];
                          if (bid === null) return null;
                          const tricksTaken = state.spadesState.tricksTakenBySeat?.[seat] || 0;
                          const isNilBid = bid === 'nil' || bid === 'blind_nil';
                          const nilFailed = isNilBid && tricksTaken > 0;
                          return (
                            <span className={`${styles.playerBid} ${nilFailed ? styles.failedNilBid : ''}`}>
                              ihale: {bid === 'blind_nil' ? 'kör nil' : bid === 'nil' ? 'nil' : bid}
                            </span>
                          );
                        })()}
                        {/* Moon shot animation */}
                        {state.moonShooter === seat && (
                          <div className={styles.moonShotText}>
                            Ayı Vurdu!
                          </div>
                        )}
                        {/* Floating score animation */}
                        {floatingScore !== null && floatingScore !== undefined && (
                          <div className={`${styles.floatingScore} ${styles.floatingScoreActive}`}>
                            {floatingScore > 0 ? `+${floatingScore}` : floatingScore}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  {state.phase === 'roundEnd' && isAnimating && pointCards.length > 0 && (
                    <div className={`${styles.playerPointCards} ${styles.animating}`}>
                      {pointCards.slice(0, visibleCardCounts[seat] || 0).map((card) => (
                        <div key={`${card.suit}-${card.rank}`} className={styles.playerPointCard}>
                          <Card card={card} small />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Last trick display - inside table, right of North player */}
            {/* Box always visible during playing phase, cards update only after animation ends */}
            {state.phase === 'playing' && (
              <div className={styles.lastTrickDisplay}>
                <span className={styles.lastTrickLabel}>Önceki El</span>
                <div className={styles.lastTrickGrid}>
                  {/* Show displayedLastTrick which only updates after animation ends */}
                  {displayedLastTrick && displayedLastTrick.length > 0 && (
                    <>
                      {/* Top (seat across from me) */}
                      <div className={styles.lastTrickTop}>
                        {displayedLastTrick.find(t => (t.seat - (state.mySeat || 0) + 4) % 4 === 2) && (
                          <Card 
                            card={displayedLastTrick.find(t => (t.seat - (state.mySeat || 0) + 4) % 4 === 2)!.card} 
                            micro 
                          />
                        )}
                      </div>
                      {/* Middle row: left, center, right */}
                      <div className={styles.lastTrickMiddle}>
                        <div className={styles.lastTrickLeft}>
                          {displayedLastTrick.find(t => (t.seat - (state.mySeat || 0) + 4) % 4 === 1) && (
                            <Card 
                              card={displayedLastTrick.find(t => (t.seat - (state.mySeat || 0) + 4) % 4 === 1)!.card} 
                              micro 
                            />
                          )}
                        </div>
                        <div className={styles.lastTrickCenter} />
                        <div className={styles.lastTrickRight}>
                          {displayedLastTrick.find(t => (t.seat - (state.mySeat || 0) + 4) % 4 === 3) && (
                            <Card 
                              card={displayedLastTrick.find(t => (t.seat - (state.mySeat || 0) + 4) % 4 === 3)!.card} 
                              micro 
                            />
                          )}
                        </div>
                      </div>
                      {/* Bottom (my seat) */}
                      <div className={styles.lastTrickBottom}>
                        {displayedLastTrick.find(t => (t.seat - (state.mySeat || 0) + 4) % 4 === 0) && (
                          <Card 
                            card={displayedLastTrick.find(t => (t.seat - (state.mySeat || 0) + 4) % 4 === 0)!.card} 
                            micro 
                          />
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Pass direction text - shown in center of table during passing phase */}
            {state.phase === 'passing' && (
              <div className={styles.passDirectionCenter}>
                Pas: {DIRECTION_LABELS[state.passDirection || 'hold']}
              </div>
            )}

            {/* Trick area - shows current trick or animation */}
            <div className={styles.trickArea}>
              {(() => {
                // Use animation trick if animating, otherwise current trick
                const trickToDisplay = state.trickAnimation?.trick || state.currentTrick;
                const isAnimating = !!state.trickAnimation;
                const phase = state.trickAnimation?.phase || 'showing';
                const winnerRelSeat = isAnimating 
                  ? ((state.trickAnimation?.winner || 0) - (state.mySeat || 0) + 4) % 4 
                  : 0;
                
                return trickToDisplay.map(({ seat, card }, index) => {
                  const relSeat = (seat - (state.mySeat || 0) + 4) % 4;
                  // Show slide animation if this is the last played card and we're not in trick animation
                  // Continue showing during pending state (waiting for trick animation to start)
                  const shouldSlideIn = !isAnimating && state.lastPlayedCard && 
                    cardEquals(state.lastPlayedCard.card, card) && 
                    state.lastPlayedCard.seat === seat;
                  const isNewest = index === trickToDisplay.length - 1;
                  // z-index based on play order: first card = 1, second = 2, etc.
                  const zIndex = index + 1;
                  
                  return (
                    <div 
                      key={`${card.suit}-${card.rank}`} 
                      className={`
                        ${styles.trickCard} 
                        ${styles[`seat${relSeat}`]}
                        ${shouldSlideIn && isNewest ? styles.slideIn : ''}
                        ${shouldSlideIn && isNewest ? styles[`slideFrom${['Bottom', 'Left', 'Top', 'Right'][relSeat]}`] : ''}
                        ${isAnimating && phase === 'stacking' ? styles.stacking : ''}
                        ${isAnimating && phase === 'sliding' ? styles.sliding : ''}
                        ${isAnimating && phase === 'sliding' ? styles[`slideTo${['Bottom', 'Left', 'Top', 'Right'][winnerRelSeat]}`] : ''}
                      `}
                      style={{ zIndex }}
                    >
                      <Card card={card} small />
                    </div>
                  );
                });
              })()}
            </div>

            {/* Turn timer - positioned in northeast corner of table */}
            {state.phase === 'playing' && state.currentPlayer !== null && (
              <div className={styles.tableTimer}>
                <div 
                  className={`${styles.tableTimerProgress} ${timerProgress < 30 ? styles.danger : timerProgress < 60 ? styles.warning : ''}`}
                  style={{ height: `${timerProgress}%` }}
                />
              </div>
            )}

            {/* Pass timer - positioned in northeast corner of table */}
            {state.phase === 'passing' && !state.passSubmitted && (
              <div className={styles.tableTimer}>
                <div 
                  className={`${styles.tableTimerProgress} ${passTimerProgress < 30 ? styles.danger : passTimerProgress < 60 ? styles.warning : ''}`}
                  style={{ height: `${passTimerProgress}%` }}
                />
              </div>
            )}
          </div>

          {/* Hand */}
          <div className={styles.handArea}>
            {/* Pass OK button - positioned over hand during passing phase */}
            {state.phase === 'passing' && !state.passSubmitted && (
              <button 
                className={styles.passOkButtonOverHand}
                onClick={handleSubmitPass}
                disabled={state.selectedPassCards.length !== 3}
              >
                Tamam ({state.selectedPassCards.length}/3)
              </button>
            )}
            {/* Rematch UI - positioned over hand during gameEnd phase */}
            {state.phase === 'gameEnd' && (
              <div className={styles.rematchOverHand}>
                <div className={styles.rematchButtons}>
                  <button className={styles.rematchYes} onClick={() => rematch(true)}>
                    Tekrar Oyna
                  </button>
                </div>
                <span className={styles.rematchVotesSmall}>
                  {Object.values(state.rematchVotes).filter(v => v).length}/4 oyuncu hazır
                </span>
              </div>
            )}
            <div className={`${styles.hand} ${isDealing ? styles.dealing : ''}`}>
              {sortHand(displayHand ?? state.hand).map((card) => {
                const selected = isCardSelected(card);
                const playable = isCardPlayable(card);
                const disabled = state.phase === 'playing' && !playable;
                
                // Check if this card is animating during pass phase
                const isPassing = passingCards.some(c => cardEquals(c, card));
                const isReceiving = receivingCards.some(c => cardEquals(c, card));
                
                return (
                  <div 
                    key={`${card.suit}-${card.rank}`}
                    className={`
                      ${styles.cardWrapper} 
                      ${selected ? styles.selected : ''} 
                      ${disabled ? styles.disabled : ''}
                      ${isPassing ? styles.cardPassing : ''}
                      ${isReceiving ? styles.cardReceiving : ''}
                    `}
                  >
                    <Card
                      card={card}
                      onClick={() => handleCardClick(card)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
