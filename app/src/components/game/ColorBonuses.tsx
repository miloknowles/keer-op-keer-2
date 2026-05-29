import { getBoardColors, isColorComplete, getCellsOfColor } from "@/lib/game/sheet";
import { COLOR_BG } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { BoardConfig } from "@/boards/board.types";
import type { ScoringContext } from "@/lib/game/scoring";

interface ColorBonusesProps {
  config: BoardConfig;
  viewingPlayerId: string;
  viewingCrossedCells: string[];
  allPlayersCrossedCells: string[][];
  scoringContext?: ScoringContext;
}

function completionIndex(crossed: string[], targets: Set<string>): number {
  let last = -1;
  for (let i = 0; i < crossed.length; i++) {
    if (targets.has(crossed[i])) last = i;
  }
  return last;
}

export function ColorBonuses({
  config,
  viewingPlayerId,
  viewingCrossedCells,
  allPlayersCrossedCells,
  scoringContext,
}: ColorBonusesProps) {
  const colors = getBoardColors(config);
  const { first: firstPts, subsequent: subPts } = config.scoring.colorCompletion;

  return (
    <div>
      <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
        Colors
      </div>
      {/* Column headers */}
      <div className="flex gap-1 mb-1">
        <div className="w-8 text-center text-[9px] font-semibold text-gray-400 uppercase">1st</div>
        <div className="w-8 text-center text-[9px] font-semibold text-gray-400 uppercase">2nd</div>
      </div>
      <div className="flex flex-col gap-1">
        {colors.map((color) => {
          const cellKeys = getCellsOfColor(config, color);
          const targets = new Set(cellKeys);

          const viewerCompleted = isColorComplete(config, color, viewingCrossedCells);
          const viewerRound =
            scoringContext?.playerCompletionRounds[viewingPlayerId]?.colors[
              color
            ];
          const firstRound = scoringContext?.firstCompletionRounds.colors[color];
          const fallbackViewerIdx = viewerCompleted
            ? completionIndex(viewingCrossedCells, targets)
            : Infinity;
          const fallbackFirstTakenByOther = allPlayersCrossedCells.some(
            (crossed) =>
              crossed !== viewingCrossedCells &&
              isColorComplete(config, color, crossed) &&
              completionIndex(crossed, targets) < fallbackViewerIdx,
          );
          const firstTaken =
            firstRound !== undefined ||
            fallbackFirstTakenByOther ||
            viewerCompleted;
          const contextViewerIsFirst =
            viewerCompleted &&
            viewerRound !== undefined &&
            firstRound !== undefined &&
            viewerRound === firstRound;
          const viewerIsFirst =
            firstRound !== undefined
              ? contextViewerIsFirst
              : viewerCompleted && !fallbackFirstTakenByOther;
          const firstTakenByOther = firstTaken && !viewerIsFirst;

          return (
            <div key={color} className="flex items-center gap-1">
              {/* First-place square */}
              <div
                className={cn(
                  "w-8 h-8 rounded flex items-center justify-center text-xs font-bold text-white",
                  COLOR_BG[color],
                  !viewerIsFirst && !firstTakenByOther && "opacity-40",
                  firstTakenByOther && !viewerIsFirst && "opacity-30",
                )}
                title={`First: +${firstPts} pts`}
              >
                {viewerIsFirst ? "✓" : firstTakenByOther ? "✕" : `+${firstPts}`}
              </div>

              {/* Subsequent square */}
              <div
                className={cn(
                  "w-8 h-8 rounded flex items-center justify-center text-xs font-bold text-white",
                  COLOR_BG[color],
                  !viewerCompleted && "opacity-40",
                  viewerCompleted && !viewerIsFirst && "opacity-100",
                  viewerIsFirst && "opacity-40",
                )}
                title={`Subsequent: +${subPts} pts`}
              >
                {viewerCompleted && !viewerIsFirst ? "✓" : `+${subPts}`}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
