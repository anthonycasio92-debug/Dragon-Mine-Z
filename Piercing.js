// DMZ Apothic Strike Bridge
// PROT_PIERCE -> Strike / SKP Damage
// 1 rank = +10% strike damage
// Disabled while using Ki Manipulation weapons

var STRIKE_BONUS_NAME = "dmzbridge_apothic_strike";
var STRIKE_BONUS_PER_RANK = 0.10;
var STRIKE_TICK_INTERVAL_MS = 500;

var KI_WEAPON_TYPES = {
    "blade": true,
    "scythe": true,
    "clawlance": true
};

function tick(event) {
    try {
        var player = event.player;
        if (player == null) return;

        var mcPlayer = player.getMCEntity();
        if (mcPlayer == null) return;

        var System = Java.type("java.lang.System");
        var now = System.currentTimeMillis();
        var temp = player.getTempdata();

        var last = temp.get("dmzbridge_strike_bonus_tick");
        if (last != null && now - parseInt(last) < STRIKE_TICK_INTERVAL_MS) return;
        temp.put("dmzbridge_strike_bonus_tick", now);

        var StatsProvider = Java.type("com.dragonminez.common.stats.StatsProvider");
        var StatsCapability = Java.type("com.dragonminez.common.stats.StatsCapability");
        var ALAttrs = Java.type("dev.shadowsoffire.attributeslib.api.ALObjects$Attributes");

        var opt = StatsProvider.get(StatsCapability.INSTANCE, mcPlayer);
        var data = null;

        try {
            data = opt.orElse(null);
        } catch (o1) {
            data = null;
        }

        if (data == null) return;

        var bonusStats = null;

        try {
            bonusStats = data.getBonusStats();
        } catch (b1) {
            return;
        }

        if (bonusStats == null) return;

        // Always remove old bonus first.
        // This guarantees the strike bonus is removed immediately when ki weapon is active.
        try {
            bonusStats.removeBonus("SKP", STRIKE_BONUS_NAME);
        } catch (r1) {}

        var kiManipActive = false;
        var weaponType = "";
        var usingKiWeapon = false;

        try {
            kiManipActive = data.getSkills().isSkillActive("kimanipulation");
        } catch (k1) {}

        try {
            weaponType = ("" + data.getStatus().getKiWeaponType()).toLowerCase();
        } catch (k2) {}

        usingKiWeapon = kiManipActive && KI_WEAPON_TYPES[weaponType] == true;

        if (usingKiWeapon) return;

        var strikeRank = 0;

        try {
            strikeRank = Number(mcPlayer.m_21133_(ALAttrs.PROT_PIERCE.get()));
        } catch (a1) {
            strikeRank = 0;
        }

        if (isNaN(strikeRank) || strikeRank <= 0) return;

        var baseStrikeDamage = 0;

        try {
            baseStrikeDamage = Number(data.getStrikeDamage());
        } catch (s1) {
            return;
        }

        if (isNaN(baseStrikeDamage) || baseStrikeDamage <= 0) return;

        var skpScaling = 1.0;

        try {
            skpScaling = Number(data.getStatScaling("SKP"));
        } catch (sc1) {
            skpScaling = 1.0;
        }

        if (isNaN(skpScaling) || skpScaling <= 0) skpScaling = 1.0;

        var powerRelease = 1.0;

        try {
            powerRelease = Number(data.getResources().getPowerRelease()) / 100.0;
        } catch (p1) {
            powerRelease = 1.0;
        }

        if (isNaN(powerRelease) || powerRelease <= 0) powerRelease = 1.0;

        var desiredExtraStrikeDamage = baseStrikeDamage * (strikeRank * STRIKE_BONUS_PER_RANK);
        var neededSkpBonusValue = desiredExtraStrikeDamage / (skpScaling * powerRelease);

        if (isNaN(neededSkpBonusValue) || neededSkpBonusValue <= 0) return;

        try {
            bonusStats.addBonus("SKP", STRIKE_BONUS_NAME, "+", neededSkpBonusValue);
        } catch (add1) {}
    } catch (err) {}
}