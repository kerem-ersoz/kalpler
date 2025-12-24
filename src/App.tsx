import { useGame } from './context/GameContext';
import { Lobby } from './components/Lobby';
import { Game } from './components/Game';

function AppContent() {
  const { state } = useGame();
  
  if (state.tableId) {
    return <Game />;
  }
  
  return <Lobby />;
}

export default function App() {
  return <AppContent />;
}
