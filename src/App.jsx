import { Routes, Route, Navigate } from "react-router-dom";
import GameHub from "@/games/GameHub";
import GamePage from "@/games/GamePage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/games" replace />} />
      <Route path="/games" element={<GameHub />} />
      <Route path="/games/:gameId" element={<GamePage />} />
      <Route path="*" element={<Navigate to="/games" replace />} />
    </Routes>
  );
}
