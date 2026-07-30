# CNPC 1.20.1.20260711 — Quick cheatsheet for this repo’s scripts

## NpcAPI

```javascript
var NpcAPI = Java.type("noppes.npcs.api.NpcAPI");
var api = NpcAPI.Instance();
var worlds = api.getIWorlds();
var ent = api.getIEntity(mcEntity);
```

## Temp / stored data

```javascript
var temp = player.getTempdata();
var stored = player.getStoreddata();
temp.put("flag", 1);
var n = Number(temp.get("flag"));
if (isNaN(n)) n = 0;
```

## MC entity for DMZ

```javascript
var mc = player.getMCEntity();
```

## Rewrite incoming damage

```javascript
function damaged(event) {
    // PlayerEvent.DamagedEvent — LivingHurt raw amount
    event.damage = Math.max(0, event.damage * 0.5);
}
```

## Rewrite outgoing damage

```javascript
function damagedEntity(event) {
    // PlayerEvent.DamagedEntityEvent
    event.damage = Math.max(0, event.damage);
}
```

## Death / kill

```javascript
function died(event) {
    var killer = event.source; // IEntity or null
    var src = event.damageSource;
}

function kill(event) {
    // PlayerEvent.KilledEntityEvent — event.entity is the victim
    var victim = event.entity;
}
```

## Forge → player trigger

```javascript
var ScriptTriggerEvent = Java.type("noppes.npcs.api.event.WorldEvent$ScriptTriggerEvent");
var EnumScriptType = Java.type("noppes.npcs.constants.EnumScriptType");
var PlayerData = Java.type("noppes.npcs.controllers.data.PlayerData");

// From a player script / wrapper:
player.trigger(id, arg0);

// Handler on Global Player:
function trigger(event) {
    // WorldEvent.ScriptTriggerEvent
    var id = event.id;
    var args = event.arguments;
    var ent = event.entity;
}
```

## Run a command as the server

```javascript
var NpcAPI = Java.type("noppes.npcs.api.NpcAPI");
NpcAPI.Instance().executeCommand(player.world, "say hi");
```

## Where used in this repo

| Pattern | Scripts |
|---|---|
| `NpcAPI.Instance()` | Rival / Sparring / End / Meditation / Android / portals |
| `getTempdata` / `getStoreddata` | Rival, Sparring, ShadowDummy, SprintJump, Prestige |
| `event.damage` rewrite | Rival, Sparring, End Strength, ShadowDummy |
| Forge + `ScriptTriggerEvent` | `EndDragon-Forge-Trigger.js` |
| `EnumScriptType` / `PlayerData` | `EndDragon-Forge-Trigger.js` |
