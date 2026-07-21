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

        player.message("§6======= DMZ Stats: " + target.getName() + " =======");

        if (ch != null) {
            try { player.message("§eRace: §f" + ch.getRace()); } catch (e1) {}
            try { player.message("§eClass: §f" + ch.getCharacterClass()); } catch (e2) {}
        }

        try {
            player.message("§ePrestiged: §f" + target.getFactionPoints(4));
        } catch (e3) {}

        try { player.message("§eDMZ Level: §f" + targetData.getLevel()); } catch (e4) {}
        try { player.message("§eMax Health: §f" + target.getMaxHealth()); } catch (e5) {}
        try { player.message("§eMax Energy / Ki: §f" + targetData.getMaxEnergy()); } catch (e6) {}

        player.message("§6--- Core Stats ---");

        if (stats != null) {
            try { player.message("§cSTR: §f" + stats.getStrength()); } catch (e7) {}
            try { player.message("§bSKP: §f" + stats.getSpirit()); } catch (e8) {}
            try { player.message("§aRES: §f" + stats.getResistance()); } catch (e9) {}
            try { player.message("§dVIT: §f" + stats.getVitality()); } catch (e10) {}
            try { player.message("§ePWR: §f" + stats.getPower()); } catch (e11) {}
            try { player.message("§3ENE: §f" + stats.getEnergy()); } catch (e12) {}
        }

        player.message("§6--- Damage / Defense ---");

        try { player.message("§cStrike Damage: §f" + targetData.getStrikeDamage()); } catch (e13) {}
        try { player.message("§bKi Damage: §f" + targetData.getKiDamage()); } catch (e14) {}
        try { player.message("§aDefense: §f" + targetData.getDefense()); } catch (e15) {}
        try { player.message("§dMax Stamina: §f" + targetData.getMaxStamina()); } catch (e16) {}

        player.message("§6--- Skills ---");

        if (skills != null) {
            try {
                player.message("§5potentialunlock: §f" + skills.getSkillLevel("potentialunlock"));
            } catch (e17) {}

            var skillMap = skills.getAllSkills();
            var iter = skillMap.keySet().iterator();

            while (iter.hasNext()) {
                var skillName = String(iter.next());
                var level = skills.getSkillLevel(skillName);

                if (level > 0) {
                    player.message("§7" + skillName + ": §f" + level);
                }
            }
        }

        player.message("§6============================");

    } catch (err) {
        return;
    }
}