# Rival System — Original Concept Checklist

Every item from the original design, mapped to the current build.

| # | Concept | Status | Where |
|---|---|---|---|
| 1 | `/Rival <player>` declare | Done | Command Handler: `/rival <player>` or `/rival declare <player>` |
| 2 | Near rival → bonus on **highest offensive stat** (STR/SKP) | Done | `rpApplyOffenseBonus` / `rpHighestOffense` |
| 3 | Longer near → rivalry rank (RP) increases | Done | Presence RP ticks (both sides) |
| 4 | Higher rank → higher damage bonus | Done | Tier + presence in `rpOffenseMultiplier` |
| 5 | Near rival + kills → bonus TP | Done | `rpHandleKillNearRivals` |
| 6 | `/Challenge Rival` — most damage in 60s | Done | `/challenge <player>` or `/challenge rival <player>` |
| 7 | End: both get TP + RP; **loser more RP**, **winner more TP** | Done | `chApplyRewards` (`CH_LOSE_RP` > `CH_WIN_RP`, `CH_WIN_TP` > `CH_LOSE_TP`) |
| 8 | Rival dies → instant win, larger TP, loser more RP | Done | Knockout path + `CH_KO_WIN_TP_BONUS` / `CH_KO_LOSE_RP_BONUS` |
| 9 | More RP than rival + they are stronger → catch-up offense near them | Done | Catch-up in `rpProcessPlayer` (up to +40%, total cap 55%) |
| 10 | Surpass rival power → large TP | Done | Surpass award on released BP overtake |
| 11 | One-sided vs stronger: TP for engaging, RP on death, huge TP if you win | Done | Underdog engage / death RP / underdog win |
| 12 | Low-level rivals you: you get kill TP while they watch; they get RP | Done | Anti-gank witness kill |
| 13 | Multiple weak rivals (≤40% your released BP): offense near you; TP+RP when you get hit | Done | Anti-gank offense + `rpHandleStrongPlayerDamagedNearWeakRivals` |
| 14 | Non-rival challenge accept + win → still TP | Done | `CH_ALLOW_NON_RIVAL` + `CH_NON_RIVAL_WIN_TP` |
| 15 | Fuse with mutual rival → power bonus from RP + kill TP split to both | Done | Fusion tick bonus + `rivalFusionKill` |

## Commands (player-facing)

```text
/rival <player>                 declare
/rival declare|accept|decline|remove <player>
/rival list|stats|top|title|journal|season|quests|achievements|hof
/challenge <player>
/challenge rival <player>
/challenge accept|decline|cancel
```

## Install files

- `Rival System.js` — Global Player (all gameplay)
- `Rival Command Handler.js` — script-slot with SkillCheck / Spar
- `CustomAlias.yml` — CMI aliases (`ExactMatch: false` on arg commands)
- `RivalNPC_v4.js` — optional chat guide NPC
