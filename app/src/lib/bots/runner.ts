import { createServiceClient } from "@/lib/supabase/service";
import { rollDice } from "@/lib/game/dice";
import { computePickResult } from "@/lib/game/effects";
import { computeScore } from "@/lib/game/scoring";
import { validateColorNumberPick, validateSpecialPick } from "@/lib/game/rules";
import { getBotStrategy } from "./index";
import type { BoardConfig } from "@/boards/board.types";
import type {
  GamePick,
  DiceRoll,
  DiceColorFace,
  DiceNumberFace,
  RoomPlayerRow,
} from "@/types/game";

// Apply a single bot's pick for the current round.
async function runBotPick(
  supabase: ReturnType<typeof createServiceClient>,
  config: BoardConfig,
  historyId: string,
  botPlayer: RoomPlayerRow,
  roll: DiceRoll,
  isActivePlayer: boolean,
  activePick: GamePick | null,
  allPlayers: RoomPlayerRow[],
  round: number,
  activePlayerId: string,
  playerPicks: Record<string, GamePick>,
): Promise<void> {
  const strategy = getBotStrategy(botPlayer.bot_type ?? "greedy");
  let pick = strategy.choosePick({
    config,
    player: botPlayer,
    roll,
    isActivePlayer,
    activePick,
    round,
    allPlayers,
  });

  // Validate non-pass picks; fall back to pass if invalid
  if (pick.type === "color_number") {
    const result = validateColorNumberPick(
      config,
      pick,
      roll,
      botPlayer,
      activePick,
      isActivePlayer,
      round,
      allPlayers.filter((p) => p.id !== botPlayer.id),
      { activePlayerId, activePick, playerPicks },
    );
    if (!result.valid) {
      console.warn(`[bot] invalid color_number pick for ${botPlayer.id}: ${result.error} — passing`);
      pick = { type: "pass" };
    }
  } else if (pick.type === "special") {
    const result = validateSpecialPick(
      config,
      pick,
      roll,
      botPlayer,
      activePick,
      isActivePlayer,
      round,
      allPlayers.filter((p) => p.id !== botPlayer.id),
      { activePlayerId, activePick, playerPicks },
    );
    if (!result.valid) {
      console.warn(`[bot] invalid special pick for ${botPlayer.id}: ${result.error} — passing`);
      pick = { type: "pass" };
    }
  }

  // Write pick to room_history
  if (isActivePlayer) {
    const { error } = await supabase
      .from("room_history")
      .update({ active_pick: pick })
      .eq("id", historyId);
    if (error) {
      console.error("[bot] update active_pick failed:", error);
      return;
    }
  } else {
    const { error } = await supabase.rpc("merge_player_pick", {
      p_history_id: historyId,
      p_player_id: botPlayer.id,
      p_pick: pick,
    });
    if (error) {
      console.error("[bot] merge_player_pick failed:", error);
      return;
    }
  }

  // Compute and write updated player state
  const otherPlayers = allPlayers.filter((p) => p.id !== botPlayer.id);
  const result = computePickResult(
    config,
    botPlayer,
    pick,
    roll,
    otherPlayers,
    { activePlayerId, activePick, playerPicks },
  );
  const { error: playerErr } = await supabase
    .from("room_players")
    .update(result)
    .eq("id", botPlayer.id);
  if (playerErr) {
    console.error("[bot] update room_players failed:", playerErr);
  }
}

// Main entry point. Called after any roll or advance that might require bot action.
// Uses a recursion guard to prevent infinite loops (max 200 rounds).
export async function handleBotRound(roomId: string, depth = 0): Promise<void> {
  if (depth > 200) {
    console.warn("[bot] handleBotRound depth limit reached — stopping");
    return;
  }

  const supabase = createServiceClient();

  // Load current room state
  const { data: room } = await supabase
    .from("rooms")
    .select("id, status, current_player_index, round_number")
    .eq("id", roomId)
    .maybeSingle();
  if (!room || room.status !== "in_progress") return;

  // Load all players
  const { data: playersData } = await supabase
    .from("room_players")
    .select("*")
    .eq("room_id", roomId)
    .order("seat_index", { ascending: true });
  const allPlayers = (playersData ?? []) as RoomPlayerRow[];

  // Load board config
  const { data: boardRow } = await supabase
    .from("room_boards")
    .select("config")
    .eq("room_id", roomId)
    .maybeSingle();
  if (!boardRow) return;
  const config = boardRow.config as unknown as BoardConfig;

  const activePlayer = allPlayers.find((p) => p.seat_index === room.current_player_index);
  if (!activePlayer) return;

  // Load or create history row for this round
  let { data: history } = await supabase
    .from("room_history")
    .select("id, active_player_id, dice_colors, dice_numbers, dice_special, active_pick, player_picks")
    .eq("room_id", roomId)
    .eq("round_number", room.round_number)
    .maybeSingle();

  // If active player is a bot and no history row yet, auto-roll
  if (!history && activePlayer.is_bot) {
    const dice = rollDice();
    const { data: newHistory, error: rollErr } = await supabase
      .from("room_history")
      .insert({
        room_id: roomId,
        round_number: room.round_number,
        active_player_id: activePlayer.id,
        dice_colors: dice.colors,
        dice_numbers: dice.numbers,
        dice_special: dice.special,
      })
      .select("id, active_player_id, dice_colors, dice_numbers, dice_special, active_pick, player_picks")
      .single();
    if (rollErr || !newHistory) {
      console.error("[bot] auto-roll insert failed:", rollErr);
      return;
    }
    history = newHistory;
  }

  if (!history) return; // No history yet and active player is human — wait for their roll

  const roll: DiceRoll = {
    colors: history.dice_colors as [DiceColorFace, DiceColorFace, DiceColorFace],
    numbers: history.dice_numbers as [DiceNumberFace, DiceNumberFace, DiceNumberFace],
    special: history.dice_special,
  };

  const activePick = history.active_pick as GamePick | null;
  const playerPicks = (history.player_picks ?? {}) as Record<string, GamePick>;
  const activePlayerId = history.active_player_id as string;

  // Pick for the active bot player if they haven't submitted yet
  if (activePlayer.is_bot && activePick === null) {
    await runBotPick(
      supabase, config, history.id,
      activePlayer, roll,
      true, null,
      allPlayers, room.round_number,
      activePlayerId, playerPicks,
    );
    // Reload active_pick for non-active bots
    const { data: refreshed } = await supabase
      .from("room_history")
      .select("active_pick")
      .eq("id", history.id)
      .maybeSingle();
    if (refreshed) {
      (history as typeof history & { active_pick: GamePick | null }).active_pick = refreshed.active_pick as GamePick | null;
    }
  }

  const currentActivePick = (history as { active_pick: GamePick | null }).active_pick;

  // Pick for all non-active bot players that haven't submitted yet
  const nonActiveBots = allPlayers.filter(
    (p) => p.is_bot && p.seat_index !== room.current_player_index && !(p.id in playerPicks),
  );

  // In rounds >= 3, non-active players must wait for the active pick
  if (room.round_number >= 3 && currentActivePick === null && nonActiveBots.length > 0) {
    return; // Active player hasn't picked yet — wait
  }

  for (const bot of nonActiveBots) {
    await runBotPick(
      supabase, config, history.id,
      bot, roll,
      false, currentActivePick,
      allPlayers, room.round_number,
      activePlayerId, playerPicks,
    );
  }

  // After all bot picks, try to advance the round
  if (nonActiveBots.length > 0 || (activePlayer.is_bot && activePick === null)) {
    const { data: advanceResult, error: advanceErr } = await supabase
      .rpc("maybe_advance_round", { p_room_id: roomId });
    if (advanceErr) {
      console.error("[bot] maybe_advance_round failed:", advanceErr);
      return;
    }

    if (advanceResult === "advanced") {
      await handleBotRound(roomId, depth + 1);
    } else if (advanceResult === "game_ends") {
      const { data: allFull } = await supabase
        .from("room_players")
        .select("*")
        .eq("room_id", roomId);
      const allFullPlayers = (allFull ?? []) as RoomPlayerRow[];
      for (const player of allFullPlayers) {
        const breakdown = computeScore(config, player, allFullPlayers);
        await supabase
          .from("room_players")
          .update({ score: breakdown.total, score_breakdown: breakdown })
          .eq("id", player.id);
      }
    }
  }
}
