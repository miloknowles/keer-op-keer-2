# Keer op Keer 2 — Game & Project Spec

Reference image: `docs/keer_op_keer_2.jpg`  
Board config: `app/src/boards/kok2-standard.json` (authoritative for all numeric values)  
Board types: `app/src/boards/board.types.ts`

## Overview

Keer op Keer 2 (KoK2) is a **roll-and-write dice game** by 999 Games for 1–6 players, ages 8+, ~15–30 min. Players roll dice each round, pick a color+number combination, and cross off cells on their personal score sheet. The player with the most points when the game ends wins.

This repo is an online multiplayer clone playable in the browser via real-time rooms.

---

## Game Mechanics

### Score Sheet

Each player has an identical score sheet — a **7 row × 15 column** colored grid (rows labeled P–V top-to-bottom, columns labeled A–O left-to-right). Column H is the center column and is highlighted; it is the mandatory starting column.

The grid contains cells in **5 colors**: pink (p), orange (o), yellow (y), green (g), blue (b). Cells are irregularly distributed. Some cells contain special icons:

- **Star cells** (☆) — if not crossed off at game end, each costs **−2 points**
- **Box cells** (!) — when crossed off, grants 1 box on the player's box track

### Cell Placement Rules

- Crossed cells must **always be orthogonally adjacent** to at least one already-crossed cell.
- At the start of the game, **any cell in column H** is a valid first placement.
- Players build outward from their crossed region over the course of the game.
- **All selected cells in a single move must form a single contiguous group** — when picking a color + number combination, you cannot select cells from two or more separate regions, even if each region is adjacent to your existing cells. You must fill one connected area at a time.
- **Exception — Bomb:** a bomb action crosses off any **2×2 block of cells anywhere** on the board, ignoring adjacency entirely.

### Heart Track

Each player's sheet has a **heart track** — 5 heart slots labeled 1 through 5, separate from the main grid.

**Earning hearts:** A player advances their heart track (crosses off the next slot) when they:
- Use the special die and it shows a Heart face, or
- Complete a heart-item row in the first round where that row is completed

**Heart bonus on column completion:** Whenever a player completes a column, they earn their **current heart count as a bonus** on top of the column's printed first/subsequent value. So a player with 3 hearts crossed off gets +3 on every column they complete from that point forward.

This creates a compounding incentive: hearts earned early amplify all future column bonuses.

### Box Track

Each player's sheet has a row of **9 boxes** at the bottom. Players start with **1 box circled** (available). Boxes are the currency for using the special die.

**Earning boxes:** Circle the next uncircled box when you:
- Cross off a cell that has a box icon (!) on it, or
- Complete a box-item row in the first round where that row is completed, or
- Complete column H — **every** player who completes column H earns a box, not just the first

**Spending boxes:** On your turn as active player, you may spend 1 box to use the special die instead of picking a color+number pair. Cross off (spend) one of your circled boxes.

The box track caps at 9. Uncircled boxes are unearned; there is no end-game scoring for boxes.

### Bombs

Bombs are earned when a player completes a bomb-item row in the first round where that row is completed. **Bombs must be played immediately** on the same turn they are earned — they cannot be held. After crossing off the cells that completed the row, the player immediately chooses a 2×2 block anywhere on the board and crosses those off too, before their turn ends.

The bomb from the special die works the same way: it is applied immediately as part of using the special die.

A bomb block may include cells that are already crossed off. The chosen 2×2 block is still recorded as the bomb target, but only cells that were not already crossed add new marks or trigger cell effects.

### Wildcard Track

Each player starts with **6 wildcard slots**. Wildcards are consumed whenever a player picks a wildcard die — the `?` number die or the `✕` color die.

- Picking one wildcard die costs **1 wildcard slot**
- Picking both a `?` and a `✕` in the same turn costs **2 wildcard slots**
- A player with 0 wildcards remaining **cannot pick** a wildcard die; the UI must prevent it
- When a player selects the `✕` die, they must declare **one** color before selecting cells. All cells crossed on that turn must be that declared color — the wildcard does not permit mixing colors. The declared color is locked in by whichever cell the player clicks first.

There is no way to earn additional wildcards — they are a finite resource that depletes over the game. There is no end-game scoring for unused wildcards.

### Dice

KoK2 uses **7 dice**:

**3 number dice** — faces: `1 2 3 4 5 ?`
The `?` is a wildcard: the player declares any value from 1–5 when making their pick, and spends 1 wildcard slot.

**3 color dice** — faces: `pink orange yellow green blue ✕`
The `✕` (black X) is a wildcard: the player declares any color when making their pick, and spends 1 wildcard slot.

**1 special die** — 6 faces:

| Face | Count | Effect |
|---|---|---|
| Heart | 2 | Advance your heart track by 1 |
| Fill | 1 | Cross off an entire connected section of one color. At least one cell in the section must be orthogonally adjacent (N/E/S/W) to your existing region **or to column H (the center column)**. Diagonal does not count. |
| Three-in-a-row | 1 | Cross off any 3 cells in a single horizontal row. All 3 cells must each individually be orthogonally adjacent to your existing region. |
| Bomb | 1 | Cross off any 2×2 block of cells anywhere (ignores adjacency) |
| Two stars | 1 | Cross off any 2 star cells that are adjacent to your existing region. The second star can chain off the first (incremental adjacency). |

Wildcard rules apply equally to the active player and non-active players. When a player picks a `?` or `✕` die, the UI prompts them to declare their chosen value/color before confirming the pick. The declared value is what gets stored and acted on.

### Turn Structure

Each round, one player is the **active player**. Turns rotate clockwise.

> **Rounds 1–2 (open rounds):** All players pick freely from all 7 dice simultaneously — there is no exclusive first pick and no restricted pool. Steps 2 and 3 below both apply to all players without restriction.
>
> **Round 3 onwards:** The active player picks first and their chosen dice are removed from the pool. Non-active players then each independently pick from the remaining dice.

1. **Active player rolls** all 7 dice.
2. **Active player chooses exactly one of:**
   - **Color + number** — pick 1 color die and 1 number die, cross off **exactly** that many cells of that color (adjacency rule applies). All selected cells must form a **single contiguous group** — you cannot split the selection across multiple separate regions. The player **must** select the full count — they cannot select fewer, and no more cells become available once the count is reached. Either or both dice may be wildcards, costing 1 wildcard slot each. If a player cannot find enough adjacent cells of the declared color in a single contiguous group, they cannot make this move and must either use a special power (if they have boxes) or pass.
   - **Special die** — spend 1 box to use the special die result instead.
   - **Pass** — take no action. Players may always pass, regardless of whether a legal move exists.
3. **All other players** each independently choose one of:
   - **Color + number** — pick 1 color die and 1 number die from the remaining pool (same wildcard rules apply).
   - **Special die** — spend 1 box to use the special die result, **as long as the active player did not already use the special die this round**. Multiple non-active players may each independently use the special die in the same round.
   - **Pass** — take no action. Players may always pass, regardless of whether a legal move exists.
   Non-active players are not competing with each other — each independently reads from the same remaining pool.
4. Play passes to the next active player.

**If a bomb is earned mid-turn** (by completing a row whose item is a bomb), the player must immediately choose and cross off a 2×2 block before their turn ends. This is resolved as part of the same pick submission.

### Game End

The game ends when any player has completely crossed off **2 full colors**. All players finish the current round, then score.

### Scoring

#### Column bonuses (A–O)
When a player completes a column, they score:

> **printed bonus** (first or subsequent) **+ current heart count at time of completion**

First player to complete a column earns the `first` value; all later completers earn `subsequent`. Both get the heart bonus added. Column H (center, easiest to reach) has a subsequent bonus of 0.

**Column H box reward:** Column H is the only column that awards a **box** to every player who completes it — first and subsequent alike. This is hardcoded in game logic and not represented in the board config.

| Column | A | B | C | D | E | F | G | H | I | J | K | L | M | N | O |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| First | 5 | 3 | 3 | 3 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 3 | 3 | 3 | 5 |
| Subsequent | 3 | 2 | 2 | 2 | 1 | 1 | 1 | 0 | 1 | 1 | 1 | 2 | 2 | 2 | 3 |

**Heart bonus row (score sheet UI):** Below the first and subsequent bonus rows on the score sheet, there is a full-width row of squares — one per column (A–O). Each square shows a lightly-colored heart icon by default. When a player completes a column, their heart count at that moment is written into that column's heart square to record the bonus earned. This makes the per-column heart bonus visible at a glance and emphasizes the incentive to earn hearts early.

Because the heart count can change between column completions, this value must be recorded at the time of completion and stored per-column. It is NOT simply the player's current heart count applied retroactively. The data model must persist `column_heart_bonuses: Record<string, number>` on `room_players` (or equivalent) so the score sheet can render correctly.

#### Row bonuses (P–V)
Every player who crosses off every cell in a row earns **5 points**. The row's **item** (box, bomb, or heart) is earned by each player who completes that row in the first round where anyone completes it. Players who complete that row in later rounds still earn **5 points** but do **not** receive the item.

| Row | P | Q | R | S | T | U | V |
|---|---|---|---|---|---|---|---|
| Points | 5 | 5 | 5 | 5 | 5 | 5 | 5 |
| Item | box | bomb | heart | bomb | box | heart | bomb |

#### Color bonuses
First player to cross off every cell of a color: **+5 pts**. Each subsequent player who also completes it: **+3 pts**.

#### End-game cell values
- Each uncrossed **star cell** (☆) on your sheet: **−2 pts**

---

## Online Multiplayer Design

### Rooms

- Players create or join a **game room** with a short code
- Rooms support 1–6 players
- One player is the **host** who starts the game
- Spectator mode — stretch goal

**Room code format:** 4 random uppercase letters (e.g. `XKQZ`). 26⁴ ≈ 456k combinations — sufficient for short-lived casual rooms. Chosen over human-readable names (e.g. `coolname`) because letter codes are faster to type, easier to read aloud unambiguously, and familiar from other party game platforms.

### Game State Authority

Game state is maintained by **Next.js API routes** acting as a stateless game server. All mutations (rolls, picks, turn advances) go through API routes, which validate the action, write to Supabase, and let Realtime broadcast the result to all clients. No browser holds authority — the host disconnecting does not affect the game.

Clients run the same validation logic locally (`src/lib/game/rules.ts`) for instant UI feedback, but the server is the final authority. Invalid requests are rejected with a 400 and the client re-syncs from DB.

**Round advancement is manual:** after all players have submitted picks, a "Next round →" button appears in the game header for every player. Any player can click it to call `POST /api/rooms/[code]/advance`, which validates that all picks are present, then atomically increments `round_number` and rotates `current_player_index`. The conditional update (`WHERE round_number = $expected`) makes simultaneous clicks idempotent. This avoids the server-crash failure mode of auto-advancing inside the pick route.

**Atomic pick storage:** non-active player picks are merged into `room_history.player_picks` via the `merge_player_pick` Postgres RPC, which does `player_picks = player_picks || $new_entry` in a single statement — eliminating the read-modify-write race condition that would otherwise occur when two non-active players submit simultaneously.

### API Routes

All routes are under `/api/game/`. Authentication is via Supabase session cookie; each route verifies the caller is a member of the room.

| Method | Route | Who can call | Description |
|---|---|---|---|
| `POST` | `/api/rooms` | Any authed user | Create a room; returns `code` |
| `POST` | `/api/rooms/[code]/join` | Any authed user | Join a room as a player |
| `POST` | `/api/rooms/[code]/start` | Host only | Transition `lobby → in_progress`; rolls first dice |
| `POST` | `/api/rooms/[code]/roll` | Active player | Roll all 7 dice; writes to `room_history` |
| `POST` | `/api/rooms/[code]/pick` | Any player in room | Submit dice pick + declared wildcard values; writes pick to `room_history` (atomic JSONB merge for non-active players), updates `room_players` sheet state; detects game-end and transitions to `finished` inline |
| `POST` | `/api/rooms/[code]/advance` | Any player in room | Advance to next round once all picks are in; idempotent via conditional update |

**`POST /api/game/[code]/pick` request body:**
```ts
// Picking color + number (wildcards optional)
{ type: "color_number",
  color_die: 0,              // index into dice_colors (0–2)
  number_die: 2,             // index into dice_numbers (0–2)
  declared_color: "pink",    // player's declared value (same as die face if not wildcard)
  declared_number: 3,        // player's declared value (same as die face if not wildcard)
  cells: ["A-P", "A-Q", "A-R"],  // cells to cross off
  bomb_cells: ["C-Q", "C-R", "D-Q", "D-R"]  // only present if a bomb row was completed this turn
}

// Spending a box to use the special die
{ type: "special",
  cells: [...],              // cells depend on which special face was rolled
  bomb_cells: [...]          // only present if a bomb row was completed this turn
}

// Passing (no legal move available)
{ type: "pass" }
```

The `cells` array lets the server validate placement (adjacency, color match, count) atomically. `bomb_cells` is included inline when a row completion triggered an immediate bomb — the server validates both together.

### Real-Time Sync

Clients subscribe to Supabase Realtime on entering a room. All state changes flow from DB → Realtime → clients; clients never write directly to Supabase.

| Table | Event | Client reaction |
|---|---|---|
| `room_history` | INSERT | New round: animate dice, open pick UI |
| `room_players` | UPDATE | Re-render that player's sheet, tracks, and scores |
| `room_chats` | INSERT | Append to chat |
| `rooms` | UPDATE | Handle status transitions; show scoring screen on `finished` |

### Game States

```
lobby → in_progress → finished
```

State transitions:
- `lobby → in_progress` — host calls `/start`; server rolls first dice
- `in_progress → finished` — server detects a player completed 2 colors after processing a pick; finishes the current round, then computes scores

---

## Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js** (App Router) | SSR for lobby/auth, client components for game |
| Language | **TypeScript** | Strict mode |
| Styling | **Tailwind CSS** | Utility-first |
| Components | **shadcn/ui** | Accessible primitives |
| Avatars | **boring-avatars** | Beam duotone avatars for player display |
| Database | **Supabase** (PostgreSQL) | Game rooms, player state, scores |
| Real-time | **Supabase Realtime** | Broadcast dice rolls, sync game state |
| Auth | **Supabase Auth** | Anonymous or email; guest play supported |
| Hosting | **Vercel** | Next.js native |

### Supabase Schema

See [`docs/schema.sql`](schema.sql) for the full applied schema including indexes, RLS policies, and Realtime configuration.

### Schema Design Decisions

| Decision | Choice | Reason |
|---|---|---|
| Sheet state location | Inline on `room_players` | State is small; simpler to update and read |
| Crossed cells type | `text[]` not jsonb | Append-friendly, compact, membership check is fast |
| Board config location | Separate `room_boards` | Config is large; keeps `rooms` fast for lobby queries |
| History granularity | One row per round | Rounds are atomic; enough to reconstruct full game state |
| Dice storage | Typed columns not jsonb | Enforces structure; easier to query individual values |

### Realtime Subscriptions

| Channel | Type | Client action |
|---|---|---|
| `room:{roomId}` | Postgres Changes (rooms + room_players) | Handle status transitions; sync player sheets and resource tracks |
| `chat:{roomId}` | Postgres Changes (room_chats INSERT) | Append message to chat |
| `history:{roomId}:{roundNumber}` | Postgres Changes (room_history INSERT) | New round: show dice result, open pick UI |
| `presence:{roomId}` | Realtime Presence | Track other players' cursor positions; render hover indicators on cells |

### Presence System

Players see realtime cursor indicators showing which cells other players are hovering. This improves the social experience by providing visibility into what other players are considering.

**Presence payload** (`PlayerPresence`):
- `userId`: unique player ID
- `displayName`: player's chosen name
- `color`: seat-based color (p/o/y/g/b) for consistent coloring
- `cursor`: optional object with:
  - `cellKey`: which cell is hovered (or `null` if none)
  - `boardOwnerId`: which player's board is currently being viewed

**Updates** are throttled to 150ms to avoid flooding the network. **Filtering** ensures cursors only appear on the board currently being viewed — if two players are looking at player A's board, only their cursors on A's board show up.

**Rendering**: Small colored dots (1.5×1.5px) appear in the top-right corner of cells where other players have their cursor. Up to 3 dots per cell; additional cursors are silently truncated. Dots are labeled with player names on hover.

This architecture is extensible: the `PlayerPresence` type can be extended with other ephemeral state (e.g. "currently considering this color", typing indicators) without changes to the core presence hook.

### Frontend Routing

Each game phase has its own route. The shared layout holds the Supabase Realtime subscription and provides room + player state to all child pages via React context — so the channel is created once and survives the lobby → game navigation without reconnecting.

```
/                          Landing page — create or join a room
/room/[code]               Redirects to /room/[code]/lobby or /room/[code]/game
                           based on current rooms.status from DB
/room/[code]/lobby         Waiting room — player list, host Start button
/room/[code]/game          Active game — board, dice, pick UI
/room/[code]/finished      Scoring screen — final scores and breakdown
```

**Phase transitions are driven by `rooms.status`:** the shared layout subscribes to the `rooms` row. When `status` changes, every connected client navigates to the correct route simultaneously — no polling, no coordinated client push.

```
lobby  ──(host calls /start)──►  in_progress  ──(server detects 2 colors done)──►  finished
  │                                   │                                                │
/lobby                             /game                                          /finished
```

**Suggestion:** on `/room/[code]` (the root), do a lightweight server-side fetch of `rooms.status` and redirect immediately — this means a shared link always lands in the right place even for late joiners or reconnects.

### Directory Structure

```
keer-op-keer/
├── app/                         # Next.js application
│   └── src/
│       ├── app/                 # App Router pages + API routes
│       │   ├── page.tsx         # Landing / create or join room
│       │   ├── room/[code]/
│       │   │   ├── layout.tsx   # Shared: Supabase channel, RoomContext provider
│       │   │   ├── page.tsx     # Redirects to /lobby or /game based on rooms.status
│       │   │   ├── lobby/
│       │   │   │   └── page.tsx # Waiting room — player list, host Start button
│       │   │   └── game/
│       │   │       └── page.tsx # Active game — board, dice, pick UI
│       │   ├── api/
│       │   │   └── rooms/
│       │   │       ├── route.ts              # POST /api/rooms
│       │   │       └── [code]/
│       │   │           ├── join/route.ts     # POST /api/rooms/[code]/join
│       │   │           ├── start/route.ts    # POST /api/rooms/[code]/start
│       │   │           ├── roll/route.ts     # POST /api/rooms/[code]/roll
│       │   │           ├── pick/route.ts     # POST /api/rooms/[code]/pick (also handles game-end)
│       │   │           ├── advance/route.ts  # POST /api/rooms/[code]/advance
│       │   │           └── players/[playerId]/route.ts  # DELETE /api/rooms/[code]/players/[playerId]
│       │   └── layout.tsx
│       ├── boards/              # board configuration files
│       │   ├── board.types.ts   # TypeScript types for BoardConfig
│       │   └── kok2-standard.json  # standard KoK2 board (authoritative values)
│       ├── components/
│       │   ├── game/            # ScoreSheet, GameDice, ResourceTracks, ColorBonuses, HistoryPanel, ChatWindow
│       │   └── ui/              # shadcn primitives
│       ├── lib/
│       │   ├── supabase/        # browser client, server client, middleware
│       │   ├── context/
│       │   │   └── room.tsx     # RoomContext — room row, players[], current user
│       │   └── game/            # pure game logic (no React)
│       │       ├── sheet.ts     # grid layout, color map, special cell positions
│       │       ├── dice.ts      # dice types, roll simulation, special die faces
│       │       ├── rules.ts     # validate a move (adjacency, color match, count)
│       │       ├── effects.ts   # apply pick effects (hearts, boxes, completions, column_heart_bonuses)
│       │       └── scoring.ts   # compute final score from sheet state
│       ├── hooks/
│       │   └── use-presence.ts  # usePresence — Supabase Realtime Presence wrapper
│       └── types/
│           ├── game.ts          # shared game TypeScript types
│           └── presence.ts      # PlayerPresence, CursorPresence types
├── supabase/                    # migrations, seed, config
└── docs/
    ├── SPEC.md
    └── keer_op_keer_2.jpg
```

---

## Open Questions

1. ~~**Exact grid color layout**~~ — resolved: all 105 cells mapped in `kok2-standard.json` using codes p/o/y/g/b.
2. ~~**Star / box / heart cell counts and positions**~~ — resolved: 12 star cells and 5 box cells mapped; no heart cells exist on the grid (hearts come only from the special die or first-round row completion).
3. **Tie-breaking** — ties are allowed; no tie-breaking rule. Final scores may be equal.
4. ~~**Turn timer**~~ — no turn timer; non-active players pick at their own pace.
5. **Anonymous play** — no account required. All players are anonymous. Supabase anonymous auth may be used under the hood to persist identity across sessions, but players never see a login flow.
