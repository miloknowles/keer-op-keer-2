import { describe, it, expect } from "vitest";
import type { BoardConfig } from "@/boards/board.types";
import type { RoomPlayerRow } from "../../types/game";
import { computeScore } from "./scoring";
import { getCellsOfColor } from "./sheet";

import rawBoard from "@/boards/kok2-standard.json";
const config = rawBoard as unknown as BoardConfig;

// Column H cells: H-P, H-Q, H-R, H-S, H-T, H-U, H-V (7 cells)
// Column H bonus: first=2, subsequent=0
// Column A bonus: first=5, subsequent=3
// colorCompletion: first=5, subsequent=3
// starPenalty: -2 per uncrossed star (12 total)
// rowBonuses: all rows = 5 pts to every completer

function makePlayer(overrides: Partial<RoomPlayerRow> = {}): RoomPlayerRow {
  return {
    id: "player1",
    room_id: "room1",
    user_id: null,
    display_name: "P1",
    seat_index: 0,
    crossed_cells: [],
    hearts: 0,
    boxes_unlocked: 1,
    boxes_spent: 0,
    wildcards: 6,
    score: null,
    score_breakdown: null,
    joined_at: new Date().toISOString(),
    is_bot: false,
    bot_type: null,
    ...overrides,
  };
}

describe("computeScore — no completions", () => {
  it("has no column/row/color bonuses and applies star penalty", () => {
    const player = makePlayer();
    const result = computeScore(config, player, [player]);
    expect(result.columns).toEqual({});
    expect(result.rows).toEqual({});
    expect(result.colors).toEqual({});
    expect(result.stars).toBe(-24); // 12 uncrossed stars × -2
    expect(result.total).toBe(-24);
  });
});

describe("computeScore — column bonus", () => {
  it("awards first-completer column H bonus + hearts", () => {
    const hCells = ["H-P", "H-Q", "H-R", "H-S", "H-T", "H-U", "H-V"];
    const player = makePlayer({ crossed_cells: hCells, hearts: 2 });
    const result = computeScore(config, player, [player]);
    // Column H first = 2, + 2 hearts = 4
    expect(result.columns["H"]).toBe(4);
  });

  it("uses the heart count recorded when the column was completed", () => {
    const hCells = ["H-P", "H-Q", "H-R", "H-S", "H-T", "H-U", "H-V"];
    const player = makePlayer({
      crossed_cells: hCells,
      hearts: 5,
      column_heart_bonuses: { H: 2 },
    });
    const result = computeScore(config, player, [player]);
    // Column H first = 2, + 2 recorded hearts = 4
    expect(result.columns["H"]).toBe(4);
  });

  it("awards subsequent column bonus to second completer", () => {
    const hCells = ["H-P", "H-Q", "H-R", "H-S", "H-T", "H-U", "H-V"];
    // Player 1 completed H first (their crossed_cells has H-P at index 0)
    const player1 = makePlayer({ id: "p1", crossed_cells: hCells, hearts: 1 });
    // Player 2 completed H but later (insert some other cells first)
    const player2 = makePlayer({
      id: "p2",
      crossed_cells: ["A-P", ...hCells], // A-P at index 0, so H-V at index 7
      hearts: 3,
    });
    const allPlayers = [player1, player2];
    // player1's last H cell is at index 6 (H-V)
    // player2's last H cell is at index 7 (H-V, after A-P)
    // player1 completed first
    const score1 = computeScore(config, player1, allPlayers);
    const score2 = computeScore(config, player2, allPlayers);
    expect(score1.columns["H"]).toBe(2 + 1); // first(2) + hearts(1)
    expect(score2.columns["H"]).toBe(0 + 3); // subsequent(0) + hearts(3)
  });
});

describe("computeScore — row bonus", () => {
  it("awards row bonus to all completers", () => {
    const rowPCells = config.grid.columns
      .map((col) => `${col}-P`)
      .filter((key) => key in config.cells);

    // player1 completed row P first
    const player1 = makePlayer({ id: "p1", crossed_cells: rowPCells });
    // player2 also completed row P but later (extra cell at start shifts indices)
    const player2 = makePlayer({
      id: "p2",
      crossed_cells: ["H-Q", ...rowPCells],
    });
    const allPlayers = [player1, player2];

    const score1 = computeScore(config, player1, allPlayers);
    const score2 = computeScore(config, player2, allPlayers);

    expect(score1.rows["P"]).toBe(5); // rowBonuses.P = 5
    expect(score2.rows["P"]).toBe(5); // subsequent also earns 5 (no item)
  });
});

describe("computeScore — color bonus", () => {
  it("awards first color completion bonus", () => {
    const greenCells = getCellsOfColor(config, "g");
    const player = makePlayer({ id: "p1", crossed_cells: greenCells });
    const result = computeScore(config, player, [player]);
    expect(result.colors["g"]).toBe(5); // colorCompletion.first = 5
  });

  it("awards subsequent color bonus to second completer", () => {
    const greenCells = getCellsOfColor(config, "g");
    const player1 = makePlayer({ id: "p1", crossed_cells: greenCells });
    // player2 completed green later (one extra cell at front)
    const player2 = makePlayer({
      id: "p2",
      crossed_cells: ["H-P", ...greenCells],
    });
    const allPlayers = [player1, player2];

    const score2 = computeScore(config, player2, allPlayers);
    expect(score2.colors["g"]).toBe(3); // colorCompletion.subsequent = 3
  });
});

describe("computeScore — star penalty", () => {
  it("applies -2 per uncrossed star", () => {
    const player = makePlayer({ crossed_cells: ["C-P", "H-R"] }); // cross 2 of 12 stars
    const result = computeScore(config, player, [player]);
    expect(result.stars).toBe(10 * -2); // 10 uncrossed stars × -2
  });

  it("zero star penalty when all stars crossed", () => {
    const allStars = [
      "B-S",
      "C-P",
      "D-S",
      "E-V",
      "F-P",
      "G-U",
      "H-R",
      "I-V",
      "J-Q",
      "L-P",
      "M-S",
      "N-U",
    ];
    const player = makePlayer({ crossed_cells: allStars });
    const result = computeScore(config, player, [player]);
    expect(result.stars).toBe(0);
  });
});

describe("computeScore — total", () => {
  it("total is the sum of all components", () => {
    const player = makePlayer();
    const result = computeScore(config, player, [player]);
    const expected =
      Object.values(result.columns).reduce((a, b) => a + b, 0) +
      Object.values(result.rows).reduce((a, b) => a + b, 0) +
      Object.values(result.colors as Record<string, number>).reduce(
        (a, b) => a + b,
        0,
      ) +
      result.stars;
    expect(result.total).toBe(expected);
  });
});

describe("computeScore — column A bonus", () => {
  it("awards first-completer column A bonus (first=5) + hearts", () => {
    const aCells = ["A-P", "A-Q", "A-R", "A-S", "A-T", "A-U", "A-V"];
    const player = makePlayer({ crossed_cells: aCells, hearts: 3 });
    const result = computeScore(config, player, [player]);
    // Column A first = 5, + 3 hearts = 8
    expect(result.columns["A"]).toBe(8);
  });

  it("awards subsequent column A bonus (subsequent=3) + hearts to second completer", () => {
    const aCells = ["A-P", "A-Q", "A-R", "A-S", "A-T", "A-U", "A-V"];
    const player1 = makePlayer({ id: "p1", crossed_cells: aCells, hearts: 1 });
    const player2 = makePlayer({
      id: "p2",
      crossed_cells: ["H-P", ...aCells],
      hearts: 2,
    });
    const allPlayers = [player1, player2];
    const score1 = computeScore(config, player1, allPlayers);
    const score2 = computeScore(config, player2, allPlayers);
    expect(score1.columns["A"]).toBe(5 + 1); // first(5) + hearts(1)
    expect(score2.columns["A"]).toBe(3 + 2); // subsequent(3) + hearts(2)
  });
});

describe("computeScore — multiple columns", () => {
  it("includes all completed columns in result and total", () => {
    const hCells = ["H-P", "H-Q", "H-R", "H-S", "H-T", "H-U", "H-V"];
    const aCells = ["A-P", "A-Q", "A-R", "A-S", "A-T", "A-U", "A-V"];
    const player = makePlayer({
      crossed_cells: [...hCells, ...aCells],
      hearts: 1,
    });
    const result = computeScore(config, player, [player]);
    // Column H first=2, + 1 heart = 3
    expect(result.columns["H"]).toBe(3);
    // Column A first=5, + 1 heart = 6
    expect(result.columns["A"]).toBe(6);
    // Both columns contribute to total
    const colSum = Object.values(result.columns).reduce((a, b) => a + b, 0);
    expect(colSum).toBeGreaterThanOrEqual(9); // at least H(3) + A(6)
    expect(result.total).toBe(
      colSum +
        Object.values(result.rows).reduce((a, b) => a + b, 0) +
        Object.values(result.colors as Record<string, number>).reduce(
          (a, b) => a + b,
          0,
        ) +
        result.stars,
    );
  });

  it("uses each column's own recorded heart count", () => {
    const hCells = ["H-P", "H-Q", "H-R", "H-S", "H-T", "H-U", "H-V"];
    const aCells = ["A-P", "A-Q", "A-R", "A-S", "A-T", "A-U", "A-V"];
    const player = makePlayer({
      crossed_cells: [...hCells, ...aCells],
      hearts: 5,
      column_heart_bonuses: { H: 1, A: 4 },
    });
    const result = computeScore(config, player, [player]);

    expect(result.columns["H"]).toBe(2 + 1);
    expect(result.columns["A"]).toBe(5 + 4);
  });
});
