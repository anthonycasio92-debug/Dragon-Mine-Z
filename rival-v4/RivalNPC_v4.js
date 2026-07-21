/*
============================================================
 DBZ Legacy Reborn - Rival Master NPC V4
 Version: 4.3.0

 Chat-only Rival Master. No dialog GUI / dialog options.

 PLACE AS: NPC Script on the Rival Master NPC
 REQUIRED EVENT: interact

 On right-click, the NPC replies in chat with a short guide
 and the player commands (same style as other chat NPCs).
============================================================
*/

var C = String.fromCharCode(167);

function msg(player, text) {
    try {
        if (player != null) player.message(text);
    } catch (e) {}
}

function line(player) {
    msg(player, C + "8" + "--------------------------------");
}

function showRivalGuide(player) {
    line(player);
    msg(player, C + "6" + C + "lRival Master");
    msg(player, C + "7A true rival sharpens you. Declare one,");
    msg(player, C + "7train near them, then settle it in battle.");
    line(player);
    msg(player, C + "6Rivalry");
    msg(player, C + "e/rivaldeclare <player>");
    msg(player, C + "e/rivalaccept <player>");
    msg(player, C + "e/rivaldecline <player>");
    msg(player, C + "e/rivalremove <player>");
    msg(player, C + "e/rivallist");
    msg(player, C + "e/rivalstats [player]");
    line(player);
    msg(player, C + "6Official Battle");
    msg(player, C + "e/challenge <player>");
    msg(player, C + "e/challengeaccept [player]");
    msg(player, C + "e/challengedecline [player]");
    msg(player, C + "e/challengecancel");
    line(player);
    msg(player, C + "6Progress");
    msg(player, C + "e/rivaltop [rp|wins|streak|damage]");
    msg(player, C + "e/rivaltitle  /rivaljournal");
    msg(player, C + "e/rivalseason  /rivalquests");
    msg(player, C + "e/rivalachievements  /rivalhof");
    msg(player, C + "e/spectaterival <player>");
    line(player);
    msg(player, C + "7Type " + C + "e/rival" + C + "7 for the full help list.");
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
