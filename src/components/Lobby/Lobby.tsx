import { useState, useEffect, useCallback } from 'react';
import { useSocket } from '../../context/SocketContext';
import { generateDefaultName } from '../../utils/defaultNames';
import type { TableInfo, GameType } from '../../types/game';
import styles from './Lobby.module.css';

const GAME_TYPE_LABELS: Record<GameType, string> = {
  hearts: 'Kupa Almaz',
  king: 'King',
};

export function Lobby() {
  const { socket, isConnected, createTable, joinTable, listTables, spectateTable } = useSocket();
  const [playerName, setPlayerName] = useState(() => generateDefaultName());
  const [isGeneratedName, setIsGeneratedName] = useState(true);
  const [joinTableId, setJoinTableId] = useState('');
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedGameType, setSelectedGameType] = useState<GameType>('hearts');
  const [showScoreModal, setShowScoreModal] = useState(false);
  const [endingScore, setEndingScore] = useState(50);

  const refreshTables = useCallback(() => {
    listTables(true); // Include in-progress games
  }, [listTables]);

  useEffect(() => {
    if (isConnected) {
      refreshTables();
    }
  }, [isConnected, refreshTables]);

  useEffect(() => {
    if (!socket) return;

    const handleTablesList = (tableList: TableInfo[]) => {
      setTables(tableList);
    };

    socket.on('tablesList', handleTablesList);

    return () => {
      socket.off('tablesList', handleTablesList);
    };
  }, [socket]);

  const handleCreateTable = () => {
    if (playerName.trim()) {
      if (selectedGameType === 'hearts') {
        setShowScoreModal(true);
      } else {
        createTable(playerName.trim(), selectedGameType);
      }
    }
  };

  const handleConfirmCreate = () => {
    createTable(playerName.trim(), selectedGameType, { endingScore });
    setShowScoreModal(false);
  };

  const handleJoinTable = (tableId: string) => {
    if (playerName.trim()) {
      joinTable(tableId, playerName.trim());
    }
  };

  const handleSpectateTable = (tableId: string) => {
    spectateTable(tableId, playerName.trim() || 'Spectator');
  };

  const handleJoinByCode = () => {
    if (playerName.trim() && joinTableId.trim()) {
      joinTable(joinTableId.trim().toLowerCase(), playerName.trim());
    }
  };

  return (
    <div className={styles.lobby}>
      <div className={styles.connectionStatus}>
        <div className={`${styles.statusDot} ${isConnected ? styles.connected : ''}`} />
        {isConnected ? 'Bağlı' : 'Bağlanıyor...'}
      </div>

      <h1 className={styles.title}>GÖNÜL KIRAATHANESi</h1>

      <div className={styles.content}>
        <div className={styles.nameSection}>
          <input
            id="playerName"
            type="text"
            className={styles.nameInput}
            value={playerName}
            onChange={(e) => {
              setPlayerName(e.target.value);
              setIsGeneratedName(false);
            }}
            onFocus={() => {
              if (isGeneratedName) {
                setPlayerName('');
                setIsGeneratedName(false);
              }
            }}
            placeholder="Adınızı girin..."
            maxLength={20}
          />
        </div>

        <div className={styles.gameTypeSection}>
          <div className={styles.gameTypeButtons}>
            <button
              className={`${styles.gameTypeButton} ${selectedGameType === 'hearts' ? styles.active : ''}`}
              onClick={() => setSelectedGameType('hearts')}
            >
              Kupa Almaz
            </button>
            <button
              className={`${styles.gameTypeButton} ${selectedGameType === 'king' ? styles.active : ''}`}
              onClick={() => setSelectedGameType('king')}
            >
              King
            </button>
          </div>
        </div>

        <div className={styles.actions}>
          <button
            className={styles.createButton}
            onClick={handleCreateTable}
            disabled={!playerName.trim() || !isConnected}
          >
            Yeni Masa Oluştur
          </button>
        </div>

        <div className={styles.tablesSection}>
          <div className={styles.tablesHeader}>
            <h2 className={styles.tablesTitle}>Açık Masalar</h2>
            <button className={styles.refreshButton} onClick={refreshTables}>
              Yenile
            </button>
          </div>

          {tables.length > 0 ? (
            <div className={styles.tablesList}>
              {tables.map((table) => (
                <div key={table.id} className={`${styles.tableItem} ${table.inGame ? styles.inProgress : ''}`}>
                  <div className={styles.tableInfo}>
                    <div className={styles.tableHeader}>
                      <span className={styles.tableId}>{table.id}</span>
                      <span className={styles.gameType}>{GAME_TYPE_LABELS[table.gameType] || 'Kupa Almaz'}</span>
                      {table.inGame && (
                        <span className={styles.inGameBadge}>OYUNDA</span>
                      )}
                      {!table.inGame && (
                        <span className={styles.scoreLimit}>
                          {table.gameType === 'king' ? 'Parti: 1' : `Bitiş: ${table.endingScore || 20}`}
                        </span>
                      )}
                    </div>
                    <span className={styles.tablePlayers}>
                      {table.inGame ? (
                        <>
                          {table.playerNames.join(', ')}
                          {table.spectatorCount > 0 && ` • ${table.spectatorCount} izleyici`}
                        </>
                      ) : (
                        <>{table.playerCount}/4 oyuncu • {table.playerNames.join(', ')}</>
                      )}
                    </span>
                  </div>
                  {table.inGame ? (
                    <div className={styles.buttonGroup}>
                      <button
                        className={styles.spectateButton}
                        onClick={() => handleSpectateTable(table.id)}
                        disabled={!isConnected}
                      >
                        izle
                      </button>
                      {table.hasTakeoverSeat && (
                        <button
                          className={styles.joinButton}
                          onClick={() => handleJoinTable(table.id)}
                          disabled={!playerName.trim() || !isConnected}
                        >
                          Katıl
                        </button>
                      )}
                    </div>
                  ) : (
                    <button
                      className={styles.joinButton}
                      onClick={() => handleJoinTable(table.id)}
                      disabled={!playerName.trim() || !isConnected}
                    >
                      Katıl
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.emptyMessage}>
              Şu anda açık masa yok. Yeni bir masa oluşturun!
            </p>
          )}
        </div>
      </div>

      {/* Score selection modal for Hearts */}
      {showScoreModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h3 className={styles.modalTitle}>Bitiş Puanı</h3>
            <div className={styles.sliderContainer}>
              <input
                type="range"
                min="10"
                max="100"
                step="5"
                value={endingScore}
                onChange={(e) => setEndingScore(Number(e.target.value))}
                className={styles.slider}
              />
              <span className={styles.sliderValue}>{endingScore}</span>
            </div>
            <div className={styles.modalButtons}>
              <button
                className={styles.modalCancelButton}
                onClick={() => setShowScoreModal(false)}
              >
                iptal
              </button>
              <button
                className={styles.modalConfirmButton}
                onClick={handleConfirmCreate}
              >
                Oluştur
              </button>
            </div>
          </div>
        </div>
      )}
      <span className={styles.versionInfo}>v1.3.1</span>
    </div>
  );
}
