class ChessGame {
  constructor() {
    this.board = this.createInitialBoard();
    this.currentPlayer = 'white';
    this.selectedPiece = null;
    this.moveHistory = [];
    this.gameStatus = 'active';
    this.enPassantSquare = null;
    this.castlingRights = this.initializeCastlingRights();
    this.aiWorker = new Worker('ai-worker.js');
    this.animationQueue = [];
    this.gameMode = 'ai';
    this.difficultyLevel = 3;
    this.init();
  }

  initializeCastlingRights() {
    return {
      white: { kingSide: true, queenSide: true },
      black: { kingSide: true, queenSide: true }
    };
  }

  createInitialBoard() {
    const board = Array(8).fill().map(() => Array(8).fill(null));
    
    const setupPieces = (row, color) => {
      const pieces = ['♜', '♞', '♝', '♛', '♚', '♝', '♞', '♜'];
      return pieces.map(type => ({ type, color, moved: false }));
    };

    board[0] = setupPieces(0, 'black');
    board[1] = Array(8).fill().map(() => ({ type: '♟', color: 'black', moved: false }));
    board[6] = Array(8).fill().map(() => ({ type: '♟', color: 'white', moved: false }));
    board[7] = setupPieces(7, 'white');
    
    return board;
  }

  init() {
    this.setupAIWorker();
    this.renderBoard();
    this.setupEventListeners();
    this.loadGameState();
    this.setupDragAndDrop();
  }

  setupAIWorker() {
    this.aiWorker.onmessage = (e) => {
      const { bestMove, evaluation } = e.data;
      this.executeAIMove(bestMove);
    };
  }

  setupEventListeners() {
    document.querySelectorAll('.chess-square').forEach(square => {
      square.addEventListener('click', e => this.handleSquareClick(e));
      square.addEventListener('contextmenu', e => this.handleRightClick(e));
    });

    document.querySelector('.new-game').addEventListener('click', () => this.startNewGame());
    document.querySelector('.undo-move').addEventListener('click', () => this.undoMove());
    document.getElementById('difficultySelect').addEventListener('change', e => {
      this.difficultyLevel = parseInt(e.target.value);
    });
    
    document.addEventListener('keydown', e => this.handleKeyboardShortcuts(e));
  }

  handleKeyboardShortcuts(e) {
    if (e.ctrlKey && e.key === 'z') this.undoMove();
    if (e.key === 'Escape') this.clearSelection();
    if (e.key === 'f') this.toggleFullscreen();
  }

  async executeAIMove(move) {
    await this.animatePieceMovement(move.start, move.end);
    this.executeMove(move.start, move.end);
    this.currentPlayer = 'white';
    this.checkGameState();
  }

  async animatePieceMovement(from, to) {
    const pieceElement = document.querySelector(`[data-row="${from[0]}"][data-col="${from[1]}"] .piece`);
    const targetSquare = document.querySelector(`[data-row="${to[0]}"][data-col="${to[1]}"]`);
    
    return new Promise(resolve => {
      pieceElement.style.transform = `translate(${
        (to[1] - from[1]) * 100
      }%, ${(to[0] - from[0]) * 100}%)`;
      
      pieceElement.addEventListener('transitionend', () => {
        targetSquare.appendChild(pieceElement);
        pieceElement.style.transform = '';
        resolve();
      }, { once: true });
    });
  }

  getPossibleMoves(position) {
    const moves = [];
    const piece = this.getPiece(position);
    
    const movementPatterns = {
      '♟': this.getPawnMoves,
      '♜': this.getRookMoves,
      '♞': this.getKnightMoves,
      '♝': this.getBishopMoves,
      '♛': this.getQueenMoves,
      '♚': this.getKingMoves
    };

    return movementPatterns[piece.type](position);
  }

  getKingMoves([x, y]) {
    const moves = [];
    const directions = [
      [-1, -1], [-1, 0], [-1, 1],
      [0, -1],          [0, 1],
      [1, -1],  [1, 0], [1, 1]
    ];

    directions.forEach(([dx, dy]) => {
      const newX = x + dx;
      const newY = y + dy;
      if (this.isValidPosition(newX, newY)) {
        moves.push([newX, newY]);
      }
    });

    // Castling logic
    const { kingSide, queenSide } = this.castlingRights[this.currentPlayer];
    if (kingSide && this.isCastlingPathClear([x, y], 'kingSide')) {
      moves.push([x, y + 2]);
    }
    if (queenSide && this.isCastlingPathClear([x, y], 'queenSide')) {
      moves.push([x, y - 2]);
    }

    return moves;
  }

  isCastlingPathClear([x, y], side) {
    const direction = side === 'kingSide' ? 1 : -1;
    for (let i = 1; i <= 2; i++) {
      if (this.getPiece([x, y + (i * direction)])) return false;
    }
    return true;
  }

  async promotePawn(position) {
    return new Promise(resolve => {
      const dialog = document.getElementById('promotionDialog');
      dialog.showModal();

      dialog.querySelectorAll('.promotion-choice').forEach(btn => {
        btn.addEventListener('click', () => {
          this.getPiece(position).type = btn.dataset.piece;
          dialog.close();
          this.renderBoard();
          resolve();
        }, { once: true });
      });
    });
  }

  evaluateBoard() {
    let score = 0;
    const pieceValues = {
      '♟': 100, '♞': 300, '♝': 300,
      '♜': 500, '♛': 900, '♚': 20000
    };

    this.board.forEach((row, x) => {
      row.forEach((piece, y) => {
        if (!piece) return;
        const value = pieceValues[piece.type];
        score += piece.color === 'white' ? value : -value;
        score += this.getPositionalValue(piece, x, y);
      });
    });

    return score;
  }

  getPositionalValue(piece, x, y) {
    const positionalTables = {
      '♟': [
        [ 0,  0,  0,  0,  0,  0,  0,  0],
        [50, 50, 50, 50, 50, 50, 50, 50],
        [10, 10, 20, 30, 30, 20, 10, 10],
        [ 5,  5, 10, 25, 25, 10,  5,  5],
        [ 0,  0,  0, 20, 20,  0,  0,  0],
        [ 5, -5,-10,  0,  0,-10, -5,  5],
        [ 5, 10, 10,-20,-20, 10, 10,  5],
        [ 0,  0,  0,  0,  0,  0,  0,  0]
      ],
      // ... جداول مماثلة للقطع الأخرى
    };

    const table = positionalTables[piece.type];
    return piece.color === 'white' ? table[x][y] : table[7 - x][7 - y];
  }

  async makeAIMove() {
    this.aiWorker.postMessage({
      board: this.board,
      depth: this.difficultyLevel,
      currentPlayer: this.currentPlayer
    });
  }

  isCheck(board = this.board) {
    const kingPos = this.findKingPosition(board);
    return this.isSquareUnderAttack(kingPos, board);
  }

  isCheckmate() {
    if (!this.isCheck()) return false;
    return this.getAllPossibleMoves().length === 0;
  }

  getAllPossibleMoves() {
    const moves = [];
    this.board.forEach((row, x) => {
      row.forEach((piece, y) => {
        if (piece?.color === this.currentPlayer) {
          moves.push(...this.getPossibleMoves([x, y]).map(end => ({ start: [x, y], end }));
        }
      });
    });
    return moves;
  }

  handleRightClick(e) {
    e.preventDefault();
    const square = e.currentTarget;
    square.classList.toggle('threatened-piece');
    this.showMoveAnalysis(square);
  }

  showMoveAnalysis(square) {
    const position = this.getPositionFromElement(square);
    const threats = this.getThreatsToPosition(position);
    this.highlightThreats(threats);
  }

  getThreatsToPosition(position) {
    const threats = [];
    this.board.forEach((row, x) => {
      row.forEach((piece, y) => {
        if (piece?.color !== this.currentPlayer && this.isValidMove([x, y], position)) {
          threats.push([x, y]);
        }
      });
    });
    return threats;
  }

  setupDragAndDrop() {
    document.querySelectorAll('.piece').forEach(piece => {
      piece.addEventListener('dragstart', e => this.handleDragStart(e));
      piece.addEventListener('dragend', e => this.handleDragEnd(e));
    });

    document.querySelectorAll('.chess-square').forEach(square => {
      square.addEventListener('dragover', e => this.handleDragOver(e));
      square.addEventListener('drop', e => this.handleDrop(e));
    });
  }

  handleDragStart(e) {
    const piece = e.target;
    const position = this.getPositionFromElement(piece.parentElement);
    if (this.getPiece(position)?.color !== this.currentPlayer) {
      e.preventDefault();
      return;
    }
    this.selectedPiece = position;
    piece.classList.add('dragging');
    this.highlightPossibleMoves(position);
  }

  handleDrop(e) {
    e.preventDefault();
    const targetPosition = this.getPositionFromElement(e.currentTarget);
    if (this.isValidMove(this.selectedPiece, targetPosition)) {
      this.handleMove(targetPosition);
    }
    this.clearDragState();
  }

  clearDragState() {
    document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
    this.clearHighlights();
    this.selectedPiece = null;
  }

  // ... المزيد من الدوال المعززة
}

// نظام Web Worker
class ChessAI {
  constructor() {
    self.onmessage = (e) => this.processMessage(e);
  }

  processMessage(e) {
    const { board, depth, currentPlayer } = e.data;
    const bestMove = this.minimaxRoot(board, depth, currentPlayer);
    self.postMessage(bestMove);
  }

  minimaxRoot(board, depth, player) {
    let bestValue = -Infinity;
    let bestMove = null;
    
    const moves = this.getAllMoves(board, player);
    moves.forEach(move => {
      const newBoard = this.executeTempMove(move);
      const value = this.minimax(newBoard, depth - 1, -Infinity, Infinity, false);
      if (value > bestValue) {
        bestValue = value;
        bestMove = move;
      }
    });
    
    return { bestMove, evaluation: bestValue };
  }

  // ... تطبيق كامل لخوارزمية Minimax مع Alpha-Beta Pruning
}

// بدء النظام
window.addEventListener('DOMContentLoaded', () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js');
  }
  new ChessGame();
});