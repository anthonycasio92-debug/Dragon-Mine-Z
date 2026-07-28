/*
 * ============================================================
 * DMZ Class -> Fabled Skill Permission via LuckPerms
 * Version: 3.0.0
 *
 * PLACE AS: CustomNPCs Global Player Script
 * Enable: Tick
 *
 * PURPOSE:
 * - Reads the player's current DMZ class.
 * - Finds the registered Fabled skill with the matching name/key.
 * - Grants that Fabled skill permission through LuckPerms.
 * - Removes old class permissions when the player changes class.
 * - Preserves a permission when the player owns the matching
 *   "<Class Name> Prestige" Fabled skill.
 *
 * EXAMPLES:
 *   DMZ class ID:  warrior
 *   Fabled skill:  Warrior
 *   Permission:    fabled.skill.warrior
 *   Command:       lp user PlayerName permission set fabled.skill.warrior
 *
 *   DMZ class ID:  martialartist
 *   Fabled skill:  Martial Artist
 *   Permission:    fabled.skill.martial-artist
 *   Prestige skill: Martial Artist Prestige
 *
 * PRESTIGE RULE:
 * - No Prestige skill: current class permission is added,
 *   old class permissions are removed.
 * - Owns "<Class> Prestige": that permission is not added or
 *   removed by this script; a previously managed permission
 *   is retained.
 *
 * IMPORTANT:
 * The corresponding base Fabled skills must have:
 *     needs-permission: true
 *
 * Style matches Spirtualist Ki Control.js (CNPC Global Player).
 * ============================================================
 */


/*
 * ============================================================
 * SETTINGS
 * ============================================================
 */

/*
 * Same tick-counter structure as the working Fabled attribute
 * scripts (about once per second at 20 TPS).
 */
var TICK_INTERVAL = 20;

/*
 * LuckPerms command alias.
 * Leading slash omitted - Bukkit dispatchCommand does not use it.
 */
var LUCKPERMS_COMMAND = "lp";

/*
 * Fabled appends this to the base class skill name for Prestige.
 * Warrior -> Warrior Prestige
 * Martial Artist -> Martial Artist Prestige
 */
var PRESTIGE_SKILL_SUFFIX = " Prestige";

/*
 * Exact root used by Fabled's needs-permission system.
 */
var FABLED_SKILL_PERMISSION_ROOT = "fabled.skill.";

/*
 * Keep false on live. When true, messages only fire on
 * class/skill state changes, LuckPerms commands, or errors.
 */
var DEBUG = false;


/*
 * ============================================================
 * DATA KEYS
 * ============================================================
 */

/*
 * Persists through logout/restart.
 * Pipe-separated base Fabled skill names this script managed.
 */
var MANAGED_SKILLS_KEY =
    "dmz_fabled_class_permissions_v3_managed";

var TICK_KEY =
    "dmz_fabled_class_permissions_v3_tick";

var DEBUG_STATE_KEY =
    "dmz_fabled_class_permissions_v3_state";

var ERROR_KEY =
    "dmz_fabled_class_permissions_v3_error";


/*
 * ============================================================
 * BASIC HELPERS
 * ============================================================
 */

function sendDebug(player, message) {
    if (!DEBUG) {
        return;
    }

    try {
        player.message(
            "\u00A76[Class Permission] \u00A77" +
            message
        );
    } catch (e) {}
}

function normalizeName(value) {
    if (value == null) {
        return "";
    }

    var text = "";
    try {
        text = "" + value;
    } catch (e) {
        return "";
    }

    /* Strip Minecraft formatting codes. */
    text = text.replace(/\u00A7./g, "");
    text = text.toLowerCase();

    /*
     * Martial Artist, martialartist, martial_artist and
     * martial-artist all become martialartist.
     */
    text = text.replace(/[^a-z0-9]/g, "");
    return text;
}

function endsWithIgnoreCase(text, suffix) {
    if (text == null || suffix == null) {
        return false;
    }

    var lowerText = ("" + text).toLowerCase();
    var lowerSuffix = ("" + suffix).toLowerCase();

    if (lowerText.length < lowerSuffix.length) {
        return false;
    }

    return (
        lowerText.substring(
            lowerText.length - lowerSuffix.length
        ) == lowerSuffix
    );
}

function containsValue(array, value) {
    if (array == null) {
        return false;
    }

    var wanted = ("" + value).toLowerCase();
    var i;
    for (i = 0; i < array.length; i++) {
        if (("" + array[i]).toLowerCase() == wanted) {
            return true;
        }
    }
    return false;
}

function addUnique(array, value) {
    if (array == null || value == null || value == "") {
        return;
    }

    if (!containsValue(array, value)) {
        array[array.length] = "" + value;
    }
}


/*
 * ============================================================
 * PERMISSION FORMAT
 * ============================================================
 *
 * Mirrors Fabled's needs-permission generation:
 * 1. Lowercase the displayed skill name.
 * 2. Replace spaces with hyphens.
 * 3. Prefix with fabled.skill.
 */

function getSkillPermission(skillName) {
    if (skillName == null) {
        return "";
    }

    var formatted =
        ("" + skillName)
            .toLowerCase()
            .replace(/ /g, "-");

    if (formatted == "") {
        return "";
    }

    return FABLED_SKILL_PERMISSION_ROOT + formatted;
}


/*
 * ============================================================
 * MANAGED SKILL STORAGE
 * ============================================================
 */

function readManagedSkills(player) {
    var result = [];

    try {
        var stored = player.getStoreddata();
        if (
            stored == null ||
            !stored.has(MANAGED_SKILLS_KEY)
        ) {
            return result;
        }

        var raw = "" + stored.get(MANAGED_SKILLS_KEY);
        if (raw == "") {
            return result;
        }

        var entries = raw.split("|");
        var i;
        for (i = 0; i < entries.length; i++) {
            var skillName = ("" + entries[i]).trim();
            if (skillName != "") {
                addUnique(result, skillName);
            }
        }
    } catch (e) {}

    return result;
}

function writeManagedSkills(player, skills) {
    try {
        var stored = player.getStoreddata();
        if (stored == null) {
            return;
        }

        var output = "";
        var i;
        for (i = 0; i < skills.length; i++) {
            var skillName = ("" + skills[i]).trim();
            if (skillName == "") {
                continue;
            }
            if (output != "") {
                output += "|";
            }
            output += skillName;
        }

        if (output == "") {
            stored.remove(MANAGED_SKILLS_KEY);
        } else {
            stored.put(MANAGED_SKILLS_KEY, output);
        }
    } catch (e) {}
}


/*
 * ============================================================
 * FABLED CONNECTION
 * ============================================================
 *
 * Same Bukkit + Fabled classloader pattern as Race Lock /
 * Fabled attribute scripts.
 */

function getFabledContext(player) {
    var Bukkit = Java.type("org.bukkit.Bukkit");
    var UUID = Java.type("java.util.UUID");

    var bukkitPlayer = Bukkit.getPlayer(
        UUID.fromString("" + player.getUUID())
    );
    if (bukkitPlayer == null) {
        return null;
    }

    var plugin =
        Bukkit.getPluginManager().getPlugin("Fabled");
    if (plugin == null || !plugin.isEnabled()) {
        return null;
    }

    var loader = plugin.getClass().getClassLoader();
    var fabledClass = loader.loadClass(
        "studio.magemonkey.fabled.Fabled"
    );

    var getDataMethod = null;
    var getSkillsMethod = null;
    var methods = fabledClass.getMethods();
    var i;
    for (i = 0; i < methods.length; i++) {
        var method = methods[i];
        var methodName = String(method.getName());
        var parameterCount =
            method.getParameterTypes().length;

        if (
            methodName == "getData" &&
            parameterCount == 1
        ) {
            getDataMethod = method;
        }
        if (
            methodName == "getSkills" &&
            parameterCount == 0
        ) {
            getSkillsMethod = method;
        }
    }

    if (getDataMethod == null || getSkillsMethod == null) {
        return null;
    }

    var fabledData = getDataMethod.invoke(
        null,
        bukkitPlayer
    );
    if (fabledData == null) {
        return null;
    }

    try {
        if (!fabledData.isInit()) {
            return null;
        }
    } catch (ignoredInitError) {}

    var emptyArguments = Java.to(
        [],
        "java.lang.Object[]"
    );
    var skillMap = getSkillsMethod.invoke(
        null,
        emptyArguments
    );
    if (skillMap == null) {
        return null;
    }

    var skills = skillMap.values().toArray();

    return {
        bukkit: Bukkit,
        bukkitPlayer: bukkitPlayer,
        plugin: plugin,
        data: fabledData,
        skills: skills
    };
}


/*
 * ============================================================
 * DMZ CONNECTION
 * ============================================================
 */

function getDMZClass(player) {
    var StatsProvider = Java.type(
        "com.dragonminez.common.stats.StatsProvider"
    );
    var StatsCapability = Java.type(
        "com.dragonminez.common.stats.StatsCapability"
    );

    var mcPlayer = player.getMCEntity
        ? player.getMCEntity()
        : null;
    if (mcPlayer == null) {
        return "";
    }

    var lazy = StatsProvider.get(
        StatsCapability.INSTANCE,
        mcPlayer
    );
    if (lazy == null) {
        return "";
    }

    var dmzData = lazy.orElse(null);
    if (dmzData == null) {
        return "";
    }

    try {
        if (!dmzData.isDataLoaded()) {
            return "";
        }
    } catch (e) {
        return "";
    }

    try {
        var status = dmzData.getStatus();
        if (
            status == null ||
            !status.isHasCreatedCharacter()
        ) {
            return "";
        }
    } catch (e2) {
        return "";
    }

    try {
        var character = dmzData.getCharacter();
        if (character == null) {
            return "";
        }

        var className = character.getCharacterClass();
        if (className == null) {
            return "";
        }

        className = ("" + className).trim();
        if (
            className == "" ||
            className.toLowerCase() == "null"
        ) {
            return "";
        }

        return className;
    } catch (e3) {
        return "";
    }
}


/*
 * ============================================================
 * SKILL SEARCH
 * ============================================================
 *
 * Finds the registered base Fabled skill matching the DMZ
 * class ID (martialartist -> Martial Artist, warrior -> Warrior).
 * Never matches "... Prestige" as the base skill.
 */

function findBaseSkill(skills, dmzClass) {
    if (skills == null || dmzClass == null) {
        return null;
    }

    var normalizedClass = normalizeName(dmzClass);
    if (normalizedClass == "") {
        return null;
    }

    var i;
    for (i = 0; i < skills.length; i++) {
        var skill = skills[i];
        if (skill == null) {
            continue;
        }

        var skillName = "" + skill.getName();
        if (
            endsWithIgnoreCase(
                skillName,
                PRESTIGE_SKILL_SUFFIX
            )
        ) {
            continue;
        }

        var skillKey = "";
        try {
            skillKey = "" + skill.getKey();
        } catch (keyError) {}

        if (
            normalizeName(skillName) == normalizedClass ||
            normalizeName(skillKey) == normalizedClass
        ) {
            return skill;
        }
    }

    return null;
}


/*
 * ============================================================
 * PRESTIGE CHECK
 * ============================================================
 */

function getPrestigeSkillLevel(fabledData, baseSkillName) {
    if (
        fabledData == null ||
        baseSkillName == null ||
        baseSkillName == ""
    ) {
        return 0;
    }

    var prestigeSkillName =
        "" + baseSkillName + PRESTIGE_SKILL_SUFFIX;
    var level = 0;

    try {
        level = Number(
            fabledData.getSkillLevel(prestigeSkillName)
        );
    } catch (e) {
        level = 0;
    }

    if (isNaN(level) || level < 0) {
        level = 0;
    }

    return Math.floor(level);
}


/*
 * ============================================================
 * LUCKPERMS COMMANDS
 * ============================================================
 *
 * lp user Player permission set fabled.skill.warrior
 * lp user Player permission unset fabled.skill.warrior
 */

function runLuckPermsCommand(
    player,
    fabledContext,
    operation,
    permission
) {
    if (
        player == null ||
        fabledContext == null ||
        permission == null ||
        permission == ""
    ) {
        return false;
    }

    var playerName = "" + player.getName();
    var command =
        LUCKPERMS_COMMAND +
        " user " +
        playerName +
        " permission " +
        operation +
        " " +
        permission;

    var accepted = fabledContext.bukkit.dispatchCommand(
        fabledContext.bukkit.getConsoleSender(),
        command
    );

    if (!accepted) {
        throw (
            "LuckPerms rejected command: /" + command
        );
    }

    sendDebug(
        player,
        "Executed: \u00A7f/" + command
    );

    return true;
}

function playerHasPermission(fabledContext, permission) {
    if (
        fabledContext == null ||
        fabledContext.bukkitPlayer == null ||
        permission == null ||
        permission == ""
    ) {
        return false;
    }

    try {
        return (
            fabledContext.bukkitPlayer.hasPermission(
                permission
            ) === true
        );
    } catch (e) {
        return false;
    }
}


/*
 * ============================================================
 * MAIN SYNCHRONIZATION
 * ============================================================
 */

function synchronizeClassPermission(player) {
    var temp = player.getTempdata();

    var fabled = getFabledContext(player);
    if (fabled == null) {
        throw (
            "Fabled player data or registered skills were unavailable."
        );
    }

    var dmzClass = getDMZClass(player);

    var currentBaseSkill = null;
    var currentSkillName = "";
    var currentPermission = "";
    var currentPrestigeLevel = 0;

    if (dmzClass != "") {
        currentBaseSkill = findBaseSkill(
            fabled.skills,
            dmzClass
        );

        if (currentBaseSkill != null) {
            currentSkillName =
                "" + currentBaseSkill.getName();
            currentPermission = getSkillPermission(
                currentSkillName
            );
            currentPrestigeLevel = getPrestigeSkillLevel(
                fabled.data,
                currentSkillName
            );
        }
    }

    var previousManaged = readManagedSkills(player);
    var updatedManaged = [];

    /*
     * Remove old class permissions that are no longer current
     * and are not protected by Prestige.
     */
    var i;
    for (i = 0; i < previousManaged.length; i++) {
        var oldSkillName = "" + previousManaged[i];

        if (
            currentSkillName != "" &&
            normalizeName(oldSkillName) ==
                normalizeName(currentSkillName)
        ) {
            continue;
        }

        var oldPermission = getSkillPermission(
            oldSkillName
        );
        var oldPrestigeLevel = getPrestigeSkillLevel(
            fabled.data,
            oldSkillName
        );

        /*
         * Prestige protects this permission.
         * Keep tracking it so cleanup can happen later if
         * Prestige is ever removed.
         */
        if (oldPrestigeLevel >= 1) {
            addUnique(updatedManaged, oldSkillName);
            continue;
        }

        runLuckPermsCommand(
            player,
            fabled,
            "unset",
            oldPermission
        );
    }

    /*
     * Add or retain the current class permission.
     */
    if (
        currentBaseSkill != null &&
        currentSkillName != "" &&
        currentPermission != ""
    ) {
        var wasManaged = containsValue(
            previousManaged,
            currentSkillName
        );

        /*
         * Prestige owned: do not add or remove via this script.
         * Keep tracking only if we already managed it before.
         */
        if (currentPrestigeLevel >= 1) {
            if (wasManaged) {
                addUnique(
                    updatedManaged,
                    currentSkillName
                );
            }
        } else {
            /*
             * No Prestige - permission is temporary and tied
             * to the current DMZ class.
             */
            if (!wasManaged) {
                runLuckPermsCommand(
                    player,
                    fabled,
                    "set",
                    currentPermission
                );
            } else if (
                !playerHasPermission(
                    fabled,
                    currentPermission
                )
            ) {
                /*
                 * Confirm Bukkit can see the permission.
                 * If it is missing despite being tracked,
                 * set it again on this pass.
                 */
                runLuckPermsCommand(
                    player,
                    fabled,
                    "set",
                    currentPermission
                );
                sendDebug(
                    player,
                    "Re-applied missing permission: \u00A7f" +
                    currentPermission
                );
            }

            addUnique(updatedManaged, currentSkillName);
        }
    } else if (dmzClass != "" && currentBaseSkill == null) {
        sendDebug(
            player,
            "No Fabled base skill matched DMZ class: \u00A7f" +
            dmzClass
        );
    }

    writeManagedSkills(player, updatedManaged);

    var state =
        normalizeName(dmzClass) +
        "|" +
        normalizeName(currentSkillName) +
        "|" +
        currentPrestigeLevel +
        "|" +
        updatedManaged.join(",");

    var previousState = "";
    try {
        if (temp.has(DEBUG_STATE_KEY)) {
            previousState = "" + temp.get(DEBUG_STATE_KEY);
        }
    } catch (stateErr) {}

    if (previousState != state) {
        try {
            temp.put(DEBUG_STATE_KEY, state);
        } catch (putErr) {}

        sendDebug(
            player,
            "DMZ class=\u00A7f" +
            (dmzClass == "" ? "(none)" : dmzClass) +
            "\u00A77 skill=\u00A7f" +
            (currentSkillName == ""
                ? "(none)"
                : currentSkillName) +
            "\u00A77 prestige=\u00A7f" +
            currentPrestigeLevel +
            "\u00A77 managed=\u00A7f" +
            (updatedManaged.length == 0
                ? "(none)"
                : updatedManaged.join(", "))
        );
    }
}


/*
 * ============================================================
 * MAIN TICK
 * ============================================================
 */

function tick(event) {
    var player = event.player;
    if (player == null) {
        return;
    }

    try {
        var temp = player.getTempdata();

        var tickCount = temp.get(TICK_KEY);
        if (tickCount == null) {
            tickCount = 0;
        }

        tickCount = parseInt("" + tickCount, 10) + 1;
        if (isNaN(tickCount)) {
            tickCount = 1;
        }

        if (tickCount < TICK_INTERVAL) {
            temp.put(TICK_KEY, "" + tickCount);
            return;
        }

        temp.put(TICK_KEY, "0");

        synchronizeClassPermission(player);

        try {
            if (temp.has(ERROR_KEY)) {
                temp.remove(ERROR_KEY);
            }
        } catch (clearErr) {}

    } catch (err) {
        try {
            var errorTemp = player.getTempdata();
            var errorText = "" + err;
            var previousError = "";

            if (errorTemp.has(ERROR_KEY)) {
                previousError =
                    "" + errorTemp.get(ERROR_KEY);
            }

            if (previousError != errorText) {
                errorTemp.put(ERROR_KEY, errorText);
                player.message(
                    "\u00A7c[Class Permission Error] \u00A7f" +
                    errorText
                );
                print(
                    "[Class Permission] Error for " +
                    player.getName() +
                    ": " +
                    errorText
                );
            }
        } catch (msgErr) {}
    }
}
