import React from "react";

const ScoreBoard = ({ score }) => {
  return (
    <div className="score-board">
      <span className="score-label">score</span>
      <span className="score-value">{score}</span>
    </div>
  );
};

export default ScoreBoard;
