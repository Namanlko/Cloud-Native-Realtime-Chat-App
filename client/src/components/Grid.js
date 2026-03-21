import React from "react";
import Tile from "./Tile";

const Grid = ({ board }) => {
  return (
    <div className="grid">
      {board.map((row, rowIndex) =>
        row.map((value, colIndex) => (
          <Tile 
            key={`${rowIndex}-${colIndex}`} 
            value={value} 
          />
        ))
      )}
    </div>
  );
};

export default Grid;
