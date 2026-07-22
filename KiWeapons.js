/*
 * CNPC INSTALL RULE:
 * Put this file in its OWN Script tab / ScriptContainer.
 * Do NOT add multiple .js files into the same tab's ScriptList.
 * CustomNPCs concatenates every file in a tab into ONE scope, so
 * duplicate tick/trigger/init/helpers overwrite each other and one
 * Java.type/load error disables the entire tab until reload.
 */

var MAX_TP_BONUS = 100.0;
var MAX_SHRED = 1.0;
var DAMAGE_DUPLICATE_WINDOW_MS = 75;
var TP_DUPLICATE_WINDOW_MS = 350;

var KI_WEAPON_TYPES = {
    "blade": true,
    "scythe": true,
    "clawlance": true
};

function damagedEntity(event) {
    try {
        var player = event.player;
        if (player == null || event.target == null || event.damage <= 0) return;

        var mcPlayer = player.getMCEntity();
        var mcTarget = event.target.getMCEntity();
        if (mcPlayer == null || mcTarget == null) return;

        var sourceType = "";

        try {
            if (event.damageSource != null && event.damageSource.getType != null) {
                sourceType = "" + event.damageSource.getType();
            }
        } catch (e1) {}

        if (sourceType == "") {
            try {
                if (event.source != null && event.source.getType != null) {
                    sourceType = "" + event.source.getType();
                }
            } catch (e2) {}
        }

        if (sourceType == "") {
            try {
                if (event.damageSource != null) {
                    sourceType = "" + event.damageSource.m_19385_();
                }
            } catch (e3) {}
        }

        sourceType = ("" + sourceType).toLowerCase();

        var isKiProjectile = sourceType == "kiblast" || sourceType == "dragonminez:kiblast";
        var isMelee = sourceType == "player" || sourceType == "minecraft:player";

        if (!isKiProjectile && !isMelee) return;

        var StatsProvider = Java.type("com.dragonminez.common.stats.StatsProvider");
        var StatsCapability = Java.type("com.dragonminez.common.stats.StatsCapability");
        var ALAttrs = Java.type("dev.shadowsoffire.attributeslib.api.ALObjects$Attributes");

        var fireRank = 0;
        var coldRank = 0;
        var strikeRank = 0;
        var armorPierce = 0;
        var armorShred = 0;
        var tpRaw = 1.0;

        try { fireRank = Number(mcPlayer.m_21133_(ALAttrs.FIRE_DAMAGE.get())); } catch (a1) {}
        try { coldRank = Number(mcPlayer.m_21133_(ALAttrs.COLD_DAMAGE.get())); } catch (a2) {}
        try { strikeRank = Number(mcPlayer.m_21133_(ALAttrs.PROT_PIERCE.get())); } catch (a3) {}
        try { armorPierce = Number(mcPlayer.m_21133_(ALAttrs.ARMOR_PIERCE.get())); } catch (a4) {}
        try { armorShred = Number(mcPlayer.m_21133_(ALAttrs.ARMOR_SHRED.get())); } catch (a5) {}
        try { tpRaw = Number(mcPlayer.m_21133_(ALAttrs.EXPERIENCE_GAINED.get())); } catch (a6) {}

        if (isNaN(fireRank) || fireRank < 0) fireRank = 0;
        if (isNaN(coldRank) || coldRank < 0) coldRank = 0;
        if (isNaN(strikeRank) || strikeRank < 0) strikeRank = 0;
        if (isNaN(armorPierce) || armorPierce < 0) armorPierce = 0;
        if (isNaN(armorShred) || armorShred < 0) armorShred = 0;
        if (isNaN(tpRaw) || tpRaw < 1.0) tpRaw = 1.0;

        if (armorShred > MAX_SHRED) armorShred = MAX_SHRED;

        var tpBonus = tpRaw - 1.0;
        if (tpBonus < 0) tpBonus = 0;
        if (tpBonus > MAX_TP_BONUS) tpBonus = MAX_TP_BONUS;

        var playerData = null;

        try {
            var optPlayer = StatsProvider.get(StatsCapability.INSTANCE, mcPlayer);
            playerData = optPlayer.orElse(null);
        } catch (pdErr) {}

        var isKiWeapon = false;
        var isStrike = false;
        var meleeDamage = 0;
        var strikeDamage = 0;

        if (playerData != null) {
            try { meleeDamage = Number(playerData.getMeleeDamage()); } catch (m1) {}
            try { strikeDamage = Number(playerData.getStrikeDamage()); } catch (s1) {}

            if (isMelee) {
                var kiManipActive = false;
                var weaponType = "";

                try { kiManipActive = playerData.getSkills().isSkillActive("kimanipulation"); } catch (kw1) {}
                try { weaponType = ("" + playerData.getStatus().getKiWeaponType()).toLowerCase(); } catch (kw2) {}

                isKiWeapon = kiManipActive && KI_WEAPON_TYPES[weaponType] == true;

                if (!isKiWeapon) {
                    try {
                        var ComboManager = Java.type("com.dragonminez.common.util.ComboManager");
                        isStrike = ComboManager.isNextHitCombo(mcPlayer.m_20148_());
                    } catch (cm1) {}

                    if (!isStrike && strikeDamage > 0) {
                        var checkDamage = Number(event.damage);
                        if (!isNaN(checkDamage)) {
                            var strikeFloor = strikeDamage * 0.60;
                            var meleeCeiling = meleeDamage * 1.20;

                            if (checkDamage >= strikeFloor && checkDamage > meleeCeiling) {
                                isStrike = true;
                            }
                        }
                    }
                }
            }
        }

        if (isNaN(meleeDamage) || meleeDamage < 0) meleeDamage = 0;
        if (isNaN(strikeDamage) || strikeDamage < 0) strikeDamage = 0;

        var targetDefense = 0;

        try {
            var optTarget = StatsProvider.get(StatsCapability.INSTANCE, mcTarget);
            var targetData = optTarget.orElse(null);

            if (targetData != null) {
                try { targetDefense = Number(targetData.getDefense()); } catch (d1) {}
            }
        } catch (d2) {}

        if (isNaN(targetDefense) || targetDefense < 0) targetDefense = 0;

        var pierceBonus = Math.min(armorPierce, targetDefense);
        var shredBonus = Math.min(targetDefense * armorShred, targetDefense);
        var resistBonus = Math.min(pierceBonus + shredBonus, targetDefense);

        var baseDamage = Number(event.damage);
        if (isNaN(baseDamage) || baseDamage <= 0) return;

        var extraDamage = 0;

        if (isKiProjectile) {
            extraDamage += baseDamage * (fireRank * 0.10);
        } else if (isKiWeapon) {
            extraDamage += baseDamage * (coldRank * 0.10);
        } else if (isStrike) {
            extraDamage += baseDamage * (strikeRank * 0.10);
        }

        extraDamage += resistBonus;

        if (extraDamage > 0) {
            var System = Java.type("java.lang.System");
            var now = System.currentTimeMillis();
            var temp = player.getTempdata();

            var playerUUID = "";
            var targetUUID = "";

            try { playerUUID = "" + mcPlayer.m_20148_(); } catch (u1) { playerUUID = "" + player.getName(); }
            try { targetUUID = "" + mcTarget.m_20148_(); } catch (u2) { targetUUID = "" + event.target.getName(); }

            var dmgKey = "dmzbridge_dmg_" + playerUUID + "_" + targetUUID + "_" + sourceType;
            var lastDmg = temp.get(dmgKey);

            if (lastDmg == null || now - parseInt(lastDmg) > DAMAGE_DUPLICATE_WINDOW_MS) {
                temp.put(dmgKey, now);
                event.damage = event.damage + extraDamage;
            }
        }

        if (tpBonus > 0 && playerData != null) {
            try {
                var System2 = Java.type("java.lang.System");
                var now2 = System2.currentTimeMillis();
                var temp2 = player.getTempdata();

                var playerUUID2 = "";
                var targetUUID2 = "";

                try { playerUUID2 = "" + mcPlayer.m_20148_(); } catch (xu1) { playerUUID2 = "" + player.getName(); }
                try { targetUUID2 = "" + mcTarget.m_20148_(); } catch (xu2) { targetUUID2 = "" + event.target.getName(); }

                var tpKey = "dmzbridge_tp_dealt_" + playerUUID2 + "_" + targetUUID2 + "_" + sourceType;
                var lastTp = temp2.get(tpKey);

                if (lastTp == null || now2 - parseInt(lastTp) > TP_DUPLICATE_WINDOW_MS) {
                    temp2.put(tpKey, now2);

                    var maxHealth = 20;
                    try { maxHealth = Number(mcTarget.m_21233_()); } catch (mh1) {}
                    if (isNaN(maxHealth) || maxHealth < 1) maxHealth = 20;

                    var baseTp = Math.min(baseDamage, Math.max(1.0, maxHealth * 0.2));
                    var bonusTp = Math.floor(baseTp * tpBonus);

                    if (bonusTp > 0) {
                        try {
                            playerData.getResources().addTrainingPoints(bonusTp);
                        } catch (tpAddErr) {}
                    }
                }
            } catch (tpErr) {}
        }
    } catch (err) {}
}

function damaged(event) {
    try {
        var player = event.player;
        if (player == null || event.damage <= 0) return;

        var mcPlayer = player.getMCEntity();
        if (mcPlayer == null) return;

        var StatsProvider = Java.type("com.dragonminez.common.stats.StatsProvider");
        var StatsCapability = Java.type("com.dragonminez.common.stats.StatsCapability");
        var ALAttrs = Java.type("dev.shadowsoffire.attributeslib.api.ALObjects$Attributes");

        var playerData = null;

        try {
            playerData = StatsProvider.get(StatsCapability.INSTANCE, mcPlayer).orElse(null);
        } catch (pdErr) {}

        if (playerData == null) return;

        var tpRaw = 1.0;
        try { tpRaw = Number(mcPlayer.m_21133_(ALAttrs.EXPERIENCE_GAINED.get())); } catch (a1) {}

        if (isNaN(tpRaw) || tpRaw < 1.0) tpRaw = 1.0;

        var tpBonus = tpRaw - 1.0;
        if (tpBonus < 0) tpBonus = 0;
        if (tpBonus > MAX_TP_BONUS) tpBonus = MAX_TP_BONUS;

        if (tpBonus <= 0) return;

        var sourceType = "";

        try {
            if (event.damageSource != null && event.damageSource.getType != null) {
                sourceType = "" + event.damageSource.getType();
            }
        } catch (s1) {}

        if (sourceType == "") {
            try {
                if (event.source != null && event.source.getType != null) {
                    sourceType = "" + event.source.getType();
                }
            } catch (s2) {}
        }

        if (sourceType == "") {
            try {
                if (event.damageSource != null) {
                    sourceType = "" + event.damageSource.m_19385_();
                }
            } catch (s3) {}
        }

        sourceType = ("" + sourceType).toLowerCase();

        var System = Java.type("java.lang.System");
        var now = System.currentTimeMillis();
        var temp = player.getTempdata();

        var playerUUID = "";
        try { playerUUID = "" + mcPlayer.m_20148_(); } catch (u1) { playerUUID = "" + player.getName(); }

        var tpKey = "dmzbridge_tp_taken_" + playerUUID + "_" + sourceType;
        var lastTp = temp.get(tpKey);

        if (lastTp == null || now - parseInt(lastTp) > TP_DUPLICATE_WINDOW_MS) {
            temp.put(tpKey, now);

            var dmg = Number(event.damage);
            if (isNaN(dmg) || dmg <= 0) return;

            var bonusTp = Math.floor(dmg * tpBonus);

            if (bonusTp > 0) {
                try {
                    playerData.getResources().addTrainingPoints(bonusTp);
                } catch (tpAddErr) {}
            }
        }
    } catch (err) {}
}