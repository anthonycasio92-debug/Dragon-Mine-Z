/*
============================================================
 DBZ Legacy Reborn - Android Conversion
 Version: 2.0.0

 Trigger ID: 45

 Console:
   noppes script trigger 45 <playerName>

 Fabled / NPC:
   noppes script trigger 45 {target}

 WHY THIS EXISTS:
 The normal Dr. Gero NPC path (NPCActionC2S.handleGero) was
 disabled on this server. This script performs the SAME
 DragonMineZ 2.1.3 conversion steps directly:

   1. setAndroidUpgraded(true)
   2. setSkillLevel("androidforms", 1)
   3. removeSkill("superforms")
   4. removeSkill("legendaryforms")
   5. updateTransformationSkillLimits(race)
   6. select + activate androidforms.androidbase
   7. clearActiveStackForm()
   8. refresh player + sync stats

 PLACE THIS in the same CustomNPCs script-slot as other
 trigger handlers (NOT Global Player).
============================================================
*/

var NpcAPI = Java.type("noppes.npcs.api.NpcAPI");
var StatsProvider = Java.type("com.dragonminez.common.stats.StatsProvider");
var StatsCapability = Java.type("com.dragonminez.common.stats.StatsCapability");
var StatsSyncS2C = Java.type("com.dragonminez.common.network.S2C.StatsSyncS2C");
var NetworkHandler = Java.type("com.dragonminez.common.network.NetworkHandler");
var ConfigManager = Java.type("com.dragonminez.common.config.ConfigManager");

var TRIGGER_ID = 45;
var COLOR = "\u00A7";

/*
 * If true, only races listed in ALLOWED_RACES can convert.
 * If false, any non-android player can convert (except blocked races).
 */
var REQUIRE_ALLOWED_RACE = true;
var ALLOWED_RACES = [
    "human"
];

/*
 * Extra safety: never convert these races even if allowed list is open.
 */
var BLOCKED_RACES = [
    "bioandroid"
];

var ANDROID_FORM_GROUP = "androidforms";
var ANDROID_BASE_FORM = "androidbase";
var ANDROID_FORM_SKILL_LEVEL = 1;

var REMOVE_SKILLS = [
    "superforms",
    "legendaryforms"
];

/* ========================= HELPERS ========================= */

function logLine(text) {
    try {
        print("[Android Trigger 45] " + text);
    } catch (ignored) {}
}

function tell(player, text) {
    try {
        player.message(text);
    } catch (ignored) {}
}

function str(value) {
    if (value == null) return "";
    return String(value);
}

function lower(value) {
    return str(value).toLowerCase();
}

function getTargetName(event) {
    try {
        if (event.arguments != null && event.arguments.length > 0) {
            var a0 = str(event.arguments[0]).replace(/^\s+|\s+$/g, "");
            if (a0 != "" && lower(a0) != "null") return a0;
        }
    } catch (ignored1) {}

    try {
        if (event.args != null && event.args.length > 0) {
            var b0 = str(event.args[0]).replace(/^\s+|\s+$/g, "");
            if (b0 != "" && lower(b0) != "null") return b0;
        }
    } catch (ignored2) {}

    /*
     * Some CNPC trigger setups put the player on event.entity / event.player.
     */
    try {
        if (event.entity != null && typeof event.entity.getName == "function") {
            return str(event.entity.getName());
        }
    } catch (ignored3) {}

    try {
        if (event.player != null && typeof event.player.getName == "function") {
            return str(event.player.getName());
        }
    } catch (ignored4) {}

    return "";
}

function findOnlinePlayer(name) {
    var wanted = lower(name);
    if (wanted == "") return null;

    var worlds = NpcAPI.Instance().getIWorlds();
    for (var w = 0; w < worlds.length; w++) {
        try {
            var players = worlds[w].getAllPlayers();
            for (var p = 0; p < players.length; p++) {
                if (lower(players[p].getName()) == wanted) {
                    return players[p];
                }
            }
        } catch (ignored) {}
    }

    return null;
}

function listContains(list, value) {
    var needle = lower(value);
    for (var i = 0; i < list.length; i++) {
        if (lower(list[i]) == needle) return true;
    }
    return false;
}

function getDMZData(mcPlayer) {
    try {
        return StatsProvider
            .get(StatsCapability.INSTANCE, mcPlayer)
            .orElse(null);
    } catch (e) {
        return null;
    }
}

function getRaceName(character) {
    try {
        return str(character.getRaceName());
    } catch (e) {}

    try {
        return str(character.getRace());
    } catch (e2) {}

    return "";
}

function raceAllowsAndroidForms(raceName) {
    try {
        var cfg = ConfigManager.getRaceCharacter(raceName);
        if (cfg == null) return false;

        var costs = cfg.getFormSkillTpCosts(ANDROID_FORM_GROUP);
        return costs != null && costs.length > 0;
    } catch (e) {
        return false;
    }
}

function refreshPlayer(mcPlayer) {
    try {
        if (typeof mcPlayer.refreshDimensions == "function") {
            mcPlayer.refreshDimensions();
            return;
        }
    } catch (e) {}

    try {
        if (typeof mcPlayer.m_6210_ == "function") {
            mcPlayer.m_6210_();
        }
    } catch (e2) {}
}

function syncDMZ(mcPlayer) {
    try {
        NetworkHandler.sendToTrackingEntityAndSelf(
            new StatsSyncS2C(mcPlayer),
            mcPlayer
        );
        return;
    } catch (e) {}

    try {
        NetworkHandler.sendToPlayer(
            new StatsSyncS2C(mcPlayer),
            mcPlayer
        );
    } catch (e2) {}
}

/* ========================= CONVERSION ========================= */

/*
 * Direct reimplementation of DragonMineZ 2.1.3 NPCActionC2S.handleGero
 * action id 1, without depending on the Gero NPC / disabled packet path.
 */
function convertToAndroid(player, mcPlayer, data) {
    var character = data.getCharacter();
    var status = data.getStatus();
    var skills = data.getSkills();

    if (character == null || status == null || skills == null) {
        throw "Missing character/status/skills data.";
    }

    if (status.isAndroidUpgraded() === true) {
        tell(
            player,
            COLOR + "c[Android] " + COLOR + "fYou are already an Android."
        );
        return false;
    }

    var raceName = getRaceName(character);
    if (raceName == "") {
        throw "Could not read player race.";
    }

    if (listContains(BLOCKED_RACES, raceName)) {
        tell(
            player,
            COLOR + "c[Android] " + COLOR + "f" + raceName +
            " cannot be android-upgraded."
        );
        return false;
    }

    if (REQUIRE_ALLOWED_RACE && !listContains(ALLOWED_RACES, raceName)) {
        /*
         * Soft fallback: if race has androidforms configured in DMZ,
         * allow it even when not listed (covers renamed human configs).
         */
        if (!raceAllowsAndroidForms(raceName)) {
            tell(
                player,
                COLOR + "c[Android] " + COLOR + "fOnly humans can be converted."
            );
            return false;
        }
    }

    status.setAndroidUpgraded(true);

    skills.setSkillLevel(ANDROID_FORM_GROUP, ANDROID_FORM_SKILL_LEVEL);

    for (var i = 0; i < REMOVE_SKILLS.length; i++) {
        try {
            skills.removeSkill(REMOVE_SKILLS[i]);
        } catch (removeErr) {}
    }

    try {
        data.updateTransformationSkillLimits(raceName);
    } catch (limitErr) {
        logLine("updateTransformationSkillLimits failed: " + limitErr);
    }

    character.setSelectedFormGroup(ANDROID_FORM_GROUP);
    character.setSelectedForm(ANDROID_BASE_FORM);
    character.setActiveForm(ANDROID_FORM_GROUP, ANDROID_BASE_FORM);

    try {
        character.clearActiveStackForm();
    } catch (stackErr) {}

    refreshPlayer(mcPlayer);
    syncDMZ(mcPlayer);

    tell(
        player,
        COLOR + "a[Android] " + COLOR + "fConversion complete. " +
        COLOR + "7Android forms unlocked."
    );

    return true;
}

/* ========================= TRIGGER ========================= */

function trigger(event) {
    if (event == null) return;

    try {
        if (Number(event.id) != Number(TRIGGER_ID)) return;
    } catch (idErr) {
        return;
    }

    var targetName = getTargetName(event);
    if (targetName == "") {
        logLine("Missing player name. Use: noppes script trigger 45 PlayerName");
        return;
    }

    var player = findOnlinePlayer(targetName);
    if (player == null) {
        logLine("Online player not found: " + targetName);
        return;
    }

    try {
        var mcPlayer = player.getMCEntity();
        if (mcPlayer == null) {
            tell(player, COLOR + "c[Android] Could not read Minecraft player.");
            return;
        }

        var data = getDMZData(mcPlayer);
        if (data == null) {
            tell(
                player,
                COLOR + "c[Android] DragonMineZ data could not be loaded."
            );
            return;
        }

        var ok = convertToAndroid(player, mcPlayer, data);
        if (ok) {
            logLine(
                "Converted " + player.getName() +
                " via direct Android upgrade path."
            );
        }

    } catch (err) {
        tell(player, COLOR + "c[Android Trigger Error] " + COLOR + "f" + err);
        logLine("Error for " + targetName + ": " + err);
    }
}