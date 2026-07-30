# DragonMineZ 2.1.3 — Script API Reference

Persisted reference for CustomNPCs / server scripts in this repo.
All current Legacy Reborn scripts target **DMZ 2.1.3**.

## Artifact identity

| Item | Value |
|---|---|
| Mod jar | `dragonminez-2.1.3.jar` (~59 MB) |
| SHA-256 | see [`jar-sha256.txt`](jar-sha256.txt) |
| Class count | ~1523 (`class-list.txt`) |
| Classes used by this repo’s scripts | [`classes-used-by-scripts.txt`](classes-used-by-scripts.txt) |

The full jar is **not** committed (too large for git). Keep a copy of
`dragonminez-2.1.3.jar` next to your server mods and verify against
`jar-sha256.txt` when upgrading.

Decompiled sources for the classes scripts touch most often are under
[`src/`](src/) (CFR). Public method dumps are under [`javap/`](javap/).

---

## Standard CNPC access pattern

```javascript
var StatsProvider = Java.type("com.dragonminez.common.stats.StatsProvider");
var StatsCapability = Java.type("com.dragonminez.common.stats.StatsCapability");
var StatsSyncS2C = Java.type("com.dragonminez.common.network.S2C.StatsSyncS2C");
var NetworkHandler = Java.type("com.dragonminez.common.network.NetworkHandler");

function getDMZ(player) {
    var mc = player.getMCEntity();
    return StatsProvider.get(StatsCapability.INSTANCE, mc).orElse(null);
}

function syncStats(player) {
    var mc = player.getMCEntity();
    NetworkHandler.sendToTrackingEntityAndSelf(new StatsSyncS2C(mc), mc);
}
```

`StatsData` only attaches to **players**. Mobs/dragons cannot hold DMZ HP.

---

## Core objects

### `StatsData` (`data`)
From: `StatsProvider.get(StatsCapability.INSTANCE, mcPlayer).orElse(null)`

Common getters used by scripts:

| Method | Notes |
|---|---|
| `getLevel()` | Player level (TP scaling curves) |
| `getBattlePower()` | float BP |
| `getBattlePowerExact()` | double BP — prefer this |
| `getMaxHealth()` / `getDefense()` / `getMeleeDamage()` / `getKiDamage()` | Combat stats |
| `calculatePostMitigationDamage(raw, isKi, …)` | Defense math |
| `getFormMultiplier("STR")` etc. | Form mults |
| `getTpTotalMultiplier()` / `getTpSourceMultiplier(TpSource)` | TP multipliers |
| `getStatus()` | → `Status` |
| `getResources()` | → `Resources` |
| `getSkills()` | → `Skills` |

Full dump: [`javap/com_dragonminez_common_stats_StatsData.txt`](javap/com_dragonminez_common_stats_StatsData.txt)

### `Status` (`data.getStatus()`)

**Flight modes (2.1.3):**

| Constant | Value | Meaning |
|---|---|---|
| `Status.FLIGHT_SEARCH` | `0` | Search Flight |
| `Status.FLIGHT_COMBAT` | `1` | Combat Flight |

```javascript
var mode = Number(status.getFlightMode()); // 0 or 1
status.setFlightMode(0);
```

Other flags used by scripts: `isChargingKi()`, `isBlocking()`, `isFused()`,
`isAndroidUpgraded()`, `hasActiveShadowDummy()`, fusion / potara fields.

### `Resources` (`data.getResources()`)

| Method | Use |
|---|---|
| `getTrainingPoints()` / `addTrainingPoints(float)` / `removeTrainingPoints(float)` | TP awards |
| `addTrainingPoints(float, boolean)` | overload with flag |
| `getPowerRelease()` / `setPowerRelease(int)` | Release % (0–100 style) |
| `getCurrentEnergy()` / `getCurrentStamina()` / `getCurrentPoise()` | Pools |

**Important:** `addTrainingPoints` applies DMZ STORY/global multipliers.
Scripts that need chat to show the *final* granted amount must measure
TP before/after, or use source-aware APIs when available.

### `Skills` (`data.getSkills()`)

```javascript
skills.getSkillLevel("fly");
skills.hasSkill("prestige");
skills.setSkillLevel("prestige", level);
skills.isSkillActive("fly");
```

---

## Combat / Ki

| Class | Use |
|---|---|
| `com.dragonminez.common.init.MainDamageTypes` | `isKiblastDamage(DamageSource)`, `isStrikeAttackDamage(...)` |
| `com.dragonminez.common.init.entities.ki.AbstractKiProjectile` | instanceof checks for ki projectiles |
| `KiBlastEntity` / `KiLaserEntity` | spawn / detect blasts & beams |
| `com.dragonminez.common.combat.clash.BeamClashManager` | `isClashing(UUID)` — damage during clash |

CNPC `event.damage` on hurt is often **pre-mitigation** DMZ amount.
For fair scoring (Rival challenges), measure **HP/absorption actually lost**.

---

## TP sources (`TpSource` enum)

`STORY`, `PASSIVE`, `TRAVEL`, `MINED`, `CRAFTED`, `KILL`, `HIT`

Used with `data.getTpSourceMultiplier(TpSource.KILL)` etc.

---

## Sync after mutation

After changing TP / skills / stats on a player:

```javascript
NetworkHandler.sendToTrackingEntityAndSelf(new StatsSyncS2C(mcPlayer), mcPlayer);
// Race/progression wipes may also need ProgressionSyncS2C
```

---

## Files in this folder

| Path | Contents |
|---|---|
| `README.md` | This guide |
| `jar-sha256.txt` | Hash of the 2.1.3 jar used to generate dumps |
| `class-list.txt` | All `com.dragonminez.*` classes in the jar |
| `package-summary.txt` | Counts by package |
| `classes-used-by-scripts.txt` | Classes referenced by repo `.js` files |
| `javap/` | `javap -public` dumps of key classes |
| `src/` | CFR-decompiled sources for those key classes |

---

## Regenerating from a jar

```bash
JAR=/path/to/dragonminez-2.1.3.jar
sha256sum "$JAR"
jar tf "$JAR" | rg '^com/dragonminez/.*\.class$' | sed 's|/|.|g;s|\.class$||' | sort
javap -classpath "$JAR" -public com.dragonminez.common.stats.StatsData
# CFR decompile optional for src/
```
