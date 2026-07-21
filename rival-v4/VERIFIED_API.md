# Verified API Notes (no guesses)

Sources inspected directly:

- `CustomNPCs-1.20.1-GBPort-Unofficial-1.20.1.20260227.jar` (uploaded)
- `dragonminez-2.1.3.jar` (Modrinth `yZ4DgZaE` / file matching CurseForge 8469416)

## CustomNPCs — ScriptTriggerEvent

Class: `noppes.npcs.api.event.WorldEvent$ScriptTriggerEvent`

Public fields:

- `IEntity entity`
- `int id`
- `Object[] arguments`
- `IPos pos`
- inherits `IWorld world` from `WorldEvent`

There is **no** `event.player` on trigger events.

Player events (`tick`, `login`, `init`, `damaged`, etc.) use `PlayerEvent.player`.

## CustomNPCs — native trigger command

`noppes.npcs.command.CmdScript`:

```text
/noppes script trigger <id>
/noppes script trigger <id> <greedy args...>
```

Behavior verified in bytecode:

- `entity` = command source entity (`CommandSourceStack.getEntity()`)
- `arguments` = greedy arg string split on spaces
- player Global scripts only run when `entity != null` and `entity.getType() == 1`

Correct player-run examples:

```text
/noppes script trigger 200
/noppes script trigger 201 Steve
/noppes script trigger 205
```

Incorrect for native CNPC (executor is already `event.entity`):

```text
/noppes script trigger 201 YourName Steve
```

## CustomNPCs — JS function names (`EnumScriptType.function`)

| Enum | JS function |
|---|---|
| INIT | `init` |
| TICK | `tick` |
| LOGIN | `login` |
| LOGOUT | `logout` |
| DAMAGED | `damaged` |
| DAMAGED_ENTITY | `damagedEntity` |
| DIED | `died` |
| KILL | `kill` |
| ATTACK | `attack` |
| SCRIPT_TRIGGER | `trigger` |

Important: kill handler is **`kill`**, not `killedEntity`.

## CustomNPCs — event fields

### `PlayerEvent$DamagedEntityEvent`
- `player`
- `target`
- `damage`
- `damageSource` (`IDamageSource`)

### `PlayerEvent$DamagedEvent`
- `player`
- `source`
- `damage`
- `damageSource`
- `clearTarget`

### `PlayerEvent$DiedEvent`
- `player`
- `source`
- `type`
- `damageSource`

### `PlayerEvent$KilledEntityEvent`
- `player`
- `entity`  (**not** `target`)

## CustomNPCs — entity / storage

- `EntitiesType.PLAYER = 1`
- `IEntity.getType()`, `getUUID()`, `getName()`, `getX/Y/Z()`, `getWorld()`, `getTempdata()`, `getStoreddata()`, `getMCEntity()`
- `IPlayer.message(String)`, `getMCEntity()` returns `ServerPlayer` on `PlayerWrapper`
- `IWorld.getStoreddata()`, `getPlayer(String)`, `getAllPlayers()`, `getName()`
- `NpcAPI.Instance().getIWorld(String)` builds `new ResourceLocation(dimension)` and matches level dimension id  
  Verified working key form: `minecraft:overworld`
- `IData`: `put`, `get`, `has`, `remove`, `getKeys`, `clear`

## CustomNPCs — IDamageSource

- `getType()`
- `getTrueSource()`
- `getImmediateSource()`
- `isProjectile()`
- `isUnblockable()`
- `getMCDamageSource()`

No `getMsgId()` in this jar.

## DragonMineZ 2.1.3 — stats access

```java
StatsProvider.get(StatsCapability.INSTANCE, entity) -> LazyOptional<StatsData>
```

`StatsData` verified methods used by rival scripts:

- `getBattlePower(): float`
- `getBattlePowerExact(): double`
- `getCurrentStatValue(String)`  // uppercases; keys STR/SKP/RES/VIT/PWR/ENE
- `getMeleeDamage()`, `getStrikeDamage()`, `getKiDamage()`
- `getStatScaling(String)`
- `getResources()`, `getBonusStats()`, `getStats()`, `getStatus()`, `getSkills()`

`Stats` (from `getStats()`):

- `getStrength()`, `getStrikePower()`, `getResistance()`, `getVitality()`, `getKiPower()`, `getEnergy()`
- `setStat(String,int)` accepts lowercase keys: `str|skp|res|vit|pwr|ene`

There is **no** `StatsData.getStat(String)`.

## DragonMineZ — Resources

- `addTrainingPoints(float)`
- `addTrainingPoints(float, boolean)`
- `getTrainingPoints(): float`
- `getPowerRelease(): int`
- `setPowerRelease(int)`
- `getRelease(): int`
- `getReleaseLimit(): int`

## DragonMineZ — BonusStats

Initialized keys: `STR`, `SKP`, `DEF`, `STM`, `VIT`, `PWR`, `ENE`

Methods:

- `addBonus(String stat, String name, String operation, double value)`
- `addBonus(..., boolean applyMultipliers)`
- `addBonusSplit(String stat, String name, String operation, double value, boolean applyMultipliers)`  
  If `stat` equalsIgnoreCase `"RES"`, applies to both `DEF` and `STM`
- `removeBonus(String stat, String name)`
- `removeBonusSplit(String stat, String name)`
- operations handled in `calculateBonus`: `+`, `-`, `*`

## DragonMineZ — network sync

- `StatsSyncS2C(ServerPlayer)`
- `NetworkHandler.sendToTrackingEntityAndSelf(MSG, Entity)`

`PlayerWrapper.getMCEntity()` is declared as `ServerPlayer`, so constructing `new StatsSyncS2C(player.getMCEntity())` matches the jar.

## DragonMineZ — fusion status (for later modules)

`Status`:

- `isFused()`
- `isFusionLeader()`
- `getFusionPartnerUUID()`
- `getFusionType()`
- `getFusionName()`
- `isChargingKi()`
- `isAuraActive()`

## DragonMineZ — ki projectile class

`com.dragonminez.common.init.entities.ki.AbstractKiProjectile` exists.

`IDamageSource.getImmediateSource()` can be tested with `AbstractKiProjectile.class.isInstance(...)`.

## No released-BP helper in StatsData

Jar has base BP + `Resources.getPowerRelease()`, but no `getReleasedBattlePower()` method.
Released BP must be computed as:

`getBattlePowerExact() * (getPowerRelease() / 100.0)`  
(with the same release normalization your working Sparring script already uses when values are stored as 1.0–2.0).
