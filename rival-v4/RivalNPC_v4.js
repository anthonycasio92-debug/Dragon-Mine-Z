/*
============================================================
 DBZ Legacy Reborn - Rival Master NPC V4
 Version: 4.6.1

 Chat-only Rival Master. No dialog GUI / dialog options.

 PLACE AS: NPC Script on the Rival Master NPC
 REQUIRED EVENT: interact

 On right-click, the NPC replies in chat with a short guide
 and the player commands (same style as other chat NPCs).
============================================================
*/

var C = "\u00A7";
var C_RESET = "\u00A7r";
var C_BOLD = "\u00A7l";

function msg(player, text) {
    try {
        if (player != null) player.message(text);
    } catch (e) {}
}

function line(player) {
    msg(player, C + "8--------------------------------" + C_RESET);
}

function showRivalGuide(player) {
    line(player);
    msg(player, C + "6" + C_BOLD + " RIVAL MASTER " + C_RESET);
    line(player);
    msg(player, C + "8Path  " + C + "7Unknown " + C + "8> " + C + "eDeclared " +
        C + "8> " + C + "6Mutual " + C + "8> " + C + "cNemesis");
    msg(player, C + "8Slots  " + C + "f2 Mutual max" + C + "8  |  " + C + "7Nemesis from history");
    msg(player, C + "8Rewards  " + C + "7RP from battles" + C + "8  |  " + C + "7TP still active");
    msg(player, " ");
    msg(player, C + "6Rivalry");
    msg(player, C + "e  /rival <player>" + C + "8  silent rival (Unknown)");
    msg(player, C + "e  /rival request <player>" + C + "8  propose Mutual");
    msg(player, C + "e  /rival accept|decline|remove <player>");
    msg(player, C + "e  /rival list" + C + "8  rivals + proving grounds");
    msg(player, " ");
    msg(player, C + "8Unknown = you rivaled them silently. Declared = you both did.");
    msg(player, " ");
    msg(player, C + "6Battle");
    msg(player, C + "e  /challenge <player>" + C + "8  60s official fight");
    msg(player, C + "e  /challenge accept|decline|cancel");
    msg(player, C + "e  /spectaterival <player>" + C + "8  watch live");
    msg(player, " ");
    msg(player, C + "6Progress");
    msg(player, C + "e  /rival top | title | journal | hof");
    msg(player, C + "e  /rival season | quests | achievements");
    msg(player, " ");
    msg(player, C + "8Defeat marks Proving Grounds. Return there for bonus rewards.");
    msg(player, C + "8Type " + C + "e/rival" + C_RESET + C + "8 for the full help list.");
    line(player);
}

function interact(event) {
    try {
        var player = event.player;
        if (player == null) return;
        showRivalGuide(player);
    } catch (error) {
        try {
            print("[RivalNPC] " + error);
        } catch (e) {}
    }
}
