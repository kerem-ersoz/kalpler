import React, { useState, useRef, useEffect } from 'react';
import { useGame } from '../../context/GameContext';
import { useSocket } from '../../context/SocketContext';
import styles from './ChatPanel.module.css';

export function ChatPanel() {
  const { state } = useGame();
  const { sendChatMessage, setTyping } = useSocket();
  const [message, setMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.messages]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessage(e.target.value);
    
    // Send typing indicator
    setTyping(true);
    
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    typingTimeoutRef.current = setTimeout(() => {
      setTyping(false);
    }, 2000);
  };

  const handleSend = () => {
    if (message.trim()) {
      sendChatMessage(message.trim());
      setMessage('');
      setTyping(false);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className={styles.chatPanel}>
      <div className={styles.messages}>
        {state.messages.map((msg, index) => (
          <div key={index} className={styles.message}>
            <div className={styles.messageHeader}>
              <span className={`${styles.messageSender} ${styles[`seat${msg.seat}`]}`}>
                {msg.from}
              </span>
              <span className={styles.messageTime}>{formatTime(msg.timestamp)}</span>
            </div>
            <span className={styles.messageText}>{msg.text}</span>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      
      <div className={styles.typingIndicator}>
        {state.typingPlayers.length > 0 && (
          <span>{state.typingPlayers.join(', ')} yazıyor...</span>
        )}
      </div>
      
      <div className={styles.inputArea}>
        <input
          type="text"
          className={styles.chatInput}
          value={message}
          onChange={handleInputChange}
          onKeyPress={handleKeyPress}
          placeholder="Mesaj yazın..."
          maxLength={500}
        />
        <button 
          className={styles.sendButton}
          onClick={handleSend}
          disabled={!message.trim()}
        >
          Gönder
        </button>
      </div>
    </div>
  );
}
