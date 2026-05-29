import type { BoardConfig, Color } from "@/boards/board.types";
import type { RoomPlayerRow, ScoreBreakdown } from "../../types/game";
import {
  isColumnComplete,
  isRowComplete,
  isColorComplete,
  getCellsOfColor,
  uncrossedStars,
  getBoardColors,
} from "./sheet";

// Returns the index of the last occurrence of any item from `targets` within `arr`.
// Used to determine when a player completed a set of cells (i.e., when they crossed the last one).
function completionIndex(arr: string[], targets: Set<string>): number {
  let last = -1;
  for (let i = 0; i < arr.length; i++) {
    if (targets.has(arr[i])) last = i;
  }
  return last;
}

function isFirstCompleter(
  cellsInGroup: string[],
  player: RoomPlayerRow,
  allPlayers: RoomPlayerRow[],
): boolean {
  const targets = new Set(cellsInGroup);
  const playerIdx = completionIndex(player.crossed_cells, targets);
  for (const other of allPlayers) {
    if (other.id === player.id) continue;
    if (!isCompletedBy(cellsInGroup, other)) continue;
    const otherIdx = completionIndex(other.crossed_cells, targets);
    if (otherIdx < playerIdx) return false;
  }
  return true;
}

function isCompletedBy(cellsInGroup: string[], player: RoomPlayerRow): boolean {
  const crossedSet = new Set(player.crossed_cells);
  return cellsInGroup.every((k) => crossedSet.has(k));
}

export function computeScore(
  config: BoardConfig,
  player: RoomPlayerRow,
  allPlayers: RoomPlayerRow[],
): ScoreBreakdown {
  const columns: Record<string, number> = {};
  const rows: Record<string, number> = {};
  const colors: Partial<Record<Color, number>> = {};

  // Column bonuses
  for (const col of config.grid.columns) {
    if (!isColumnComplete(config, col, player.crossed_cells)) continue;
    const colCells = config.grid.rows
      .map((row) => `${col}-${row}`)
      .filter((key) => key in config.cells);
    const bonusDef = config.scoring.columnBonuses[col];
    const isFirst = isFirstCompleter(colCells, player, allPlayers);
    const printed = isFirst ? bonusDef.first : bonusDef.subsequent;
    const heartBonus = player.column_heart_bonuses?.[col] ?? player.hearts;
    columns[col] = printed + heartBonus;
  }

  // Row bonuses — all completers earn points; only the first also earns the item (handled in effects.ts)
  for (const row of config.grid.rows) {
    if (!isRowComplete(config, row, player.crossed_cells)) continue;
    rows[row] = config.scoring.rowBonuses[row] ?? 0;
  }

  // Color bonuses
  for (const color of getBoardColors(config)) {
    if (!isColorComplete(config, color, player.crossed_cells)) continue;
    const colorCells = getCellsOfColor(config, color);
    const isFirst = isFirstCompleter(colorCells, player, allPlayers);
    colors[color] = isFirst
      ? config.scoring.colorCompletion.first
      : config.scoring.colorCompletion.subsequent;
  }

  // Star penalty
  const starCount = uncrossedStars(config, player.crossed_cells).length;
  const stars = starCount === 0 ? 0 : starCount * config.scoring.starPenalty;

  const total =
    Object.values(columns).reduce((a, b) => a + b, 0) +
    Object.values(rows).reduce((a, b) => a + b, 0) +
    Object.values(colors).reduce((a, b) => a + b, 0) +
    stars;

  return { columns, rows, colors, stars, total };
}
