"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSound } from "react-sounds";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import {
  isRowComplete,
  isColumnComplete,
  isColorComplete,
  getBoardColors,
  getConnectedRegion,
} from "@/lib/game/sheet";
import { isColorWildcard, isNumberWildcard } from "@/lib/game/dice";
import {
  getValidCells,
  wasRowCompletedByOthersBeforeRound,
} from "@/lib/game/rules";
import { computeHintText } from "@/lib/game/hint";
import { COLOR_NAMES, MEDALS, SEAT_TO_COLOR } from "@/lib/constants";
import { ScoreSheet } from "@/components/game/ScoreSheet";
import { GameDice } from "@/components/game/GameDice";
import { ResourceTracks } from "@/components/game/ResourceTracks";
import { ColorBonuses } from "@/components/game/ColorBonuses";
import { ChatWindow } from "@/components/game/ChatWindow";
import { HistoryPanel } from "@/components/game/HistoryPanel";
import { ScoreDialog } from "@/components/game/ScoreDialog";
import { GameOverDialog } from "@/components/game/GameOverDialog";
import { useRoomContext } from "@/lib/context/room";
import { usePresence } from "@/hooks/use-presence";
import { useRoomChat } from "@/hooks/use-room-chat";
import { useGameHistory } from "@/hooks/use-game-history";
import { DEV_MULTI_SEAT, DEV_ADMIN_BOARD } from "@/lib/devFlags";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import type {
  DiceColorFace,
  DiceNumberFace,
  BoardConfig,
  Color,
} from "@/types/game";

function NudgeBotButton({ roomCode, botName }: { roomCode: string; botName: string }) {
  const [nudging, setNudging] = useState(false);
  async function handleNudge() {
    setNudging(true);
    await fetch(`/api/rooms/${roomCode}/nudge-bot`, { method: "POST" });
    setNudging(false);
  }
  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-xs text-gray-400 italic">
        Waiting for {botName} to roll…
      </p>
      <button
        onClick={handleNudge}
        disabled={nudging}
        className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 disabled:opacity-40 disabled:pointer-events-none transition-all"
      >
        {nudging ? "Nudging…" : "Nudge bot"}
      </button>
    </div>
  );
}

export default function GamePage() {
  const { room, me, players, board } = useRoomContext();
  const boardConfig = board.config as unknown as BoardConfig;

  const prevCrossedRef = useRef<Record<string, string[]>>({});
  const currentHistory = useGameHistory(room.id, room.round_number);

  const [viewingId, setViewingId] = useState(me.id);
  const [chatOpen, setChatOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [selectedColor, setSelectedColor] = useState<0 | 1 | 2 | undefined>();
  const [selectedNumber, setSelectedNumber] = useState<0 | 1 | 2 | undefined>();
  const [selectedCells, setSelectedCells] = useState<string[]>([]);
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [selectedSpecial, setSelectedSpecial] = useState(false);
  const [skipConfirming, setSkipConfirming] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [scoresOpen, setScoresOpen] = useState(false);
  const [gameOverOpen, setGameOverOpen] = useState(room.status === "finished");
  const [rowBombCells, setRowBombCells] = useState<string[]>([]);

  const { unreadCount, resetUnreadCount } = useRoomChat(room.id, me.id, chatOpen);
  const { play: playDiceRollSound } = useSound("notification/popup", { volume: 0.6 });
  const { play: playPickSound } = useSound("notification/completed", { volume: 0.3 });
  const { play: playCellClickSound } = useSound("ui/button_soft", { volume: 0.4 });
  const { play: playCompletionSound } = useSound("notification/success", { volume: 0.6 });

  useEffect(() => {
    if (chatOpen) {
      resetUnreadCount();
    }
  }, [chatOpen, resetUnreadCount]);

  const roomStatusRef = useRef(room.status);
  useEffect(() => { roomStatusRef.current = room.status; }, [room.status]);

  const playersRef = useRef(players);
  useEffect(() => { playersRef.current = players; }, [players]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "c") { e.preventDefault(); setChatOpen((prev) => !prev); }
      else if (e.key === "h") { e.preventDefault(); setHistoryOpen((prev) => !prev); }
      else if (e.key === "s") { e.preventDefault(); if (roomStatusRef.current === "finished") { setGameOverOpen((prev) => !prev); } else { setScoresOpen((prev) => !prev); } }
      else {
        const digit = parseInt(e.key, 10);
        if (!isNaN(digit) && digit >= 1) {
          const target = playersRef.current[digit - 1];
          if (target) setViewingId(target.id);
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const { presences, updatePresence } = usePresence(room.id, {
    userId: me.id,
    displayName: me.display_name,
    color: SEAT_TO_COLOR[me.seat_index] ?? "p",
    cursor: { cellKey: hoveredCell, boardOwnerId: viewingId },
  });

  useEffect(() => {
    updatePresence({
      cursor: { cellKey: hoveredCell, boardOwnerId: viewingId },
    });
  }, [hoveredCell, viewingId]); // eslint-disable-line react-hooks/exhaustive-deps

  const dice = useMemo(
    () =>
      currentHistory
        ? {
            colors: currentHistory.dice_colors as [
              DiceColorFace,
              DiceColorFace,
              DiceColorFace,
            ],
            numbers: currentHistory.dice_numbers as [
              DiceNumberFace,
              DiceNumberFace,
              DiceNumberFace,
            ],
            special: currentHistory.dice_special,
          }
        : null,
    [currentHistory],
  );

  const cellCursors = useMemo(() => {
    const result: Record<string, { color: Color; displayName: string }[]> = {};
    for (const p of Object.values(presences)) {
      if (!p.cursor || p.cursor.boardOwnerId !== viewingId || !p.cursor.cellKey)
        continue;
      const key = p.cursor.cellKey;
      result[key] = [
        ...(result[key] ?? []),
        { color: p.color, displayName: p.displayName },
      ];
    }
    return result;
  }, [presences, viewingId]);

  const viewing = players.find((p) => p.id === viewingId) ?? players[0];
  const activePlayer = players.find(
    (p) => p.seat_index === room.current_player_index,
  );
  // In DEV_MULTI_SEAT all players share one user_id, so act as whichever player
  // is currently being viewed rather than only the active player.
  const effectiveMe = DEV_MULTI_SEAT
    ? (players.find((p) => p.id === viewingId) ?? me)
    : me;
  const isMyBoard = viewingId === effectiveMe.id;
  const isActivePlayer = effectiveMe.seat_index === room.current_player_index;
  const availableBoxes = effectiveMe.boxes_unlocked - effectiveMe.boxes_spent;
  const openRound = room.round_number < 2;
  const activePick = currentHistory?.active_pick ?? null;
  const specialTakenByActive =
    !openRound && !isActivePlayer && activePick?.type === "special";
  const canUseSpecial =
    availableBoxes > 0 &&
    !!dice &&
    !specialTakenByActive &&
    (openRound || isActivePlayer || !!activePick);
  const allPicksSubmitted =
    !!currentHistory &&
    !!currentHistory.active_pick &&
    Object.keys((currentHistory.player_picks as Record<string, unknown>) ?? {})
      .length >=
      players.length - 1;
  let disabledColorDice: (0 | 1 | 2)[] = (() => {
    if (isActivePlayer || openRound) return [];
    if (!activePick) return [0, 1, 2];
    if (activePick.type === "color_number") return [activePick.color_die];
    return [];
  })();
  let disabledNumberDice: (0 | 1 | 2)[] = (() => {
    if (isActivePlayer || openRound) return [];
    if (!activePick) return [0, 1, 2];
    if (activePick.type === "color_number") return [activePick.number_die];
    return [];
  })();
  // Spec: player with 0 wildcards cannot pick a wildcard die
  if (effectiveMe.wildcards === 0 && dice) {
    ([0, 1, 2] as const).forEach((i) => {
      if (isColorWildcard(dice.colors[i]) && !disabledColorDice.includes(i))
        disabledColorDice = [...disabledColorDice, i];
      if (isNumberWildcard(dice.numbers[i]) && !disabledNumberDice.includes(i))
        disabledNumberDice = [...disabledNumberDice, i];
    });
  }

  useEffect(() => {
    let anyComplete = false;
    for (const player of players) {
      const prev = prevCrossedRef.current[player.id] ?? null;
      const curr = player.crossed_cells as string[];
      const who = player.id === me.id ? "You" : player.display_name;

      if (prev !== null && curr.length > prev.length) {
        for (const row of boardConfig.grid.rows) {
          if (!isRowComplete(boardConfig, row, prev) && isRowComplete(boardConfig, row, curr)) {
            toast.success(`🎉 ${who} completed row ${row}!`);
            anyComplete = true;
          }
        }
        for (const col of boardConfig.grid.columns) {
          if (!isColumnComplete(boardConfig, col, prev) && isColumnComplete(boardConfig, col, curr)) {
            toast.success(`🎉 ${who} completed column ${col}!`);
            anyComplete = true;
          }
        }
        for (const color of getBoardColors(boardConfig)) {
          if (!isColorComplete(boardConfig, color, prev) && isColorComplete(boardConfig, color, curr)) {
            toast.success(`🎉 ${who} completed all ${COLOR_NAMES[color]}!`);
            anyComplete = true;
          }
        }
      }

      prevCrossedRef.current[player.id] = curr;
    }
    if (anyComplete) playCompletionSound();
  }, [players]); // eslint-disable-line react-hooks/exhaustive-deps

  const validCells = useMemo<Set<string> | undefined>(() => {
    if (!isMyBoard || !dice) return undefined;
    return getValidCells(
      boardConfig,
      effectiveMe.crossed_cells as string[],
      dice,
      selectedSpecial,
      selectedColor,
      selectedNumber,
      selectedCells,
    );
  }, [
    isMyBoard,
    dice,
    boardConfig,
    effectiveMe.crossed_cells,
    selectedSpecial,
    selectedColor,
    selectedNumber,
    selectedCells,
  ]);

  // True when selectedCells would newly complete a bomb-item row.
  const willCompleteBombRow = useMemo(() => {
    if (selectedCells.length === 0) return false;
    const after = [...(effectiveMe.crossed_cells as string[]), ...selectedCells];
    return boardConfig.grid.rows.some((row) => {
      if (isRowComplete(boardConfig, row, effectiveMe.crossed_cells as string[])) return false;
      if (!isRowComplete(boardConfig, row, after)) return false;
      if ((boardConfig.scoring.rowItems as Record<string, string>)[row] !== "bomb") {
        return false;
      }
      return !wasRowCompletedByOthersBeforeRound(
        boardConfig,
        row,
        effectiveMe.id,
        players.filter((p) => p.id !== effectiveMe.id),
        {
          activePlayerId: currentHistory?.active_player_id,
          activePick: currentHistory?.active_pick,
          playerPicks: currentHistory?.player_picks,
        },
      );
    });
  }, [selectedCells, effectiveMe, boardConfig, players, currentHistory]);

  const playerMedals = useMemo<Record<string, string>>(() => {
    if (room.status !== "finished") return {};
    const sorted = [...players].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const result: Record<string, string> = {};
    sorted.forEach((p, i) => {
      if (MEDALS[i]) result[p.id] = MEDALS[i];
    });
    return result;
  }, [room.status, players]);

  const scoring = boardConfig.scoring;
  const { grid } = boardConfig;

  const myCompletedRows = grid.rows.filter((r) =>
    isRowComplete(boardConfig, r, viewing.crossed_cells),
  );
  const myCompletedCols = grid.columns.filter((c) =>
    isColumnComplete(boardConfig, c, viewing.crossed_cells),
  );
  const firstTakenRows = grid.rows.filter((r) =>
    players.some((p) => isRowComplete(boardConfig, r, p.crossed_cells)),
  );
  const firstTakenCols = grid.columns.filter((c) =>
    players.some((p) => isColumnComplete(boardConfig, c, p.crossed_cells)),
  );

  function handleCellClick(key: string) {
    if (!isMyBoard) return;
    playCellClickSound();

    // Row-bomb placement mode: main pick is ready and completed a bomb row.
    // Direct further clicks to selecting the 2×2 bomb cells.
    if (inRowBombMode) {
      if (rowBombCells.includes(key)) {
        setRowBombCells((p) => p.filter((k) => k !== key));
        return;
      }
      if (rowBombCells.length >= 4) return;
      const newSel = [...rowBombCells, key];
      const idxs = newSel.map((k) => {
        const [col, row] = k.split("-");
        return [
          boardConfig.grid.columns.indexOf(col),
          boardConfig.grid.rows.indexOf(row),
        ] as [number, number];
      });
      const cSpan = Math.max(...idxs.map(([c]) => c)) - Math.min(...idxs.map(([c]) => c));
      const rSpan = Math.max(...idxs.map(([, r]) => r)) - Math.min(...idxs.map(([, r]) => r));
      if (cSpan > 1 || rSpan > 1) return;
      setRowBombCells(newSel);
      return;
    }

    if (selectedSpecial && dice) {
      if (dice.special === "heart") return;

      if (dice.special === "fill") {
        const cell = boardConfig.cells[key];
        if (!cell) return;
        if (selectedCells.includes(key)) {
          setSelectedCells([]);
          return;
        }
        const region = getConnectedRegion(
          boardConfig,
          cell.color,
          key,
          effectiveMe.crossed_cells as string[],
        );
        setSelectedCells(region);
        return;
      }

      if (dice.special === "three_in_a_row") {
        if (selectedCells.includes(key)) {
          setSelectedCells((p) => p.filter((k) => k !== key));
          return;
        }
        if (selectedCells.length >= 3) return;
        if (
          selectedCells.length > 0 &&
          key.split("-")[1] !== selectedCells[0].split("-")[1]
        )
          return;
        setSelectedCells((p) => [...p, key]);
        return;
      }

      if (dice.special === "bomb") {
        if (selectedCells.includes(key)) {
          setSelectedCells((p) => p.filter((k) => k !== key));
          return;
        }
        if (selectedCells.length >= 4) return;
        const newSel = [...selectedCells, key];
        const idxs = newSel.map((k) => {
          const [col, row] = k.split("-");
          return [
            boardConfig.grid.columns.indexOf(col),
            boardConfig.grid.rows.indexOf(row),
          ] as [number, number];
        });
        const cSpan =
          Math.max(...idxs.map(([c]) => c)) - Math.min(...idxs.map(([c]) => c));
        const rSpan =
          Math.max(...idxs.map(([, r]) => r)) -
          Math.min(...idxs.map(([, r]) => r));
        if (cSpan > 1 || rSpan > 1) return;
        setSelectedCells(newSel);
        return;
      }

      if (dice.special === "two_stars") {
        if (selectedCells.includes(key)) {
          setSelectedCells((p) => p.filter((k) => k !== key));
          return;
        }
        if (selectedCells.length >= 2) return;
        setSelectedCells((p) => [...p, key]);
        return;
      }
    }

    setSelectedCells((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  function handleColorPick(i: 0 | 1 | 2) {
    setSelectedSpecial(false);
    setSelectedColor((prev) => {
      if (prev !== i) setSelectedCells([]);
      return prev === i ? undefined : i;
    });
  }

  function handleNumberPick(i: 0 | 1 | 2) {
    setSelectedSpecial(false);
    setSelectedNumber((prev) => {
      if (prev !== i) setSelectedCells([]);
      return prev === i ? undefined : i;
    });
  }

  function handleSpecialSelect() {
    setSelectedSpecial((prev) => {
      if (!prev) {
        setSelectedColor(undefined);
        setSelectedNumber(undefined);
        setSelectedCells([]);
      }
      return !prev;
    });
  }

  useEffect(() => {
    if (room.status === "finished") setGameOverOpen(true);
  }, [room.status]);

  const prevPickCountRef = useRef(0);
  useEffect(() => {
    if (!currentHistory) return;
    const count =
      (currentHistory.active_pick ? 1 : 0) +
      Object.keys((currentHistory.player_picks as Record<string, unknown>) ?? {}).length;
    if (count > prevPickCountRef.current) playPickSound();
    prevPickCountRef.current = count;
  }, [currentHistory]); // eslint-disable-line react-hooks/exhaustive-deps

  const prevDiceNullRef = useRef(true);
  useEffect(() => {
    if (dice) {
      setRolling(false);
      if (prevDiceNullRef.current) playDiceRollSound();
      prevDiceNullRef.current = false;
    } else {
      prevDiceNullRef.current = true;
    }
  }, [dice]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRoll() {
    setRolling(true);
    await fetch(`/api/rooms/${room.code}/roll`, { method: "POST" });
  }

  async function handleAdvanceRound() {
    setAdvancing(true);
    try {
      const res = await fetch(`/api/rooms/${room.code}/advance`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? "Failed to advance round");
      }
    } finally {
      setAdvancing(false);
    }
  }

  function clearPick() {
    setSelectedColor(undefined);
    setSelectedNumber(undefined);
    setSelectedCells([]);
    setSelectedSpecial(false);
    setRowBombCells([]);
  }

  async function handleSkipTurn() {
    setSkipping(true);
    try {
      const res = await fetch(`/api/rooms/${room.code}/pick`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "pass",
          ...(DEV_MULTI_SEAT && { _dev_player_id: effectiveMe.id }),
        }),
      });
      if (res.ok) {
        setSkipConfirming(false);
        clearPick();
      } else {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? "Cannot skip turn");
        setSkipConfirming(false);
      }
    } catch {
      toast.error("Network error — please try again");
    } finally {
      setSkipping(false);
    }
  }

  async function handleConfirmPick() {
    if (
      !canConfirm ||
      !dice ||
      selectedColor === undefined ||
      selectedNumber === undefined
    )
      return;
    setConfirming(true);
    try {
      const colorFace = dice.colors[selectedColor];
      const numberFace = dice.numbers[selectedNumber];
      // Wildcard color: infer declared_color from first selected cell
      const declaredColor =
        colorFace === "✕"
          ? (boardConfig.cells[selectedCells[0]]?.color ?? colorFace)
          : colorFace;
      // Wildcard number: declared_number = cell count
      const declaredNumber =
        numberFace === "?" ? selectedCells.length : parseInt(numberFace, 10);

      const res = await fetch(`/api/rooms/${room.code}/pick`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "color_number",
          color_die: selectedColor,
          number_die: selectedNumber,
          declared_color: declaredColor,
          declared_number: declaredNumber,
          cells: selectedCells,
          ...(rowBombCells.length > 0 && { bomb_cells: rowBombCells }),
          ...(DEV_MULTI_SEAT && { _dev_player_id: effectiveMe.id }),
        }),
      });
      if (res.ok) {
        clearPick();
      } else {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? "Failed to confirm pick");
        // Pick was already recorded — clear selection so the UI doesn't suggest
        // the player can submit again this round.
        if (res.status === 409) clearPick();
      }
    } catch (err) {
      console.error("[handleConfirmPick] network error:", err);
      toast.error("Network error — please try again");
    } finally {
      setConfirming(false);
    }
  }

  async function handleConfirmSpecialPick() {
    if (!canConfirmSpecial) return;
    setConfirming(true);
    try {
      const res = await fetch(`/api/rooms/${room.code}/pick`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "special",
          cells: selectedCells,
          ...(rowBombCells.length > 0 && { bomb_cells: rowBombCells }),
          ...(DEV_MULTI_SEAT && { _dev_player_id: effectiveMe.id }),
        }),
      });
      if (res.ok) {
        clearPick();
      } else {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? "Failed to confirm special pick");
      }
    } catch (err) {
      console.error("[handleConfirmSpecialPick] network error:", err);
      toast.error("Network error — please try again");
    } finally {
      setConfirming(false);
    }
  }

  const mainPickReady = useMemo(() => {
    if (!isMyBoard || selectedColor === undefined || selectedNumber === undefined || !dice) return false;
    const declaredNumberFace = dice.numbers[selectedNumber];
    if (isNumberWildcard(declaredNumberFace)) return selectedCells.length > 0;
    return selectedCells.length === parseInt(declaredNumberFace, 10);
  }, [isMyBoard, selectedColor, selectedNumber, selectedCells, dice]);

  const mainSpecialPickReady = useMemo(() => {
    if (!selectedSpecial || !dice) return false;
    switch (dice.special) {
      case "heart": return true;
      case "fill": return selectedCells.length > 0;
      case "three_in_a_row": return selectedCells.length >= 1 && selectedCells.length <= 3;
      case "bomb": return selectedCells.length === 4;
      case "two_stars": return selectedCells.length === 2;
      default: return false;
    }
  }, [selectedSpecial, dice, selectedCells]);

  // Row bomb placement is required when the main pick is ready and completes a bomb row.
  const inRowBombMode = (mainPickReady || mainSpecialPickReady) && willCompleteBombRow;

  const canConfirm = mainPickReady && (!willCompleteBombRow || rowBombCells.length === 4);
  const canConfirmSpecial = mainSpecialPickReady && (!willCompleteBombRow || rowBombCells.length === 4);

  // Valid cells for the row-bomb 2×2 placement step — mirrors getValidCells bomb logic.
  const rowBombValidCells = useMemo<Set<string> | undefined>(() => {
    if (!inRowBombMode) return undefined;
    const crossedSet = new Set(effectiveMe.crossed_cells as string[]);
    if (rowBombCells.length === 0) {
      const result = new Set<string>();
      for (const key of Object.keys(boardConfig.cells)) {
        if (!crossedSet.has(key)) result.add(key);
      }
      return result;
    }
    if (rowBombCells.length >= 4) return new Set<string>();
    const selIndices = rowBombCells.map((k) => {
      const [col, row] = k.split("-");
      return [boardConfig.grid.columns.indexOf(col), boardConfig.grid.rows.indexOf(row)] as [number, number];
    });
    const minCol = Math.min(...selIndices.map(([c]) => c));
    const maxCol = Math.max(...selIndices.map(([c]) => c));
    const minRow = Math.min(...selIndices.map(([, r]) => r));
    const maxRow = Math.max(...selIndices.map(([, r]) => r));
    if (maxCol - minCol > 1 || maxRow - minRow > 1) return new Set<string>();
    const result = new Set<string>();
    const acMin = Math.max(0, maxCol - 1);
    const acMax = Math.min(boardConfig.grid.columns.length - 2, minCol);
    const arMin = Math.max(0, maxRow - 1);
    const arMax = Math.min(boardConfig.grid.rows.length - 2, minRow);
    for (let ac = acMin; ac <= acMax; ac++) {
      for (let ar = arMin; ar <= arMax; ar++) {
        const allFit = selIndices.every(([c, r]) => c >= ac && c <= ac + 1 && r >= ar && r <= ar + 1);
        if (!allFit) continue;
        for (let dc = 0; dc <= 1; dc++) {
          for (let dr = 0; dr <= 1; dr++) {
            const key = `${boardConfig.grid.columns[ac + dc]}-${boardConfig.grid.rows[ar + dr]}`;
            if (!(key in boardConfig.cells)) continue;
            if (crossedSet.has(key) || rowBombCells.includes(key)) continue;
            result.add(key);
          }
        }
      }
    }
    return result;
  }, [inRowBombMode, rowBombCells, boardConfig, effectiveMe.crossed_cells]);

  const hintText = useMemo<string | null>(
    () =>
      computeHintText({
        isMyBoard,
        dice,
        inRowBombMode,
        rowBombCells,
        selectedSpecial,
        selectedColor,
        selectedNumber,
        selectedCells,
        boardCells: boardConfig.cells,
      }),
    [
      isMyBoard,
      dice,
      inRowBombMode,
      rowBombCells,
      selectedSpecial,
      selectedColor,
      selectedNumber,
      selectedCells,
      boardConfig.cells,
    ],
  );

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-5 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/" className="font-black text-kok-orange tracking-wide uppercase hover:opacity-75 transition-opacity">
            Keer op Keer 2
          </Link>
          <span className="text-gray-300">|</span>
          <span className="font-mono font-bold text-gray-600 tracking-widest text-sm">
            {room.code.toUpperCase()}
          </span>
          {DEV_ADMIN_BOARD && (
            <>
              <span className="text-gray-300">|</span>
              <Link
                href={`/room/${room.code}/admin`}
                className="text-xs font-semibold text-kok-orange hover:underline"
              >
                Admin
              </Link>
            </>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-gray-500">
            Round{" "}
            <span className="font-bold text-gray-800">
              {room.round_number + 1}
            </span>
          </span>
          {allPicksSubmitted && room.status !== "finished" ? (
            <button
              onClick={handleAdvanceRound}
              disabled={advancing}
              className="px-3 py-1 rounded-lg bg-kok-green text-white text-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {advancing ? "Advancing…" : "Next round"}
              {advancing ? (
                <svg
                  className="animate-spin"
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                >
                  <circle cx="7" cy="7" r="5" strokeOpacity="0.3" />
                  <path d="M7 2a5 5 0 0 1 5 5" />
                </svg>
              ) : (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M2 7h10M8 3l4 4-4 4" />
                </svg>
              )}
            </button>
          ) : null}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Board area */}
        <main className="flex-1 p-5 overflow-auto">
          {/* Player tabs */}
          <div className="flex gap-1.5 mb-4">
            {players.map((p) => (
              <button
                key={p.id}
                onClick={() => setViewingId(p.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                  viewingId === p.id
                    ? "bg-kok-blue text-white shadow-sm"
                    : "bg-white text-gray-600 hover:bg-gray-50 border border-gray-200"
                }`}
              >
                <PlayerAvatar name={p.display_name} seatIndex={p.seat_index} size={20} />
                {p.display_name}
                {p.id === me.id && " (you)"}
              </button>
            ))}
          </div>

          <div className="flex gap-4 items-start">
            {/* Board */}
            <div className="flex flex-col gap-3 w-fit">
              {/* Score sheet */}
              <div className="bg-white rounded-xl shadow-sm p-4">
                <ScoreSheet
                  config={boardConfig}
                  crossedCells={viewing.crossed_cells}
                  selectedCells={isMyBoard ? [...selectedCells, ...rowBombCells] : []}
                  onCellClick={isMyBoard ? handleCellClick : undefined}
                  validCells={isMyBoard ? (inRowBombMode ? rowBombValidCells : validCells) : undefined}
                  myCompletedRows={myCompletedRows}
                  myCompletedCols={myCompletedCols}
                  firstTakenRows={firstTakenRows}
                  firstTakenCols={firstTakenCols}
                  columnHeartBonuses={
                    (viewing.column_heart_bonuses as Record<
                      string,
                      number
                    > | null) ?? {}
                  }
                  onCellHover={setHoveredCell}
                  cellCursors={cellCursors}
                />
              </div>
            </div>

            {/* Right column: color bonuses + resource tracks */}
            <div className="flex flex-col gap-3 shrink-0">
              <div className="bg-white rounded-xl shadow-sm px-4 py-3">
                <ColorBonuses
                  config={boardConfig}
                  viewingCrossedCells={viewing.crossed_cells}
                  allPlayersCrossedCells={players.map((p) => p.crossed_cells)}
                />
              </div>
              <div className="bg-white rounded-xl shadow-sm px-4 py-3">
                <ResourceTracks
                  hearts={viewing.hearts}
                  heartSize={scoring.heartTrack.size}
                  boxesUnlocked={viewing.boxes_unlocked}
                  boxesSpent={viewing.boxes_spent}
                  wildcards={viewing.wildcards}
                  wildcardStart={scoring.wildcardTrack.starting}
                />
              </div>
            </div>
          </div>
        </main>

        {/* Game actions sidebar */}
        <aside className="w-60 shrink-0 bg-white border-l border-gray-200 flex flex-col overflow-y-auto">
          {/* Players list */}
          <div className="p-4 border-b border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                Players
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => room.status === "finished" ? setGameOverOpen(true) : setScoresOpen(true)}
                  className="text-xs text-kok-blue font-semibold hover:underline transition-colors"
                >
                  Scores
                </button>
                <button
                  onClick={() => setHistoryOpen((prev) => !prev)}
                  className="text-xs text-kok-blue font-semibold hover:underline transition-colors"
                >
                  History
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              {players.map((p) => {
                const isActive = p.seat_index === room.current_player_index;
                const activePlayerHasPicked = !!currentHistory?.active_pick;
                const thisPlayerHasPicked = currentHistory
                  ? isActive
                    ? !!currentHistory.active_pick
                    : p.id in (currentHistory.player_picks ?? {})
                  : false;
                const pickStatus = currentHistory
                  ? thisPlayerHasPicked
                    ? "done"
                    : openRound || isActive || activePlayerHasPicked
                      ? "waiting"
                      : "blocked"
                  : null;
                return (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between px-2.5 py-2 rounded-lg text-sm ${
                      isActive
                        ? "bg-kok-green/10 border border-kok-green/25"
                        : "bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <PlayerAvatar name={p.display_name} seatIndex={p.seat_index} size={24} />
                      <div className="min-w-0">
                        <span className="font-medium text-gray-800 truncate block">
                          {playerMedals[p.id] && (
                            <span className="mr-1">{playerMedals[p.id]}</span>
                          )}
                          {p.display_name}
                          {p.id === me.id && (
                            <span className="text-gray-400 text-xs font-normal">
                              {" "}
                              (you)
                            </span>
                          )}
                        </span>
                        {pickStatus && pickStatus !== "done" && (
                          <span className="text-[10px] text-gray-400 leading-none">
                            {pickStatus === "waiting"
                              ? p.id === me.id
                                ? "Waiting for your pick"
                                : "Waiting for their pick"
                              : "Can't pick yet"}
                          </span>
                        )}
                      </div>
                    </div>
                    {pickStatus === "done" && (
                      <svg
                        className="shrink-0 text-kok-green"
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="2.5,8.5 6,12 13.5,4" />
                      </svg>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Dice roll */}
          <div className="p-4 border-b border-gray-100">
            {dice ? (
              <GameDice
                colors={dice.colors}
                numbers={dice.numbers}
                special={dice.special}
                selectedColor={isMyBoard ? selectedColor : undefined}
                selectedNumber={isMyBoard ? selectedNumber : undefined}
                selectedSpecial={isMyBoard ? selectedSpecial : undefined}
                onSelectColor={isMyBoard ? handleColorPick : undefined}
                onSelectNumber={isMyBoard ? handleNumberPick : undefined}
                onSelectSpecial={
                  isMyBoard && canUseSpecial ? handleSpecialSelect : undefined
                }
                disabledColors={isMyBoard ? disabledColorDice : undefined}
                onClear={isMyBoard ? clearPick : undefined}
                disabledNumbers={isMyBoard ? disabledNumberDice : undefined}
                disabledTooltip={
                  activePick
                    ? `${activePlayer?.display_name ?? "Active player"} already picked this`
                    : undefined
                }
                noWildcardsLeft={
                  isMyBoard ? effectiveMe.wildcards === 0 : undefined
                }
              />
            ) : effectiveMe.seat_index === room.current_player_index ? (
              <button
                onClick={handleRoll}
                disabled={rolling}
                className="w-full py-3 rounded-xl bg-kok-orange text-white font-black text-lg uppercase tracking-wide shadow-sm hover:brightness-110 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-50 disabled:pointer-events-none transition-all flex items-center justify-center gap-2"
              >
                {rolling ? (
                  <svg
                    className="animate-spin"
                    width="28"
                    height="28"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="2" y="2" width="20" height="20" rx="3" ry="3" />
                    <circle
                      cx="8"
                      cy="8"
                      r="1.5"
                      fill="currentColor"
                      stroke="none"
                    />
                    <circle
                      cx="16"
                      cy="8"
                      r="1.5"
                      fill="currentColor"
                      stroke="none"
                    />
                    <circle
                      cx="8"
                      cy="16"
                      r="1.5"
                      fill="currentColor"
                      stroke="none"
                    />
                    <circle
                      cx="16"
                      cy="16"
                      r="1.5"
                      fill="currentColor"
                      stroke="none"
                    />
                    <circle
                      cx="12"
                      cy="12"
                      r="1.5"
                      fill="currentColor"
                      stroke="none"
                    />
                  </svg>
                ) : (
                  "Roll Dice"
                )}
              </button>
            ) : activePlayer?.is_bot ? (
              <NudgeBotButton roomCode={room.code} botName={activePlayer.display_name} />
            ) : (
              <p className="text-xs text-gray-400 italic">
                Waiting for {activePlayer?.display_name ?? "—"} to roll…
              </p>
            )}
          </div>

          {/* Pick status + actions */}
          {isMyBoard && (
            <div className="p-4 flex flex-col gap-2">
              <button
                onClick={
                  selectedSpecial ? handleConfirmSpecialPick : handleConfirmPick
                }
                disabled={
                  !(selectedSpecial ? canConfirmSpecial : canConfirm) ||
                  confirming
                }
                className="mt-1 w-full py-2 rounded-lg bg-kok-blue text-white font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition-all"
              >
                {confirming ? "Confirming…" : "Confirm Pick"}
              </button>
              {hintText && (
                <p className="text-xs text-gray-400 italic text-center leading-snug">
                  {hintText}
                </p>
              )}
              <button
                onClick={() => setSkipConfirming(true)}
                className="text-xs text-gray-400 underline hover:text-gray-600 text-center transition-colors mt-1"
              >
                Skip my turn
              </button>
              <AlertDialog
                open={skipConfirming}
                onOpenChange={setSkipConfirming}
              >
                <AlertDialogContent size="sm">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Skip your turn?</AlertDialogTitle>
                    <AlertDialogDescription>
                      You won&apos;t place any color this round.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel variant="ghost">
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={handleSkipTurn}
                      disabled={skipping}
                    >
                      {skipping ? "Skipping…" : "Yes, skip"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </aside>

        <ScoreDialog
          open={scoresOpen}
          onOpenChange={setScoresOpen}
          players={players}
          config={boardConfig}
        />

        <GameOverDialog
          open={gameOverOpen}
          onOpenChange={setGameOverOpen}
          players={players}
        />

        {/* History column — always mounted to preserve subscription */}
        <aside
          className={`w-64 shrink-0 bg-white border-l border-gray-200 flex flex-col overflow-hidden ${historyOpen ? "" : "hidden"}`}
        >
          <HistoryPanel
            roomId={room.id}
            players={players}
            onClose={() => setHistoryOpen(false)}
          />
        </aside>

        {/* Chat column — always mounted to preserve messages and subscription */}
        <aside
          className={`w-72 shrink-0 bg-white border-l border-gray-200 flex flex-col overflow-hidden ${chatOpen ? "" : "hidden"}`}
        >
          <ChatWindow
            roomId={room.id}
            playerId={me.id}
            players={players}
            onClose={() => setChatOpen(false)}
            open={chatOpen}
          />
        </aside>
      </div>

      {/* Floating chat toggle */}
      {!chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          className={`fixed bottom-5 right-5 w-12 h-12 rounded-full bg-kok-blue text-white shadow-lg flex items-center justify-center hover:brightness-110 transition-all ${
            unreadCount > 0 ? "animate-bounce" : ""
          }`}
          aria-label="Open chat"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path d="M2 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6l-4 3V4z" />
          </svg>
          {unreadCount > 0 && (
            <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </div>
          )}
        </button>
      )}
    </div>
  );
}
