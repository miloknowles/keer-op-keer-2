import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RoomHistoryRow } from "@/types/game";

export function useRoomHistory(roomId: string) {
  const supabase = useRef(createClient()).current;
  const [histories, setHistories] = useState<RoomHistoryRow[]>([]);

  useEffect(() => {
    supabase
      .from("room_history")
      .select("*")
      .eq("room_id", roomId)
      .order("round_number", { ascending: true })
      .then(({ data }) => setHistories(data ?? []));

    const channel = supabase
      .channel(`all-history:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "room_history",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const row = payload.new as RoomHistoryRow;
          setHistories((prev) =>
            [...prev.filter((h) => h.id !== row.id), row].sort(
              (a, b) => a.round_number - b.round_number,
            ),
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "room_history",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const row = payload.new as RoomHistoryRow;
          setHistories((prev) =>
            prev
              .map((h) => (h.id === row.id ? row : h))
              .sort((a, b) => a.round_number - b.round_number),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId]); // eslint-disable-line react-hooks/exhaustive-deps

  return histories;
}
