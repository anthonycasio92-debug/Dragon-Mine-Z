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

## 5) CMI aliases — use asFakeOp!

**Use `asFakeOp!`** (noppes needs a player source; console is not enough).

Important detail from your CNPC jar:
- Global Player scripts **skip FakePlayer**
- Forge / script-slot scripts **still receive** the trigger

So:
1. Put `RivalRouter_v4.js` in the **same script location as SkillCheckCommand** (NOT Global Player)
2. Paste `cmi/Aliases-Rival.yml` into CMI Aliases.yml
3. `/cmi reload`

Alias pattern:

```yaml
challenge:
  Cmds:
  - asFakeOp! noppes script trigger 210 [playerName] $1
```

Router reads:
- arg0 = real player (`[playerName]`)
- remaining args = command args

Gameplay modules (proximity/instinct/challenge combat) stay as Global Player scripts.
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
