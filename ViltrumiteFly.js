/*
 * CNPC INSTALL RULE:
 * Put this file in its OWN Script tab / ScriptContainer.
 * Do NOT add multiple .js files into the same tab's ScriptList.
 * CustomNPCs concatenates every file in a tab into ONE scope, so
 * duplicate tick/trigger/init/helpers overwrite each other and one
 * Java.type/load error disables the entire tab until reload.
 */

var StatsProvider = Java.type("com.dragonminez.common.stats.StatsProvider");
var StatsCapability = Java.type("com.dragonminez.common.stats.StatsCapability");
var StatsSyncS2C = Java.type("com.dragonminez.common.network.S2C.StatsSyncS2C");
var NetworkHandler = Java.type("com.dragonminez.common.network.NetworkHandler");
var System = Java.type("java.lang.System");

function tick(event) {
    var player = event.player;
    if (player == null) return;

    var temp = player.getTempdata();
    var now = System.currentTimeMillis();

    // Only check once per second.
    if (temp.has("viltrumite_flight_next_check")) {
        if (now < parseInt(temp.get("viltrumite_flight_next_check"))) return;
    }

    temp.put("viltrumite_flight_next_check", now + 1000);

    try {
        var mcPlayer = player.getMCEntity ? player.getMCEntity() : player;
        var data = StatsProvider.get(StatsCapability.INSTANCE, mcPlayer).orElse(null);
        if (data == null) return;

        var ch = data.getCharacter();
        if (ch == null) return;

        var skills = data.getSkills();
        if (skills == null) return;

        var race = String(ch.getRace()).toLowerCase();
        var currentFly = skills.getSkillLevel("fly");

        if (race == "viltrumite") {
            var maxFly = skills.getMaxSkillLevel("fly");
            if (maxFly <= 0) maxFly = 10;

            if (currentFly < maxFly) {
                skills.setSkillLevel("fly", maxFly);
                temp.put("viltrumite_flight_granted", true);
                NetworkHandler.sendToTrackingEntityAndSelf(new StatsSyncS2C(mcPlayer), mcPlayer);
            }

        } else {
            // Only remove flight if THIS script previously granted it.
            if (temp.has("viltrumite_flight_granted")) {
                if (currentFly > 0) {
                    skills.setSkillLevel("fly", 0);
                    NetworkHandler.sendToTrackingEntityAndSelf(new StatsSyncS2C(mcPlayer), mcPlayer);
                }

                temp.remove("viltrumite_flight_granted");
            }
        }

    } catch (err) {
        // player.message("Viltrumite fly skill error: " + err);
    }
}