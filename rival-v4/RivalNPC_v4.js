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
    msg(player, C + "7Unknown → Declared → Mutual → Nemesis");
    msg(player, C + "7Max 2 Mutual (3rd demotes oldest). One Nemesis from history.");
    msg(player, C + "7RP from official battles only.");
    line(player);
    msg(player, C + "6Rivalry");
    msg(player, C + "e/rival <player>");
    msg(player, C + "e/rival accept|decline|remove <player>");
    msg(player, C + "e/rival list | stats [player]");
    line(player);
    msg(player, C + "6Official Battle");
    msg(player, C + "e/challenge <player>");
    msg(player, C + "e/challenge rival <player>");
    msg(player, C + "e/challenge accept|decline|cancel");
    line(player);
    msg(player, C + "6Progress");
    msg(player, C + "e/rival top [rp|wins|streak|damage]");
    msg(player, C + "e/rival title  /rival journal");
    msg(player, C + "e/rival season  /rival quests");
    msg(player, C + "e/rival achievements  /rival hof");
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
