"use client";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { BoardConfig } from "@/boards/board.types";
import { COLOR_NAMES } from "@/lib/constants";
import { computeScore } from "@/lib/game/scoring";
import type { RoomPlayerRow, ScoreBreakdown, Color } from "@/types/game";
import type { ScoringContext } from "@/lib/game/scoring";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  players: RoomPlayerRow[];
  config: BoardConfig;
  scoringContext?: ScoringContext;
}

const RANK_MEDALS = ["🥇", "🥈", "🥉"];

function colTotal(bd: ScoreBreakdown) {
  return Object.values(bd.columns).reduce((a, b) => a + b, 0);
}
function rowTotal(bd: ScoreBreakdown) {
  return Object.values(bd.rows).reduce((a, b) => a + b, 0);
}
function colorTotal(bd: ScoreBreakdown) {
  return Object.values(bd.colors).reduce((a, b) => a + b, 0);
}

export function GameOverDialog({
  open,
  onOpenChange,
  players,
  config,
  scoringContext,
}: Props) {
  const scoredPlayers = players.map((player) => {
    const breakdown =
      scoringContext
        ? computeScore(config, player, players, scoringContext)
        : player.score_breakdown ?? computeScore(config, player, players);
    return {
      ...player,
      score: scoringContext ? breakdown.total : player.score ?? breakdown.total,
      score_breakdown: breakdown,
    };
  });
  const sorted = [...scoredPlayers].sort((a, b) => b.score - a.score);
  const winner = sorted[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Game Over!</DialogTitle>
        </DialogHeader>

        {players.length === 0 ? (
          <p className="text-sm text-gray-400 italic py-4 text-center">
            Calculating final scores…
          </p>
        ) : (
          <div className="flex flex-col gap-5">
            {/* Winner banner */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-0.5">
                  Winner
                </div>
                <div className="text-lg font-bold text-gray-900">
                  {winner?.display_name}
                </div>
              </div>
              <div className="text-3xl font-black text-amber-600">
                {winner?.score}
              </div>
            </div>

            {/* Scores table */}
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide bg-gray-50">
                    <th className="text-left px-4 py-2.5 font-medium w-8">#</th>
                    <th className="text-left px-3 py-2.5 font-medium">Player</th>
                    <th className="text-right px-3 py-2.5 font-medium">Cols</th>
                    <th className="text-right px-3 py-2.5 font-medium">Rows</th>
                    <th className="text-right px-3 py-2.5 font-medium">Colors</th>
                    <th className="text-right px-3 py-2.5 font-medium">Stars</th>
                    <th className="text-right px-3 py-2.5 font-medium">Wild</th>
                    <th className="text-right px-4 py-2.5 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((p, i) => {
                    const bd = p.score_breakdown as ScoreBreakdown;
                    return (
                      <tr
                        key={p.id}
                        className={i < sorted.length - 1 ? "border-b border-gray-50" : ""}
                      >
                        <td className="px-4 py-3 text-base">
                          {RANK_MEDALS[i] ?? i + 1}
                        </td>
                        <td className="px-3 py-3 font-semibold text-gray-900">
                          {p.display_name}
                        </td>
                        <td className="px-3 py-3 text-right text-gray-700">
                          {colTotal(bd)}
                        </td>
                        <td className="px-3 py-3 text-right text-gray-700">
                          {rowTotal(bd)}
                        </td>
                        <td className="px-3 py-3 text-right text-gray-700">
                          {colorTotal(bd)}
                        </td>
                        <td className="px-3 py-3 text-right text-red-500">
                          {bd.stars}
                        </td>
                        <td className="px-3 py-3 text-right text-gray-700">
                          {bd.wildcards}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-gray-900">
                          {p.score}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Color completions */}
            {sorted.some((p) => {
              const bd = p.score_breakdown as ScoreBreakdown;
              return Object.keys(bd.colors).length > 0;
            }) && (
              <div>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Color completions
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {sorted.map((p) => {
                    const bd = p.score_breakdown as ScoreBreakdown;
                    const completedColors = Object.entries(bd.colors) as [Color, number][];
                    if (completedColors.length === 0) return null;
                    return (
                      <div
                        key={p.id}
                        className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3"
                      >
                        <div className="text-xs font-semibold text-gray-700 mb-1.5">
                          {p.display_name}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {completedColors.map(([color, pts]) => (
                            <span
                              key={color}
                              className="inline-flex items-center gap-1 text-xs bg-white border border-gray-200 text-gray-700 rounded-full px-2.5 py-0.5"
                            >
                              {COLOR_NAMES[color] ?? color}
                              <span className="font-semibold text-gray-900">
                                +{pts}
                              </span>
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}
