/*
 * DBZ LEGACY REBORN - REAL DR. GERO ANDROID CONVERSION
 * Verified against DragonMineZ 2.1.3
 * Trigger ID: 45
 *
 * Console:
 * noppes script trigger 45 PlayerName
 *
 * Fabled command:
 * noppes script trigger 45 {target}
 * Type: console
 */

/*
 * CNPC INSTALL RULE:
 * Put this file in its OWN Script tab / ScriptContainer.
 * Do NOT add multiple .js files into the same tab's ScriptList.
 * CustomNPCs concatenates every file in a tab into ONE scope, so
 * duplicate tick/trigger/init/helpers overwrite each other and one
 * Java.type/load error disables the entire tab until reload.
 */
var NpcAPI = Java.type("noppes.npcs.api.NpcAPI");
var StatsProvider = Java.type("com.dragonminez.common.stats.StatsProvider");
var StatsCapability = Java.type("com.dragonminez.common.stats.StatsCapability");
var NPCActionC2S = Java.type("com.dragonminez.common.network.C2S.NPCActionC2S");
var NetworkHandler = Java.type("com.dragonminez.common.network.NetworkHandler");
var StatsSyncS2C = Java.type("com.dragonminez.common.network.S2C.StatsSyncS2C");
var ServerPlayer = Java.type("net.minecraft.server.level.ServerPlayer");
var StatsData = Java.type("com.dragonminez.common.stats.StatsData");
var IntegerClass = Java.type("java.lang.Integer");

var TRIGGER_ID = 45;

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

function getTargetName(event) {
    try {
        if (event.arguments != null && event.arguments.length > 0) {
            return "" + event.arguments[0];
        }
    } catch (ignored1) {}

    try {
        if (event.args != null && event.args.length > 0) {
            return "" + event.args[0];
        }
    } catch (ignored2) {}

    return "";
}

function findOnlinePlayer(name) {
    var wanted = ("" + name).toLowerCase();
    var worlds = NpcAPI.Instance().getIWorlds();

    for (var w = 0; w < worlds.length; w++) {
        var players = worlds[w].getAllPlayers();

        for (var p = 0; p < players.length; p++) {
            var current = players[p];
            if (("" + current.getName()).toLowerCase() == wanted) {
                return current;
            }
        }
    }

    return null;
}

function findRealGeroMethod() {
    var methods = NPCActionC2S.class.getDeclaredMethods();

    for (var i = 0; i < methods.length; i++) {
        var method = methods[i];

        if (
            ("" + method.getName()) == "handleGero" &&
            method.getParameterCount() == 3
        ) {
            method.setAccessible(true);
            return method;
        }
    }

    return null;
}

function invokeRealGero(mcPlayer, data) {
    var method = findRealGeroMethod();

    if (method == null) {
        throw "DragonMineZ handleGero(ServerPlayer, StatsData, int) was not found.";
    }

    /*
     * Object[] used by java.lang.reflect.Method.invoke.
     * Do not rename this variable to 'arguments'; Nashorn strict mode
     * reserves that identifier.
     */
    var methodArgs = Java.to(
        [
            mcPlayer,
            data,
            IntegerClass.valueOf(1)
        ],
        "java.lang.Object[]"
    );

    method.invoke(null, methodArgs);
}

function syncDMZ(mcPlayer) {
    NetworkHandler.sendToPlayer(
        new StatsSyncS2C(mcPlayer),
        mcPlayer
    );
}

function trigger(event) {
    if (event == null || Number(event.id) != Number(TRIGGER_ID)) {
        return;
    }

    var targetName = getTargetName(event);

    if (targetName.length == 0) {
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
        var data = StatsProvider
            .get(StatsCapability.INSTANCE, mcPlayer)
            .orElse(null);

        if (data == null) {
            tell(player, "�c[Android] DragonMineZ data could not be loaded.");
            return;
        }

        /*
         * This runs DragonMineZ 2.1.3's real Dr. Gero action 1.
         * The mod performs its own race check, already-Android check,
         * permanent status write, skill changes, form changes, player
         * refresh, and success/failure message.
         */
        invokeRealGero(mcPlayer, data);

        /* The normal packet handler sync occurs outside handleGero. */
        syncDMZ(mcPlayer);

        logLine("Ran DragonMineZ handleGero action 1 for " + player.getName());

    } catch (err) {
        tell(player, "�c[Android Trigger Error] �f" + err);
        logLine("Error for " + targetName + ": " + err);
    }
}