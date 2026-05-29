import type { Color, BoardConfig } from "@/boards/board.types";
import type { ColorNumberPick, GamePick } from "@/types/game";
import {
  isValidPlacement,
  getAdjacentCells,
  areCellsContiguousWithBridge,
  isRowComplete,
  isColumnComplete,
  isColorComplete,
} from "@/lib/game/sheet";
import { isColorWildcard, isNumberWildcard } from "@/lib/game/dice";
import { type CurrentRoundPicks, simulateBombCascade } from "@/lib/game/rules";
import type { BotContext, BotStrategy } from "./types";

const ROUND_FOR_SPECIAL_ORDERING = 3;

// Score a single cell for greedy selection priority.
function cellValue(config: BoardConfig, key: string): number {
  const cell = config.cells[key];
  if (!cell) return 0;
  if (cell.special === "star") return 2; // avoid -2 end-game penalty
  if (cell.special === "box") return 1;  // gain a box
  return 0;
}

// Score a completed group of cells based on strategic value.
function scoreGroup(
  config: BoardConfig,
  cells: string[],
  crossedCells: string[],
): number {
  const newCrossed = [...crossedCells, ...cells];
  let score = cells.length * 0.1; // tie-break: more cells is marginally better

  // Per-cell value
  for (const key of cells) {
    score += cellValue(config, key);
  }

  // Row completion bonus
  for (const row of config.grid.rows) {
    if (!isRowComplete(config, row, crossedCells) && isRowComplete(config, row, newCrossed)) {
      score += 5;
    }
  }

  // Column completion bonus (use the printed "first" value as a heuristic — we don't
  // know if we'd be first or subsequent, so use the average)
  for (const col of config.grid.columns) {
    if (!isColumnComplete(config, col, crossedCells) && isColumnComplete(config, col, newCrossed)) {
      const bonus = config.scoring.columnBonuses[col];
      score += (bonus.first + bonus.subsequent) / 2;
    }
  }

  // Color completion bonus
  for (const color of Object.keys(
    Object.fromEntries(
      Object.values(config.cells).map((c) => [c.color, true]),
    ),
  ) as Color[]) {
    if (!isColorComplete(config, color, crossedCells) && isColorComplete(config, color, newCrossed)) {
      score += (config.scoring.colorCompletion.first + config.scoring.colorCompletion.subsequent) / 2;
    }
  }

  return score;
}

// Greedily extend a selection from `seed` up to `count` cells of `color`,
// Find all uncrossed same-color cells reachable from any cell in `group`,
// traversing through same-color already-crossed cells as bridges.
// This mirrors areCellsContiguousWithBridge's reachability model.
function bridgeReachableCandidates(
  config: BoardConfig,
  color: Color,
  group: string[],
  crossedCells: string[],
): string[] {
  const crossedSet = new Set(crossedCells);
  const candidates: string[] = [];
  const visited = new Set<string>(group);
  const queue = [...group];

  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const adj of getAdjacentCells(config, cur)) {
      if (visited.has(adj)) continue;
      const cell = config.cells[adj];
      if (!cell || cell.color !== color) continue;
      visited.add(adj);
      if (crossedSet.has(adj)) {
        // Same-color crossed cell — traverse it as a bridge to find more candidates
        queue.push(adj);
      } else {
        candidates.push(adj);
      }
    }
  }

  return candidates;
}

// Greedily extend a selection from `seed` up to `count` cells of `color`,
// each time picking the highest-value reachable uncrossed same-color cell.
// Reachability traverses through same-color crossed cells (bridges), matching
// the areCellsContiguousWithBridge rule used in move validation.
// Returns null if we can't reach `count` cells.
function greedyExtend(
  config: BoardConfig,
  color: Color,
  seed: string,
  count: number,
  crossedCells: string[],
): string[] | null {
  const group = [seed];

  while (group.length < count) {
    const candidates = bridgeReachableCandidates(config, color, group, crossedCells);

    let bestKey: string | null = null;
    let bestVal = -Infinity;
    for (const adj of candidates) {
      const val = cellValue(config, adj);
      if (val > bestVal) {
        bestVal = val;
        bestKey = adj;
      }
    }

    if (bestKey === null) return null;
    group.push(bestKey);
  }

  return group;
}

// Find the best group of `count` cells of `color` reachable from the bot's region.
// Returns null if no valid group exists.
function findBestGroup(
  config: BoardConfig,
  color: Color,
  count: number,
  crossedCells: string[],
): string[] | null {
  const crossedSet = new Set(crossedCells);

  // All uncrossed cells of the target color that are valid placements
  const seeds = Object.keys(config.cells).filter((key) => {
    const cell = config.cells[key];
    return cell.color === color && !crossedSet.has(key) && isValidPlacement(config, key, crossedCells);
  });

  let bestGroup: string[] | null = null;
  let bestScore = -Infinity;

  for (const seed of seeds) {
    const group = greedyExtend(config, color, seed, count, crossedCells);
    if (!group || group.length !== count) continue;
    if (!areCellsContiguousWithBridge(config, group, crossedCells)) continue;
    const score = scoreGroup(config, group, crossedCells);
    if (score > bestScore) {
      bestScore = score;
      bestGroup = group;
    }
  }

  return bestGroup;
}

// Find the best 2×2 bomb block. Prefers blocks with uncrossed star cells.
function findBestBombBlock(
  config: BoardConfig,
  crossedCells: string[],
  alreadyCrossingCells: string[],
): string[] | null {
  const alreadyCountedSet = new Set([...crossedCells, ...alreadyCrossingCells]);
  const cols = config.grid.columns;
  const rows = config.grid.rows;

  let bestBlock: string[] | null = null;
  let bestScore = -Infinity;

  for (let ci = 0; ci < cols.length - 1; ci++) {
    for (let ri = 0; ri < rows.length - 1; ri++) {
      const block = [
        `${cols[ci]}-${rows[ri]}`,
        `${cols[ci + 1]}-${rows[ri]}`,
        `${cols[ci]}-${rows[ri + 1]}`,
        `${cols[ci + 1]}-${rows[ri + 1]}`,
      ];
      // All four cells must exist on the board. Already-crossed cells are legal
      // bomb targets; they just do not add any new value.
      if (!block.every((k) => k in config.cells)) continue;

      // Score: prefer blocks with newly-crossed star cells.
      const score = block.reduce(
        (s, k) => s + (alreadyCountedSet.has(k) ? 0 : cellValue(config, k)),
        0,
      );
      if (score > bestScore) {
        bestScore = score;
        bestBlock = block;
      }
    }
  }

  return bestBlock;
}

function buildBombChain(
  config: BoardConfig,
  playerId: string,
  crossedCells: string[],
  mainCells: string[],
  allPlayers: { id: string; crossed_cells: string[] }[],
  currentRoundPicks: CurrentRoundPicks,
): string[][] | null {
  const bombs: string[][] = [];

  while (true) {
    const cascade = simulateBombCascade(
      config,
      crossedCells,
      mainCells,
      playerId,
      bombs,
      allPlayers.filter((p) => p.id !== playerId),
      currentRoundPicks,
    );
    if (cascade.owedRows.length === bombs.length) return bombs;

    const block = findBestBombBlock(config, cascade.crossedCells, []);
    if (!block) return null;
    bombs.push(block);
  }
}

export class GreedyBot implements BotStrategy {
  readonly type = "greedy";

  choosePick(ctx: BotContext): GamePick {
    const { config, player, roll, isActivePlayer, activePick, round } = ctx;
    const crossed = player.crossed_cells;

    let bestPick: ColorNumberPick | null = null;
    let bestScore = -Infinity;

    for (let ci = 0 as 0 | 1 | 2; ci <= 2; ci++) {
      for (let ni = 0 as 0 | 1 | 2; ni <= 2; ni++) {
        // Skip dice excluded by active player (rounds >= 3, non-active)
        if (round >= ROUND_FOR_SPECIAL_ORDERING && !isActivePlayer && activePick?.type === "color_number") {
          if (ci === activePick.color_die || ni === activePick.number_die) continue;
        }

        const colorFace = roll.colors[ci];
        const numberFace = roll.numbers[ni];

        // Skip wildcards in v1
        if (isColorWildcard(colorFace) || isNumberWildcard(numberFace)) continue;

        const declaredColor = colorFace as Color;
        const declaredNumber = parseInt(numberFace, 10);

        // Check if we have enough wildcards (none needed here since we skipped wildcards)
        if (player.wildcards < 0) continue;

        const group = findBestGroup(config, declaredColor, declaredNumber, crossed);
        if (!group) continue;

        const score = scoreGroup(config, group, crossed);
        if (score <= bestScore) continue;

        const bombs = buildBombChain(
          config,
          player.id,
          crossed,
          group,
          ctx.allPlayers,
          {
            activePlayerId: ctx.activePlayerId,
            activePick: ctx.activePick,
            playerPicks: ctx.playerPicks,
          },
        );
        if (!bombs) continue;

        bestScore = score;
        bestPick = {
          type: "color_number",
          color_die: ci,
          number_die: ni,
          declared_color: declaredColor,
          declared_number: declaredNumber,
          cells: group,
          ...(bombs.length > 0 ? { bombs } : {}),
        };
      }
    }

    return bestPick ?? { type: "pass" };
  }
}
