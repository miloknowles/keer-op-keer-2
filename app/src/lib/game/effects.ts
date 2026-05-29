import type { BoardConfig } from "@/boards/board.types";
import type { GamePick, DiceRoll, RoomPlayerRow, PickResult } from "../../types/game";
import { isColorWildcard, isNumberWildcard } from "./dice";
import { isRowComplete, isColumnComplete, getCell } from "./sheet";
import {
  type CurrentRoundPicks,
  wasRowCompletedByOthersBeforeRound,
} from "./rules";

export type { PickResult };

// Computes the player's new state after applying a pick. Pure — no DB I/O.
// `otherPlayers` is used to determine whether row items were already claimed before this round.
export function computePickResult(
  config: BoardConfig,
  player: RoomPlayerRow,
  pick: GamePick,
  roll: DiceRoll,
  otherPlayers: Pick<RoomPlayerRow, "id" | "crossed_cells">[],
  currentRoundPicks: CurrentRoundPicks = {},
): PickResult {
  const pickedCells = pick.type === "pass" ? [] : (pick.cells ?? []);
  const bombCells =
    pick.type !== "pass" && pick.bomb_cells ? pick.bomb_cells : [];
  const newCrossedCells = [...player.crossed_cells];
  const newCrossedSet = new Set(newCrossedCells);
  for (const key of [...pickedCells, ...bombCells]) {
    if (newCrossedSet.has(key)) continue;
    newCrossedCells.push(key);
    newCrossedSet.add(key);
  }
  const prevCrossedSet = new Set(player.crossed_cells);

  // Wildcard deduction
  let newWildcards = player.wildcards;
  if (pick.type === "color_number") {
    if (isColorWildcard(roll.colors[pick.color_die])) newWildcards -= 1;
    if (isNumberWildcard(roll.numbers[pick.number_die])) newWildcards -= 1;
  }

  // Box cells earned by crossing new box-icon cells
  const boxCellsEarned = newCrossedCells.filter(
    (key) =>
      !prevCrossedSet.has(key) && getCell(config, key)?.special === "box",
  ).length;
  let newBoxesUnlocked = Math.min(
    player.boxes_unlocked + boxCellsEarned,
    config.scoring.boxTrack.size,
  );

  // Special pick effects
  let newBoxesSpent = player.boxes_spent;
  let newHearts = player.hearts;
  if (pick.type === "special") {
    newBoxesSpent += 1;
    if (roll.special === "heart") {
      newHearts = Math.min(
        player.hearts + 1,
        config.scoring.heartTrack.size,
      );
    }
  }

  // Row item bonuses — awarded to players who complete the row in its first completion round.
  for (const row of config.grid.rows) {
    if (isRowComplete(config, row, player.crossed_cells)) continue;
    if (!isRowComplete(config, row, newCrossedCells)) continue;
    const alreadyCompletedByOther = wasRowCompletedByOthersBeforeRound(
      config,
      row,
      player.id,
      otherPlayers,
      currentRoundPicks,
    );
    if (alreadyCompletedByOther) continue;

    const item = (config.scoring.rowItems as Record<string, string>)[row];
    if (item === "heart") {
      newHearts = Math.min(newHearts + 1, config.scoring.heartTrack.size);
    } else if (item === "box") {
      newBoxesUnlocked = Math.min(
        newBoxesUnlocked + 1,
        config.scoring.boxTrack.size,
      );
    }
  }

  // Column completion — record heart count at time of completion; award box for column H
  const newHeartBonuses = {
    ...((player.column_heart_bonuses ?? {}) as Record<string, number>),
  };
  for (const col of config.grid.columns) {
    if (col in newHeartBonuses) continue;
    if (isColumnComplete(config, col, player.crossed_cells)) continue;
    if (!isColumnComplete(config, col, newCrossedCells)) continue;
    newHeartBonuses[col] = newHearts;
    if (col === "H") {
      newBoxesUnlocked = Math.min(
        newBoxesUnlocked + 1,
        config.scoring.boxTrack.size,
      );
    }
  }

  return {
    crossed_cells: newCrossedCells,
    wildcards: newWildcards,
    boxes_unlocked: newBoxesUnlocked,
    boxes_spent: newBoxesSpent,
    hearts: newHearts,
    column_heart_bonuses: newHeartBonuses,
  };
}
