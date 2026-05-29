import type { BoardConfig, Color } from "@/boards/board.types";
import type {
  GamePick,
  RoomHistoryRow,
  RoomPlayerRow,
  ScoreBreakdown,
} from "../../types/game";
import {
  isColumnComplete,
  isRowComplete,
  isColorComplete,
  getCellsOfColor,
  uncrossedStars,
  getBoardColors,
} from "./sheet";
import { cellsCrossedByPick } from "./rules";

type CompletionKind = "columns" | "colors";

export type ScoringContext = {
  playerCompletionRounds: Record<
    string,
    Record<CompletionKind, Record<string, number>>
  >;
  firstCompletionRounds: Record<CompletionKind, Record<string, number>>;
};

function emptyCompletionRounds(): Record<
  CompletionKind,
  Record<string, number>
> {
  return { columns: {}, colors: {} };
}

function applyPick(crossed: string[], pick: GamePick | null | undefined) {
  const crossedSet = new Set(crossed);
  for (const key of cellsCrossedByPick(pick)) {
    if (crossedSet.has(key)) continue;
    crossed.push(key);
    crossedSet.add(key);
  }
}

function recordCompletion(
  context: ScoringContext,
  playerId: string,
  kind: CompletionKind,
  key: string,
  roundNumber: number,
) {
  const playerRounds =
    context.playerCompletionRounds[playerId] ?? emptyCompletionRounds();
  context.playerCompletionRounds[playerId] = playerRounds;
  if (playerRounds[kind][key] !== undefined) return;

  playerRounds[kind][key] = roundNumber;
  const existingFirst = context.firstCompletionRounds[kind][key];
  if (existingFirst === undefined || roundNumber < existingFirst) {
    context.firstCompletionRounds[kind][key] = roundNumber;
  }
}

export function buildScoringContext(
  config: BoardConfig,
  players: Pick<RoomPlayerRow, "id">[],
  histories: Pick<
    RoomHistoryRow,
    "round_number" | "active_player_id" | "active_pick" | "player_picks"
  >[],
): ScoringContext {
  const context: ScoringContext = {
    playerCompletionRounds: {},
    firstCompletionRounds: emptyCompletionRounds(),
  };
  const crossedByPlayer: Record<string, string[]> = {};
  for (const player of players) {
    context.playerCompletionRounds[player.id] = emptyCompletionRounds();
    crossedByPlayer[player.id] = [];
  }

  const sortedHistories = [...histories].sort(
    (a, b) => a.round_number - b.round_number,
  );
  const colors = getBoardColors(config);

  for (const history of sortedHistories) {
    const picks: Record<string, GamePick> = {
      ...(history.player_picks ?? {}),
    } as Record<string, GamePick>;
    if (history.active_pick) {
      picks[history.active_player_id] = history.active_pick;
    }

    for (const [playerId, pick] of Object.entries(picks)) {
      crossedByPlayer[playerId] ??= [];
      context.playerCompletionRounds[playerId] ??= emptyCompletionRounds();
      applyPick(crossedByPlayer[playerId], pick);
    }

    for (const player of players) {
      const crossed = crossedByPlayer[player.id] ?? [];
      for (const col of config.grid.columns) {
        if (!isColumnComplete(config, col, crossed)) continue;
        recordCompletion(context, player.id, "columns", col, history.round_number);
      }
      for (const color of colors) {
        if (!isColorComplete(config, color, crossed)) continue;
        recordCompletion(
          context,
          player.id,
          "colors",
          color,
          history.round_number,
        );
      }
    }
  }

  return context;
}

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

function isFirstCompleterByContext(
  context: ScoringContext | undefined,
  playerId: string,
  kind: CompletionKind,
  key: string,
): boolean | undefined {
  if (!context) return undefined;
  const playerRound = context.playerCompletionRounds[playerId]?.[kind]?.[key];
  const firstRound = context.firstCompletionRounds[kind][key];
  if (playerRound === undefined || firstRound === undefined) return undefined;
  return playerRound === firstRound;
}

export function computeScore(
  config: BoardConfig,
  player: RoomPlayerRow,
  allPlayers: RoomPlayerRow[],
  context?: ScoringContext,
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
    const isFirst =
      isFirstCompleterByContext(context, player.id, "columns", col) ??
      isFirstCompleter(colCells, player, allPlayers);
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
    const isFirst =
      isFirstCompleterByContext(context, player.id, "colors", color) ??
      isFirstCompleter(colorCells, player, allPlayers);
    colors[color] = isFirst
      ? config.scoring.colorCompletion.first
      : config.scoring.colorCompletion.subsequent;
  }

  // Star penalty
  const starCount = uncrossedStars(config, player.crossed_cells).length;
  const stars = starCount === 0 ? 0 : starCount * config.scoring.starPenalty;
  const wildcards = player.wildcards;

  const total =
    Object.values(columns).reduce((a, b) => a + b, 0) +
    Object.values(rows).reduce((a, b) => a + b, 0) +
    Object.values(colors).reduce((a, b) => a + b, 0) +
    stars +
    wildcards;

  return { columns, rows, colors, stars, wildcards, total };
}
