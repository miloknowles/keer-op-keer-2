import { NextRequest, NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DEV_MULTI_SEAT } from "@/lib/devFlags";
import { handleBotRound } from "@/lib/bots/runner";
import {
  validateColorNumberPick,
  validateSpecialPick,
} from "@/lib/game/rules";
import { computePickResult } from "@/lib/game/effects";
import { buildScoringContext, computeScore } from "@/lib/game/scoring";
import type {
  GamePick,
  DiceRoll,
  DiceColorFace,
  DiceNumberFace,
  RoomPlayerRow,
} from "@/types/game";
import type { BoardConfig } from "@/boards/board.types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const supabase = await createClient();

  // ── 1–2. Auth + room lookup ───────────────────────────────────────────────
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: room } = await supabase
    .from("rooms")
    .select("id, status, current_player_index, round_number")
    .eq("code", code.toLowerCase())
    .maybeSingle();
  if (!room)
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  if (room.status !== "in_progress")
    return NextResponse.json(
      { error: "Game is not in progress" },
      { status: 409 },
    );

  // ── 3. Player lookup ──────────────────────────────────────────────────────
  // Parse body early so DEV_MULTI_SEAT can use _dev_player_id to disambiguate
  // when all players share one user_id.
  let rawBody: Record<string, unknown>;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let meQuery = supabase
    .from("room_players")
    .select(
      "id, seat_index, crossed_cells, hearts, boxes_unlocked, boxes_spent, wildcards, column_heart_bonuses",
    )
    .eq("room_id", room.id);

  if (DEV_MULTI_SEAT && typeof rawBody._dev_player_id === "string") {
    meQuery = meQuery.eq("id", rawBody._dev_player_id);
  } else {
    meQuery = meQuery.eq("user_id", user.id);
  }

  const { data: me } = await meQuery.maybeSingle();
  if (!me)
    return NextResponse.json({ error: "Not in room" }, { status: 403 });

  const isActivePlayer = me.seat_index === room.current_player_index;

  // ── 4. Load current round history ─────────────────────────────────────────
  const { data: history } = await supabase
    .from("room_history")
    .select(
      "id, active_player_id, dice_colors, dice_numbers, dice_special, active_pick, player_picks",
    )
    .eq("room_id", room.id)
    .eq("round_number", room.round_number)
    .maybeSingle();
  if (!history)
    return NextResponse.json(
      { error: "No dice rolled for this round yet" },
      { status: 409 },
    );

  // ── 5. Guard against duplicate submissions ────────────────────────────────
  if (isActivePlayer && history.active_pick !== null)
    return NextResponse.json(
      { error: "Already submitted pick for this round" },
      { status: 409 },
    );
  if (!isActivePlayer && me.id in (history.player_picks ?? {}))
    return NextResponse.json(
      { error: "Already submitted pick for this round" },
      { status: 409 },
    );

  // ── 6. Load board config ──────────────────────────────────────────────────
  const { data: boardRow } = await supabase
    .from("room_boards")
    .select("config")
    .eq("room_id", room.id)
    .maybeSingle();
  if (!boardRow)
    return NextResponse.json({ error: "Board not found" }, { status: 500 });
  const config = boardRow.config as unknown as BoardConfig;

  // ── 7. Parse pick from already-read body ──────────────────────────────────
  const pick = rawBody as unknown as GamePick;
  if (!pick?.type)
    return NextResponse.json({ error: "Missing pick type" }, { status: 400 });

  // ── 8. Reconstruct DiceRoll from history ──────────────────────────────────
  const roll: DiceRoll = {
    colors: history.dice_colors as [
      DiceColorFace,
      DiceColorFace,
      DiceColorFace,
    ],
    numbers: history.dice_numbers as [
      DiceNumberFace,
      DiceNumberFace,
      DiceNumberFace,
    ],
    special: history.dice_special,
  };

  const playerRow = me as unknown as RoomPlayerRow;
  const activePick = history.active_pick as GamePick | null;
  const playerPicks = (history.player_picks ?? {}) as Record<string, GamePick>;

  // ── 9. Load other players for row item eligibility checks ────────────────
  const { data: allPlayers } = await supabase
    .from("room_players")
    .select("id, crossed_cells")
    .eq("room_id", room.id);
  const otherPlayers = (allPlayers ?? []).filter((p) => p.id !== me.id);
  const currentRoundPicks = {
    activePlayerId: history.active_player_id as string,
    activePick,
    playerPicks,
  };

  // ── 10. Server-side validation ────────────────────────────────────────────
  if (pick.type === "color_number") {
    const result = validateColorNumberPick(
      config,
      pick,
      roll,
      playerRow,
      activePick,
      isActivePlayer,
      room.round_number,
      otherPlayers,
      currentRoundPicks,
    );
    if (!result.valid)
      return NextResponse.json({ error: result.error }, { status: 400 });
  } else if (pick.type === "special") {
    const result = validateSpecialPick(
      config,
      pick,
      roll,
      playerRow,
      activePick,
      isActivePlayer,
      room.round_number,
      otherPlayers,
      currentRoundPicks,
    );
    if (!result.valid)
      return NextResponse.json({ error: result.error }, { status: 400 });
  } else if (pick.type === "pass") {
    // Players may always pass — no legal-move check enforced.
  } else {
    return NextResponse.json({ error: "Unknown pick type" }, { status: 400 });
  }

  // ── 11. Write pick to room_history ────────────────────────────────────────
  if (isActivePlayer) {
    const { error: historyErr } = await supabase
      .from("room_history")
      .update({ active_pick: pick })
      .eq("id", history.id);
    if (historyErr) {
      console.error("[pick] update active_pick failed:", historyErr);
      return NextResponse.json(
        { error: historyErr.message },
        { status: 500 },
      );
    }
  } else {
    const { error: historyErr } = await supabase.rpc("merge_player_pick", {
      p_history_id: history.id,
      p_player_id: me.id,
      p_pick: pick,
    });
    if (historyErr) {
      console.error("[pick] merge_player_pick failed:", historyErr);
      return NextResponse.json(
        { error: historyErr.message },
        { status: 500 },
      );
    }
  }

  // ── 12. Compute updated player state (pure) ───────────────────────────────
  const result = computePickResult(
    config,
    playerRow,
    pick,
    roll,
    otherPlayers,
    currentRoundPicks,
  );

  // ── 13. Write updated player row ──────────────────────────────────────────
  const { error: playerErr } = await supabase
    .from("room_players")
    .update(result)
    .eq("id", me.id);
  if (playerErr) {
    console.error("[pick] update room_players failed:", playerErr);
    return NextResponse.json({ error: playerErr.message }, { status: 500 });
  }

  // ── 14. Atomically check completion and advance ──────────────────────────
  const { data: advanceResult, error: advanceErr } = await supabase
    .rpc("maybe_advance_round", { p_room_id: room.id });
  if (advanceErr) {
    console.error("[pick] maybe_advance_round failed:", advanceErr);
    return NextResponse.json({ error: advanceErr.message }, { status: 500 });
  }

  if (advanceResult === "game_ends") {
    // ── 15. Compute and persist final scores (room already marked finished) ─
    const { data: histories } = await supabase
      .from("room_history")
      .select("round_number, active_player_id, active_pick, player_picks")
      .eq("room_id", room.id)
      .order("round_number", { ascending: true });
    const { data: allFull } = await supabase
      .from("room_players")
      .select("*")
      .eq("room_id", room.id);
    const allFullPlayers = (allFull ?? []) as RoomPlayerRow[];
    const scoringContext = buildScoringContext(
      config,
      allFullPlayers,
      histories ?? [],
    );
    for (const player of allFullPlayers) {
      const breakdown = computeScore(
        config,
        player,
        allFullPlayers,
        scoringContext,
      );
      const { error: scoreErr } = await supabase
        .from("room_players")
        .update({ score: breakdown.total, score_breakdown: breakdown })
        .eq("id", player.id);
      if (scoreErr) console.error("[pick] write score failed:", scoreErr);
    }
  }

  // When the round auto-advances, trigger any bots that need to act in the new round.
  // `after` (Next.js 15) runs after the response is sent and is tracked by the runtime.
  if (advanceResult === "advanced") {
    after(() => handleBotRound(room.id).catch((e) => console.error("[pick] handleBotRound failed:", e)));
  }

  return NextResponse.json({ ok: true });
}
