# Rival System V4 — DBZ Legacy Reborn

Rework of Rival V3, patterned after the Sparring TP System quality bar.
Target: CustomNPCs 1.20.1 GBPort + DragonMineZ 2.1.3 + Fabled (optional).

## Design Goals

1. Rivalries feel persistent and anime-like, not just duel queues.
2. Mutual and one-sided rivalries both matter, with different rewards.
3. Proximity training and official challenges are the two primary loops.
4. Anti-gank: low-BP players who rival a stronger fighter grow faster near them.
5. Never punish fair losses with RP loss. Punish forfeits / AFK / disconnects only.

## Modules (install these)

| File | Slot | Role |
|---|---|---|
| `Rival System.js` | Global Player | All gameplay (core, proximity, challenges, instinct, progression, spectator, fusion) |
| `Rival Command Handler.js` | Script-slot | All player commands (same style as Sparring Command Handler) |
| `RivalNPC_v4.js` | NPC | Chat guide on interact (no dialog options) |

Obsolete split Global Player files (`RivalCore_v4.js`, etc.) are stubs — do not install them.

Disable old V3 rival scripts while testing V4.

## Commands / Triggers

| Trigger | Command idea | Action |
|---|---|---|
| 200 | `/rival help` | Help |
| 201 | `/rivaldeclare <player>` | Declare / request |
| 202 | `/rivalaccept <player>` | Accept |
| 203 | `/rivaldecline <player>` | Decline |
| 204 | `/rivalremove <player>` | Remove |
| 205 | `/rivallist` | List rivals |
| 206 | `/rivalstats [player]` | Personal / target stats |
| 210 | `/challenge <player>` | Start 60s damage contest |
| 211 | `/challengeaccept` | Accept challenge |
| 212 | `/challengedecline` | Decline |
| 213 | `/challengecancel` | Cancel pending / forfeit |
| 220 | `/rivaltop` | Leaderboards |
| 221–226 | title / journal / season / quests / achievements / hof | Displays |
| 230 | `/spectaterival <player>` | Spectate |
| 240 | admin refresh | Titles / HoF (Global Player trigger) |

Wire these with CMI aliases (same style as sparring):

```yaml
rivaldeclare:
  Cmds:
  - asFakeOp! noppes script trigger 201 [playerName] $1
```

Place `Rival Command Handler.js` with SkillCheck / Sparring Command Handler.
Gameplay stays in `Rival System.js` (Global Player).

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

See prior design notes in repo history / chat for proximity offense, anti-gank,
underdog, surpass, catch-up, mutual fusion bonus, and 60s damage challenges.

## Config

All multipliers live in top-of-section CONFIG blocks inside `Rival System.js`
(same style as Sparring).

## Storage keys

- `dlr.rivalry.v4.database`
- `dlr.rivalry.v4.challenges`
- `dlr.rivalry.v4.progression`
(+ `.backup` variants)
