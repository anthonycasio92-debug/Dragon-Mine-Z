var StatsProvider = Java.type("com.dragonminez.common.stats.StatsProvider");
var StatsCapability = Java.type("com.dragonminez.common.stats.StatsCapability");
var MCPlayerClass = Java.type("net.minecraft.world.entity.player.Player");

function interact(event) {
    var player = event.player;
    if (player == null) return;

    try {
        if (!player.isSneaking()) return;

        var target = event.target;
        if (target == null) return;

        var targetMC = target.getMCEntity();
        if (targetMC == null) return;

        if (!MCPlayerClass.class.isInstance(targetMC)) return;

        var targetData = StatsProvider.get(StatsCapability.INSTANCE, targetMC).orElse(null);
        if (targetData == null) return;

        var ch = targetData.getCharacter();
        var stats = targetData.getStats();
        var skills = targetData.getSkills();

        player.message("\u00A76======= DMZ Stats: " + target.getName() + " =======");

        if (ch != null) {
            try { player.message("\u00A7eRace: \u00A7f" + ch.getRace()); } catch (e1) {}
            try { player.message("\u00A7eClass: \u00A7f" + ch.getCharacterClass()); } catch (e2) {}
        }

        try {
            player.message("\u00A7ePrestiged: \u00A7f" + target.getFactionPoints(4));
        } catch (e3) {}

        try { player.message("\u00A7eDMZ Level: \u00A7f" + targetData.getLevel()); } catch (e4) {}
        try { player.message("\u00A7eMax Health: \u00A7f" + target.getMaxHealth()); } catch (e5) {}
        try { player.message("\u00A7eMax Energy / Ki: \u00A7f" + targetData.getMaxEnergy()); } catch (e6) {}

        player.message("\u00A76--- Core Stats ---");

        if (stats != null) {
            try { player.message("\u00A7cSTR: \u00A7f" + stats.getStrength()); } catch (e7) {}
            try { player.message("\u00A7bSKP: \u00A7f" + stats.getSpirit()); } catch (e8) {}
            try { player.message("\u00A7aRES: \u00A7f" + stats.getResistance()); } catch (e9) {}
            try { player.message("\u00A7dVIT: \u00A7f" + stats.getVitality()); } catch (e10) {}
            try { player.message("\u00A7ePWR: \u00A7f" + stats.getPower()); } catch (e11) {}
            try { player.message("\u00A73ENE: \u00A7f" + stats.getEnergy()); } catch (e12) {}
        }

        player.message("\u00A76--- Damage / Defense ---");

        try { player.message("\u00A7cStrike Damage: \u00A7f" + targetData.getStrikeDamage()); } catch (e13) {}
        try { player.message("\u00A7bKi Damage: \u00A7f" + targetData.getKiDamage()); } catch (e14) {}
        try { player.message("\u00A7aDefense: \u00A7f" + targetData.getDefense()); } catch (e15) {}
        try { player.message("\u00A7dMax Stamina: \u00A7f" + targetData.getMaxStamina()); } catch (e16) {}

        player.message("\u00A76--- Skills ---");

        if (skills != null) {
            try {
                player.message("\u00A75potentialunlock: \u00A7f" + skills.getSkillLevel("potentialunlock"));
            } catch (e17) {}

            var skillMap = skills.getAllSkills();
            var iter = skillMap.keySet().iterator();

            while (iter.hasNext()) {
                var skillName = String(iter.next());
                var level = skills.getSkillLevel(skillName);

                if (level > 0) {
                    player.message("\u00A77" + skillName + ": \u00A7f" + level);
                }
            }
        }

        player.message("\u00A76============================");

    } catch (err) {
        return;
    }
}