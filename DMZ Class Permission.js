/*
 * ============================================================
 * DMZ Class -> Fabled Skill Permission via LuckPerms
 * Version: 3.2.2
 *
 * PLACE AS: CustomNPCs Global Player Script
 * Enable: Tick
 *
 * PURPOSE:
 * - When a player chooses a DMZ class, grant the Fabled skill
 *   permission for the matching class name.
 * - When the player changes class, remove temporary class
 *   permissions that are no longer current.
 * - If the player has a Fabled skill titled
 *   "<Class Name> Prestige", lock that class permission
 *   permanently and STOP checking Prestige for it.
 *
 * CLASS CONFIRMATION (menu / wish):
 * - Character customization flips the server class on every
 *   arrow click, and Dragon Ball recustomize wishes open that
 *   same menu. There is no reliable "in menu" flag.
 * - Confirm delay applies ONLY when the DMZ class differs from
 *   the last class this script already synced.
 * - Existing players / first install: if this script has never
 *   synced them, grant their CURRENT class permission immediately
 *   (no settle wait). Same for missing permissions on the
 *   already-synced class.
 * - Unloaded / missing DMZ data does NOT reset the timer and
 *   does NOT unset permissions (avoids never-assigning).
 *
 * EXAMPLES:
 *   DMZ class ID:   warrior
 *   Fabled skill:   Warrior
 *   Permission:     fabled.skill.warrior
 *   Prestige skill: Warrior Prestige
 *
 *   DMZ class ID:   martialartist
 *   Fabled skill:   Martial Artist
 *   Permission:     fabled.skill.martial-artist
 *   Prestige skill: Martial Artist Prestige
 *
 * PRESTIGE RULE:
 * - No Prestige yet: permission follows current DMZ class
 *   (set on choose, unset on leave).
 * - Once "<Class> Prestige" is owned (level >= 1):
 *   permission is kept forever and this script never checks
 *   that Prestige skill again for that class.
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
 * How long the DMZ class must stay unchanged before LuckPerms
 * set/unset runs. Covers character-menu browsing and Dragon
 * Ball recustomize wishes (both apply class on every preview).
 * Slightly shorter than Spiritualist's 10s so permissions
 * assign soon after leaving the menu / finishing a wish.
 */
var CLASS_CONFIRM_TIME_MS = 5000;

/*
 * java.lang.System - same as Spirtualist Ki Control.js
 */
var System = Java.type("java.lang.System");

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
 * Pipe-separated base Fabled skill names with TEMPORARY
 * class permissions (no Prestige yet).
 */
var MANAGED_SKILLS_KEY =
    "dmz_fabled_class_permissions_v3_managed";

/*
 * Classes whose "<Name> Prestige" skill was confirmed once.
 * Permission stays forever. Never re-check Prestige for these.
 */
var LOCKED_PRESTIGE_KEY =
    "dmz_fabled_class_permissions_v3_prestige_locked";

var TICK_KEY =
    "dmz_fabled_class_permissions_v3_tick";

var DEBUG_STATE_KEY =
    "dmz_fabled_class_permissions_v3_state";

var ERROR_KEY =
    "dmz_fabled_class_permissions_v3_error";

/*
 * Temp only. Tracks the last observed DMZ class and when it
 * last changed so menu/wish previews do not thrash permissions.
 */
var LAST_SEEN_CLASS_KEY =
    "dmz_fabled_class_permissions_v3_last_seen_class";

var CLASS_STABLE_SINCE_KEY =
    "dmz_fabled_class_permissions_v3_class_stable_since";

/*
 * Last DMZ class that completed a permission sync.
 * Stored persistently so existing players are bootstrapped once
 * and menu/wish confirm only runs on real class changes.
 */
var LAST_SYNCED_CLASS_KEY =
    "dmz_fabled_class_permissions_v3_last_synced_class";


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

    /*
     * Case / spacing insensitive:
     * "Martial Artist", "martial artist", "martialartist"
     */
    var wanted = normalizeName(value);
    if (wanted == "") {
        wanted = ("" + value).toLowerCase();
    }

    var i;
    for (i = 0; i < array.length; i++) {
        var entry = normalizeName(array[i]);
        if (entry == "") {
            entry = ("" + array[i]).toLowerCase();
        }
        if (entry == wanted) {
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

    /*
     * Case-insensitive permission id:
     * "Martial Artist" / "martial artist" -> fabled.skill.martial-artist
     */
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
 * MANAGED / LOCKED SKILL STORAGE
 * ============================================================
 */

function readSkillList(player, key) {
    var result = [];

    try {
        var stored = player.getStoreddata();
        if (stored == null || !stored.has(key)) {
            return result;
        }

        var raw = "" + stored.get(key);
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

function writeSkillList(player, key, skills) {
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
            stored.remove(key);
        } else {
            stored.put(key, output);
        }
    } catch (e) {}
}

function readManagedSkills(player) {
    return readSkillList(player, MANAGED_SKILLS_KEY);
}

function writeManagedSkills(player, skills) {
    writeSkillList(player, MANAGED_SKILLS_KEY, skills);
}

function readLockedPrestigeSkills(player) {
    return readSkillList(player, LOCKED_PRESTIGE_KEY);
}

function writeLockedPrestigeSkills(player, skills) {
    writeSkillList(player, LOCKED_PRESTIGE_KEY, skills);
}

function isPrestigeLocked(lockedList, skillName) {
    return containsValue(lockedList, skillName);
}

/*
 * First time Prestige is confirmed: ensure permission is set,
 * then permanently stop checking that Prestige skill.
 */
function lockPrestigeClass(
    player,
    fabled,
    skillName,
    lockedList
) {
    if (
        skillName == null ||
        skillName == "" ||
        isPrestigeLocked(lockedList, skillName)
    ) {
        return false;
    }

    var permission = getSkillPermission(skillName);
    if (permission == "") {
        return false;
    }

    if (!playerHasPermission(fabled, permission)) {
        runLuckPermsCommand(
            player,
            fabled,
            "set",
            permission
        );
    }

    addUnique(lockedList, skillName);

    sendDebug(
        player,
        "Prestige locked (no more checks): \u00A7f" +
        skillName +
        " Prestige"
    );

    return true;
}


/*
 * ============================================================
 * FABLED CONNECTION
 * ============================================================
 *
 * Same Bukkit + Fabled classloader pattern as Race Lock /
 * Fabled attribute scripts.
 *
 * Returns null quietly when Bukkit/Fabled/player data is not
 * ready yet (common right after join). Callers must NOT throw
 * on null - just retry next tick.
 */

var CACHED_SKILL_LIST = null;
var CACHED_SKILL_LIST_AT = 0;
var SKILL_LIST_CACHE_MS = 60000;

function invokeNoArgStatic(method) {
    if (method == null) {
        return null;
    }

    try {
        return method.invoke(null);
    } catch (e1) {}

    try {
        var empty = Java.to([], "java.lang.Object[]");
        return method.invoke(null, empty);
    } catch (e2) {}

    try {
        return method.invoke(null, []);
    } catch (e3) {}

    return null;
}

function getBukkitPlayer(player) {
    var Bukkit = Java.type("org.bukkit.Bukkit");
    var UUID = Java.type("java.util.UUID");

    try {
        var byUuid = Bukkit.getPlayer(
            UUID.fromString("" + player.getUUID())
        );
        if (byUuid != null) {
            return { bukkit: Bukkit, bukkitPlayer: byUuid };
        }
    } catch (e1) {}

    try {
        var byName = Bukkit.getPlayerExact("" + player.getName());
        if (byName != null) {
            return { bukkit: Bukkit, bukkitPlayer: byName };
        }
    } catch (e2) {}

    try {
        var byName2 = Bukkit.getPlayer("" + player.getName());
        if (byName2 != null) {
            return { bukkit: Bukkit, bukkitPlayer: byName2 };
        }
    } catch (e3) {}

    return null;
}

function loadRegisteredSkills(fabledClass, getSkillsMethod) {
    var now = 0;
    try {
        now = Number(
            Java.type("java.lang.System").currentTimeMillis()
        );
    } catch (tErr) {
        now = 0;
    }

    if (
        CACHED_SKILL_LIST != null &&
        now > 0 &&
        now - CACHED_SKILL_LIST_AT < SKILL_LIST_CACHE_MS
    ) {
        return CACHED_SKILL_LIST;
    }

    var skillMap = null;

    if (getSkillsMethod != null) {
        skillMap = invokeNoArgStatic(getSkillsMethod);
    }

    if (skillMap == null) {
        try {
            skillMap = fabledClass
                .getMethod("getSkills")
                .invoke(null);
        } catch (e2) {}
    }

    if (skillMap == null) {
        return null;
    }

    var skills = null;
    try {
        skills = skillMap.values().toArray();
    } catch (arrErr) {
        try {
            var list = [];
            var it = skillMap.values().iterator();
            while (it.hasNext()) {
                list[list.length] = it.next();
            }
            skills = list;
        } catch (iterErr) {
            return null;
        }
    }

    if (skills == null || skills.length == 0) {
        return skills;
    }

    CACHED_SKILL_LIST = skills;
    CACHED_SKILL_LIST_AT = now;
    return skills;
}

function getFabledContext(player) {
    try {
        var resolved = getBukkitPlayer(player);
        if (resolved == null || resolved.bukkitPlayer == null) {
            return null;
        }

        var Bukkit = resolved.bukkit;
        var bukkitPlayer = resolved.bukkitPlayer;

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

        if (getDataMethod == null) {
            try {
                getDataMethod = fabledClass.getMethod(
                    "getData",
                    Java.type("org.bukkit.OfflinePlayer")
                );
            } catch (mErr) {}
        }

        if (getDataMethod == null) {
            return null;
        }

        var fabledData = getDataMethod.invoke(
            null,
            bukkitPlayer
        );
        if (fabledData == null) {
            return null;
        }

        /*
         * Player data often is not init for a few ticks after join.
         * Skip quietly until Fabled finishes loading.
         */
        try {
            if (!fabledData.isInit()) {
                return null;
            }
        } catch (ignoredInitError) {}

        var skills = loadRegisteredSkills(
            fabledClass,
            getSkillsMethod
        );
        if (skills == null) {
            return null;
        }

        return {
            bukkit: Bukkit,
            bukkitPlayer: bukkitPlayer,
            plugin: plugin,
            data: fabledData,
            skills: skills
        };
    } catch (err) {
        return null;
    }
}


/*
 * ============================================================
 * DMZ CONNECTION
 * ============================================================
 *
 * Returns:
 *   { ready: false, className: "" }
 *     when stats/character are not available yet
 *   { ready: true, className: "warrior" }
 *     when the character exists and class can be trusted
 *
 * ready:false must NOT reset the confirm timer and must NOT
 * unset permissions - that was causing grants to never stick.
 */

function getDMZClassState(player) {
    var notReady = { ready: false, className: "" };

    try {
        var StatsProvider = Java.type(
            "com.dragonminez.common.stats.StatsProvider"
        );
        var StatsCapability = Java.type(
            "com.dragonminez.common.stats.StatsCapability"
        );

        /*
         * Match Spirtualist Ki Control.js: fall back to the CNPC
         * player wrapper when getMCEntity() is unavailable.
         */
        var mcPlayer = player.getMCEntity
            ? player.getMCEntity()
            : player;
        if (mcPlayer == null) {
            return notReady;
        }

        var lazy = StatsProvider.get(
            StatsCapability.INSTANCE,
            mcPlayer
        );
        if (lazy == null) {
            return notReady;
        }

        var dmzData = lazy.orElse(null);
        if (dmzData == null) {
            return notReady;
        }

        try {
            if (!dmzData.isDataLoaded()) {
                return notReady;
            }
        } catch (e) {
            return notReady;
        }

        try {
            var status = dmzData.getStatus();
            if (
                status == null ||
                !status.isHasCreatedCharacter()
            ) {
                return notReady;
            }
        } catch (e2) {
            return notReady;
        }

        var character = dmzData.getCharacter();
        if (character == null) {
            return notReady;
        }

        var className = character.getCharacterClass();
        if (className == null) {
            /*
             * Character exists but class is null - treat as ready
             * empty only if stringifies to blank; otherwise not ready.
             */
            return { ready: true, className: "" };
        }

        className = ("" + className).trim();
        if (
            className == "" ||
            className.toLowerCase() == "null"
        ) {
            return { ready: true, className: "" };
        }

        return { ready: true, className: className };
    } catch (e3) {
        return notReady;
    }
}

function getDMZClass(player) {
    var state = getDMZClassState(player);
    if (state == null || !state.ready) {
        return "";
    }
    return state.className;
}


/*
 * ============================================================
 * SKILL SEARCH
 * ============================================================
 *
 * All skill matching is case-insensitive (and ignores spaces,
 * underscores, hyphens via normalizeName).
 *
 * Finds the registered base Fabled skill matching the DMZ
 * class ID (martialartist -> Martial Artist, warrior -> Warrior).
 * Never matches "... Prestige" as the base skill.
 */

function namesMatchIgnoreCase(a, b) {
    if (a == null || b == null) {
        return false;
    }

    var na = normalizeName(a);
    var nb = normalizeName(b);
    if (na != "" && nb != "" && na == nb) {
        return true;
    }

    return ("" + a).toLowerCase() == ("" + b).toLowerCase();
}

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
            namesMatchIgnoreCase(skillName, dmzClass) ||
            namesMatchIgnoreCase(skillKey, dmzClass) ||
            normalizeName(skillName) == normalizedClass ||
            normalizeName(skillKey) == normalizedClass
        ) {
            return skill;
        }
    }

    return null;
}

/*
 * Find "<Class> Prestige" in the registered skill list without
 * caring about capitalization (Warrior Prestige / warrior prestige).
 */
function findPrestigeSkill(skills, baseSkillName) {
    if (
        skills == null ||
        baseSkillName == null ||
        baseSkillName == ""
    ) {
        return null;
    }

    var wanted = normalizeName(
        "" + baseSkillName + PRESTIGE_SKILL_SUFFIX
    );
    if (wanted == "") {
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
            !endsWithIgnoreCase(
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
            normalizeName(skillName) == wanted ||
            normalizeName(skillKey) == wanted
        ) {
            return skill;
        }

        /*
         * Also accept prestige skills whose base portion matches
         * the class name (e.g. base "Warrior", skill "warrior prestige").
         */
        var baseFromPrestige = skillName.substring(
            0,
            skillName.length - PRESTIGE_SKILL_SUFFIX.length
        );
        if (namesMatchIgnoreCase(baseFromPrestige, baseSkillName)) {
            return skill;
        }
    }

    return null;
}


/*
 * ============================================================
 * PRESTIGE CHECK
 * ============================================================
 *
 * Case-insensitive. Tries the constructed name, then scans
 * registered skills for any casing of "<Class> Prestige".
 */

function getPrestigeSkillLevel(fabledData, baseSkillName, skills) {
    if (
        fabledData == null ||
        baseSkillName == null ||
        baseSkillName == ""
    ) {
        return 0;
    }

    var level = 0;
    var tried = [];

    function tryLevel(skillLabel) {
        if (
            skillLabel == null ||
            skillLabel == "" ||
            containsValue(tried, skillLabel)
        ) {
            return 0;
        }
        addUnique(tried, skillLabel);

        try {
            var value = Number(
                fabledData.getSkillLevel(skillLabel)
            );
            if (!isNaN(value) && value > 0) {
                return Math.floor(value);
            }
        } catch (e) {}

        return 0;
    }

    /* Direct attempts - Fabled itself lowercases, but try variants. */
    level = tryLevel("" + baseSkillName + PRESTIGE_SKILL_SUFFIX);
    if (level >= 1) {
        return level;
    }
    level = tryLevel(
        ("" + baseSkillName + PRESTIGE_SKILL_SUFFIX).toLowerCase()
    );
    if (level >= 1) {
        return level;
    }

    /* Scan registered skills case-insensitively for the real name/key. */
    var prestigeSkill = findPrestigeSkill(skills, baseSkillName);
    if (prestigeSkill != null) {
        var realName = "" + prestigeSkill.getName();
        level = tryLevel(realName);
        if (level >= 1) {
            return level;
        }

        try {
            level = tryLevel("" + prestigeSkill.getKey());
            if (level >= 1) {
                return level;
            }
        } catch (keyErr) {}
    }

    return 0;
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

    /*
     * LuckPerms accepts an explicit true/false on set. Using
     * true avoids ambiguous parses on some LP versions.
     */
    if (operation == "set") {
        command += " true";
    }

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
 * CLASS CONFIRMATION (MENU / WISH)
 * ============================================================
 *
 * DMZ writes the selected class to the player on every menu
 * arrow click and when a recustomize wish opens that menu.
 * Wait until the observed class is stable before syncing
 * LuckPerms, then always apply whatever the current class is.
 */

function getNowMs() {
    try {
        return System.currentTimeMillis();
    } catch (e) {
        return 0;
    }
}

function readTempNumber(temp, key, fallback) {
    try {
        if (temp == null || !temp.has(key)) {
            return fallback;
        }
        var value = Number("" + temp.get(key));
        if (isNaN(value)) {
            return fallback;
        }
        return value;
    } catch (e) {
        return fallback;
    }
}

function readLastSyncedClass(player) {
    try {
        var stored = player.getStoreddata();
        if (stored == null || !stored.has(LAST_SYNCED_CLASS_KEY)) {
            return "";
        }
        return ("" + stored.get(LAST_SYNCED_CLASS_KEY)).trim();
    } catch (e) {
        return "";
    }
}

function writeLastSyncedClass(player, dmzClass) {
    try {
        var stored = player.getStoreddata();
        if (stored == null) {
            return;
        }
        if (dmzClass == null || dmzClass == "") {
            stored.remove(LAST_SYNCED_CLASS_KEY);
        } else {
            stored.put(LAST_SYNCED_CLASS_KEY, "" + dmzClass);
        }
    } catch (e) {}
}

/*
 * True when we must wait for the class to stop changing
 * (menu browse / wish). False for:
 * - first-ever sync (existing players / new install)
 * - current class already matches last synced class
 */
function needsClassChangeConfirm(player, dmzClass) {
    var lastSynced = readLastSyncedClass(player);
    if (lastSynced == "") {
        return false;
    }
    return normalizeName(lastSynced) != normalizeName(dmzClass);
}

/*
 * Returns true only after dmzClass has been unchanged for
 * CLASS_CONFIRM_TIME_MS. Any real class change (menu browse or
 * wish) restarts the timer.
 */
function isDmzClassConfirmed(player, dmzClass, now) {
    if (player == null) {
        return false;
    }

    if (now == null || isNaN(Number("" + now)) || Number("" + now) <= 0) {
        now = getNowMs();
    }
    now = Number("" + now);
    if (isNaN(now) || now <= 0) {
        return false;
    }

    var temp = player.getTempdata();
    if (temp == null) {
        return false;
    }

    var classKey = normalizeName(dmzClass);
    var lastSeen = "";

    try {
        if (temp.has(LAST_SEEN_CLASS_KEY)) {
            lastSeen = "" + temp.get(LAST_SEEN_CLASS_KEY);
        }
    } catch (readErr) {
        lastSeen = "";
    }

    var lastKey = normalizeName(lastSeen);

    if (lastKey != classKey) {
        try {
            temp.put(LAST_SEEN_CLASS_KEY, "" + dmzClass);
            temp.put(CLASS_STABLE_SINCE_KEY, "" + now);
        } catch (putErr) {}

        sendDebug(
            player,
            "Class change detected (\u00A7f" +
            (dmzClass == "" ? "(none)" : dmzClass) +
            "\u00A77). Waiting " +
            Math.ceil(CLASS_CONFIRM_TIME_MS / 1000) +
            "s before syncing permissions."
        );

        return false;
    }

    var stableSince = readTempNumber(
        temp,
        CLASS_STABLE_SINCE_KEY,
        0
    );

    if (stableSince <= 0) {
        try {
            temp.put(CLASS_STABLE_SINCE_KEY, "" + now);
        } catch (e) {}
        return false;
    }

    if (now - stableSince < CLASS_CONFIRM_TIME_MS) {
        return false;
    }

    return true;
}


/*
 * ============================================================
 * MAIN SYNCHRONIZATION
 * ============================================================
 */

function synchronizeClassPermission(player) {
    var temp = player.getTempdata();
    var now = getNowMs();

    /*
     * Observe DMZ class before Fabled. Unready data must not
     * reset the confirm timer or strip permissions.
     */
    var classState = getDMZClassState(player);
    if (classState == null || !classState.ready) {
        return;
    }

    var dmzClass = classState.className;

    /*
     * DMZ characters always have a class id (default warrior).
     * A blank class means bad/partial reads - ignore it so we
     * do not reset the confirm timer or strip permissions.
     */
    if (dmzClass == null || dmzClass == "") {
        return;
    }

    /*
     * Existing players / first install: never synced before ->
     * grant current class immediately.
     * Already-synced same class: re-check/repair permission.
     * Menu / wish class change: wait until settled.
     */
    if (needsClassChangeConfirm(player, dmzClass)) {
        if (!isDmzClassConfirmed(player, dmzClass, now)) {
            return;
        }
    }

    var fabled = getFabledContext(player);
    if (fabled == null) {
        /*
         * Wait for Fabled without clearing bootstrap / confirm
         * state so the grant still happens next tick.
         */
        return;
    }

    var currentBaseSkill = null;
    var currentSkillName = "";
    var currentPermission = "";

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
        }
    }

    var previousManaged = readManagedSkills(player);
    var lockedPrestige = readLockedPrestigeSkills(player);
    var updatedManaged = [];
    var lockedChanged = false;

    /*
     * Clean temporary permissions for classes the player left.
     * Prestige-locked classes are never unset and never
     * re-checked for Prestige.
     */
    var i;
    for (i = 0; i < previousManaged.length; i++) {
        var oldSkillName = "" + previousManaged[i];

        if (isPrestigeLocked(lockedPrestige, oldSkillName)) {
            continue;
        }

        if (
            currentSkillName != "" &&
            normalizeName(oldSkillName) ==
                normalizeName(currentSkillName)
        ) {
            continue;
        }

        /*
         * One Prestige check for this old class. If owned,
         * lock forever and stop checking it.
         */
        var oldPrestigeLevel = getPrestigeSkillLevel(
            fabled.data,
            oldSkillName,
            fabled.skills
        );
        if (oldPrestigeLevel >= 1) {
            if (
                lockPrestigeClass(
                    player,
                    fabled,
                    oldSkillName,
                    lockedPrestige
                )
            ) {
                lockedChanged = true;
            }
            continue;
        }

        runLuckPermsCommand(
            player,
            fabled,
            "unset",
            getSkillPermission(oldSkillName)
        );
    }

    /*
     * Current DMZ class -> matching Fabled class permission.
     */
    if (
        currentBaseSkill != null &&
        currentSkillName != "" &&
        currentPermission != ""
    ) {
        if (isPrestigeLocked(lockedPrestige, currentSkillName)) {
            /*
             * Already locked by Prestige - do nothing.
             * Never re-check "<Class> Prestige" for this class.
             */
        } else {
            var currentPrestigeLevel = getPrestigeSkillLevel(
                fabled.data,
                currentSkillName,
                fabled.skills
            );

            if (currentPrestigeLevel >= 1) {
                if (
                    lockPrestigeClass(
                        player,
                        fabled,
                        currentSkillName,
                        lockedPrestige
                    )
                ) {
                    lockedChanged = true;
                }
            } else {
                var wasManaged = containsValue(
                    previousManaged,
                    currentSkillName
                );

                var lastSyncedClass = readLastSyncedClass(player);

                var classAlreadySynced =
                    normalizeName(lastSyncedClass) ==
                    normalizeName(dmzClass);

                var hasPermission = playerHasPermission(
                    fabled,
                    currentPermission
                );

                /*
                 * Always grant when:
                 * - first time managing this class skill
                 * - permission is missing (existing players)
                 * - settled DMZ class differs from last sync
                 */
                if (
                    !wasManaged ||
                    !hasPermission ||
                    !classAlreadySynced
                ) {
                    runLuckPermsCommand(
                        player,
                        fabled,
                        "set",
                        currentPermission
                    );
                    sendDebug(
                        player,
                        "Granted permission: \u00A7f" +
                        currentPermission
                    );
                }

                addUnique(updatedManaged, currentSkillName);
            }
        }
    } else if (dmzClass != "" && currentBaseSkill == null) {
        sendDebug(
            player,
            "No Fabled base skill matched DMZ class: \u00A7f" +
            dmzClass
        );
    }

    writeManagedSkills(player, updatedManaged);
    if (lockedChanged) {
        writeLockedPrestigeSkills(player, lockedPrestige);
    }

    /*
     * Mark synced only when the current class matched a Fabled
     * skill (granted, repaired, or prestige-locked). No match
     * keeps retrying so existing players are not stuck.
     */
    if (currentSkillName != "") {
        writeLastSyncedClass(player, dmzClass);
    }

    var state =
        normalizeName(dmzClass) +
        "|" +
        normalizeName(currentSkillName) +
        "|managed=" +
        updatedManaged.join(",") +
        "|locked=" +
        lockedPrestige.join(",");

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
            "\u00A77 temp=\u00A7f" +
            (updatedManaged.length == 0
                ? "(none)"
                : updatedManaged.join(", ")) +
            "\u00A77 prestige-locked=\u00A7f" +
            (lockedPrestige.length == 0
                ? "(none)"
                : lockedPrestige.join(", "))
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
