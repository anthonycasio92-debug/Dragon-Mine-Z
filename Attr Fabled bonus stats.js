// ============================================================
// DISABLED DUPLICATE - do not use this script
// ============================================================
//
// This file is a near-copy of "Attr Fabled Multi bonus.js".
// Both used the same tick key but DIFFERENT bonus names
// ("Prestrige Bonus" vs "Prestige Bonus"), so if both tabs
// were enabled they STACKED two Fabled prestige multipliers
// every second.
//
// That made DMZ power look like it "persisted" after Race Lock
// / prestige / dmzstats wipe, because Fabled attribute points
// survive DMZ reset and these scripts re-applied them.
//
// Keep ONLY: Attr Fabled Multi bonus.js
// Remove this script from your CNPC player tabs.
// ============================================================

var WARN_KEY = "attr_fabled_duplicate_disabled_notice";

function tick(event) {
    try {
        var player = event.player;
        if (player == null) return;

        var temp = player.getTempdata();
        if (temp.get(WARN_KEY) != null) return;
        temp.put(WARN_KEY, "1");

        player.message(
            "\u00A7e[Attr Fabled] This script is a DISABLED duplicate."
        );
        player.message(
            "\u00A77Remove \u00A7fAttr Fabled bonus stats.js\u00A77 from player tabs."
        );
        player.message(
            "\u00A77Keep only \u00A7fAttr Fabled Multi bonus.js\u00A77."
        );
    } catch (err) {}
}
