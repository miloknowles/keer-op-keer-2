export type Color = "p" | "o" | "y" | "g" | "b";

// Special icon printed on a cell.
// "star"  — if uncrossed at game end, costs the player `starPenalty` points.
// "box"   — when crossed off, grants the player 1 box on their box track.
export type CellSpecial = "star" | "box";

// Item awarded to players who complete a row in the first round it is completed.
// "bomb"  — must be played immediately on the same turn; cross off any 2×2 block anywhere.
// "heart" — advances the player's heart track by 1.
// "box"   — grants the player 1 box on their box track.
export type RowItem = "box" | "bomb" | "heart";

// Cell address in "col-row" format, e.g. "A-P", "H-V"
export type CellKey = string;

export interface BoardCell {
  color: Color;
  special?: CellSpecial;
}

export interface BoardConfig {
  id: string;
  name: string;
  version: number;

  grid: {
    columns: string[]; // ordered left-to-right, e.g. ["A".."O"]
    rows: string[]; // ordered top-to-bottom, e.g. ["P".."V"]
    startColumns: string[]; // columns a player's first cross must land in
  };

  scoring: {
    // Points for completing a column. Both first and subsequent players also add
    // their current heart count on top of the printed value.
    columnBonuses: Record<string, { first: number; subsequent: number }>;

    // Points awarded to every player who completes a row (cross off all cells).
    // Subsequent completers earn no points and no item.
    rowBonuses: Record<string, number>;

    // Item given to first-round row completers. Omit if the row has no item.
    rowItems: Partial<Record<string, RowItem>>;

    // Bonus for crossing off every cell of a single color.
    colorCompletion: {
      first: number; // points for the first player to finish the color
      subsequent: number; // points for every other player who also finishes it
    };

    // End-game penalty per uncrossed star cell (expected to be negative, e.g. -2).
    starPenalty: number;

    // The game ends when any player has fully completed this many colors.
    gameEnd: {
      colorsCompleted: number;
    };

    // Box track configuration.
    boxTrack: {
      size: number; // total number of box slots (9 in standard KoK2)
      startingBoxes: number; // boxes available at game start (1 in standard KoK2)
    };

    // Heart track configuration.
    heartTrack: {
      size: number; // total number of heart slots (5 in standard KoK2)
    };

    // Wildcard track configuration.
    wildcardTrack: {
      starting: number; // wildcard uses available at game start (6 in standard KoK2)
    };
  };

  // Every cell that exists on the board. Cells not listed here do not exist
  // (allows non-rectangular / irregular boards for custom variants).
  cells: Record<CellKey, BoardCell>;
}
