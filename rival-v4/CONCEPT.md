# Rival System — Original Concept Checklist

Every item from the original design, mapped to the current build.

| # | Concept | Status | Where |
|---|---|---|---|
| 1 | `/Rival <player>` declare | Done | `/rival <player>` or `/rival declare <player>` |
| 2 | Near rival → bonus on **highest offensive stat** (STR/SKP) | Done | `rpApplyOffenseBonus` |
| 3 | Longer near → rivalry rank (RP) increases | Done | Presence RP ticks |
| 4 | Higher rank → higher damage bonus | Done | Tier + presence offense |
| 5 | Near rival + kills → bonus TP | Done | `rpHandleKillNearRivals` |
| 6 | `/Challenge Rival` — most damage in 60s | Done | `/challenge` / `/challenge rival` |
| 7 | End: both get TP + RP; **loser more RP**, **winner more TP** | Done | `chApplyRewards` |
| 8 | Rival dies → instant win, larger TP, loser more RP | Done | Knockout bonuses |
| 9 | More RP than rival + they are stronger → catch-up | Done | Catch-up offense |
| 10 | Surpass rival power → large TP | Done | Surpass award |
| 11 | One-sided vs stronger: engage TP / death RP / win TP | Done | Underdog hooks |
| 12 | Low-level rivals you: kill TP while watched; they get RP | Done | Anti-gank witness |
| 13 | Weak rivals ≤40% released BP: offense + TP/RP when you get hit | Done | Anti-gank |
| 14 | Non-rival challenge win → still TP | Done | `CH_NON_RIVAL_WIN_TP` |
| 15 | Fuse with mutual rival → power + kill TP split | Done | Fusion hooks |

## Relationship statuses (4-part)

| Status | Meaning | Limit |
|---|---|---|
| **Unknown** | They declared you; you have not accepted/declared back | Unlimited |
| **Declared** | You declared them (one-sided) | Unlimited |
| **Mutual** | Both accepted | **Max 2** (shared with Nemesis) |
| **Nemesis** | Mutual that reached **1500+ RP** on that link | Counts as a Mutual slot |

Progression: `Unknown → Declared (cross-declare/accept) → Mutual → Nemesis`

Nemesis gets stronger presence RP and kill TP than Mutual.

## Commands

```text
/rival <player>
/rival declare|accept|decline|remove <player>
/rival list
/challenge <player>
/challenge rival <player>
/challenge accept|decline|cancel
```

## Install

- `Rival System.js` — Global Player
- `Rival Command Handler.js` — script-slot
- `CustomAlias.yml` — CMI
- `RivalNPC_v4.js` — optional chat NPC
