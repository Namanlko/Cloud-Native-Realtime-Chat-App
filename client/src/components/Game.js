import React, { useState, useEffect, useCallback } from "react";
import Grid from "./Grid";
import ScoreBoard from "./ScoreBoard";
import axios from "axios";

// ✅ Dynamic API URL (NO hardcoding, NO docker service name)
const API_URL = `/api`;

const Game = () => {
  const [board, setBoard] = useState([]);
  const [score, setScore] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    newGame();
  }, []);

  const newGame = async () => {
    try {
      setLoading(true);
      const response = await axios.post(`${API_URL}/new-game`);
      setBoard(response.data.board);
      setScore(response.data.score);
      setError(null);
    } catch (err) {
      setError("Failed to start new game");
      console.error("New game error:", err);
    } finally {
      setLoading(false);
    }
  };

  const makeMove = useCallback(async (direction) => {
    try {
      const response = await axios.post(`${API_URL}/move`, {
        board,
        direction,
        score
      });

      setBoard(response.data.board);
      setScore(response.data.score);

      if (response.data.gameOver) {
        setTimeout(() => {
          alert(`Game Over! Final Score: ${response.data.score}`);
        }, 100);
      }

      if (response.data.won) {
        setTimeout(() => {
          alert("Congratulations! You reached 2048!");
        }, 100);
      }
    } catch (err) {
      console.error("Move failed:", err);
    }
  }, [board, score]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        const direction = e.key.replace("Arrow", "").toLowerCase();
        makeMove(direction);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [makeMove]);

  if (loading) {
    return <div className="loading">Loading game...</div>;
  }

  if (error) {
    return <div className="error">{error}</div>;
  }

  return (
    <div className="game-container">
      <div className="game-header">
        <h1 className="game-title">2048</h1>
        <ScoreBoard score={score} />
      </div>

      <Grid board={board} />

      <button className="restart-btn" onClick={newGame}>
        ↻ New Game
      </button>

      <div className="hint">
        <kbd>←</kbd>
        <kbd>→</kbd>
        <kbd>↑</kbd>
        <kbd>↓</kbd>
      </div>
    </div>
  );
};

export default Game;
