"use client";

import { cn } from "@/lib/utils";
import { COLOR_BG } from "@/lib/constants";
import type { BoardConfig, Color, RawCell } from "@/types/game";

interface ScoreSheetProps {
  config: BoardConfig;
  crossedCells: string[];
  selectedCells?: string[];
  onCellClick?: (cellKey: string) => void;
  myCompletedRows?: string[];
  myCompletedCols?: string[];
  firstTakenRows?: string[];
  firstTakenCols?: string[];
  /** Heart count recorded at the moment each column was completed. Key = column letter. */
  columnHeartBonuses?: Record<string, number>;
  /** When defined, uncrossed/unselected cells not in this set are dimmed and non-clickable. */
  validCells?: Set<string>;
  onCellHover?: (cellKey: string | null) => void;
  cellCursors?: Record<string, { color: Color; displayName: string }[]>;
}

export function ScoreSheet({
  config,
  crossedCells,
  selectedCells = [],
  onCellClick,
  myCompletedRows = [],
  myCompletedCols = [],
  firstTakenRows = [],
  firstTakenCols = [],
  columnHeartBonuses = {},
  validCells,
  onCellHover,
  cellCursors = {},
}: ScoreSheetProps) {
  const { grid, scoring } = config;
  const cells = config.cells as unknown as Record<string, RawCell>;
  const crossedSet = new Set(crossedCells);
  const selectedSet = new Set(selectedCells);
  const myCompletedRowSet = new Set(myCompletedRows);
  const myCompletedColSet = new Set(myCompletedCols);
  const firstTakenRowSet = new Set(firstTakenRows);
  const firstTakenColSet = new Set(firstTakenCols);

  return (
    <div className="select-none">
      {/* Column labels */}
      <div className="flex gap-1 mb-1 ml-20">
        {grid.columns.map((col) => (
          <div
            key={col}
            className={cn(
              "w-10 text-center text-xs font-bold shrink-0",
              grid.startColumns.includes(col)
                ? "text-kok-orange"
                : "text-gray-500",
            )}
          >
            {col}
          </div>
        ))}
      </div>

      {/* Rows */}
      <div className="flex flex-col gap-1" onMouseLeave={() => onCellHover?.(null)}>
        {grid.rows.map((row) => {
          const rowItem = (scoring.rowItems as Record<string, string>)[row];
          const rowBonus = (scoring.rowBonuses as Record<string, number>)[row];
          const myClaimed = myCompletedRowSet.has(row);
          const firstTaken = firstTakenRowSet.has(row);
          const missed = !myClaimed && firstTaken;

          return (
            <div key={row} className="flex items-center gap-1">
              {/* Row bonus score cell */}
              <div
                className={cn(
                  "w-8 h-10 shrink-0 rounded flex items-center justify-center text-xs font-bold",
                  myClaimed && "bg-kok-green/20 text-kok-green",
                  missed && "text-gray-300 line-through",
                  !myClaimed && !missed && "text-gray-700",
                )}
              >
                {missed ? rowBonus : rowBonus}
              </div>

              {/* Row item reward cell */}
              <div
                className={cn(
                  "w-10 h-10 shrink-0 rounded flex items-center justify-center text-lg",
                  myClaimed && "bg-kok-green/20",
                  missed && "opacity-25",
                )}
              >
                {rowItem === "heart" && <span>❤️</span>}
                {rowItem === "box" && <span>📦</span>}
                {rowItem === "bomb" && <span>💣</span>}
              </div>

              {/* Cells */}
              {grid.columns.map((col) => {
                const key = `${col}-${row}`;
                const cell = cells[key];

                if (!cell) {
                  return (
                    <div
                      key={key}
                      className="w-10 h-10 shrink-0 rounded bg-gray-50"
                    />
                  );
                }

                const color = cell.color;
                const isStar = cell.star === true || cell.special === "star";
                const isBox = cell.box === true || cell.special === "box";
                const isCrossed = crossedSet.has(key);
                const isSelected = selectedSet.has(key);
                const isInvalid =
                  validCells !== undefined &&
                  !isCrossed &&
                  !isSelected &&
                  !validCells.has(key);

                const cursors = cellCursors[key] ?? [];
                const isStartCol = grid.startColumns.includes(col);

                return (
                  <button
                    key={key}
                    onClick={isInvalid ? undefined : () => onCellClick?.(key)}
                    onMouseEnter={() => onCellHover?.(key)}
                    className={cn(
                      "w-10 h-10 shrink-0 rounded relative flex items-center justify-center transition-all",
                      COLOR_BG[color],
                      isStartCol &&
                        "z-10 shadow-[inset_0_0_0_2px_rgba(17,24,39,0.45),0_0_0_1px_rgba(255,255,255,0.85),0_1px_4px_rgba(17,24,39,0.16)]",
                      isCrossed && "brightness-90",
                      isSelected && "ring-2 ring-inset ring-black/70",
                      onCellClick && !isCrossed && !isInvalid && "hover:brightness-110 cursor-pointer",
                      isInvalid && "opacity-30 cursor-default",
                      !onCellClick && !isInvalid && "cursor-default",
                    )}
                  >
                    {!isCrossed && isStar && (
                      <span className="text-lg leading-none">⭐</span>
                    )}
                    {!isCrossed && isBox && (
                      <span className="text-lg leading-none">📦</span>
                    )}
                    {isCrossed && (
                      <span className="text-gray-950/80 font-black text-base leading-none pointer-events-none">
                        ✕
                      </span>
                    )}
                    {cursors.length > 0 && (
                      <div className="absolute top-0.5 right-0.5 flex gap-0.5">
                        {cursors.slice(0, 3).map((cursor, idx) => (
                          <div
                            key={idx}
                            className={cn(
                              "w-1.5 h-1.5 rounded-full",
                              COLOR_BG[cursor.color]
                            )}
                            title={cursor.displayName}
                          />
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}

              {/* Row label */}
              <div className="w-8 text-center text-xs font-bold text-gray-500 shrink-0 ml-1">
                {row}
              </div>
            </div>
          );
        })}
      </div>

      {/* Column bonus footer — 3×N grid */}
      <div className="flex gap-1 mt-1 ml-20">
        {grid.columns.map((col) => {
          const bonus = (
            scoring.columnBonuses as Record<
              string,
              { first: number; subsequent: number }
            >
          )[col];
          const myClaimed = myCompletedColSet.has(col);
          const someoneElseFirst = firstTakenColSet.has(col) && !myClaimed;
          const heartBonus = columnHeartBonuses[col];
          const heartRecorded = heartBonus !== undefined;

          return (
            <div key={col} className="w-10 shrink-0 flex flex-col gap-1">
              {/* First-place value */}
              <div
                className={cn(
                  "w-10 h-10 rounded flex items-center justify-center text-xs font-bold",
                  myClaimed && "bg-kok-green/20 text-kok-green",
                  someoneElseFirst && "text-gray-300 line-through",
                  !myClaimed &&
                    !someoneElseFirst &&
                    "bg-gray-100 text-gray-700",
                )}
              >
                {bonus?.first}
              </div>
              {/* Subsequent value */}
              <div
                className={cn(
                  "w-10 h-10 rounded flex items-center justify-center text-[10px]",
                  someoneElseFirst && "bg-gray-100 text-gray-600 font-semibold",
                  !someoneElseFirst && "text-gray-400",
                )}
              >
                {col === "H" ? "📦" : bonus?.subsequent}
              </div>
              {/* Heart bonus square — light heart placeholder; filled with recorded bonus on column completion */}
              <div
                className={cn(
                  "w-10 h-10 rounded flex items-center justify-center",
                  heartRecorded ? "bg-red-50" : "bg-gray-50",
                )}
              >
                {heartRecorded ? (
                  <span className="text-xs font-bold text-red-400 flex items-center gap-0.5">
                    <span className="text-[10px]">❤️</span>
                    {heartBonus}
                  </span>
                ) : (
                  <span className="text-[10px] opacity-30">❤️</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
