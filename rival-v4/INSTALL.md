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
Events: `tick`, `damagedEntity`, `damaged`, `killedEntity`, `logout`, `died`

### 3. `RivalChallenge_v4.js`
Events: `init`, `tick`, `damagedEntity`, `damaged`, `killedEntity`, `died`, `logout`, `trigger`

## Install command display script

Place `RivalCommands_v4.js` with your other trigger scripts (same place as Sparring Command Handler / SkillCheckCommand).

Events: `trigger`

## Suggested command wiring

Example using `noppes script trigger`:

```text
/rival                -> trigger 200 <player>
/rival <name>         -> trigger 201 <player> <name>
/rival accept <name>  -> trigger 202 <player> <name>
/rival decline <name> -> trigger 203 <player> <name>
/rival remove <name>  -> trigger 204 <player> <name>
/rival list           -> trigger 205 <player>
/rival stats [name]   -> trigger 206 <player> [name]
/rival top            -> trigger 220 <player>

/challenge rival <name> -> trigger 210 <player> <name>
/challenge accept       -> trigger 211 <player>
/challenge decline      -> trigger 212 <player>
/challenge cancel       -> trigger 213 <player>
```

If you use MyCommand / DeluxeMenus / etc., point those commands at the same trigger IDs.

## Quick test

After installing `RivalCore_v4.js` as a Global Player script with `trigger` enabled:

```text
noppes script trigger 200 <YourName>
```

You should see the Rival System V4 help menu.

```text
noppes script trigger 201 <YourName> <OtherPlayer>
noppes script trigger 205 <YourName>
```

Important: CustomNPCs Global Player triggers use `event.entity` for the player.
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
