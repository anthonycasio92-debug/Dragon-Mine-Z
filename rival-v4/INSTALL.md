# Rival System V4.3 — Install Guide

## Final layout (3 scripts)

Same idea as sparring: **one Global Player system** + **one command handler** + optional NPC.

| File | Where | Events |
|---|---|---|
| `Rival System.js` | Global Player | init, login, tick, damagedEntity, damaged, kill, died, logout, trigger |
| `Rival Command Handler.js` | Script-slot (with SkillCheck / Sparring Command Handler) | trigger |
| `RivalNPC_v4.js` | Rival Master NPC | interact |

## 1) Disable old V3

Disable Global Player scripts:

- `RivalCore V3.js`
- `RivalEvents V3.js`
- `RivalBattle Manager V3.js`
- `RivalBattle Combat Core V3.js`

## 2) Install the combined Global Player script

Install **only** `Rival System.js` as a Global Player script.

Enable all events listed in the table above.

Do **not** also enable the old split modules (`RivalCore_v4`, `RivalProximity_v4`, etc.) — those are obsolete stubs.

## 3) Install the command handler

Put `Rival Command Handler.js` in the **same CustomNPCs script location as SkillCheck / Sparring Command Handler**.

Do **not** put it in Global Player.

## 4) Rival Master NPC (optional)

Put `RivalNPC_v4.js` on a CustomNPC at spawn. Enable **interact** only.

No dialog GUI needed — right-click replies in chat with the rival command guide.

## 5) CMI CustomAlias

Replace your server `CustomAlias.yml` with:

- `CustomAlias.yml` (repo root) **or** `rival-v4/cmi/CustomAlias.yml`

That file keeps your existing aliases (spar, SkillCheck, etc.) and adds all rival/challenge commands in the same format.

Then: `/cmi reload`

Rival pattern (matches your spar aliases):

```yaml
  rivaldeclare:
    Cmds:
    - asFakeOp! noppes script trigger 201 [playerName] $1
    AddTabs: true
    ExactMatch: true
```

- `[playerName]` = argument 0 (required)
- `$1` / `$1-` = extra args after the player name

## 6) CMI title placeholder

On login / `/rivaltitle`:

- `cmi usermeta <player> set rival_title <Title>`

Nametag/tab (if enabled):

```text
%cmi_user_meta_rival_title%
```

## 7) Coverage

Core, proximity, challenges, instinct, titles/seasons/quests/achievements/journal/HoF, spectator, fusion hooks, command aliases.

See `DESIGN.md` and `VERIFIED_API.md`.
