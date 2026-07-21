/*
============================================================
 DBZ Legacy Reborn - Rival Master NPC V4
 Version: 4.1.0

 Phase 13 — Wire a spawn Rival Master CustomNPC dialog/script
 to these trigger IDs (player must be event.entity).

 PLACE AS: NPC Script on the Rival Master NPC
 EVENTS: dialog / dialogOption / trigger (as needed)

 Dialog option examples:
  Open Help            -> trigger(200)
  List Rivals          -> trigger(205)
  Stats                -> trigger(206)
  Leaderboard          -> trigger(220)
  Title / Perks        -> trigger(221)
  Journal              -> trigger(222)
  Season               -> trigger(223)
  Quests               -> trigger(224)
  Achievements         -> trigger(225)
  Hall of Fame         -> trigger(226)

 For declare/challenge, ask the player to type:
  /rival declare <name>
  /challenge <name>
============================================================
*/

var C = String.fromCharCode(167);

function msg(p, t) { try { p.message(t); } catch (e) {} }

function fire(player, id) {
    try {
        var Bukkit = Java.type("org.bukkit.Bukkit");
        Bukkit.dispatchCommand(
            Bukkit.getConsoleSender(),
            "execute as " + player.getName() + " at " + player.getName() +
            " run noppes script trigger " + id
        );
    } catch (e) {
        msg(player, C + "cRival Master failed to open menu: " + e);
    }
}

/*
 Dialog option IDs are configured in the NPC dialog GUI.
 Map your option slot numbers here.
*/
var OPTION_MAP = {
    0: 200,
    1: 205,
    2: 206,
    3: 220,
    4: 221,
    5: 222,
    6: 223,
    7: 224,
    8: 225,
    9: 226
};

function dialogOption(event) {
    try {
        var player = event.player;
        if (player == null) return;
        var option = null;
        try { option = event.option; } catch (e) {}
        var slot = -1;
        try {
            if (option != null && option.getSlot) slot = Number(option.getSlot());
            else if (event.optionId != null) slot = Number(event.optionId);
        } catch (e2) {}
        if (OPTION_MAP[slot] != null) {
            fire(player, OPTION_MAP[slot]);
            return;
        }
        msg(player, C + "6[Rival Master] " + C + "7Use /rival help for commands.");
    } catch (error) {
        try { print("[RivalNPC] " + error); } catch (e3) {}
    }
}

function interact(event) {
    try {
        var player = event.player;
        if (player == null) return;
        msg(player, C + "6[Rival Master] " + C + "eWelcome, warrior.");
        msg(player, C + "7Talk through my dialog options, or use:");
        msg(player, C + "e/rival help");
        msg(player, C + "e/challenge <player>");
    } catch (e) {}
}
