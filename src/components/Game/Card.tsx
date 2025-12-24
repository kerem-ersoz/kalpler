import type { Card as CardType } from '../../types/game';
import styles from './Card.module.css';

const SUIT_SYMBOLS: Record<string, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
};

// Pip positions for number cards (like real French cards)
// Positions are [row, col] where row/col are 0-4 (5 positions each)
const PIP_LAYOUTS: Record<number, [number, number][]> = {
  2: [[0, 2], [4, 2]],
  3: [[0, 2], [2, 2], [4, 2]],
  4: [[0, 1], [0, 3], [4, 1], [4, 3]],
  5: [[0, 1], [0, 3], [2, 2], [4, 1], [4, 3]],
  6: [[0, 1], [0, 3], [2, 1], [2, 3], [4, 1], [4, 3]],
  7: [[0, 1], [0, 3], [1, 2], [2, 1], [2, 3], [4, 1], [4, 3]],
  8: [[0, 1], [0, 3], [1, 2], [2, 1], [2, 3], [3, 2], [4, 1], [4, 3]],
  9: [[0, 1], [0, 3], [1, 1], [1, 3], [2, 2], [3, 1], [3, 3], [4, 1], [4, 3]],
  10: [[0, 1], [0, 3], [0.5, 2], [1, 1], [1, 3], [3, 1], [3, 3], [3.5, 2], [4, 1], [4, 3]],
};

interface CardProps {
  card?: CardType;
  faceDown?: boolean;
  onClick?: () => void;
  small?: boolean;
  micro?: boolean;
  className?: string;
}

export function Card({ card, faceDown = false, onClick, small = false, micro = false, className = '' }: CardProps) {
  // Face down card
  if (faceDown || !card) {
    return (
      <div className={`${styles.card} ${styles.faceDown} ${small ? styles.small : ''} ${micro ? styles.micro : ''} ${className}`} />
    );
  }

  // Default programmatic card
  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
  const suitSymbol = SUIT_SYMBOLS[card.suit];
  
  // Check if this is a number card (2-10)
  const rankNum = parseInt(card.rank);
  const isNumberCard = !isNaN(rankNum) && rankNum >= 2 && rankNum <= 10;
  const pipLayout = isNumberCard ? PIP_LAYOUTS[rankNum] : null;

  return (
    <div
      className={`${styles.card} ${isRed ? styles.red : styles.black} ${small ? styles.small : ''} ${micro ? styles.micro : ''} ${className}`}
      onClick={onClick}
    >
      <span className={styles.rank}>{card.rank}</span>
      <span className={styles.suit}>{suitSymbol}</span>
      
      {/* Pip area for number cards */}
      {!micro && pipLayout && (
        <div className={styles.pipArea}>
          {pipLayout.map(([row, col], i) => (
            <span 
              key={i} 
              className={`${styles.pip} ${row > 2 ? styles.pipFlipped : ''}`}
              style={{
                top: `${(row / 4) * 100}%`,
                left: `${(col / 4) * 100}%`,
              }}
            >
              {suitSymbol}
            </span>
          ))}
        </div>
      )}
      
      {/* Center symbol for face cards */}
      {!micro && !pipLayout && (
        <div className={styles.centerSymbol}>
          {suitSymbol}
        </div>
      )}
      
      {!micro && (
        <div className={styles.bottomCorner}>
          <span className={styles.rank}>{card.rank}</span>
          <span className={styles.suit}>{suitSymbol}</span>
        </div>
      )}
    </div>
  );
}
