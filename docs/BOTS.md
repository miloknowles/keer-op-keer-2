# Bot Framework

Bots are AI-controlled players that join rooms alongside humans. They are stored as normal `room_players` rows with `is_bot = true` and auto-play every turn without any browser session.

## Schema

```sql
ALTER TABLE public.room_players
  ADD COLUMN is_bot   boolean NOT NULL DEFAULT false,
  ADD COLUMN bot_type text;     -- e.g. "greedy"; null for humans
```

Bots have `user_id = null`. The service-role client is used wherever bots write to the DB so that RLS (which requires a `user_id`) is bypassed.

## File Layout

```
app/src/lib/bots/
  types.ts      BotContext and BotStrategy interfaces
  greedy.ts     GreedyBot — the only strategy in v1
  index.ts      Registry; getBotStrategy(type)
  runner.ts     Orchestrator; handleBotRound()
app/src/lib/supabase/
  service.ts    Service-role Supabase client (server-only)
app/src/app/api/rooms/[code]/
  add-bot/route.ts  POST — add a bot to a lobby
```

## Execution Flow

### Human rolls → non-active bots pick

```
POST /api/rooms/[code]/roll
  ↓ inserts room_history row
  ↓ handleBotRound(roomId)   ← fire-and-forget
      non-active bots that haven't picked yet → runBotPick()
      maybe_advance_round RPC
        "advanced"   → handleBotRound(roomId, depth+1)
        "game_ends"  → computeScore for all players
        "not_complete" → done (waiting for humans)
```

### Human advances → active bot auto-rolls and picks

```
POST /api/rooms/[code]/advance
  ↓ maybe_advance_round RPC → "advanced"
  ↓ handleBotRound(roomId)   ← fire-and-forget
      if active player is a bot and no history row:
        rollDice() → insert room_history (auto-roll)
      if active bot hasn't picked yet → runBotPick(isActivePlayer=true)
      reload active_pick
      non-active bots that haven't picked yet → runBotPick(isActivePlayer=false)
      maybe_advance_round RPC  (recurse if needed)
```

`handleBotRound` uses a `depth` counter (max 200) to guard against infinite recursion when a game has consecutive all-bot rounds.

### Non-active bots and round ordering (round ≥ 3)

From round 3 onward, non-active players must exclude the two dice indices used by the active player. If the active pick isn't available yet when `handleBotRound` runs, non-active bots wait — the function returns early and will be re-triggered on the next advance.

## Adding a New Strategy

1. Create `app/src/lib/bots/<name>.ts` exporting a class that implements `BotStrategy`:

   ```ts
   import type { BotContext, BotStrategy } from "./types";
   import type { GamePick } from "@/types/game";

   export class MyBot implements BotStrategy {
     readonly type = "my_bot";
     choosePick(ctx: BotContext): GamePick {
       // ...return a pick or { type: "pass" }
     }
   }
   ```

2. Register it in `app/src/lib/bots/index.ts`:

   ```ts
   import { MyBot } from "./my_bot";
   const REGISTRY: Record<string, BotStrategy> = {
     greedy: new GreedyBot(),
     my_bot: new MyBot(),
   };
   ```

3. The new type will automatically appear in `BOT_TYPES` and be accepted by `POST /add-bot`.

## Greedy Strategy

`GreedyBot` picks the single best group it can place right now. It makes no attempt to plan ahead — it just maximises the immediate value of this turn's cells. This keeps the implementation simple and produces reasonable play.

### Step 1 — Enumerate candidate (color, number) pairs

There are three color dice and three number dice, giving nine possible (color_die_index, number_die_index) pairs. The bot loops over all nine. It skips:

- **Wildcard faces** — any die showing a wildcard color or wildcard number is ignored in v1. The bot never spends wildcards.
- **Excluded dice** (rounds ≥ 3, non-active player only) — from round 3 onward, the active player's choice of `color_die` and `number_die` locks out those two indices for everyone else. If the active pick is already known, any pair that reuses either of those indices is skipped.

For each remaining pair, the declared color and declared number are read directly from the rolled faces.

### Step 2 — Find the best group for each pair

For a given (declared_color, declared_number) the bot searches for the highest-scoring contiguous group of exactly `declared_number` uncrossed cells of `declared_color` that it could legally place.

**Finding candidate groups** (`findBestGroup`):

Every uncrossed cell of the target color that passes `isValidPlacement` is tried as a seed. From each seed, `greedyExtend` builds a group by repeatedly adding the highest-value adjacent uncrossed same-color cell until the group reaches `declared_number` cells or runs out of neighbours. If the group can't reach the required size, that seed is discarded. The surviving groups are filtered by `areCellsContiguousWithBridge` (the game requires contiguity, possibly through already-crossed bridge cells). Each passing group is scored and the highest-scoring one is kept.

**Scoring a group** (`scoreGroup`):

| Bonus | Amount | Reason |
|---|---|---|
| Per cell | +0.1 | Tie-break: bigger groups slightly preferred |
| Star cell | +2 each | Avoids the −2 end-game penalty for uncrossed stars |
| Box cell | +1 each | Gains a box token |
| Row completion | +5 | Any row that goes from incomplete to complete |
| Column completion | +(first + subsequent) / 2 | Average used — bot can't predict whether it will be first |
| Color completion | +(first + subsequent) / 2 | Same reasoning |

### Step 3 — Handle bomb rows

If the winning group would complete a row whose `rowItems` value is `"bomb"`, the bot must also choose a 2×2 bomb block. `findBestBombBlock` scans all complete 2×2 blocks where all four cells exist on the board, allowing cells that are already crossed off. It scores only cells that would be newly crossed, preferring blocks with newly-crossed star cells (stars are worth +2 each to eliminate the end-game penalty), and returns the best block. If no valid block exists, that pick is skipped entirely and the bot falls back to the next-best pair.

### Step 4 — Return the best pick or pass

After evaluating all nine pairs, the bot returns the `color_number` pick with the highest group score, including any `bomb_cells` if a bomb row was completed. If no valid pick was found across all nine pairs, it returns `{ type: "pass" }`.

## Validation Safety Net

`runner.ts` validates every non-pass pick via `validateColorNumberPick` / `validateSpecialPick` before writing it. If the strategy returns an invalid pick (e.g. a logic bug), the runner logs a warning and submits `{ type: "pass" }` instead, so an invalid bot never breaks the game.

## Service-Role Client

`app/src/lib/supabase/service.ts` creates a Supabase client with the `SUPABASE_SERVICE_ROLE_KEY`. This key must be set in `.env.local` (and Vercel env) and is **never** prefixed `NEXT_PUBLIC_` — it stays server-only. The service client bypasses RLS, which is necessary because bot rows have `user_id = null`.

## Adding a Bot (API)

```
POST /api/rooms/[code]/add-bot
Authorization: caller must be authenticated and be the room host
Room must be in "lobby" status

Body (optional):
  { "bot_type": "greedy" }   ← defaults to "greedy" if omitted or invalid

Response:
  { "player_id": "<uuid>" }
```

Bots count toward the room's 6-player maximum. The lobby UI shows a "BOT" badge on bot players and an "Add Bot" button visible only to the host.
