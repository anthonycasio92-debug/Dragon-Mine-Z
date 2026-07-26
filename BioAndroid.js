var DEBUG = false;
var StatsProvider = Java.type("com.dragonminez.common.stats.StatsProvider");
var StatsCapability = Java.type("com.dragonminez.common.stats.StatsCapability");
var ConfigManager = Java.type("com.dragonminez.common.config.ConfigManager");
var StatsSyncS2C = Java.type("com.dragonminez.common.network.S2C.StatsSyncS2C");
var NetworkHandler = Java.type("com.dragonminez.common.network.NetworkHandler");
var MCPlayerClass = Java.type("net.minecraft.world.entity.player.Player");

function tick(event) {
    var player = event.player;
    if (player == null) return;

    try {
        var mcPlayer = player.getMCEntity();
        var bioData = StatsProvider.get(StatsCapability.INSTANCE, mcPlayer).orElse(null);
        if (bioData == null) return;

        var bioChar = bioData.getCharacter();
        if (bioChar == null) return;

        if (String(bioChar.getRace()).toLowerCase() != "bioandroid") return;

        var temp = player.getTempdata();

        if (!bioData.getCooldowns().hasCooldown("DrainActive")) {
            temp.remove("bioandroid_absorb_processed_target");
            return;
        }

        var targetId = bioData.getStatus().getDrainingTargetId();
        if (targetId <= 0) return;

        var lastTarget = temp.has("bioandroid_absorb_processed_target")
            ? String(temp.get("bioandroid_absorb_processed_target"))
            : "";

        if (lastTarget == String(targetId)) return;
        temp.put("bioandroid_absorb_processed_target", String(targetId));

        var wrappedTarget = null;
        var allEntities = player.getWorld().getAllEntities(-1);

        for (var i = 0; i < allEntities.length; i++) {
            var check = allEntities[i];
            if (check == null) continue;

            var checkMC = check.getMCEntity();
            if (checkMC == null) continue;

            // m_19879_() = MC entity id
            if (checkMC.m_19879_() == targetId) {
                wrappedTarget = check;
                break;
            }
        }

        if (wrappedTarget == null) {
            if (DEBUG) player.message("\u00A7c[Absorb Debug] No target entity found for ID " + targetId + ".");
            return;
        }

        var targetEntity = wrappedTarget.getMCEntity();
        if (targetEntity == null) {
            if (DEBUG) player.message("\u00A7c[Absorb Debug] Target entity could not be converted.");
            return;
        }

        var bioResources = bioData.getResources();

        // Non-player target: convert 10% max health into TP.
        if (!MCPlayerClass.class.isInstance(targetEntity)) {
            var npcBonusTP = Math.floor(wrappedTarget.getMaxHealth() * 0.10);

            if (npcBonusTP > 0) {
                bioResources.addTrainingPoints(npcBonusTP);
                player.message("\u00A7a[Absorb] Non-player target converted into \u00A7e" + npcBonusTP + " TP\u00A7a.");
            } else {
                if (DEBUG) player.message("\u00A77[Absorb Debug] Non-player target gave 0 TP.");
            }

            NetworkHandler.sendToTrackingEntityAndSelf(new StatsSyncS2C(mcPlayer), mcPlayer);
            return;
        }

        var targetData = StatsProvider.get(StatsCapability.INSTANCE, targetEntity).orElse(null);
        if (targetData == null) {
            if (DEBUG) player.message("\u00A7c[Absorb Debug] Target player has no DMZ data.");
            return;
        }

        var targetResources = targetData.getResources();

        // Player target: steal 10% held TP.
        var targetTP = targetResources.getTrainingPoints();
        var stolenTP = Math.floor(targetTP * 0.10);

        if (stolenTP > 0) {
            targetResources.removeTrainingPoints(stolenTP);
            bioResources.addTrainingPoints(stolenTP);
            player.message("\u00A7a[Absorb] Absorbed \u00A7e" + stolenTP + " TP\u00A7a from player.");
        } else {
            if (DEBUG) player.message("\u00A77[Absorb Debug] Target had too little TP to absorb.");
        }

        var bioSkills = bioData.getSkills();
        var targetSkills = targetData.getSkills();

        if (bioSkills == null || targetSkills == null) {
            NetworkHandler.sendToTrackingEntityAndSelf(new StatsSyncS2C(mcPlayer), mcPlayer);
            NetworkHandler.sendToTrackingEntityAndSelf(new StatsSyncS2C(targetEntity), targetEntity);
            return;
        }

        var skillsConfig = ConfigManager.getSkillsConfig();
        var formSkills = skillsConfig.getFormSkills();
        var stackSkills = skillsConfig.getStackSkills();

        var possibleSkills = [];
        var targetSkillMap = targetSkills.getAllSkills();
        var iter = targetSkillMap.keySet().iterator();

        while (iter.hasNext()) {
            var skillName = String(iter.next());

            if (formSkills.contains(skillName)) continue;
            if (stackSkills.contains(skillName)) continue;

            var targetSkillLevel = targetSkills.getSkillLevel(skillName);
            var bioSkillLevel = bioSkills.getSkillLevel(skillName);

            if (targetSkillLevel > bioSkillLevel) {
                possibleSkills.push(skillName);
            }
        }

        // Player has no learnable skills: convert 5% max health into TP.
        if (possibleSkills.length <= 0) {
            var playerBonusTP = Math.floor(wrappedTarget.getMaxHealth() * 0.05);

            if (playerBonusTP > 0) {
                bioResources.addTrainingPoints(playerBonusTP);
                player.message("\u00A7a[Absorb] Target had no learnable skills. Gained \u00A7e" + playerBonusTP + " TP\u00A7a from max health.");
            } else {
                if (DEBUG) player.message("\u00A77[Absorb Debug] No learnable skills and health conversion gave 0 TP.");
            }

            NetworkHandler.sendToTrackingEntityAndSelf(new StatsSyncS2C(mcPlayer), mcPlayer);
            NetworkHandler.sendToTrackingEntityAndSelf(new StatsSyncS2C(targetEntity), targetEntity);
            return;
        }

        var bioLvl = bioData.getLevel();
        var targetLvl = targetData.getLevel();

        var chance = 0.50;

        if (targetLvl > 0) {
            chance = 0.50 + ((bioLvl - targetLvl) / (targetLvl * 2.0));
        }

        if (chance < 0.05) chance = 0.05;
        if (chance > 0.95) chance = 0.95;

        var roll = Math.random();

        if (roll <= chance) {
            var picked = possibleSkills[Math.floor(Math.random() * possibleSkills.length)];

            var currentBioSkillLevel = bioSkills.getSkillLevel(picked);
            var targetPickedLevel = targetSkills.getSkillLevel(picked);

            var newLevel = currentBioSkillLevel + 1;

            if (newLevel > targetPickedLevel) {
                newLevel = targetPickedLevel;
            }

            bioSkills.setSkillLevel(picked, newLevel);

            player.message("\u00A7d[Absorb] Learned \u00A7b" + picked + " \u00A7dlevel " + newLevel + "\u00A7d.");
            if (DEBUG) player.message("\u00A77[Absorb Debug] DMZ Level Chance: " + Math.floor(chance * 100) + "% | Roll: " + Math.floor(roll * 100) + "%");
        } else {
            if (DEBUG) player.message("\u00A77[Absorb Debug] Skill absorb failed. DMZ Level Chance: " + Math.floor(chance * 100) + "% | Roll: " + Math.floor(roll * 100) + "%");
        }

        NetworkHandler.sendToTrackingEntityAndSelf(new StatsSyncS2C(mcPlayer), mcPlayer);
        NetworkHandler.sendToTrackingEntityAndSelf(new StatsSyncS2C(targetEntity), targetEntity);

    } catch (err) {
        player.message("\u00A74[Absorb Script Error] " + err);
    }
}