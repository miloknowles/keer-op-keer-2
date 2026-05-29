import type { BoardConfig, DiceColorFace, DiceNumberFace, DiceSpecialFace } from "@/types/game";
import { isColorWildcard, isNumberWildcard } from "./dice";
import { COLOR_NAMES } from "@/lib/constants";

interface HintParams {
  isMyBoard: boolean;
  dice: {
    colors: [DiceColorFace, DiceColorFace, DiceColorFace];
    numbers: [DiceNumberFace, DiceNumberFace, DiceNumberFace];
    special: DiceSpecialFace;
  } | null;
  inRowBombMode: boolean;
  currentBombCells: string[];
  bombNumber: number;
  selectedSpecial: boolean;
  selectedColor: 0 | 1 | 2 | undefined;
  selectedNumber: 0 | 1 | 2 | undefined;
  selectedCells: string[];
  boardCells: BoardConfig["cells"];
}

export function computeHintText({
  isMyBoard,
  dice,
  inRowBombMode,
  currentBombCells,
  bombNumber,
  selectedSpecial,
  selectedColor,
  selectedNumber,
  selectedCells,
  boardCells,
}: HintParams): string | null {
  if (!isMyBoard || !dice) return null;

  if (inRowBombMode) {
    const rem = 4 - currentBombCells.length;
    if (rem > 0)
      return `Bomb earned — place bomb ${bombNumber}: pick ${rem} more cell${rem === 1 ? "" : "s"} to form a 2×2`;
    return null;
  }

  if (selectedSpecial) {
    switch (dice.special) {
      case "heart":
        return "Spend 1 box — gain 1 heart";
      case "fill":
        return selectedCells.length > 0
          ? "Region selected — click Confirm"
          : "Click a cell to fill its connected color region";
      case "three_in_a_row": {
        const rem = 3 - selectedCells.length;
        if (selectedCells.length === 0) return "Pick 1–3 adjacent cells in the same row";
        if (rem > 0) return `Confirm, or pick ${rem} more cell${rem === 1 ? "" : "s"} in the row`;
        return null;
      }
      case "bomb": {
        const rem = 4 - selectedCells.length;
        return rem > 0 ? `Pick ${rem} more cell${rem === 1 ? "" : "s"} to complete the 2×2` : null;
      }
      case "two_stars": {
        const rem = 2 - selectedCells.length;
        return rem > 0 ? `Pick ${rem} more star cell${rem === 1 ? "" : "s"}` : null;
      }
    }
  }

  if (selectedColor === undefined) return "Pick a color die";
  if (selectedNumber === undefined) return "Pick a number die";

  const declaredColorFace = dice.colors[selectedColor];
  const declaredNumberFace = dice.numbers[selectedNumber];
  const wildcardLockedColor =
    isColorWildcard(declaredColorFace) && selectedCells.length > 0
      ? (boardCells as Record<string, { color: string }>)[selectedCells[0]]?.color
      : undefined;
  const colorName = wildcardLockedColor
    ? (COLOR_NAMES[wildcardLockedColor] ?? wildcardLockedColor)
    : isColorWildcard(declaredColorFace)
      ? "any color"
      : (COLOR_NAMES[declaredColorFace] ?? declaredColorFace);

  if (isNumberWildcard(declaredNumberFace)) {
    return `Select ${colorName} squares, then confirm`;
  }

  const required = parseInt(declaredNumberFace, 10);
  const remaining = required - selectedCells.length;
  if (remaining === 0) return null;
  return `Pick ${remaining} more ${colorName} square${remaining === 1 ? "" : "s"}`;
}
