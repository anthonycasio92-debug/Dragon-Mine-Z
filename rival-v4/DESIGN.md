# Rival System V4 — DBZ Legacy Reborn

Rework of Rival V3, patterned after the Sparring TP System quality bar.
Target: CustomNPCs 1.20.1 GBPort + DragonMineZ 2.1.3 + Fabled (optional).

## Design Goals

1. Rivalries feel persistent and anime-like, not just duel queues.
2. Mutual and one-sided rivalries both matter, with different rewards.
3. Proximity training and official challenges are the two primary loops.
4. Anti-gank: low-BP players who rival a stronger fighter grow faster near them.
5. Never punish fair losses with RP loss. Punish forfeits / AFK / disconnects only.

## Modules

| File | Slot | Role |
|---|---|---|
| `RivalCore_v4.js` | Global Player | Declare / accept / remove / list / RP tiers / DB |
| `RivalProximity_v4.js` | Global Player | Near-rival bonuses, kill TP, anti-gank, catch-up |
| `RivalChallenge_v4.js` | Global Player | `/Challenge Rival` 60s damage contest |
| `RivalCommands_v4.js` | Script Triggers | Stats / help / leaderboard displays |

Disable old V3 rival scripts while testing V4.

## Commands / Triggers

| Trigger | Command idea | Action |
|---|---|---|
| 200 | `/rival help` | Help |
| 201 | `/rival <player>` | Declare / request |
| 202 | `/rival accept <player>` | Accept |
| 203 | `/rival decline <player>` | Decline |
| 204 | `/rival remove <player>` | Remove |
| 205 | `/rival list` | List rivals |
| 206 | `/rival stats [player]` | Personal / target stats |
| 210 | `/challenge rival <player>` | Start 60s damage contest |
| 211 | `/challenge accept` | Accept challenge |
| 212 | `/challenge decline` | Decline |
| 213 | `/challenge cancel` | Cancel pending / forfeit |
| 220 | `/rival top` | RP leaderboard |

Wire these with `noppes script trigger <id> <player> [args...]`.

## Rival Point Tiers

| RP | Title |
|---|---|
| 0 | Acquaintance |
| 100 | Competitor |
| 300 | Adversary |
| 700 | Rival |
| 1500 | Nemesis |
| 3000 | Legendary |
| 5000 | Arch Rival |
| 7500 | Mortal Enemy |
| 10000 | Eternal Rival |
| 15000 | Mythic Rival |

## Core Loops (Adjusted Design)

### A. Proximity Rivalry (`/rival`)

While within range of a rival:

- Bonus to your **highest offensive stat** (STR or SKP), scaled by RP tier + time nearby.
- Bonus TP on kills made near them.
- Passive RP ticks from shared presence (both mutual; one-sided favors the declarer).

If your RP > their RP and they are stronger by BP:

- Catch-up multiplier on your offensive bonus so you can close the gap.
- Crossing above their released BP awards a one-time “Surpass” TP dump (cooldown).

### B. Official Challenge (`/challenge rival`)

60-second most-damage contest:

- Winner: more TP, less RP
- Loser: more RP, less TP
- Knockout: instant win, larger TP for winner, larger RP for loser
- Fair loss never reduces RP
- Forfeit / disconnect: winner gets TP; loser gets RP penalty or zero RP gain

Non-rival accepted challenges still award TP on win.

### C. One-sided Underdog

If you declared them, they did not declare you, and they are stronger:

- Combat engagement grants TP
- Dying to them grants RP
- Beating them grants a large TP bonus

### D. Anti-Gank (≤40% Released BP)

If weaker players have you as a rival and are ≤40% of your released BP:

- You gain bonus TP for kills made in front of them
- They gain RP for witnessing / proximity
- They receive an offensive proximity bonus near you
- When you take damage near them, they gain TP + RP

Repeated gank pressure accelerates their growth until they can retaliate.

### E. Fusion (mutual only)

While fused with a mutual rival:

- Shared power bonus scaled by combined RP
- Kill TP split / bonus awarded to both accounts when possible

## Persistence

Single overworld stored database:

- `dlr.rivalry.v4.database`
- `dlr.rivalry.v4.database.backup`

Player session/temp keys use `rival.v4.*` prefixes.

## Roadmap After V4 Core

Reports UI polish, seasons, quests, achievements, Rival Master NPC,
spectator mode, journal, hall of fame — keep the same database schema
so later modules only read/write new fields.

## Balance Knobs

All multipliers live in top-of-file CONFIG blocks (same style as Sparring).
Tune first:

- proximity range
- offensive bonus caps
- kill TP rates
- challenge TP / RP payouts
- underdog / anti-gank thresholds (default 0.40 BP)
