# Rival System V4.6 — Design

## Vision

Recreate the feeling of iconic DBZ rivalries through **history**, not another PvP ladder.

Up to two Mutual rivals matter. Official battles write the story. One Nemesis emerges from that history. Each rivalry can earn a named **Proving Grounds** battlefield.

## Layout

| File | Slot |
|---|---|
| `Rival System.js` | Global Player — gameplay |
| `Rival Command Handler.js` | Script-slot — CMI command triggers |
| `RivalNPC_v4.js` | Optional Rival Master NPC (chat guide) |
| `cmi/CustomAlias.yml` | CMI aliases |

Gameplay stays in `Rival System.js` (Global Player).

## Relationship statuses

| Status | Meaning | Limit |
|---|---|---|
| Unknown | You silently rivaled them (hidden from them) | Unlimited |
| Declared | Both silently rivaled each other | Unlimited |
| Mutual | Both accepted | **Max 2** (3rd demotes oldest) |
| Nemesis | Greatest mutual by history | **Only 1** (auto) |

`/rival <player>` is silent Unknown. Crossed silent rivals become Declared. Mutual needs accept.

## Career RP titles (total RP — separate from Nemesis status)

| RP | Title | Rival TP mult |
|---|---|---|
| 0 | Acquaintance | 1.00x |
| 100 | Competitor | 1.05x |
| 300 | Adversary | 1.10x |
| 700 | Rival | 1.15x |
| 1500 | Nemesis *(title)* | 1.25x |
| 3000 | Legendary | 1.35x |
| 5000 | Arch Rival | 1.45x |
| 7500 | Mortal Enemy | 1.55x |
| 10000 | Eternal Rival | 1.70x |
| 15000 | Mythic Rival | 2.00x |

Note: the **Nemesis link status** is history-chosen (one Mutual). The career title named "Nemesis" is unrelated RP flavor.

Title TP mult stacks with level scaling on all rival TP (presence, kills, challenges, fusion).

## Core loops

1. Declare → accept → Mutual (auto-demote oldest if at 2)
2. Official `/challenge` battles write history + RP (Mutual only)
3. Defeat marks **Proving Grounds** (biome/landmark name); return fights grant bonus TP/RP + underdog aura
4. Reclaim by beating the champion on those grounds (server announcement)
5. Instinct senses Mutual/Nemesis rivals (arrive, ki, power, form, fusion)
6. Nemesis recomputed after battles
7. Hall of Legends remembers the server’s greatest rivalries
8. Removing Declared/Mutual/Nemesis ends it for **both** players; history is archived and restored if they rival again

RP does **not** grant raw STR/SKP bonuses.

**TP rewards stay on** (level-scaled via `StatsData.getLevel()`):

| Kind | Sources | Curve |
|---|---|---|
| **burst** | challenges, kill near rival, surpass, underdog win, fusion | full log anchors → 850x @ 100k |
| **drip** | presence, engage, light anti-gank | `burst^0.55` capped at 75x |

Messages show `LvX Y.YYx` so players can see the scale.

## Config

Top-of-section CONFIG blocks in `Rival System.js`.

- `RP_OFFENSE_ENABLED = false`
- `RP_PRESENCE_RP_ENABLED = false`
- Level TP scaling via verified `StatsData.getLevel()`

## API

See `VERIFIED_API.md` (CustomNPCs ScriptTriggerEvent, DragonMineZ StatsData/Status/Resources/BonusStats).
