# Rival System V4.3 — Install Guide

## Final layout (3 scripts)

Same idea as sparring: **one Global Player system** + **one command handler** + optional NPC.

| File | Where | Events |
|---|---|---|
| `Rival System.js` | Global Player | init, login, tick, damagedEntity, damaged, kill, died, logout, trigger |
| `Rival Command Handler.js` | Script-slot (with SkillCheck / Sparring Command Handler) | trigger |
| `RivalNPC_v4.js` | Rival Master NPC | interact, dialogOption |

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

Put `RivalNPC_v4.js` on a CustomNPC at spawn. Enable `interact` + `dialogOption`.
Map dialog options to slots 0–9 (see file header).

## 5) CMI aliases (same style as sparring)

1. Paste `cmi/Aliases-Rival.yml` into CMI `Aliases.yml`
2. (Optional) paste `cmi/Aliases-Sparring.yml` for sparring shortcuts
3. `/cmi reload`

Pattern:

```yaml
rivalstats:
  Cmds:
  - asFakeOp! noppes script trigger 206 [playerName] $1-

rivaldeclare:
  Cmds:
  - asFakeOp! noppes script trigger 201 [playerName] $1
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
