export type {
  Color,
  CellKey,
  BoardCell,
  BoardConfig,
} from "@/boards/board.types";
import type { Color, BoardConfig } from "@/boards/board.types";

// ---------------------------------------------------------------------------
// Room / DB row shapes (snake_case matches Supabase column names)
// ---------------------------------------------------------------------------

export type RoomStatus = "lobby" | "in_progress" | "finished";

export interface RoomRow {
  id: string;
  code: string;
  host_id: string | null;
  status: RoomStatus;
  current_player_index: number;
  round_number: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface RoomPlayerRow {
  id: string;
  room_id: string;
  user_id: string | null;
  display_name: string;
  seat_index: number;
  crossed_cells: string[];
  hearts: number;
  /** Heart count recorded at the moment each column was completed. Populated by API on column completion. */
  column_heart_bonuses?: Record<string, number> | null;
  boxes_unlocked: number; // total boxes circled/earned (starts at 1, max 9)
  boxes_spent: number; // total boxes spent; available = boxes_unlocked - boxes_spent
  wildcards: number; // remaining wildcard uses (starts at 6, only decreases)
  score: number | null;
  score_breakdown: ScoreBreakdown | null;
  joined_at: string;
  is_bot: boolean;
  bot_type: string | null;
}

export interface RoomBoardRow {
  id: string;
  room_id: string;
  template_id: string | null;
  config: BoardConfig;
  created_at: string;
}

export interface RoomHistoryRow {
  id: string;
  room_id: string;
  round_number: number;
  active_player_id: string;
  dice_colors: [string, string, string];
  dice_numbers: [string, string, string];
  dice_special: DiceSpecialFace;
  active_pick: GamePick | null; // null until active player submits
  player_picks: Record<string, GamePick>;
  created_at: string;
}

export interface RoomChatRow {
  id: string;
  room_id: string;
  player_id: string | null; // null = system message
  message: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Dice
// ---------------------------------------------------------------------------

export type DiceColorFace = "p" | "o" | "y" | "g" | "b" | "✕";
export type DiceNumberFace = "1" | "2" | "3" | "4" | "5" | "?";
export type DiceSpecialFace =
  | "heart"
  | "fill"
  | "three_in_a_row"
  | "bomb"
  | "two_stars";

export interface DiceRoll {
  colors: [DiceColorFace, DiceColorFace, DiceColorFace];
  numbers: [DiceNumberFace, DiceNumberFace, DiceNumberFace];
  special: DiceSpecialFace;
}

// ---------------------------------------------------------------------------
// Picks (named GamePick to avoid collision with TS built-in Pick<T,K>)
// ---------------------------------------------------------------------------

export interface ColorNumberPick {
  type: "color_number";
  color_die: 0 | 1 | 2; // index into dice_colors
  number_die: 0 | 1 | 2; // index into dice_numbers
  declared_color: Color;
  declared_number: number; // 1–5
  cells: string[];
  bomb_cells?: string[]; // only present if a bomb row was completed this turn
}

export interface SpecialPick {
  type: "special";
  cells: string[];
  bomb_cells?: string[];
}

export interface PassPick {
  type: "pass";
}

export type GamePick = ColorNumberPick | SpecialPick | PassPick;

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Game logic results
// ---------------------------------------------------------------------------

export type ValidationResult =
  | { valid: true }
  | { valid: false; error: string };

export interface PickResult {
  crossed_cells: string[];
  wildcards: number;
  boxes_unlocked: number;
  boxes_spent: number;
  hearts: number;
  column_heart_bonuses: Record<string, number>;
}

// Raw board cell shape as stored in JSON (uses flat booleans for specials).
// BoardCell in board.types uses special?: "star"|"box" — this covers the legacy format.
export type RawCell = {
  color: Color;
  star?: boolean;
  box?: boolean;
  special?: string;
};

export interface ScoreBreakdown {
  columns: Record<string, number>;
  rows: Record<string, number>;
  colors: Partial<Record<Color, number>>;
  stars: number; // negative; −2 per uncrossed star cell
  wildcards: number; // +1 per unused wildcard slot at game end
  total: number;
}
