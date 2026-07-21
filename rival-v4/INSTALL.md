# Rival System V4 — Install Guide

## Disable old V3 first

In CustomNPCs Global Player Scripts, disable or remove:

- `RivalCore V3.js`
- `RivalEvents V3.js`
- `RivalBattle Manager V3.js`
- `RivalBattle Combat Core V3.js`

V3 and V4 use different database keys, so they will not share data.

## Install V4 Global Player scripts

Add these as **separate Global Player scripts** and enable the listed events:

### 1. `RivalCore_v4.js`
Events: `init`, `login`, `trigger`

### 2. `RivalProximity_v4.js`
Events: `tick`, `damagedEntity`, `damaged`, `kill`, `logout`, `died`

### 3. `RivalChallenge_v4.js`
Events: `init`, `tick`, `damagedEntity`, `damaged`, `kill`, `died`, `logout`, `trigger`

## Install command display script

Place `RivalCommands_v4.js` with your other trigger scripts (same place as Sparring Command Handler / SkillCheckCommand).

Events: `trigger`

## Suggested command wiring

Example using `noppes script trigger`:

Native CustomNPCs command (player is `event.entity`, args are only the text after the id):

```text
/noppes script trigger 200
/noppes script trigger 201 <targetName>
/noppes script trigger 202 <targetName>
/noppes script trigger 203 <targetName>
/noppes script trigger 204 <targetName>
/noppes script trigger 205
/noppes script trigger 206 [targetName]
/noppes script trigger 220

/noppes script trigger 210 <targetName>
/noppes script trigger 211
/noppes script trigger 212
/noppes script trigger 213
```

If a command plugin runs the trigger as console/NPC and passes the player name as arg0,
use the RivalCommands script-slot handler pattern (lookup by name), not Global Player `event.entity`.

See `VERIFIED_API.md` for jar-confirmed field/function names.

## Quick test

After installing `RivalCore_v4.js` as a Global Player script with `trigger` enabled:

Run these **as the player** (or with the player as command source entity):

```text
/noppes script trigger 200
/noppes script trigger 201 OtherPlayer
/noppes script trigger 205
```

Verified from CNPC jar: trigger player is `event.entity`; args do **not** include your own name.
If nothing happens, confirm the script has the **trigger** event checkbox enabled.


- Declare / accept / decline / remove / list
- RP tiers through Mythic Rival
- Proximity offensive bonus on highest of STR/SKP
- Kill TP near rivals
- Presence RP
- Catch-up bonus when your RP is higher but their BP is higher
- Surpass-rival TP award
- One-sided underdog engage / death / win rewards
- Anti-gank rewards for weak declarers (≤40% released BP)
- 60s damage challenges with battle reports
- Fair losses never lose RP; forfeits/disconnects can

## Not in this first V4 ship (roadmap)

- Fusion mutual power share
- Seasons / quests / achievements
- Rival Master NPC GUI
- Spectator mode / Hall of Fame
- Animated nametag titles

Those plug into the same `dlr.rivalry.v4.database` schema later.
