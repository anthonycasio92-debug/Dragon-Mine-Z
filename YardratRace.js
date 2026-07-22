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
var ConfigManager = Java.type("com.dragonminez.common.config.ConfigManager");
var StatsSyncS2C = Java.type("com.dragonminez.common.network.S2C.StatsSyncS2C");
var NetworkHandler = Java.type("com.dragonminez.common.network.NetworkHandler");

var YARDRAT_RACE = "yardrat";

function tick(event) {
    var player = event.player;
    if (player == null) return;

    try {
        var mcPlayer = player.getMCEntity ? player.getMCEntity() : player;
        var data = StatsProvider.get(StatsCapability.INSTANCE, mcPlayer).orElse(null);
        if (data == null) return;

        var ch = data.getCharacter();
        if (ch == null) return;

        var race = String(ch.getRace());
        if (race == null || race.toLowerCase() != YARDRAT_RACE) return;

        var temp = player.getTempdata();
        var changed = false;

        // Normal form mastery
        if (ch.hasActiveForm()) {
            var group = String(ch.getActiveFormGroup());
            var form = String(ch.getActiveForm());

            if (group != null && form != null && group != "" && form != "") {
                var masteries = ch.getFormMasteries();
                var current = masteries.getMastery(group, form);
                var key = "yardrat_form_mastery_" + group.toLowerCase() + "_" + form.toLowerCase();
                var last = temp.has(key) ? parseFloat(temp.get(key)) : current;

                if (current > last) {
                    var gained = current - last;
                    var max = 100.0;

                    var formData = ConfigManager.getForm(ch.getRaceName(), group, form);
                    if (formData != null && formData.getMaxMastery() != null) {
                        max = formData.getMaxMastery();
                    }

                    masteries.addMastery(group, form, gained, max);
                    current = masteries.getMastery(group, form);
                    changed = true;
                }

                temp.put(key, current);
            }
        }

        // Stack form mastery
        if (ch.hasActiveStackForm()) {
            var sGroup = String(ch.getActiveStackFormGroup());
            var sForm = String(ch.getActiveStackForm());

            if (sGroup != null && sForm != null && sGroup != "" && sForm != "") {
                var stackMasteries = ch.getStackFormMasteries();
                var sCurrent = stackMasteries.getMastery(sGroup, sForm);
                var sKey = "yardrat_stack_mastery_" + sGroup.toLowerCase() + "_" + sForm.toLowerCase();
                var sLast = temp.has(sKey) ? parseFloat(temp.get(sKey)) : sCurrent;

                if (sCurrent > sLast) {
                    var sGained = sCurrent - sLast;
                    var sMax = 100.0;

                    var stackData = ConfigManager.getStackForm(sGroup, sForm);
                    if (stackData != null && stackData.getMaxMastery() != null) {
                        sMax = stackData.getMaxMastery();
                    }

                    stackMasteries.addMastery(sGroup, sForm, sGained, sMax);
                    sCurrent = stackMasteries.getMastery(sGroup, sForm);
                    changed = true;
                }

                temp.put(sKey, sCurrent);
            }
        }

        if (changed) {
            NetworkHandler.sendToTrackingEntityAndSelf(new StatsSyncS2C(mcPlayer), mcPlayer);
        }

    } catch (err) {
        // Keep silent unless debugging.
        // player.message("Yardrat mastery error: " + err);
    }
}
