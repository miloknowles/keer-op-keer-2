"use client";

import { computeScore } from "@/lib/game/scoring";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { COLOR_NAMES } from "@/lib/constants";
import type { BoardConfig, RoomPlayerRow } from "@/types/game";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  players: RoomPlayerRow[];
  config: BoardConfig;
}

export function ScoreDialog({ open, onOpenChange, players, config }: Props) {
  const scores = players.map((p) => ({
    player: p,
    breakdown: computeScore(config, p, players),
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-[calc(100vw-2rem)]">
        <DialogHeader>
          <DialogTitle>Live Scores</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 overflow-x-auto overflow-y-hidden pb-2">
          <div className="flex h-full min-h-0 gap-3">
            {scores.map(({ player, breakdown }) => {
              const completedColumns = Object.entries(breakdown.columns);
              const completedRows = Object.entries(breakdown.rows);
              const completedColors = Object.entries(breakdown.colors) as [
                string,
                number,
              ][];

              return (
                <div
                  key={player.id}
                  className="flex max-h-full min-h-0 w-72 shrink-0 flex-col gap-2 rounded-lg border border-gray-100 bg-gray-50 p-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-gray-800">
                      {player.display_name}
                    </div>
                  </div>

                  <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1 text-xs text-gray-600">
                    {completedColumns.length > 0 && (
                      <div>
                        <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                          Columns
                        </div>
                        {completedColumns.map(([col, pts]) => (
                          <div key={col} className="flex justify-between gap-3">
                            <span>Column {col}</span>
                            <span className="font-medium text-gray-700">
                              +{pts}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {completedRows.length > 0 && (
                      <div>
                        <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                          Rows
                        </div>
                        {completedRows.map(([row, pts]) => (
                          <div key={row} className="flex justify-between gap-3">
                            <span>Row {row}</span>
                            <span className="font-medium text-gray-700">
                              +{pts}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {completedColors.length > 0 && (
                      <div>
                        <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                          Colors
                        </div>
                        {completedColors.map(([color, pts]) => (
                          <div
                            key={color}
                            className="flex justify-between gap-3"
                          >
                            <span className="truncate capitalize">
                              {COLOR_NAMES[color] ?? color}
                            </span>
                            <span className="font-medium text-gray-700">
                              +{pts}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex justify-between gap-3">
                      <span>Stars</span>
                      <span
                        className={`font-medium ${breakdown.stars < 0 ? "text-red-500" : "text-gray-700"}`}
                      >
                        {breakdown.stars}
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-between border-t border-gray-200 pt-2 text-sm font-bold text-gray-900">
                    <span>Total</span>
                    <span>{breakdown.total}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}
