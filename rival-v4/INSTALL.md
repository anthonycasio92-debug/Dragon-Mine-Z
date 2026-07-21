# Rival System V4.3 — Install Guide

## 1) Disable old V3

Disable Global Player scripts:

- `RivalCore V3.js`
- `RivalEvents V3.js`
- `RivalBattle Manager V3.js`
- `RivalBattle Combat Core V3.js`

## 2) Global Player scripts (gameplay only)

Same split as Sparring: Global Player = systems, **not** commands.

| Script | Events |
|---|---|
| `RivalCore_v4.js` | init, login |
| `RivalProximity_v4.js` | tick, damagedEntity, damaged, kill, logout, died |
| `RivalChallenge_v4.js` | init, tick, damagedEntity, damaged, kill, died, logout |
| `RivalInstinct_v4.js` | tick, login |
| `RivalProgression_v4.js` | login, tick, trigger |
| `RivalSpectator_v4.js` | tick |
| `RivalDMZHooks_v4.js` | tick, kill, logout, died |

## 3) Script-slot command handler

Same place as **SkillCheckCommand** / **Sparring Command Handler**:

| Script | Events |
|---|---|
| `Rival Command Handler.js` | trigger |

Do **not** place this in the Global Player Script slot.

## 4) Rival Master NPC

Put `RivalNPC_v4.js` on a CustomNPC at spawn. Enable `interact` + `dialogOption`.
Map dialog options to slots 0–9 (see file header).

## 5) CMI aliases (same style as sparring)

1. Paste `cmi/Aliases-Rival.yml` into CMI `Aliases.yml`
2. (Optional) paste `cmi/Aliases-Sparring.yml` if you want matching sparring shortcuts
3. `/cmi reload`

Pattern (identical to sparring stats):

```yaml
sparstats:
  Cmds:
  - asFakeOp! noppes script trigger 73 [playerName]

rivalstats:
  Cmds:
  - asFakeOp! noppes script trigger 206 [playerName] $1-

rivaldeclare:
  Cmds:
  - asFakeOp! noppes script trigger 201 [playerName] $1
```

- `[playerName]` = argument 0 (required — what the handler resolves)
- `$1` / `$1-` = extra args after the player name
- `asFakeOp!` = player-like OP source for `noppes script trigger`

## 6) CMI title placeholder

On login / `/rivaltitle`, progression writes:

- `cmi usermeta <player> set rival_title <Title>`
- `cmi usermeta <player> set rival_rank <Title>`

Use in nametags/tab (if enabled in your CMI setup):

```text
%cmi_user_meta_rival_title%
```

## 7) What this build covers vs roadmap

Implemented now:

- Phase 1 Core
- Phase 2 Instinct sensing
- Phase 3 Challenges + combat tracking + reports
- Phase 4 RP tiers + fair-loss rules
- Phase 5 Titles (CMI usermeta)
- Phase 6 Perk text unlocks by tier
- Phase 7 Battle reports
- Phase 8 Stats
- Phase 9 Leaderboards (in-game categories)
- Phase 10 Seasons (75-day window, season RP)
- Phase 11 Weekly quests
- Phase 12 Achievements
- Phase 13 Rival Master NPC hooks
- Phase 14 Spectator
- Phase 15 Journal
- Phase 16 Hall of Fame data
- Phase 17 Fusion mutual bonus + kill TP split
- Adjusted design: proximity offense, anti-gank, underdog, surpass, catch-up

Still optional / later polish:

- Website / Discord leaderboard feeds
- Animated hologram titles
- Entrance animations / custom particle auras (needs asset pipeline)
- Betting (intentionally disabled)
- Saga dialogue tables

See `VERIFIED_API.md` and `DESIGN.md`.
