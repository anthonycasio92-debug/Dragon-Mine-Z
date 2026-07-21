var StatsProvider = Java.type(
    "com.dragonminez.common.stats.StatsProvider"
);

var StatsCapability = Java.type(
    "com.dragonminez.common.stats.StatsCapability"
);

var StatsSyncS2C = Java.type(
    "com.dragonminez.common.network.S2C.StatsSyncS2C"
);

var NetworkHandler = Java.type(
    "com.dragonminez.common.network.NetworkHandler"
);

var System = Java.type(
    "java.lang.System"
);


/*
 * ============================================================
 * SETTINGS
 * ============================================================
 */

var TARGET_CLASS =
    "spiritualist";

var KI_CONTROL =
    "kicontrol";

var CHECK_INTERVAL_MS =
    1000;

/*
 * The class must remain Spiritualist for 10 seconds before the
 * script grants Ki Control.
 *
 * This helps prevent character-selection previews from
 * immediately granting the skill.
 */
var CLASS_CONFIRM_TIME_MS =
    10000;

var DEBUG =
    false;


/*
 * ============================================================
 * TEMP-DATA KEYS
 * ============================================================
 */

var KEY_NEXT_CHECK =
    "spiritualist_kicontrol_next_check";

var KEY_CLASS_DETECTED_AT =
    "spiritualist_class_detected_at";

var KEY_LAST_DETECTED_CLASS =
    "spiritualist_last_detected_class";

var KEY_DEBUG_COOLDOWN =
    "spiritualist_kicontrol_debug_cooldown";


/*
 * ============================================================
 * STORED-DATA KEY
 * ============================================================
 */

/*
 * This marks that Ki Control was given by this script.
 *
 * If the player is later detected as another class, the script
 * removes Ki Control and clears this marker.
 */
var KEY_GRANTED_BY_CLASS =
    "spiritualist_granted_kicontrol";


/*
 * ============================================================
 * NORMALIZE CLASS NAME
 * ============================================================
 */

function normalizeClassName(value) {
    if (
        value == null ||
        String(value) == "null"
    ) {
        return "";
    }

    return String(value)
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "")
        .replace(/[_-]/g, "");
}


/*
 * ============================================================
 * DATA HELPERS
 * ============================================================
 */

function readNumber(
    data,
    key,
    fallback
) {
    try {
        if (
            data != null &&
            data.has(key)
        ) {
            var value =
                Number(
                    "" +
                    data.get(key)
                );

            if (!isNaN(value)) {
                return value;
            }
        }
    } catch (err) {}

    return fallback;
}


function readBoolean(
    data,
    key
) {
    try {
        if (
            data != null &&
            data.has(key)
        ) {
            return (
                String(
                    data.get(key)
                ).toLowerCase() ==
                "true"
            );
        }
    } catch (err) {}

    return false;
}


/*
 * ============================================================
 * DEBUG MESSAGE
 * ============================================================
 */

function debugMessage(
    player,
    message,
    now
) {
    if (!DEBUG) {
        return;
    }

    try {
        var temp =
            player.getTempdata();

        var nextMessage =
            readNumber(
                temp,
                KEY_DEBUG_COOLDOWN,
                0
            );

        if (
            now <
            nextMessage
        ) {
            return;
        }

        temp.put(
            KEY_DEBUG_COOLDOWN,
            "" +
            (
                now +
                3000
            )
        );

        player.message(
            "\u00A78[Spiritualist Debug] \u00A77" +
            message
        );

    } catch (err) {}
}


/*
 * ============================================================
 * SYNC DMZ DATA
 * ============================================================
 */

function syncPlayerStats(
    player,
    mcPlayer
) {
    try {
        NetworkHandler
            .sendToTrackingEntityAndSelf(
                new StatsSyncS2C(
                    mcPlayer
                ),
                mcPlayer
            );

        return true;

    } catch (err) {
        if (DEBUG) {
            player.message(
                "\u00A7c[Spiritualist Debug] Sync failed: " +
                err
            );
        }

        return false;
    }
}


/*
 * ============================================================
 * CLASS CONFIRMATION
 * ============================================================
 */

function clearClassConfirmation(player) {
    try {
        player
            .getTempdata()
            .remove(
                KEY_CLASS_DETECTED_AT
            );

    } catch (err) {}
}


function isSpiritualistConfirmed(
    player,
    now
) {
    try {
        var temp =
            player.getTempdata();

        var detectedAt =
            readNumber(
                temp,
                KEY_CLASS_DETECTED_AT,
                0
            );

        if (
            detectedAt <= 0
        ) {
            temp.put(
                KEY_CLASS_DETECTED_AT,
                "" + now
            );

            return false;
        }

        return (
            now -
            detectedAt >=
            CLASS_CONFIRM_TIME_MS
        );

    } catch (err) {
        return false;
    }
}


/*
 * ============================================================
 * GIVE KI CONTROL
 * ============================================================
 */

function grantKiControl(
    player,
    mcPlayer,
    skills
) {
    try {
        var stored =
            player.getStoreddata();

        var currentLevel =
            Number(
                skills.getSkillLevel(
                    KI_CONTROL
                )
            );

        if (isNaN(currentLevel)) {
            currentLevel = 0;
        }

        /*
         * Spiritualist already has Ki Control.
         *
         * If the marker already exists, no work is needed.
         */
        if (
            currentLevel >= 1
        ) {
            return false;
        }

        skills.setSkillLevel(
            KI_CONTROL,
            1
        );

        var confirmedLevel =
            Number(
                skills.getSkillLevel(
                    KI_CONTROL
                )
            );

        if (
            isNaN(confirmedLevel) ||
            confirmedLevel != 1
        ) {
            player.message(
                "\u00A7c[Spiritualist] DMZ rejected the Ki Control unlock."
            );

            return false;
        }

        stored.put(
            KEY_GRANTED_BY_CLASS,
            "true"
        );

        syncPlayerStats(
            player,
            mcPlayer
        );

        player.message(
            "\u00A7b\u00A7lSpiritualist Ability Unlocked!"
        );

        player.message(
            "\u00A77Your natural connection to Ki has unlocked \u00A7bKi Control\u00A77."
        );

        return true;

    } catch (err) {
        player.message(
            "\u00A7c[Spiritualist Grant Error] " +
            err
        );

        return false;
    }
}


/*
 * ============================================================
 * REMOVE KI CONTROL
 * ============================================================
 */

function removeClassKiControl(
    player,
    mcPlayer,
    skills
) {
    try {
        var stored =
            player.getStoreddata();

        /*
         * Only remove Ki Control when this script previously
         * marked it as a Spiritualist class grant.
         */
        if (
            !readBoolean(
                stored,
                KEY_GRANTED_BY_CLASS
            )
        ) {
            return false;
        }

        var currentLevel =
            Number(
                skills.getSkillLevel(
                    KI_CONTROL
                )
            );

        if (isNaN(currentLevel)) {
            currentLevel = 0;
        }

        if (
            currentLevel > 0
        ) {
            skills.setSkillLevel(
                KI_CONTROL,
                0
            );
        }

        var confirmedLevel =
            Number(
                skills.getSkillLevel(
                    KI_CONTROL
                )
            );

        if (isNaN(confirmedLevel)) {
            confirmedLevel = 0;
        }

        if (
            confirmedLevel > 0
        ) {
            if (DEBUG) {
                player.message(
                    "\u00A7c[Spiritualist Debug] DMZ rejected the Ki Control removal."
                );
            }

            return false;
        }

        stored.remove(
            KEY_GRANTED_BY_CLASS
        );

        syncPlayerStats(
            player,
            mcPlayer
        );

        player.message(
            "\u00A77Ki Control was removed because your chosen class is not Spiritualist."
        );

        return true;

    } catch (err) {
        player.message(
            "\u00A7c[Spiritualist Removal Error] " +
            err
        );

        return false;
    }
}


/*
 * ============================================================
 * MAIN TICK
 * ============================================================
 */

function tick(event) {
    var player =
        event.player;

    if (player == null) {
        return;
    }

    try {
        var temp =
            player.getTempdata();

        var now =
            System.currentTimeMillis();

        var nextCheck =
            readNumber(
                temp,
                KEY_NEXT_CHECK,
                0
            );

        if (
            now <
            nextCheck
        ) {
            return;
        }

        temp.put(
            KEY_NEXT_CHECK,
            "" +
            (
                now +
                CHECK_INTERVAL_MS
            )
        );

        var mcPlayer =
            player.getMCEntity
                ? player.getMCEntity()
                : player;

        var data =
            StatsProvider
                .get(
                    StatsCapability.INSTANCE,
                    mcPlayer
                )
                .orElse(null);

        if (data == null) {
            return;
        }

        var character =
            data.getCharacter();

        var skills =
            data.getSkills();

        if (
            character == null ||
            skills == null
        ) {
            return;
        }

        var rawClass =
            character.getCharacterClass();

        var currentClass =
            normalizeClassName(
                rawClass
            );

        var targetClass =
            normalizeClassName(
                TARGET_CLASS
            );

        var lastClass =
            temp.has(
                KEY_LAST_DETECTED_CLASS
            )
                ? String(
                    temp.get(
                        KEY_LAST_DETECTED_CLASS
                    )
                )
                : "";

        /*
         * Whenever the detected class changes, restart the
         * confirmation timer.
         */
        if (
            lastClass !=
            String(rawClass)
        ) {
            temp.put(
                KEY_LAST_DETECTED_CLASS,
                "" + rawClass
            );

            clearClassConfirmation(
                player
            );

            if (DEBUG) {
                player.message(
                    "\u00A78[Spiritualist Debug] \u00A77Detected class: \u00A7f" +
                    rawClass
                );
            }
        }

        /*
         * The player is not currently Spiritualist.
         *
         * Immediately remove Ki Control when it was granted by
         * this script.
         */
        if (
            currentClass !=
            targetClass
        ) {
            clearClassConfirmation(
                player
            );

            removeClassKiControl(
                player,
                mcPlayer,
                skills
            );

            return;
        }

        /*
         * The player currently appears as Spiritualist.
         *
         * Wait for the class to remain unchanged for the full
         * confirmation period before giving the skill.
         */
        if (
            !isSpiritualistConfirmed(
                player,
                now
            )
        ) {
            var detectedAt =
                readNumber(
                    temp,
                    KEY_CLASS_DETECTED_AT,
                    now
                );

            var remaining =
                Math.max(
                    0,
                    CLASS_CONFIRM_TIME_MS -
                    (
                        now -
                        detectedAt
                    )
                );

            debugMessage(
                player,
                "Waiting to confirm Spiritualist: " +
                Math.ceil(
                    remaining /
                    1000
                ) +
                "s",
                now
            );

            return;
        }

        grantKiControl(
            player,
            mcPlayer,
            skills
        );

    } catch (err) {
        player.message(
            "\u00A7c[Spiritualist Script Error] " +
            err
        );
    }
}