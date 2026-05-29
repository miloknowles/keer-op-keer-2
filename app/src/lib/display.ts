import type { Color } from "@/boards/board.types";
import type { DiceSpecialFace } from "@/types/game";

export const COLOR_DISPLAY: Record<Color, string> = {
  p: "Pink",
  o: "Orange",
  y: "Yellow",
  g: "Green",
  b: "Blue",
};

export const SPECIAL_DISPLAY: Record<DiceSpecialFace, string> = {
  heart: "Heart",
  fill: "Fill",
  three_in_a_row: "Three in a Row",
  bomb: "Bomb",
  two_stars: "Two Stars",
};

export const SPECIAL_DESCRIPTION: Record<DiceSpecialFace, string> = {
  heart: "Heart (+1 on columns)",
  fill: "Fill (connected section)",
  three_in_a_row: "3-in-a-row",
  bomb: "Bomb (any 2×2)",
  two_stars: "Two stars (any 2 ★)",
};
