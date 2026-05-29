# Keer op Keer 2 — Game Rules

Reference image: `docs/keer_op_keer_2.jpg`  
Board config: `app/src/boards/kok2-standard.json` (authoritative for all numeric values)

---

## Score Sheet

Each player has an identical score sheet — a **7 row × 15 column** colored grid (rows labeled P–V top-to-bottom, columns labeled A–O left-to-right). Column H is the center column and is highlighted; it is the mandatory starting column.

The grid contains cells in **5 colors**: pink (p), orange (o), yellow (y), green (g), blue (b). Cells are irregularly distributed. Some cells contain special icons:

- **Star cells** (☆) — if not crossed off at game end, each costs **−2 points**
- **Box cells** (!) — when crossed off, grants 1 box on the player's box track

---

## Cell Placement Rules

- Crossed cells must **always be orthogonally adjacent** to at least one already-crossed cell.
- At the start of the game, **any cell in column H** is a valid first placement.
- Players build outward from their crossed region over the course of the game.
- **All selected cells in a single move must form a single contiguous group** — when picking a color + number combination, you cannot select cells from two or more separate regions, even if each region is adjacent to your existing cells. You must fill one connected area at a time.
- **Exception — Bomb:** a bomb action crosses off any **2×2 block of cells anywhere** on the board, ignoring adjacency entirely.

---

## Heart Track

Each player's sheet has a **heart track** — 5 heart slots labeled 1 through 5, separate from the main grid.

**Earning hearts:** A player advances their heart track (crosses off the next slot) when they:
- Use the special die and it shows a Heart face, or
- Complete a heart-item row in the first round where that row is completed

**Heart bonus on column completion:** Whenever a player completes a column, they earn their **current heart count as a bonus** on top of the column's printed first/subsequent value. So a player with 3 hearts crossed off gets +3 on every column they complete from that point forward.

This creates a compounding incentive: hearts earned early amplify all future column bonuses.

---

## Box Track

Each player's sheet has a row of **9 boxes** at the bottom. Players start with **1 box circled** (available). Boxes are the currency for using the special die.

**Earning boxes:** Circle the next uncircled box when you:
- Cross off a cell that has a box icon (!) on it, or
- Complete a box-item row in the first round where that row is completed, or
- Complete column H — **every** player who completes column H earns a box, not just the first

**Spending boxes:** On your turn as active player, you may spend 1 box to use the special die instead of picking a color+number pair. Cross off (spend) one of your circled boxes.

The box track caps at 9. Uncircled boxes are unearned; there is no end-game scoring for boxes.

---

## Bombs

Bombs are earned when a player completes a bomb-item row in the first round where that row is completed. **Bombs must be played immediately** on the same turn they are earned — they cannot be held. After crossing off the cells that completed the row, the player immediately chooses a 2×2 block anywhere on the board and crosses those off too, before their turn ends.

The bomb from the special die works the same way: it is applied immediately as part of using the special die.

A bomb block may include cells that are already crossed off. The chosen 2×2 block is still legal; only cells that were not already crossed add new marks or trigger cell effects.

---

## Wildcard Track

Each player starts with **6 wildcard slots**. Wildcards are consumed whenever a player picks a wildcard die — the `?` number die or the `✕` color die.

- Picking one wildcard die costs **1 wildcard slot**
- Picking both a `?` and a `✕` in the same turn costs **2 wildcard slots**
- A player with 0 wildcards remaining **cannot pick** a wildcard die; the UI must prevent it
- When a player selects the `✕` die, they must declare **one** color before selecting cells. All cells crossed on that turn must be that declared color — the wildcard does not permit mixing colors. The declared color is locked in by whichever cell the player clicks first. The normal contiguous-group rule still applies: all selected cells must form a single connected region (e.g. you cannot cross off 3 cells of the declared color in one region and 1 cell of that color in another region).

There is no way to earn additional wildcards — they are a finite resource that depletes over the game. At game end, each unused wildcard slot is worth **+1 point**. For example, a player with 3 unused wildcards scores **+3 points**.

---

## Dice

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

---

## Turn Structure

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

---

## Game End

The game ends when any player has completely crossed off **2 full colors**. All players finish the current round, then score.

---

## Scoring

### Column bonuses (A–O)

When a player completes a column, they score:

> **printed bonus** (first or subsequent) **+ current heart count at time of completion**

First player to complete a column earns the `first` value; all later completers earn `subsequent`. Both get the heart bonus added. Column H (center, easiest to reach) has a subsequent bonus of 0.

**Column H box reward:** Column H is the only column that awards a **box** to every player who completes it — first and subsequent alike.

| Column | A | B | C | D | E | F | G | H | I | J | K | L | M | N | O |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| First | 5 | 3 | 3 | 3 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 3 | 3 | 3 | 5 |
| Subsequent | 3 | 2 | 2 | 2 | 1 | 1 | 1 | 0 | 1 | 1 | 1 | 2 | 2 | 2 | 3 |

The heart bonus earned per column is recorded at the time of completion — it is NOT retroactively recalculated using the player's current heart count at game end.

### Row bonuses (P–V)

Every player who crosses off every cell in a row earns **5 points**. The row's **item** (box, bomb, or heart) is earned by each player who completes that row in the first round where anyone completes it. Players who complete that row in later rounds still earn **5 points** but do **not** receive the item.

| Row | P | Q | R | S | T | U | V |
|---|---|---|---|---|---|---|---|
| Points | 5 | 5 | 5 | 5 | 5 | 5 | 5 |
| Item | box | bomb | heart | bomb | box | heart | bomb |

### Color bonuses

First player to cross off every cell of a color: **+5 pts**. Each subsequent player who also completes it: **+3 pts**.

### Star penalty

Each uncrossed **star cell** (☆) on your sheet at game end: **−2 pts**

### Unused wildcards

Each unused wildcard slot at game end is worth **+1 point**. For example, 3 unused wildcards score **+3 points**.

### Tie-breaking

Ties are allowed; there is no tie-breaking rule. Final scores may be equal.
