import { useState, useEffect, useCallback } from 'react';
import { useSocket } from '../../context/SocketContext';
import { generateDefaultName } from '../../utils/defaultNames';
import type { TableInfo } from '../../types/game';
import styles from './Lobby.module.css';

export function Lobby() {
  const { socket, isConnected, createTable, joinTable, listTables } = useSocket();
  const [playerName, setPlayerName] = useState(() => generateDefaultName());
  const [isGeneratedName, setIsGeneratedName] = useState(true);
  const [joinTableId, setJoinTableId] = useState('');
  const [tables, setTables] = useState<TableInfo[]>([]);

  const refreshTables = useCallback(() => {
    listTables();
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
      createTable(playerName.trim());
    }
  };

  const handleJoinTable = (tableId: string) => {
    if (playerName.trim()) {
      joinTable(tableId, playerName.trim());
    }
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

      <h1 className={styles.title}>GÖNÜL<br />KIRAATHANESi</h1>

      <div className={styles.content}>
        <div className={styles.nameSection}>
          <label htmlFor="playerName">Oyuncu Adı</label>
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
                <div key={table.id} className={styles.tableItem}>
                  <div className={styles.tableInfo}>
                    <div className={styles.tableHeader}>
                      <span className={styles.tableId}>{table.id}</span>
                      <span className={styles.gameType}>Kalpler</span>
                      <span className={styles.scoreLimit}>Bitiş: 20</span>
                    </div>
                    <span className={styles.tablePlayers}>
                      {table.playerCount}/4 oyuncu • {table.playerNames.join(', ')}
                    </span>
                  </div>
                  <button
                    className={styles.joinButton}
                    onClick={() => handleJoinTable(table.id)}
                    disabled={!playerName.trim() || !isConnected}
                  >
                    Katıl
                  </button>
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
    </div>
  );
}
