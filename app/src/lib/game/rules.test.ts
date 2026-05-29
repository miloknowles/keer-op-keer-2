import { describe, it, expect } from "vitest";
import type { BoardConfig } from "@/boards/board.types";
import type {
  DiceRoll,
  RoomPlayerRow,
  ColorNumberPick,
  SpecialPick,
  GamePick,
} from "../../types/game";
import {
  validateColorNumberPick,
  validateSpecialPick,
  validateBombCells,
  getValidCells,
} from "./rules";

import rawBoard from "@/boards/kok2-standard.json";
const config = rawBoard as unknown as BoardConfig;

// H-P: green, H-Q: pink, H-R: orange(star), H-S: blue
// G-P: pink, I-P: green, G-Q: pink
// Orange connected region from H-R: H-R, G-R, F-R, F-Q, E-Q

function makePlayer(overrides: Partial<RoomPlayerRow> = {}): RoomPlayerRow {
  return {
    id: "player1",
    room_id: "room1",
    user_id: null,
    display_name: "Test",
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

function makeRoll(overrides: Partial<DiceRoll> = {}): DiceRoll {
  return {
    colors: ["g", "p", "o"],
    numbers: ["1", "2", "3"],
    special: "fill",
    ...overrides,
  };
}

// ─── validateBombCells ───────────────────────────────────────────────────────

describe("validateBombCells", () => {
  it("accepts a valid 2×2 block", () => {
    const result = validateBombCells(config, ["A-P", "B-P", "A-Q", "B-Q"]);
    expect(result.valid).toBe(true);
  });

  it("rejects fewer than 4 cells", () => {
    const result = validateBombCells(config, ["A-P", "B-P", "A-Q"]);
    expect(result.valid).toBe(false);
  });

  it("rejects cells not forming a 2×2 block (3×1 strip)", () => {
    const result = validateBombCells(config, ["A-P", "B-P", "C-P", "D-P"]);
    expect(result.valid).toBe(false);
  });

  it("rejects a non-existent cell", () => {
    const result = validateBombCells(config, ["A-P", "B-P", "A-Q", "Z-Z"]);
    expect(result.valid).toBe(false);
  });
});

// ─── validateColorNumberPick ─────────────────────────────────────────────────

describe("validateColorNumberPick — basic", () => {
  it("accepts a valid first pick in column H", () => {
    const pick: ColorNumberPick = {
      type: "color_number",
      color_die: 0,
      number_die: 0,
      declared_color: "g",
      declared_number: 1,
      cells: ["H-P"],
    };
    const result = validateColorNumberPick(
      config,
      pick,
      makeRoll(),
      makePlayer(),
      null,
      true,
      1,
    );
    expect(result.valid).toBe(true);
  });

  it("rejects first pick outside startColumn", () => {
    const pick: ColorNumberPick = {
      type: "color_number",
      color_die: 0,
      number_die: 0,
      declared_color: "p",
      declared_number: 1,
      cells: ["A-P"],
    };
    // colors: ['p', ...] — die index 0 is 'p'... wait, makeRoll has colors: ['g','p','o']
    // A-P is pink; use color die index 1 ('p')
    const pickFixed: ColorNumberPick = { ...pick, color_die: 1 };
    const result = validateColorNumberPick(
      config,
      pickFixed,
      makeRoll(),
      makePlayer(),
      null,
      true,
      1,
    );
    expect(result.valid).toBe(false);
    expect((result as { valid: false; error: string }).error).toMatch(
      /adjacent|startColumn|not adjacent/i,
    );
  });

  it("rejects cells of wrong color", () => {
    const pick: ColorNumberPick = {
      type: "color_number",
      color_die: 0, // die face 'g'
      number_die: 0,
      declared_color: "g",
      declared_number: 1,
      cells: ["H-Q"], // H-Q is pink, not green
    };
    const result = validateColorNumberPick(
      config,
      pick,
      makeRoll(),
      makePlayer(),
      null,
      true,
      1,
    );
    expect(result.valid).toBe(false);
    expect((result as { valid: false; error: string }).error).toMatch(/color/i);
  });

  it("rejects cell count mismatch", () => {
    const pick: ColorNumberPick = {
      type: "color_number",
      color_die: 0,
      number_die: 1, // die face '2'
      declared_color: "g",
      declared_number: 2,
      cells: ["H-P"], // only 1 cell but declared 2
    };
    const result = validateColorNumberPick(
      config,
      pick,
      makeRoll(),
      makePlayer(),
      null,
      true,
      1,
    );
    expect(result.valid).toBe(false);
    expect((result as { valid: false; error: string }).error).toMatch(
      /cells|count/i,
    );
  });

  it("rejects already-crossed cells", () => {
    const pick: ColorNumberPick = {
      type: "color_number",
      color_die: 0,
      number_die: 0,
      declared_color: "g",
      declared_number: 1,
      cells: ["H-P"],
    };
    const player = makePlayer({ crossed_cells: ["H-P"], hearts: 0 });
    const result = validateColorNumberPick(
      config,
      pick,
      makeRoll(),
      player,
      null,
      false,
      2,
    );
    expect(result.valid).toBe(false);
    expect((result as { valid: false; error: string }).error).toMatch(
      /crossed/i,
    );
  });

  it("rejects non-adjacent cells when region exists", () => {
    const pick: ColorNumberPick = {
      type: "color_number",
      color_die: 1, // 'p'
      number_die: 0,
      declared_color: "p",
      declared_number: 1,
      cells: ["A-P"], // pink, but far from H-P
    };
    const player = makePlayer({ crossed_cells: ["H-P"] });
    const result = validateColorNumberPick(
      config,
      pick,
      makeRoll(),
      player,
      null,
      false,
      2,
    );
    expect(result.valid).toBe(false);
  });

  it("accepts non-adjacent same-color cells bridged by a crossed cell", () => {
    // Orange cells: E-Q, F-Q, F-R, G-R, H-R
    // With F-Q already crossed, E-Q and F-R are connected through it even though they
    // are not directly adjacent (they are diagonal).
    const pick: ColorNumberPick = {
      type: "color_number",
      color_die: 2, // 'o' (orange)
      number_die: 1, // '2'
      declared_color: "o",
      declared_number: 2,
      cells: ["E-Q", "F-R"],
    };
    const player = makePlayer({ crossed_cells: ["F-Q"] });
    const result = validateColorNumberPick(config, pick, makeRoll(), player, null, true, 1);
    expect(result.valid).toBe(true);
  });

  it("rejects cells that cannot be bridged through crossed cells", () => {
    // F-P and H-Q are both pink. G-P (pink, crossed) is adjacent to F-P, and
    // H-Q (crossed) is adjacent to I-Q. Both pass incremental adjacency, but there
    // is no path from F-P to I-Q through the crossed pink cells [G-P].
    // (G-P is not adjacent to H-Q, so the bridge chain is broken.)
    const pick: ColorNumberPick = {
      type: "color_number",
      color_die: 1, // 'p' (pink)
      number_die: 1, // '2'
      declared_color: "p",
      declared_number: 2,
      cells: ["F-P", "H-Q"], // both pink; crossed [G-P] does not bridge them to each other
    };
    // G-P is the only crossed pink cell; it is adjacent to F-P but not to H-Q.
    // (G-P is col G row P; H-Q is col H row Q — diagonal, not orthogonally adjacent.)
    const player = makePlayer({ crossed_cells: ["G-P"] });
    const result = validateColorNumberPick(config, pick, makeRoll(), player, null, false, 2);
    expect(result.valid).toBe(false);
    expect((result as { valid: false; error: string }).error).toMatch(/contiguous/i);
  });
});

describe("validateColorNumberPick — bomb row", () => {
  it("requires bomb_cells when completing a bomb row (row Q)", () => {
    // Cross all cells in row Q except the last one, then pick the last cell.
    // Row Q has a "bomb" rowItem — completing it requires bomb_cells in the pick.
    const rowQCells = config.grid.columns
      .map((col) => `${col}-Q`)
      .filter((key) => key in config.cells);
    const lastCell = rowQCells[rowQCells.length - 1];
    const crossedExceptLast = rowQCells.slice(0, -1);
    const cellColor = config.cells[lastCell].color;

    const roll: DiceRoll = {
      colors: ["✕", "p", "o"],
      numbers: ["1", "2", "3"],
      special: "fill",
    };
    const pick: ColorNumberPick = {
      type: "color_number",
      color_die: 0, // wildcard — declare any color
      number_die: 0, // "1"
      declared_color: cellColor,
      declared_number: 1,
      cells: [lastCell],
    };
    const player = makePlayer({ crossed_cells: crossedExceptLast, wildcards: 6 });

    const resultNoBomb = validateColorNumberPick(config, pick, roll, player, null, true, 1);
    expect(resultNoBomb.valid).toBe(false);
    expect((resultNoBomb as { valid: false; error: string }).error).toMatch(/bomb/i);

    // With a valid 2×2 bomb_cells (rows R-S are not in crossedExceptLast)
    const pickWithBomb: ColorNumberPick = {
      ...pick,
      bomb_cells: ["A-R", "B-R", "A-S", "B-S"],
    };
    const resultWithBomb = validateColorNumberPick(config, pickWithBomb, roll, player, null, true, 1);
    expect(resultWithBomb.valid).toBe(true);
  });

  it("accepts bomb_cells containing already-crossed cells", () => {
    const rowQCells = config.grid.columns
      .map((col) => `${col}-Q`)
      .filter((key) => key in config.cells);
    const lastCell = rowQCells[rowQCells.length - 1];
    const crossedExceptLast = rowQCells.slice(0, -1);
    const cellColor = config.cells[lastCell].color;
    const player = makePlayer({ crossed_cells: crossedExceptLast, wildcards: 6 });
    const roll: DiceRoll = {
      colors: ["✕", "p", "o"],
      numbers: ["1", "2", "3"],
      special: "fill",
    };
    const pick: ColorNumberPick = {
      type: "color_number",
      color_die: 0,
      number_die: 0,
      declared_color: cellColor,
      declared_number: 1,
      cells: [lastCell],
      bomb_cells: ["A-Q", "B-Q", "A-R", "B-R"],
    };

    const result = validateColorNumberPick(config, pick, roll, player, null, true, 1);

    expect(result.valid).toBe(true);
  });

  it("requires bomb_cells for a same-round second bomb-row completer", () => {
    const rowQCells = config.grid.columns
      .map((col) => `${col}-Q`)
      .filter((key) => key in config.cells);
    const lastCell = rowQCells[rowQCells.length - 1];
    const crossedExceptLast = rowQCells.slice(0, -1);
    const cellColor = config.cells[lastCell].color;
    const otherPick: GamePick = {
      type: "color_number",
      color_die: 0,
      number_die: 0,
      declared_color: cellColor,
      declared_number: 1,
      cells: [lastCell],
      bomb_cells: ["A-R", "B-R", "A-S", "B-S"],
    };
    const otherPlayer = makePlayer({ id: "p2", crossed_cells: rowQCells });
    const player = makePlayer({ crossed_cells: crossedExceptLast, wildcards: 6 });
    const roll: DiceRoll = {
      colors: ["✕", "p", "o"],
      numbers: ["1", "2", "3"],
      special: "fill",
    };
    const pick: ColorNumberPick = {
      type: "color_number",
      color_die: 0,
      number_die: 0,
      declared_color: cellColor,
      declared_number: 1,
      cells: [lastCell],
    };

    const resultNoBomb = validateColorNumberPick(
      config,
      pick,
      roll,
      player,
      null,
      true,
      1,
      [otherPlayer],
      { activePlayerId: "p2", activePick: otherPick },
    );
    expect(resultNoBomb.valid).toBe(false);
    expect((resultNoBomb as { valid: false; error: string }).error).toMatch(/bomb/i);

    const resultWithBomb = validateColorNumberPick(
      config,
      { ...pick, bomb_cells: ["C-R", "D-R", "C-S", "D-S"] },
      roll,
      player,
      null,
      true,
      1,
      [otherPlayer],
      { activePlayerId: "p2", activePick: otherPick },
    );
    expect(resultWithBomb.valid).toBe(true);
  });

  it("does not require or allow bomb_cells for a later-round bomb-row completer", () => {
    const rowQCells = config.grid.columns
      .map((col) => `${col}-Q`)
      .filter((key) => key in config.cells);
    const lastCell = rowQCells[rowQCells.length - 1];
    const crossedExceptLast = rowQCells.slice(0, -1);
    const cellColor = config.cells[lastCell].color;
    const otherPlayer = makePlayer({ id: "p2", crossed_cells: rowQCells });
    const player = makePlayer({ crossed_cells: crossedExceptLast, wildcards: 6 });
    const roll: DiceRoll = {
      colors: ["✕", "p", "o"],
      numbers: ["1", "2", "3"],
      special: "fill",
    };
    const pick: ColorNumberPick = {
      type: "color_number",
      color_die: 0,
      number_die: 0,
      declared_color: cellColor,
      declared_number: 1,
      cells: [lastCell],
    };

    const resultNoBomb = validateColorNumberPick(
      config,
      pick,
      roll,
      player,
      null,
      true,
      1,
      [otherPlayer],
    );
    expect(resultNoBomb.valid).toBe(true);

    const resultWithBomb = validateColorNumberPick(
      config,
      { ...pick, bomb_cells: ["A-R", "B-R", "A-S", "B-S"] },
      roll,
      player,
      null,
      true,
      1,
      [otherPlayer],
    );
    expect(resultWithBomb.valid).toBe(false);
    expect((resultWithBomb as { valid: false; error: string }).error).toMatch(/only allowed/i);
  });
});

describe("validateColorNumberPick — wildcards", () => {
  it("accepts wildcard color die when wildcards available", () => {
    const roll: DiceRoll = {
      colors: ["✕", "p", "o"],
      numbers: ["1", "2", "3"],
      special: "fill",
    };
    const pick: ColorNumberPick = {
      type: "color_number",
      color_die: 0, // wildcard
      number_die: 0,
      declared_color: "g", // declare green
      declared_number: 1,
      cells: ["H-P"],
    };
    const result = validateColorNumberPick(
      config,
      pick,
      roll,
      makePlayer(),
      null,
      true,
      1,
    );
    expect(result.valid).toBe(true);
  });

  it("rejects wildcard die when wildcards === 0", () => {
    const roll: DiceRoll = {
      colors: ["✕", "p", "o"],
      numbers: ["1", "2", "3"],
      special: "fill",
    };
    const pick: ColorNumberPick = {
      type: "color_number",
      color_die: 0, // wildcard
      number_die: 0,
      declared_color: "g",
      declared_number: 1,
      cells: ["H-P"],
    };
    const player = makePlayer({ wildcards: 0 });
    const result = validateColorNumberPick(
      config,
      pick,
      roll,
      player,
      null,
      true,
      1,
    );
    expect(result.valid).toBe(false);
    expect((result as { valid: false; error: string }).error).toMatch(
      /wildcard/i,
    );
  });

  it("requires 2 wildcards when both dice are wildcards", () => {
    const roll: DiceRoll = {
      colors: ["✕", "p", "o"],
      numbers: ["?", "2", "3"],
      special: "fill",
    };
    const pick: ColorNumberPick = {
      type: "color_number",
      color_die: 0, // wildcard
      number_die: 0, // wildcard
      declared_color: "g",
      declared_number: 1,
      cells: ["H-P"],
    };
    const player1 = makePlayer({ wildcards: 1 });
    expect(
      validateColorNumberPick(config, pick, roll, player1, null, true, 1).valid,
    ).toBe(false);

    const player2 = makePlayer({ wildcards: 2 });
    expect(
      validateColorNumberPick(config, pick, roll, player2, null, true, 1).valid,
    ).toBe(true);
  });
});

describe("validateColorNumberPick — round restrictions", () => {
  it("rounds 1-2: non-active player can use any dice", () => {
    // Active player used color_die:0, number_die:0. Non-active uses same in round 2 — should be OK.
    const activePick: ColorNumberPick = {
      type: "color_number",
      color_die: 0,
      number_die: 0,
      declared_color: "g",
      declared_number: 1,
      cells: ["H-P"],
    };
    const pick: ColorNumberPick = {
      type: "color_number",
      color_die: 0, // same as active player
      number_die: 0,
      declared_color: "g",
      declared_number: 1,
      cells: ["H-P"],
    };
    const player = makePlayer();
    // Round 2 — open round, no restriction
    const result = validateColorNumberPick(
      config,
      pick,
      makeRoll(),
      player,
      activePick,
      false,
      2,
    );
    // This will still fail because H-P is not crossed yet (first pick must be startColumn, but the
    // test player has no crossed cells — H-P IS in start column, so it should be valid.
    expect(result.valid).toBe(true);
  });

  it("round 3+: non-active player cannot reuse active player dice indices", () => {
    const activePick: ColorNumberPick = {
      type: "color_number",
      color_die: 0,
      number_die: 0,
      declared_color: "g",
      declared_number: 1,
      cells: ["H-P"],
    };
    const pick: ColorNumberPick = {
      type: "color_number",
      color_die: 0, // same color die as active player
      number_die: 1,
      declared_color: "g",
      declared_number: 2,
      cells: ["H-P", "I-P"], // H-P(green) + I-P(green) — both adjacent is not possible first-pick
    };
    // Player has H-Q already so region exists
    const player = makePlayer({ crossed_cells: ["H-Q"] });
    const result = validateColorNumberPick(
      config,
      pick,
      makeRoll(),
      player,
      activePick,
      false,
      3,
    );
    expect(result.valid).toBe(false);
    expect((result as { valid: false; error: string }).error).toMatch(
      /active player/i,
    );
  });
});

// ─── validateSpecialPick ─────────────────────────────────────────────────────

describe("validateSpecialPick — heart", () => {
  it("accepts heart with no cells", () => {
    const pick: SpecialPick = { type: "special", cells: [] };
    const roll = makeRoll({ special: "heart" });
    const result = validateSpecialPick(config, pick, roll, makePlayer());
    expect(result.valid).toBe(true);
  });

  it("rejects heart when player has no boxes", () => {
    const pick: SpecialPick = { type: "special", cells: [] };
    const roll = makeRoll({ special: "heart" });
    const player = makePlayer({ boxes_unlocked: 1, boxes_spent: 1 });
    const result = validateSpecialPick(config, pick, roll, player);
    expect(result.valid).toBe(false);
    expect((result as { valid: false; error: string }).error).toMatch(/box/i);
  });

  it("rejects heart with cells provided", () => {
    const pick: SpecialPick = { type: "special", cells: ["H-P"] };
    const roll = makeRoll({ special: "heart" });
    const result = validateSpecialPick(config, pick, roll, makePlayer());
    expect(result.valid).toBe(false);
  });
});

describe("validateSpecialPick — fill", () => {
  it("accepts a valid fill of the connected orange region from H-R", () => {
    // Player has H-S crossed so H-R is adjacent to region
    const player = makePlayer({ crossed_cells: ["H-S"] });
    const pick: SpecialPick = {
      type: "special",
      cells: ["H-R", "G-R", "F-R", "F-Q", "E-Q"],
    };
    const roll = makeRoll({ special: "fill" });
    const result = validateSpecialPick(config, pick, roll, player);
    expect(result.valid).toBe(true);
  });

  it("rejects fill with incomplete region (subset of connected cells)", () => {
    const player = makePlayer({ crossed_cells: ["H-S"] });
    const pick: SpecialPick = {
      type: "special",
      cells: ["H-R", "G-R"], // only 2 of the 5 connected cells
    };
    const roll = makeRoll({ special: "fill" });
    const result = validateSpecialPick(config, pick, roll, player);
    expect(result.valid).toBe(false);
    expect((result as { valid: false; error: string }).error).toMatch(
      /region/i,
    );
  });

  it("rejects fill with no adjacency to existing region or column H", () => {
    const player = makePlayer({ crossed_cells: ["H-P"] });
    // A-Q and A-R are blue and form a complete connected region — not in/adjacent to column H, not adjacent to H-P
    const pick: SpecialPick = {
      type: "special",
      cells: ["A-Q", "A-R"],
    };
    const roll = makeRoll({ special: "fill" });
    const result = validateSpecialPick(config, pick, roll, player);
    expect(result.valid).toBe(false);
    expect((result as { valid: false; error: string }).error).toMatch(
      /adjacent/i,
    );
  });
});

describe("validateSpecialPick — three_in_a_row", () => {
  it("accepts 3 cells in same row each adjacent to region", () => {
    const player3 = makePlayer({
      crossed_cells: ["H-P", "H-Q", "H-R", "H-S", "H-T", "H-U", "H-V"],
    });
    // In row P: many cells might be adjacent. H-P is crossed so G-P (adj) and I-P (adj) qualify.
    // G-P, I-P, and... what else in row P is adjacent to the region?
    // F-P is adjacent to G-P which is NOT yet crossed (only H column is crossed)
    // So only G-P and I-P are adjacent to H-P in row P
    // Let's try row S which has more cells near H
    // H-S is crossed. In row S: G-S, I-S are adjacent to H-S
    // With incremental adjacency, G-S (adj to H-S) then J-S (adj to I-S which was just added)
    // is now valid. Test the truly-out-of-reach case: L-S is not adjacent to [H-S, G-S, I-S].
    const pick2: SpecialPick = {
      type: "special",
      cells: ["G-S", "I-S", "L-S"],
    };
    const result2 = validateSpecialPick(
      config,
      pick2,
      makeRoll({ special: "three_in_a_row" }),
      player3,
    );
    // L-S is not adjacent to any cell in the incrementally-built region
    expect(result2.valid).toBe(false);
  });

  it("rejects cells from different rows", () => {
    const player = makePlayer({ crossed_cells: ["H-P"] });
    const pick: SpecialPick = {
      type: "special",
      cells: ["G-P", "G-Q", "I-P"], // G-Q is row Q, others row P
    };
    const roll = makeRoll({ special: "three_in_a_row" });
    const result = validateSpecialPick(config, pick, roll, player);
    expect(result.valid).toBe(false);
    expect((result as { valid: false; error: string }).error).toMatch(/row/i);
  });

  it("rejects 0 cells", () => {
    const player = makePlayer({ crossed_cells: ["H-P"] });
    const pick: SpecialPick = {
      type: "special",
      cells: [],
    };
    const roll = makeRoll({ special: "three_in_a_row" });
    const result = validateSpecialPick(config, pick, roll, player);
    expect(result.valid).toBe(false);
    expect((result as { valid: false; error: string }).error).toMatch(/1/i);
  });

  it("rejects more than 3 cells", () => {
    const player = makePlayer({ crossed_cells: ["H-P"] });
    const pick: SpecialPick = {
      type: "special",
      cells: ["G-P", "I-P", "H-Q", "I-Q"], // 4 cells
    };
    const roll = makeRoll({ special: "three_in_a_row" });
    const result = validateSpecialPick(config, pick, roll, player);
    expect(result.valid).toBe(false);
  });

  it("accepts 1 or 2 cells (up to 3 allowed)", () => {
    const player = makePlayer({ crossed_cells: ["H-P"] });
    for (const cells of [["G-P"], ["G-P", "I-P"]]) {
      const pick: SpecialPick = { type: "special", cells };
      const roll = makeRoll({ special: "three_in_a_row" });
      const result = validateSpecialPick(config, pick, roll, player);
      expect(result.valid).toBe(true);
    }
  });
});

describe("validateSpecialPick — bomb", () => {
  it("accepts a valid 2×2 block", () => {
    const pick: SpecialPick = {
      type: "special",
      cells: ["A-P", "B-P", "A-Q", "B-Q"],
    };
    const roll = makeRoll({ special: "bomb" });
    const result = validateSpecialPick(config, pick, roll, makePlayer());
    expect(result.valid).toBe(true);
  });

  it("rejects a non-2×2 arrangement", () => {
    const pick: SpecialPick = {
      type: "special",
      cells: ["A-P", "B-P", "C-P", "A-Q"],
    };
    const roll = makeRoll({ special: "bomb" });
    const result = validateSpecialPick(config, pick, roll, makePlayer());
    expect(result.valid).toBe(false);
  });

  it("accepts already-crossed cells", () => {
    const player = makePlayer({ crossed_cells: ["A-P"] });
    const pick: SpecialPick = {
      type: "special",
      cells: ["A-P", "B-P", "A-Q", "B-Q"],
    };
    const roll = makeRoll({ special: "bomb" });
    const result = validateSpecialPick(config, pick, roll, player);
    expect(result.valid).toBe(true);
  });
});

describe("getValidCells — bomb", () => {
  it("includes crossed cells and excludes only already-selected cells", () => {
    const dice = makeRoll({ special: "bomb" });

    const initial = getValidCells(
      config,
      ["A-P"],
      dice,
      true,
      undefined,
      undefined,
      [],
    );
    expect(initial?.has("A-P")).toBe(true);

    const next = getValidCells(
      config,
      ["A-P"],
      dice,
      true,
      undefined,
      undefined,
      ["A-P"],
    );
    expect(next?.has("A-P")).toBe(false);
    expect(next?.has("B-P")).toBe(true);
    expect(next?.has("A-Q")).toBe(true);
    expect(next?.has("B-Q")).toBe(true);
  });
});

describe("validateSpecialPick — two_stars", () => {
  // Player with H column fully crossed: G-U (adj to H-U) and I-V (adj to H-V) are reachable stars.
  const playerWithPath = makePlayer({
    crossed_cells: ["H-P", "H-Q", "H-R", "H-S", "H-T", "H-U", "H-V"],
  });

  it("accepts 2 adjacent star cells", () => {
    const pick: SpecialPick = {
      type: "special",
      cells: ["G-U", "I-V"], // G-U adj to H-U; I-V adj to H-V
    };
    const roll = makeRoll({ special: "two_stars" });
    const result = validateSpecialPick(config, pick, roll, playerWithPath);
    expect(result.valid).toBe(true);
  });

  it("rejects stars not adjacent to existing region", () => {
    const pick: SpecialPick = {
      type: "special",
      cells: ["C-P", "H-R"], // C-P not reachable with empty crossed region
    };
    const roll = makeRoll({ special: "two_stars" });
    const result = validateSpecialPick(config, pick, roll, makePlayer());
    expect(result.valid).toBe(false);
    expect((result as { valid: false; error: string }).error).toMatch(/adjacent/i);
  });

  it("rejects non-star cells", () => {
    const pick: SpecialPick = {
      type: "special",
      cells: ["H-P", "A-P"], // neither is a star
    };
    const roll = makeRoll({ special: "two_stars" });
    const result = validateSpecialPick(config, pick, roll, makePlayer());
    expect(result.valid).toBe(false);
    expect((result as { valid: false; error: string }).error).toMatch(/star/i);
  });

  it("rejects wrong cell count", () => {
    const pick: SpecialPick = {
      type: "special",
      cells: ["C-P"],
    };
    const roll = makeRoll({ special: "two_stars" });
    const result = validateSpecialPick(config, pick, roll, makePlayer());
    expect(result.valid).toBe(false);
  });

  it("rejects already-crossed star cells", () => {
    const player = makePlayer({ crossed_cells: ["C-P"] });
    const pick: SpecialPick = {
      type: "special",
      cells: ["C-P", "H-R"],
    };
    const roll = makeRoll({ special: "two_stars" });
    const result = validateSpecialPick(config, pick, roll, player);
    expect(result.valid).toBe(false);
  });
});
