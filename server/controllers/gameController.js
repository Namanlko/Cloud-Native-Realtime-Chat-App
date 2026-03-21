const createEmptyBoard = () => {
  return Array(4).fill().map(() => Array(4).fill(0));
};

const addRandomTile = (board) => {
  const emptyCells = [];
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      if (board[i][j] === 0) emptyCells.push([i, j]);
    }
  }
  
  if (emptyCells.length === 0) return board;
  
  const [row, col] = emptyCells[Math.floor(Math.random() * emptyCells.length)];
  board[row][col] = Math.random() < 0.9 ? 2 : 4;
  return board;
};

const moveAndMerge = (board, direction) => {
  let newBoard = JSON.parse(JSON.stringify(board));
  let moved = false;
  let scoreEarned = 0;

  const rotateLeft = (matrix) => {
    return matrix[0].map((_, index) => matrix.map(row => row[index]).reverse());
  };

  const rotateRight = (matrix) => {
    return matrix[0].map((_, index) => matrix.map(row => row[index]).reverse()).reverse();
  };

  if (direction === "up") {
    newBoard = rotateLeft(newBoard);
  } else if (direction === "down") {
    newBoard = rotateRight(newBoard);
  } else if (direction === "right") {
    newBoard = newBoard.map(row => row.reverse());
  }

  for (let i = 0; i < 4; i++) {
    const row = newBoard[i];
    const filtered = row.filter(val => val !== 0);
    const merged = [];
    let j = 0;
    
    while (j < filtered.length) {
      if (j < filtered.length - 1 && filtered[j] === filtered[j + 1]) {
        merged.push(filtered[j] * 2);
        scoreEarned += filtered[j] * 2;
        j += 2;
      } else {
        merged.push(filtered[j]);
        j++;
      }
    }
    
    while (merged.length < 4) merged.push(0);
    
    if (JSON.stringify(row) !== JSON.stringify(merged)) {
      moved = true;
    }
    newBoard[i] = merged;
  }

  if (direction === "up") {
    newBoard = rotateRight(newBoard);
  } else if (direction === "down") {
    newBoard = rotateLeft(newBoard);
  } else if (direction === "right") {
    newBoard = newBoard.map(row => row.reverse());
  }

  return { newBoard, moved, scoreEarned };
};

const checkGameOver = (board) => {
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      if (board[i][j] === 0) return false;
    }
  }

  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 3; j++) {
      if (board[i][j] === board[i][j + 1]) return false;
    }
  }

  for (let j = 0; j < 4; j++) {
    for (let i = 0; i < 3; i++) {
      if (board[i][j] === board[i + 1][j]) return false;
    }
  }

  return true;
};

const checkWin = (board) => {
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      if (board[i][j] === 2048) return true;
    }
  }
  return false;
};

exports.newGame = (req, res) => {
  try {
    let board = createEmptyBoard();
    board = addRandomTile(board);
    board = addRandomTile(board);
    
    res.json({
      board,
      score: 0,
      gameOver: false,
      won: false
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.makeMove = (req, res) => {
  try {
    const { board, direction, score } = req.body;
    
    if (!board || !direction) {
      return res.status(400).json({ error: "Board and direction are required" });
    }

    const { newBoard, moved, scoreEarned } = moveAndMerge(board, direction);
    let updatedBoard = newBoard;
    let newScore = score + scoreEarned;

    if (moved) {
      updatedBoard = addRandomTile(newBoard);
    }

    const gameOver = checkGameOver(updatedBoard);
    const won = checkWin(updatedBoard);

    res.json({
      board: updatedBoard,
      score: newScore,
      gameOver,
      won
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
