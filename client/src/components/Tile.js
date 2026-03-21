import React from "react";

const Tile = ({ value }) => {
  const getTileClass = () => {
    if (value === 0) return "tile empty";
    return `tile value-${value}`;
  };

  return (
    <div className={getTileClass()}>
      {value !== 0 && value}
    </div>
  );
};

export default Tile;
