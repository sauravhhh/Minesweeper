/* Minesweeper core logic — pure functions, no DOM. Used by index.html and headless-tested in Node. */
(function (root) {
  'use strict';

  function createBoard(rows, cols, mines) {
    var grid = [];
    for (var r = 0; r < rows; r++) {
      grid.push([]);
      for (var c = 0; c < cols; c++) grid[r].push({ mine: false, count: 0, revealed: false, flagged: false });
    }
    return {
      rows: rows, cols: cols, mineCount: mines,
      grid: grid, minesPlaced: false,
      revealedCount: 0, flaggedCount: 0,
      status: 'ready' // ready | playing | won | lost
    };
  }

  function neighbors(state, r, c) {
    var out = [];
    for (var dr = -1; dr <= 1; dr++)
      for (var dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        var nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < state.rows && nc >= 0 && nc < state.cols) out.push([nr, nc]);
      }
    return out;
  }

  // Places mines after the first reveal, guaranteeing the first cell (and its
  // neighbors, for a nice opening) are safe. rng injectable for tests.
  function placeMines(state, safeR, safeC, rng) {
    rng = rng || Math.random;
    var safe = {};
    safe[safeR + ',' + safeC] = true;
    neighbors(state, safeR, safeC).forEach(function (n) { safe[n[0] + ',' + n[1]] = true; });

    var placed = 0, guard = 0;
    while (placed < state.mineCount && guard++ < 10000) {
      var r = Math.floor(rng() * state.rows), c = Math.floor(rng() * state.cols);
      if (safe[r + ',' + c] || state.grid[r][c].mine) continue;
      state.grid[r][c].mine = true;
      placed++;
    }
    // Neighbor counts
    for (var r2 = 0; r2 < state.rows; r2++)
      for (var c2 = 0; c2 < state.cols; c2++) {
        if (state.grid[r2][c2].mine) continue;
        var n = 0;
        neighbors(state, r2, c2).forEach(function (xy) { if (state.grid[xy[0]][xy[1]].mine) n++; });
        state.grid[r2][c2].count = n;
      }
    state.minesPlaced = true;
  }

  // Reveals a cell. Returns { exploded, revealed: [[r,c]...], won }.
  function reveal(state, r, c, rng) {
    if (state.status === 'won' || state.status === 'lost') return { exploded: false, revealed: [], won: false };
    var cell = state.grid[r][c];
    if (cell.revealed || cell.flagged) return { exploded: false, revealed: [], won: false };

    if (!state.minesPlaced) {
      placeMines(state, r, c, rng);
      state.status = 'playing';
    }

    if (cell.mine) {
      cell.revealed = true;
      state.status = 'lost';
      return { exploded: true, revealed: [[r, c]], won: false };
    }

    // Flood fill
    var revealed = [], stack = [[r, c]];
    while (stack.length) {
      var cur = stack.pop(), cr = cur[0], cc = cur[1];
      var cl = state.grid[cr][cc];
      if (cl.revealed || cl.flagged) continue;
      cl.revealed = true;
      state.revealedCount++;
      revealed.push([cr, cc]);
      if (cl.count === 0) {
        neighbors(state, cr, cc).forEach(function (n) {
          var nl = state.grid[n[0]][n[1]];
          if (!nl.revealed && !nl.flagged) stack.push(n);
        });
      }
    }

    var won = state.revealedCount === state.rows * state.cols - state.mineCount;
    if (won) state.status = 'won';
    return { exploded: false, revealed: revealed, won: won };
  }

  function toggleFlag(state, r, c) {
    if (state.status === 'won' || state.status === 'lost') return false;
    var cell = state.grid[r][c];
    if (cell.revealed) return false;
    cell.flagged = !cell.flagged;
    state.flaggedCount += cell.flagged ? 1 : -1;
    return cell.flagged;
  }

  // Chord: reveal all unflagged neighbors of a revealed number whose flag count matches.
  function chord(state, r, c, rng) {
    var cell = state.grid[r][c];
    if (!cell.revealed || cell.count === 0) return { exploded: false, revealed: [], won: false };
    var nbs = neighbors(state, r, c);
    var flags = nbs.filter(function (n) { return state.grid[n[0]][n[1]].flagged; }).length;
    if (flags !== cell.count) return { exploded: false, revealed: [], won: false };
    var all = { exploded: false, revealed: [], won: false };
    nbs.forEach(function (n) {
      var nl = state.grid[n[0]][n[1]];
      if (!nl.revealed && !nl.flagged) {
        var res = reveal(state, n[0], n[1], rng);
        if (res.exploded) { all.exploded = true; }
        all.revealed = all.revealed.concat(res.revealed);
        if (res.won) all.won = true;
      }
    });
    return all;
  }

  function countMines(state) {
    var n = 0;
    for (var r = 0; r < state.rows; r++)
      for (var c = 0; c < state.cols; c++)
        if (state.grid[r][c].mine) n++;
    return n;
  }

  var api = {
    createBoard: createBoard, placeMines: placeMines, reveal: reveal,
    toggleFlag: toggleFlag, chord: chord, neighbors: neighbors, countMines: countMines
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Minesweeper = api;
})(typeof window !== 'undefined' ? window : global);
