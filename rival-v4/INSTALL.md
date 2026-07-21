# Rival System V4.1 — Install Guide

## 1) Disable old V3

Disable Global Player scripts:

- `RivalCore V3.js`
- `RivalEvents V3.js`
- `RivalBattle Manager V3.js`
- `RivalBattle Combat Core V3.js`

## 2) Global Player scripts

Install as **separate** Global Player scripts:

| Script | Events |
|---|---|
| `RivalCore_v4.js` | init, login, trigger |
| `RivalProximity_v4.js` | tick, damagedEntity, damaged, kill, logout, died |
| `RivalChallenge_v4.js` | init, tick, damagedEntity, damaged, kill, died, logout, trigger |
| `RivalInstinct_v4.js` | tick, login |
| `RivalProgression_v4.js` | login, tick, trigger |
| `RivalSpectator_v4.js` | tick |
| `RivalDMZHooks_v4.js` | tick, kill, logout, died |

## 3) Script-slot scripts (same place as SkillCheck / Sparring Command Handler)

| Script | Events |
|---|---|
| `RivalRouter_v4.js` | trigger |
| `RivalCommands_v4.js` | trigger (optional; Router covers displays) |

## 4) Rival Master NPC

Put `RivalNPC_v4.js` on a CustomNPC at spawn. Enable `interact` + `dialogOption`.
Map dialog options to slots 0–9 (see file header).

## 5) CMI aliases (FakeOp note)

**Do not use `asFakeOp!` for CNPC triggers.**  
CustomNPCs ignores FakePlayer entities in `EventHooks.onScriptTriggerEvent` (verified in your CNPC jar).

Use the provided file:

`cmi/Aliases-Rival.yml`

Pattern:

```yaml
challenge:
  Cmds:
  - asConsole! noppes script trigger 210 [playerName] $1
```

`RivalRouter_v4.js` resolves `[playerName]`, then re-dispatches gameplay triggers with:

```text
execute as <player> run noppes script trigger <id> ...
```

so `event.entity` is the real player for RivalCore / RivalChallenge.

After editing Aliases.yml: `/cmi reload`

Suggested player-facing commands:

```text
/rival
/rival declare <player>     (or create multi-word aliases in CMI editor)
/rivalaccept <player>
/rivaldecline <player>
/rivalremove <player>
/rivallist
/rivalstats [player]
/rivaltop [rp|wins|streak|damage|combo|hit|battles]
/rivaltitle
/rivaljournal [player]
/rivalseason
/rivalquests
/rivalachievements
/rivalhof
/challenge <player>
/challengeaccept
/challengedecline
/challengecancel
/spectaterival <player>
```

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
