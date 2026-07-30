# Fabled 1.0.4-R0.97 — Quick cheatsheet for this repo’s scripts

## Load Fabled through its plugin classloader

```javascript
var Bukkit = Java.type("org.bukkit.Bukkit");
var plugin = Bukkit.getPluginManager().getPlugin("Fabled");
if (plugin == null || !plugin.isEnabled()) return null;

var loader = plugin.getClass().getClassLoader();
var Fabled = loader.loadClass("studio.magemonkey.fabled.Fabled");

function findStatic(cls, name, arity) {
    var methods = cls.getMethods();
    for (var i = 0; i < methods.length; i++) {
        if (methods[i].getName() == name &&
            methods[i].getParameterTypes().length == arity) {
            return methods[i];
        }
    }
    return null;
}

var getData = findStatic(Fabled, "getData", 1);
var fabledData = getData.invoke(null, bukkitPlayer);
```

## Skill level gate

```javascript
var level = Number(fabledData.getSkillLevel("Warrior"));
if (isNaN(level) || level < 1) {
    // blocked
}
```

## Prestige class level

```javascript
var prestige = fabledData.getClass("Prestige");
if (prestige == null) prestige = fabledData.getClass("prestige");
var lvl = prestige != null ? Number(prestige.getLevel()) : 0;
// DMZ prestige skill is usually fabledLevel - 1
```

## Attributes → numbers

```javascript
var str = Number(fabledData.getAttribute("str"));
var vit = Number(fabledData.getAttribute("vit"));
var pwr = Number(fabledData.getAttribute("pwr"));
var ene = Number(fabledData.getAttribute("ene"));
var res = Number(fabledData.getAttribute("res"));
var skp = Number(fabledData.getAttribute("skp"));
```

## Registered skills map

```javascript
var getSkills = findStatic(Fabled, "getSkills", 0);
var skillMap = getSkills.invoke(null); // Map<String, Skill>
```

## Permissions

| Node | Use |
|---|---|
| `fabled.skill.<skill>` | Class Permission grants these via LuckPerms |
| `fabled.basic` | Cast / skill trees (default true) |

## Required plugins

1. `codex-1.2.0-R0.1-SNAPSHOT.jar` (plugin name **CodexCore**)
2. `fabled-1.0.4-R0.97-SNAPSHOT.jar` (plugin name **Fabled**)

Checksums: [`jar-sha256.txt`](jar-sha256.txt)
