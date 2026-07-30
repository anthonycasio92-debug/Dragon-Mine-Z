# CustomNPCs-Unofficial 1.20.1.20260711 — Script API Reference

Persisted reference for the CustomNPCs build this pack’s scripts target
(Forge 1.20.1, Goodbird unofficial / GBPort).

## Artifact identity

| Item | Value |
|---|---|
| Mod jar | `CustomNPCs-1.20.1-GBPort-Unofficial-1.20.1.20260711.jar` (~10.4 MB) |
| Implementation version | `1.20.1.20260711` (Manifest, 2026-07-11) |
| CurseForge file | [8414335](https://www.curseforge.com/minecraft/mc-mods/customnpcs-unofficial/files/8414335) |
| Modrinth project | [customnpcs-unofficial](https://modrinth.com/mod/customnpcs-unofficial) |
| SHA-256 | see [`jar-sha256.txt`](jar-sha256.txt) |
| Class count | ~1249 (`class-list.txt`) |
| Classes used via `Java.type` in this repo | [`classes-used-by-scripts.txt`](classes-used-by-scripts.txt) |

The full jar is **not** committed (binary). Keep a copy in your server
`mods/` folder and verify against `jar-sha256.txt` when upgrading.

Decompiled sources for the API surface scripts touch most often are under
[`src/`](src/) (CFR). Public method dumps are under [`javap/`](javap/).

Official scripting docs (upstream):  
https://goodbird-git.github.io/CNPC-Unofficial-1.20.1-ScriptingDoc/

---

## Install slots used by this pack

| Slot | Typical scripts |
|---|---|
| Global **Player** | Rival System, Sparring TP, End Strength, flight suppression, SprintJump, Race Lock, Class Permission, … |
| Global **Forge** | EndDragon-Forge-Trigger, Disable End Portals, ShadowDummyForgeProtect |
| Script block / NPC / command bridge | Rival Command Handler, Sparring Command Handler, Prestige NPC |

Most player scripts receive a CNPC-wrapped `event.player` (`IPlayer`).
Forge tabs receive `ForgeEvent` wrappers around native Forge bus events.

---

## Standard access patterns

### NpcAPI singleton

```javascript
var NpcAPI = Java.type("noppes.npcs.api.NpcAPI");
var api = NpcAPI.Instance();

var worlds = api.getIWorlds();
var overworld = api.getIWorld("minecraft:overworld"); // dimension id string
var wrapped = api.getIEntity(mcEntity);               // Entity → IEntity
api.executeCommand(world, "say hello");
```

### Player / entity data bags

```javascript
var temp = player.getTempdata();     // session — clears on logout / restart
var stored = player.getStoreddata(); // persisted on player data
var worldData = player.world.getStoreddata(); // or player.getWorld().getStoreddata()

temp.put("key", value);
var v = temp.get("key");
if (temp.has("key")) temp.remove("key");
```

`IData` API: `put`, `get`, `has`, `remove`, `getKeys`, `clear`.

### Drop to Minecraft entity (DMZ interop)

```javascript
var mc = player.getMCEntity(); // ServerPlayer
// then StatsProvider.get(StatsCapability.INSTANCE, mc)...
```

### Script trigger bridge (Forge → Player)

Used by `EndDragon-Forge-Trigger.js`:

```javascript
var PlayerData = Java.type("noppes.npcs.controllers.data.PlayerData");
var EnumScriptType = Java.type("noppes.npcs.constants.EnumScriptType");
var ScriptTriggerEvent = Java.type("noppes.npcs.api.event.WorldEvent$ScriptTriggerEvent");

// player.trigger(id, args...) → WorldEvent.ScriptTriggerEvent on player scripts
player.trigger(triggerId, arg0, arg1);
```

`EnumScriptType.SCRIPT_TRIGGER` / function name `trigger`.

---

## Core player events (`PlayerEvent`)

Handler function names match `EnumScriptType.function` (e.g. `damaged`,
`damagedEntity`, `died`, `kill`, `tick`, `login`, `logout`, `chat`,
`timer`, `keyPressed`).

| Event class | Key fields |
|---|---|
| `PlayerEvent.DamagedEvent` | `player`, `source`, `damageSource`, **`damage`** (mutable) |
| `PlayerEvent.DamagedEntityEvent` | `player`, `target`, `damageSource`, **`damage`** (mutable) |
| `PlayerEvent.DiedEvent` | `player`, `source`, `damageSource`, `type` |
| `PlayerEvent.KilledEntityEvent` | `player`, `entity` |
| `PlayerEvent.UpdateEvent` | `player` (tick) |
| `PlayerEvent.LoginEvent` / `LogoutEvent` | `player` |
| `PlayerEvent.ChatEvent` | `player`, `message` |
| `PlayerEvent.TimerEvent` | `player`, `id` |
| `PlayerEvent.KeyPressedEvent` | `player`, `key`, modifier flags |

**Damage note:** `DamagedEvent` / `DamagedEntityEvent` fire on LivingHurt
with the raw amount in `event.damage`. Scripts in this pack often rewrite
`event.damage` for rival/sparring/End logic. That value is typically
**pre-mitigation** relative to DMZ defense math.

Full dumps: [`javap/noppes_npcs_api_event_PlayerEvent*.txt`](javap/)

---

## Forge events (`ForgeEvent`)

Global Forge script tab:

| Wrapper | Fields |
|---|---|
| `ForgeEvent` | `event` — underlying Forge `Event` |
| `ForgeEvent.EntityEvent` | `entity` (`IEntity`) + `event` |
| `ForgeEvent.LevelEvent` | `world` (`IWorld`) + `event` |
| `ForgeEvent.InitEvent` | fired once at script init |

Cancel via CNPC/Forge cancelable semantics on the wrapper / underlying event.

---

## Useful `IPlayer` / `IEntity` methods

From [`IPlayer`](src/noppes/npcs/api/entity/IPlayer.java) /
[`IEntity`](src/noppes/npcs/api/entity/IEntity.java):

| Method | Notes |
|---|---|
| `message(str)` | Chat to player |
| `getName()` / `getDisplayName()` | Identity |
| `getUUID()` | String UUID (via entity hierarchy) |
| `getTempdata()` / `getStoreddata()` | `IData` bags |
| `getWorld()` / `.world` | `IWorld` |
| `getMCEntity()` | Underlying MC entity |
| `getTimers()` | CNPC timers |
| `trigger(id, …)` | Fire `ScriptTriggerEvent` |
| `executeCommand(cmd)` | On `ICustomNpc` / via `NpcAPI` |
| `hasPermission(node)` | Permission check |

Wrappers implementing these: `PlayerWrapper`, `EntityWrapper`,
`EntityLivingBaseWrapper`, `WorldWrapper`, `WrapperNpcAPI`.

---

## Layout

```
docs/cnpc-1.20.1.20260711/
  README.md
  SCRIPT-CHEATSHEET.md
  jar-sha256.txt
  class-list.txt
  package-summary.txt
  classes-used-by-scripts.txt
  javap/          # public signatures
  src/noppes/…    # CFR sources for key API classes
```
