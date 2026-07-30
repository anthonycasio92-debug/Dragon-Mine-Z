# DMZ 2.1.3 — Quick cheatsheet for this repo’s scripts

## Get stats

```javascript
var StatsProvider = Java.type("com.dragonminez.common.stats.StatsProvider");
var StatsCapability = Java.type("com.dragonminez.common.stats.StatsCapability");
var data = StatsProvider.get(StatsCapability.INSTANCE, player.getMCEntity()).orElse(null);
```

## Battle power / release

```javascript
var bp = Number(data.getBattlePowerExact()); // prefer Exact
if (isNaN(bp)) bp = Number(data.getBattlePower());
var release = Number(data.getResources().getPowerRelease()); // often 0-100
var releasedBp = bp * (release / 100.0);
```

## Award TP + sync

```javascript
var StatsSyncS2C = Java.type("com.dragonminez.common.network.S2C.StatsSyncS2C");
var NetworkHandler = Java.type("com.dragonminez.common.network.NetworkHandler");
data.getResources().addTrainingPoints(amount);
var mc = player.getMCEntity();
NetworkHandler.sendToTrackingEntityAndSelf(new StatsSyncS2C(mc), mc);
```

## Flight mode

```javascript
var mode = Number(data.getStatus().getFlightMode());
// 0 = Search Flight, 1 = Combat Flight
```

## Ki damage check

```javascript
var MainDamageTypes = Java.type("com.dragonminez.common.init.MainDamageTypes");
var isKi = MainDamageTypes.isKiblastDamage(damageSource);
```

## Beam clash

```javascript
var BeamClashManager = Java.type("com.dragonminez.common.combat.clash.BeamClashManager");
if (BeamClashManager.isClashing(java.util.UUID.fromString(player.getUUID()))) {
    // mid-clash — sparring/rival damage proxies may be unreliable
}
```

## Skills

```javascript
var skills = data.getSkills();
var flyLvl = skills.getSkillLevel("fly");
skills.setSkillLevel("prestige", Math.max(0, fabledPrestigeLevel - 1));
```

## Where used in this repo

| Area | Scripts |
|---|---|
| Rival TP / BP / release | `Rival System.js` |
| Sparring BP / ki / clash | `Sparring Tp System.js` |
| Flight soft-cap | `flight suppression.js` |
| End settle TP / ki attacks | `End Dimension Strength.js` |
| Prestige skill sync | `Fabled Sync.js` |
| Race wipe / class perms | `DMZ RACE LOCK.js`, `DMZ Class Permission.js` |
| Sprint/jump | `SprintJump.js` |
