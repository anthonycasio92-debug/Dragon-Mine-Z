/*
============================================================
 DBZ Legacy Reborn - Yardrat.js
 Version: 1.0.0

 Combined from: YardratRace.js + YardratSkills.js

 PLACE AS: CustomNPCs Global Player Script
 Enable: tick

 Old YardratRace / YardratSkills files were removed.
============================================================
*/

var StatsProvider = Java.type("com.dragonminez.common.stats.StatsProvider");
var StatsCapability = Java.type("com.dragonminez.common.stats.StatsCapability");
var ConfigManager = Java.type("com.dragonminez.common.config.ConfigManager");
var StatsSyncS2C = Java.type("com.dragonminez.common.network.S2C.StatsSyncS2C");
var NetworkHandler = Java.type("com.dragonminez.common.network.NetworkHandler");

var YARDRAT_RACE = "yardrat";

function yardratMasteryTick(event) {
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

function yardratSkillsTick(event) {
    var player = event.player;
    if (player == null) return;

    try {
        var mcPlayer = player.getMCEntity ? player.getMCEntity() : player;
        var data = StatsProvider.get(StatsCapability.INSTANCE, mcPlayer).orElse(null);
        if (data == null) return;

        var ch = data.getCharacter();
        if (ch == null) return;

        var skills = data.getSkills();
        if (skills == null) return;

        var temp = player.getTempdata();

        var race = String(ch.getRace()).toLowerCase();

        var skillOne = "ki_manipulation";
        var skillTwo = "ki_control";

        var changed = false;

        if (race == "yardrat") {

            if (skills.getSkillLevel(skillOne) < 5) {
                skills.setSkillLevel(skillOne, 5);
                changed = true;
            }

            if (skills.getSkillLevel(skillTwo) < 5) {
                skills.setSkillLevel(skillTwo, 5);
                changed = true;
            }

            if (changed) {
                temp.put("yardrat_starting_ki_skills_granted", true);
                NetworkHandler.sendToTrackingEntityAndSelf(new StatsSyncS2C(mcPlayer), mcPlayer);
            }

        } else {

            // Only remove these starter levels if THIS script previously granted them.
            if (temp.has("yardrat_starting_ki_skills_granted")) {

                if (skills.getSkillLevel(skillOne) > 0) {
                    skills.setSkillLevel(skillOne, 0);
                    changed = true;
                }

                if (skills.getSkillLevel(skillTwo) > 0) {
                    skills.setSkillLevel(skillTwo, 0);
                    changed = true;
                }

                temp.remove("yardrat_starting_ki_skills_granted");

                if (changed) {
                    NetworkHandler.sendToTrackingEntityAndSelf(new StatsSyncS2C(mcPlayer), mcPlayer);
                }
            }
        }

    } catch (err) {
        // Uncomment for debugging:
        // player.message("Yardrat starter skill error: " + err);
    }
}

function tick(event) {
    yardratMasteryTick(event);
    yardratSkillsTick(event);
}
