import type { BoardConfig } from "@/boards/board.types";
import type {
  ColorNumberPick,
  SpecialPick,
  GamePick,
  DiceRoll,
  RoomPlayerRow,
  ValidationResult,
} from "../../types/game";
import { isColorWildcard, isNumberWildcard } from "./dice";
import {
  getCell,
  isAdjacentToRegion,
  isAdjacentToStartZone,
  isValidPlacement,
  isRowComplete,
  getConnectedRegion,
  areCellsContiguousWithBridge,
} from "./sheet";

const ROUND_FOR_SPECIAL_ORDERING = 3;
const BOMB_CELL_COUNT = 4;
const TWO_STARS_CELL_COUNT = 2;
const THREE_IN_A_ROW_MIN = 1;
const THREE_IN_A_ROW_MAX = 3;
const VALID_NUMBER_MIN = 1;
const VALID_NUMBER_MAX = 5;

export type CurrentRoundPicks = {
  activePlayerId?: string | null;
  activePick?: GamePick | null;
  playerPicks?: Record<string, GamePick> | null;
};

type RowCompletionPlayer = Pick<RoomPlayerRow, "id" | "crossed_cells">;

function cellsCrossedByPick(pick: GamePick | null | undefined): string[] {
  if (!pick || pick.type === "pass") return [];
  return [...pick.cells, ...(pick.bomb_cells ?? [])];
}

export function crossedCellsAtRoundStart(
  crossedCells: string[],
  pick: GamePick | null | undefined,
): string[] {
  const currentRoundCells = new Set(cellsCrossedByPick(pick));
  if (currentRoundCells.size === 0) return crossedCells;
  return crossedCells.filter((key) => !currentRoundCells.has(key));
}

function pickForPlayer(
  playerId: string,
  currentRoundPicks: CurrentRoundPicks,
): GamePick | null {
  if (playerId === currentRoundPicks.activePlayerId) {
    return currentRoundPicks.activePick ?? null;
  }
  return currentRoundPicks.playerPicks?.[playerId] ?? null;
}

export function wasRowCompletedByOthersBeforeRound(
  config: BoardConfig,
  row: string,
  playerId: string,
  otherPlayers: RowCompletionPlayer[],
  currentRoundPicks: CurrentRoundPicks = {},
): boolean {
  return otherPlayers.some((p) => {
    if (p.id === playerId) return false;
    const roundStartCrossed = crossedCellsAtRoundStart(
      p.crossed_cells as string[],
      pickForPlayer(p.id, currentRoundPicks),
    );
    return isRowComplete(config, row, roundStartCrossed);
  });
}

function newlyCompletedBombRows(
  config: BoardConfig,
  beforeCrossed: string[],
  afterCrossed: string[],
  playerId: string,
  otherPlayers: RowCompletionPlayer[] = [],
  currentRoundPicks: CurrentRoundPicks = {},
): string[] {
  return config.grid.rows.filter((row) => {
    if (isRowComplete(config, row, beforeCrossed)) return false;
    if (!isRowComplete(config, row, afterCrossed)) return false;
    return (config.scoring.rowItems as Record<string, string>)[row] === "bomb";
  }).filter((row) => {
    return !wasRowCompletedByOthersBeforeRound(
      config,
      row,
      playerId,
      otherPlayers,
      currentRoundPicks,
    );
  });
}

function ok(): ValidationResult {
  return { valid: true };
}
function fail(error: string): ValidationResult {
  return { valid: false, error };
}

export function validateBombCells(
  config: BoardConfig,
  cells: string[],
): ValidationResult {
  if (cells.length !== BOMB_CELL_COUNT) return fail("bomb requires exactly 4 cells");
  for (const key of cells) {
    if (!getCell(config, key))
      return fail(`cell ${key} does not exist on board`);
  }
  // Verify cells form a 2×2 block
  const cols = cells.map((k) => config.grid.columns.indexOf(k.split("-")[0]));
  const rows = cells.map((k) => config.grid.rows.indexOf(k.split("-")[1]));
  const minCol = Math.min(...cols);
  const maxCol = Math.max(...cols);
  const minRow = Math.min(...rows);
  const maxRow = Math.max(...rows);
  if (maxCol - minCol !== 1 || maxRow - minRow !== 1)
    return fail("bomb cells must form a 2×2 block");
  // Ensure all four corners of that block are present
  const keys = new Set(cells);
  const c1 = config.grid.columns[minCol],
    c2 = config.grid.columns[maxCol];
  const r1 = config.grid.rows[minRow],
    r2 = config.grid.rows[maxRow];
  for (const c of [c1, c2]) {
    for (const r of [r1, r2]) {
      if (!keys.has(`${c}-${r}`))
        return fail("bomb cells must form a complete 2×2 block");
    }
  }
  return ok();
}

export function validateColorNumberPick(
  config: BoardConfig,
  pick: ColorNumberPick,
  roll: DiceRoll,
  player: RoomPlayerRow,
  activePick: GamePick | null,
  isActivePlayer: boolean,
  round: number,
  otherPlayers: RowCompletionPlayer[] = [],
  currentRoundPicks: CurrentRoundPicks = {},
): ValidationResult {
  const { color_die, number_die, declared_color, declared_number, cells } =
    pick;

  // Valid die indices
  if (![0, 1, 2].includes(color_die)) return fail("invalid color_die index");
  if (![0, 1, 2].includes(number_die)) return fail("invalid number_die index");

  // In rounds 3+, non-active players cannot use the dice the active player used
  if (round >= ROUND_FOR_SPECIAL_ORDERING && !isActivePlayer) {
    if (activePick === null) return fail("active player has not yet picked");
    if (activePick.type === "color_number") {
      if (color_die === activePick.color_die)
        return fail("color die already used by active player");
      if (number_die === activePick.number_die)
        return fail("number die already used by active player");
    }
  }

  // Wildcard accounting
  const colorFace = roll.colors[color_die];
  const numberFace = roll.numbers[number_die];
  const colorIsWild = isColorWildcard(colorFace);
  const numberIsWild = isNumberWildcard(numberFace);
  const wildcardsNeeded = (colorIsWild ? 1 : 0) + (numberIsWild ? 1 : 0);
  if (wildcardsNeeded > player.wildcards) return fail("not enough wildcards");

  // Declared color matches die unless wildcard
  if (!colorIsWild && colorFace !== declared_color) {
    return fail(
      `declared_color (${declared_color}) does not match color die face (${colorFace})`,
    );
  }

  // Declared number is valid
  if (declared_number < VALID_NUMBER_MIN || declared_number > VALID_NUMBER_MAX)
    return fail("declared_number must be 1–5");
  if (!numberIsWild && numberFace !== String(declared_number)) {
    return fail(
      `declared_number (${declared_number}) does not match number die face (${numberFace})`,
    );
  }

  // Cell count matches declared number
  if (cells.length !== declared_number) {
    return fail(
      `must cross off exactly ${declared_number} cells, got ${cells.length}`,
    );
  }

  const crossedSet = new Set(player.crossed_cells);

  for (const key of cells) {
    const cell = getCell(config, key);
    if (!cell) return fail(`cell ${key} does not exist on board`);
    if (cell.color !== declared_color)
      return fail(`cell ${key} is not color ${declared_color}`);
    if (crossedSet.has(key)) return fail(`cell ${key} is already crossed`);
  }

  // Adjacency / start condition — each cell must independently satisfy placement rules
  // Build incrementally: as cells are "placed" they join the region for subsequent cells
  const buildingCrossed = [...player.crossed_cells];
  for (const key of cells) {
    if (!isValidPlacement(config, key, buildingCrossed)) {
      return fail(`cell ${key} is not adjacent to existing region`);
    }
    buildingCrossed.push(key);
  }

  // Contiguity check — cells must be connected, allowing bridges through same-color
  // already-crossed cells (e.g. picking A and C when B is already crossed).
  if (!areCellsContiguousWithBridge(config, cells, player.crossed_cells)) {
    return fail("selected cells must form a single contiguous group");
  }

  // Bomb cells from row completion — required when a bomb-item row is newly completed
  const bombRowsCompleted = newlyCompletedBombRows(
    config,
    player.crossed_cells,
    buildingCrossed,
    player.id,
    otherPlayers,
    currentRoundPicks,
  );
  if (bombRowsCompleted.length > 0 && (!pick.bomb_cells || pick.bomb_cells.length === 0)) {
    return fail("must include bomb_cells when completing a bomb row");
  }
  if (bombRowsCompleted.length === 0 && pick.bomb_cells && pick.bomb_cells.length > 0) {
    return fail("bomb_cells are only allowed when earning a bomb row item");
  }
  if (pick.bomb_cells && pick.bomb_cells.length > 0) {
    const bombResult = validateBombCells(config, pick.bomb_cells);
    if (!bombResult.valid) return fail(`bomb_cells: ${bombResult.error}`);
  }

  return ok();
}

export function validateSpecialPick(
  config: BoardConfig,
  pick: SpecialPick,
  roll: DiceRoll,
  player: RoomPlayerRow,
  activePick: GamePick | null = null,
  isActivePlayer: boolean = true,
  round: number = 1,
  otherPlayers: RowCompletionPlayer[] = [],
  currentRoundPicks: CurrentRoundPicks = {},
): ValidationResult {
  const availableBoxes = player.boxes_unlocked - player.boxes_spent;
  if (availableBoxes < 1) return fail("no boxes available");

  // In rounds 3+, non-active players must wait for the active player to pick,
  // then cannot use the special if the active player already claimed it.
  if (round >= ROUND_FOR_SPECIAL_ORDERING && !isActivePlayer) {
    if (activePick === null) return fail("active player has not yet picked");
    if (activePick.type === "special")
      return fail("special die already used by active player");
  }

  const crossedSet = new Set(player.crossed_cells);
  const { cells } = pick;

  switch (roll.special) {
    case "heart": {
      if (cells.length !== 0) return fail("heart pick must have no cells");
      break;
    }

    case "fill": {
      if (cells.length === 0)
        return fail("fill must include at least one cell");
      // All cells must be uncrossed and exist on board
      for (const key of cells) {
        if (!getCell(config, key))
          return fail(`cell ${key} does not exist on board`);
        if (crossedSet.has(key)) return fail(`cell ${key} is already crossed`);
      }
      // All cells must be same color
      const color = getCell(config, cells[0])!.color;
      for (const key of cells) {
        if (getCell(config, key)!.color !== color)
          return fail("fill cells must all be the same color");
      }
      // Cells must form a connected region
      const connected = getConnectedRegion(
        config,
        color,
        cells[0],
        player.crossed_cells,
      );
      const connectedSet = new Set(connected);
      for (const key of cells) {
        if (!connectedSet.has(key))
          return fail(`fill cells are not a fully connected same-color region`);
      }
      if (connected.length !== cells.length) {
        return fail(
          "fill must cross off the entire connected region, not a subset",
        );
      }
      // At least one cell must touch the player's existing region or column H.
      // "Touching column H" means the cell is in column H or orthogonally adjacent to it.
      const anyValid = cells.some(
        (key) =>
          isValidPlacement(config, key, player.crossed_cells) ||
          isAdjacentToStartZone(config, key),
      );
      if (!anyValid)
        return fail(
          "fill region must be adjacent to existing crossed region or to column H",
        );
      break;
    }

    case "three_in_a_row": {
      if (cells.length < THREE_IN_A_ROW_MIN || cells.length > THREE_IN_A_ROW_MAX)
        return fail("three_in_a_row requires 1–3 cells");
      const rows = cells.map((k) => k.split("-")[1]);
      if (new Set(rows).size !== 1)
        return fail("three_in_a_row cells must all be in the same row");
      // Incremental adjacency: each cell must touch the growing region, allowing
      // cells to chain off earlier picks (e.g. green → green → yellow in one row).
      const buildingCrossed = [...player.crossed_cells];
      for (const key of cells) {
        if (!getCell(config, key))
          return fail(`cell ${key} does not exist on board`);
        if (crossedSet.has(key)) return fail(`cell ${key} is already crossed`);
        if (!isValidPlacement(config, key, buildingCrossed)) {
          return fail(`cell ${key} is not adjacent to existing region`);
        }
        buildingCrossed.push(key);
      }
      break;
    }

    case "bomb": {
      if (cells.length !== BOMB_CELL_COUNT) return fail("bomb requires exactly 4 cells");
      const bombResult = validateBombCells(config, cells);
      if (!bombResult.valid) return bombResult;
      break;
    }

    case "two_stars": {
      if (cells.length !== TWO_STARS_CELL_COUNT) return fail("two_stars requires exactly 2 cells");
      const buildingCrossed = [...player.crossed_cells];
      for (const key of cells) {
        const cell = getCell(config, key);
        if (!cell) return fail(`cell ${key} does not exist on board`);
        if (cell.special !== "star")
          return fail(`cell ${key} is not a star cell`);
        if (crossedSet.has(key)) return fail(`cell ${key} is already crossed`);
        if (!isValidPlacement(config, key, buildingCrossed))
          return fail(`cell ${key} is not adjacent to existing region`);
        buildingCrossed.push(key);
      }
      break;
    }
  }

  // Bomb cells from row completion — required when a bomb-item row is newly completed
  const allCrossedAfterSpecial = [...player.crossed_cells, ...cells];
  const bombRowsCompletedBySpecial = newlyCompletedBombRows(
    config,
    player.crossed_cells,
    allCrossedAfterSpecial,
    player.id,
    otherPlayers,
    currentRoundPicks,
  );
  if (bombRowsCompletedBySpecial.length > 0 && (!pick.bomb_cells || pick.bomb_cells.length === 0)) {
    return fail("must include bomb_cells when completing a bomb row");
  }
  if (bombRowsCompletedBySpecial.length === 0 && pick.bomb_cells && pick.bomb_cells.length > 0) {
    return fail("bomb_cells are only allowed when earning a bomb row item");
  }
  if (pick.bomb_cells && pick.bomb_cells.length > 0) {
    const bombResult = validateBombCells(config, pick.bomb_cells);
    if (!bombResult.valid) return fail(`bomb_cells: ${bombResult.error}`);
  }

  return ok();
}

// Returns the set of cells the player can legally click given the current
// dice roll and selection state. Returns undefined when no guidance applies
// (color mode, no color die selected yet).
export function getValidCells(
  config: BoardConfig,
  crossed: string[],
  dice: DiceRoll,
  selectedSpecial: boolean,
  selectedColor: 0 | 1 | 2 | undefined,
  selectedNumber: 0 | 1 | 2 | undefined,
  selectedCells: string[],
): Set<string> | undefined {
  const crossedSet = new Set(crossed);

  if (selectedSpecial) {
    switch (dice.special) {
      case "heart":
        return new Set<string>();

      case "fill": {
        const result = new Set<string>();
        const processed = new Set<string>();
        for (const key of Object.keys(config.cells)) {
          if (crossedSet.has(key) || processed.has(key)) continue;
          if (!isAdjacentToRegion(config, key, crossed)) continue;
          const cell = config.cells[key];
          if (!cell) continue;
          const region = getConnectedRegion(config, cell.color, key, crossed);
          for (const k of region) {
            result.add(k);
            processed.add(k);
          }
        }
        return result;
      }

      case "three_in_a_row": {
        if (selectedCells.length >= 3) return new Set<string>();
        const selectedRow =
          selectedCells.length > 0 ? selectedCells[0].split("-")[1] : null;
        const result = new Set<string>();
        // Adjacency is checked against the incrementally-growing region so that
        // cells can chain off previously-selected cells, not just off crossed cells.
        const reachable = [...crossed, ...selectedCells];
        for (const key of Object.keys(config.cells)) {
          if (crossedSet.has(key) || selectedCells.includes(key)) continue;
          const [, row] = key.split("-");
          if (selectedRow !== null && row !== selectedRow) continue;
          if (!isAdjacentToRegion(config, key, reachable)) continue;
          result.add(key);
        }
        return result;
      }

      case "bomb": {
        if (selectedCells.length >= 4) return new Set<string>();
        if (selectedCells.length === 0) {
          return new Set<string>(Object.keys(config.cells));
        }
        const selIndices = selectedCells.map((k) => {
          const [col, row] = k.split("-");
          return [
            config.grid.columns.indexOf(col),
            config.grid.rows.indexOf(row),
          ] as [number, number];
        });
        const minCol = Math.min(...selIndices.map(([c]) => c));
        const maxCol = Math.max(...selIndices.map(([c]) => c));
        const minRow = Math.min(...selIndices.map(([, r]) => r));
        const maxRow = Math.max(...selIndices.map(([, r]) => r));
        if (maxCol - minCol > 1 || maxRow - minRow > 1) return new Set<string>();
        const result = new Set<string>();
        const acMin = Math.max(0, maxCol - 1);
        const acMax = Math.min(
          config.grid.columns.length - 2,
          minCol,
        );
        const arMin = Math.max(0, maxRow - 1);
        const arMax = Math.min(config.grid.rows.length - 2, minRow);
        for (let ac = acMin; ac <= acMax; ac++) {
          for (let ar = arMin; ar <= arMax; ar++) {
            const allFit = selIndices.every(
              ([c, r]) =>
                c >= ac && c <= ac + 1 && r >= ar && r <= ar + 1,
            );
            if (!allFit) continue;
            for (let dc = 0; dc <= 1; dc++) {
              for (let dr = 0; dr <= 1; dr++) {
                const key = `${config.grid.columns[ac + dc]}-${config.grid.rows[ar + dr]}`;
                if (!(key in config.cells)) continue;
                if (selectedCells.includes(key)) continue;
                result.add(key);
              }
            }
          }
        }
        return result;
      }

      case "two_stars": {
        if (selectedCells.length >= 2) return new Set<string>();
        const reachable = [...crossed, ...selectedCells];
        const result = new Set<string>();
        for (const [key, cell] of Object.entries(config.cells)) {
          if (crossedSet.has(key) || selectedCells.includes(key)) continue;
          if (cell.special !== "star") continue;
          if (!isValidPlacement(config, key, reachable)) continue;
          result.add(key);
        }
        return result;
      }
    }
  }

  // color_number mode
  if (selectedColor === undefined) return undefined;
  const declaredColorFace = dice.colors[selectedColor];
  const declaredNumberFace = dice.numbers[selectedNumber ?? 0];
  const isWild = isColorWildcard(declaredColorFace);
  // Once the first wildcard cell is chosen, lock all further picks to that color.
  const lockedColor =
    isWild && selectedCells.length > 0
      ? (config.cells as Record<string, { color: string }>)[selectedCells[0]]?.color
      : undefined;
  const effectiveColor: string | undefined =
    lockedColor ?? (!isWild ? (declaredColorFace as string) : undefined);
  const occupiedCells = [...crossed, ...selectedCells];
  const occupiedSet = new Set(occupiedCells);
  const result = new Set<string>();
  const required =
    selectedNumber === undefined
      ? Infinity
      : isNumberWildcard(declaredNumberFace)
      ? VALID_NUMBER_MAX
      : parseInt(declaredNumberFace, 10);
  const canSelectMore = selectedCells.length < required;
  for (const [key, cell] of Object.entries(config.cells)) {
    if (occupiedSet.has(key)) continue;
    if (effectiveColor !== undefined && cell.color !== effectiveColor) continue;
    if (!isValidPlacement(config, key, occupiedCells)) continue;
    // Once cells are selected, only allow cells that keep the selection contiguous
    // (using same-color crossed cells as bridges). This prevents picking from two
    // separate regions in one turn.
    if (
      selectedCells.length > 0 &&
      !areCellsContiguousWithBridge(config, [...selectedCells, key], crossed)
    ) {
      continue;
    }
    if (canSelectMore) result.add(key);
  }
  return result;
}
