import { describe, it, expect } from "vitest";
import type { BoardConfig } from "@/boards/board.types";
import type { DiceRoll, GamePick, RoomPlayerRow } from "../../types/game";
import { computePickResult } from "./effects";

import rawBoard from "@/boards/kok2-standard.json";
const config = rawBoard as unknown as BoardConfig;

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

const roll: DiceRoll = {
  colors: ["g", "p", "o"],
  numbers: ["1", "2", "3"],
  special: "fill",
};

function rowCells(row: string): string[] {
  return config.grid.columns
    .map((col) => `${col}-${row}`)
    .filter((key) => key in config.cells);
}

describe("computePickResult — row items", () => {
  it("awards a heart item to multiple same-round row completers", () => {
    const cells = rowCells("R");
    const lastCell = cells[cells.length - 1];
    const sameRoundPick: GamePick = {
      type: "color_number",
      color_die: 0,
      number_die: 0,
      declared_color: "g",
      declared_number: 1,
      cells: [lastCell],
    };
    const player = makePlayer({ crossed_cells: cells.slice(0, -1) });
    const otherPlayer = makePlayer({ id: "p2", crossed_cells: cells });

    const result = computePickResult(
      config,
      player,
      sameRoundPick,
      roll,
      [otherPlayer],
      { activePlayerId: "p2", activePick: sameRoundPick },
    );

    expect(result.hearts).toBe(1);
  });

  it("does not award a heart item to a later-round row completer", () => {
    const cells = rowCells("R");
    const lastCell = cells[cells.length - 1];
    const pick: GamePick = {
      type: "color_number",
      color_die: 0,
      number_die: 0,
      declared_color: "g",
      declared_number: 1,
      cells: [lastCell],
    };
    const player = makePlayer({ crossed_cells: cells.slice(0, -1) });
    const otherPlayer = makePlayer({ id: "p2", crossed_cells: cells });

    const result = computePickResult(config, player, pick, roll, [otherPlayer]);

    expect(result.hearts).toBe(0);
  });

  it("awards a box item to multiple same-round row completers", () => {
    const cells = rowCells("P");
    const lastCell = cells[cells.length - 1];
    const sameRoundPick: GamePick = {
      type: "color_number",
      color_die: 0,
      number_die: 0,
      declared_color: "g",
      declared_number: 1,
      cells: [lastCell],
    };
    const player = makePlayer({ crossed_cells: cells.slice(0, -1) });
    const otherPlayer = makePlayer({ id: "p2", crossed_cells: cells });

    const result = computePickResult(
      config,
      player,
      sameRoundPick,
      roll,
      [otherPlayer],
      { playerPicks: { p2: sameRoundPick } },
    );

    expect(result.boxes_unlocked).toBe(2);
  });

  it("does not award a box item to a later-round row completer", () => {
    const cells = rowCells("P");
    const lastCell = cells[cells.length - 1];
    const pick: GamePick = {
      type: "color_number",
      color_die: 0,
      number_die: 0,
      declared_color: "g",
      declared_number: 1,
      cells: [lastCell],
    };
    const player = makePlayer({ crossed_cells: cells.slice(0, -1) });
    const otherPlayer = makePlayer({ id: "p2", crossed_cells: cells });

    const result = computePickResult(config, player, pick, roll, [otherPlayer]);

    expect(result.boxes_unlocked).toBe(1);
  });
});
