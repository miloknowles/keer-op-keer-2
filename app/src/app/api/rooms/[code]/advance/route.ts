import { NextRequest, NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildScoringContext, computeScore } from "@/lib/game/scoring";
import type { RoomPlayerRow } from "@/types/game";
import type { BoardConfig } from "@/boards/board.types";
import { handleBotRound } from "@/lib/bots/runner";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: room } = await supabase
    .from("rooms")
    .select("id, status")
    .eq("code", code.toLowerCase())
    .maybeSingle();
  if (!room)
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  if (room.status !== "in_progress")
    return NextResponse.json(
      { error: "Game is not in progress" },
      { status: 409 },
    );

  const { count: playerCount } = await supabase
    .from("room_players")
    .select("id", { count: "exact", head: true })
    .eq("room_id", room.id)
    .eq("user_id", user.id);
  if (!playerCount || playerCount === 0)
    return NextResponse.json({ error: "Not in room" }, { status: 403 });

  const { data: advanceResult, error: advanceErr } = await supabase
    .rpc("maybe_advance_round", { p_room_id: room.id });
  if (advanceErr) {
    console.error("[advance] maybe_advance_round failed:", advanceErr);
    return NextResponse.json({ error: advanceErr.message }, { status: 500 });
  }

  if (advanceResult === "not_complete")
    return NextResponse.json(
      { error: "Not all players have submitted picks yet" },
      { status: 409 },
    );

  if (advanceResult === "already_finished")
    return NextResponse.json(
      { error: "Game is not in progress" },
      { status: 409 },
    );

  // Trigger bot round after advance (handles active bot auto-roll + all non-active bot picks)
  if (advanceResult === "advanced") {
    after(() => handleBotRound(room.id).catch((e) => console.error("[advance] handleBotRound failed:", e)));
  }

  if (advanceResult === "game_ends") {
    const { data: boardRow } = await supabase
      .from("room_boards")
      .select("config")
      .eq("room_id", room.id)
      .maybeSingle();
    const config = boardRow?.config as unknown as BoardConfig;
    const { data: allFull } = await supabase
      .from("room_players")
      .select("*")
      .eq("room_id", room.id);
    const allFullPlayers = (allFull ?? []) as RoomPlayerRow[];
    const { data: histories } = await supabase
      .from("room_history")
      .select("round_number, active_player_id, active_pick, player_picks")
      .eq("room_id", room.id)
      .order("round_number", { ascending: true });
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
      if (scoreErr) console.error("[advance] write score failed:", scoreErr);
    }
  }

  return NextResponse.json({ ok: true });
}
