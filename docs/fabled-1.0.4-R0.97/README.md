# Fabled 1.0.4-R0.97-SNAPSHOT — Script API Reference

Persisted reference for the MageMonkey **Fabled** Bukkit plugin
(`studio.magemonkey.fabled`) used by this pack’s CNPC / Arclight scripts.

## Artifact identity

| Item | Value |
|---|---|
| Plugin jar | `fabled-1.0.4-R0.97-SNAPSHOT.jar` (~1.3 MB) |
| Version | `1.0.4-R0.97-SNAPSHOT` (Maven build `20260725.042800-1`) |
| Main class | `studio.magemonkey.fabled.Fabled` |
| Hard depend | **CodexCore** (`codex-1.2.0-R0.1-SNAPSHOT.jar`, ~2.0 MB) |
| Provides | `SkillAPI`, `ProSkillAPI` |
| SHA-256 | see [`jar-sha256.txt`](jar-sha256.txt) |
| Class count | ~688 (`class-list.txt`) |
| Direct `Java.type` / `loadClass` usage | [`classes-used-by-scripts.txt`](classes-used-by-scripts.txt) |

Jars are **not** committed. Keep both Fabled and CodexCore in the server
`plugins/` folder. Fabled’s POM pins Codex `1.2.0-R0.1-SNAPSHOT`.

Source: [Maven snapshots](https://repo.travja.dev/snapshots/studio/magemonkey/fabled/) ·
[GitHub](https://github.com/magemonkeystudio/fabled) ·
[Hangar](https://hangar.papermc.io/VoidEdge/Fabled) (may lag Maven)

Decompiled sources: [`src/`](src/) (CFR). Public dumps: [`javap/`](javap/).

---

## How this pack loads Fabled from CNPC

Arclight / hybrid: Bukkit plugin classloader ≠ Nashorn/CNPC classloader.
Scripts therefore:

1. `Bukkit.getPluginManager().getPlugin("Fabled")`
2. `plugin.getClass().getClassLoader().loadClass("studio.magemonkey.fabled.Fabled")`
3. Reflect `getData(OfflinePlayer)` / `getSkills()`
4. Call instance methods on the returned `PlayerData`

See `Fabled Sync.js`, `DMZ Class Permission.js`, `DMZ RACE LOCK.js`,
`Attr Fabled *.js`, `DMZ Fabled Bridge.js`.

```javascript
var Bukkit = Java.type("org.bukkit.Bukkit");
var plugin = Bukkit.getPluginManager().getPlugin("Fabled");
if (plugin == null || !plugin.isEnabled()) return;

var loader = plugin.getClass().getClassLoader();
var Fabled = loader.loadClass("studio.magemonkey.fabled.Fabled");

// static Fabled.getData(OfflinePlayer)
var getData = null;
var methods = Fabled.getMethods();
for (var i = 0; i < methods.length; i++) {
    if (methods[i].getName() == "getData" &&
        methods[i].getParameterTypes().length == 1) {
        getData = methods[i];
        break;
    }
}
var fabledData = getData.invoke(null, bukkitPlayer);
```

---

## Core API used by this repo

### `Fabled` (static)

| Method | Notes |
|---|---|
| `getData(OfflinePlayer)` | → `PlayerData` |
| `getSkills()` | → `Map<String, Skill>` registered skills |
| `getSkill(String)` | single skill |
| `getClass(String)` / `getClasses()` | registered `FabledClass` defs |
| `getPlayerAccounts(OfflinePlayer)` | multi-account |
| `inst()` / `isLoaded()` | plugin instance / ready |

### `PlayerData`

| Method | Used for |
|---|---|
| `getSkillLevel(String)` | Race lock, class perms, skill gates |
| `getClass(String)` | Prestige / faction class sync |
| `getMainClass()` / `getClasses()` | Class inspection |
| `getAttribute(String)` | Attr → DMZ bonus (`str`, `skp`, `res`, `vit`, `pwr`, `ene`, …) |
| `getAttributes()` | Full attr map |
| `hasSkill` / `getSkill` / `giveSkill` | Skill ownership |
| `giveLevels` / `setLevel` / `giveExp` | Progression (via `PlayerClass` too) |

### `PlayerClass`

| Method | Notes |
|---|---|
| `getLevel()` / `setLevel(int)` | Prestige level sync |
| `getData()` | → `FabledClass` definition |

Permissions used by Class Permission script: `fabled.skill.<name>`.

---

## Scripts that depend on Fabled

| Script | Role |
|---|---|
| `Fabled Sync.js` | Prestige class level ↔ DMZ prestige skill (+ faction/value cleaner) |
| `DMZ Class Permission.js` | DMZ class → LuckPerms `fabled.skill.*` |
| `DMZ RACE LOCK.js` | Require Fabled skill level ≥ 1 for race |
| `Attr Fabled bonus stats.js` / `Attr Fabled Multi bonus.js` | Attributes → DMZ bonuses |
| `DMZ Fabled Bridge.js` | Shared bridge helpers |
| `TP IS SP Fabled.js` | TP / SP related Fabled hooks |
| `Sparring Tp System.js` | Prestige class lookup |

Install note: use **`Fabled Sync.js` only** — do not also load a separate
`Prestige Sync Fabled.js`.

---

## Layout

```
docs/fabled-1.0.4-R0.97/
  README.md
  SCRIPT-CHEATSHEET.md
  jar-sha256.txt          # Fabled + matching CodexCore
  class-list.txt
  package-summary.txt
  classes-used-by-scripts.txt
  javap/
  src/studio/magemonkey/fabled/…
```
