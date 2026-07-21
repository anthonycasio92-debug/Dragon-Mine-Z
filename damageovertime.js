var BONUS_DOT_FLAG = "bonus_dot_damage_flag";

function damaged(event) {
    var player = event.player;
    if (player == null) return;
    if (event.damageSource == null) return;

    // Prevent recursion from our own extra damage
    if (player.getTempdata().has(BONUS_DOT_FLAG)) {
        return;
    }

    var type = String(event.damageSource.getType());
    if (type == null) return;

    var percent = 0.0;

    switch (type) {
        case "wither":
            percent = 0.02;   // +2%
            break;

        case "starve":
            percent = 0.025;   // +1%
            break;

        case "drown":
            percent = 0.02;   // +2%
            break;

        case "inWall":
            percent = 0.02;   // +2%
            break;

        case "inFire":
        case "onFire":
            percent = 0.025;  // +2.5%
            break;

        case "magic":
            // poison usually comes through magic
            if (hasPotion(player, "minecraft:poison")) {
                percent = 0.01; // +1%
            }
            break;
    }

    if (percent <= 0) return;

    var maxHealth = getMaxHealth(player);
    if (maxHealth <= 0) return;

    var bonusDamage = maxHealth * percent;
    if (bonusDamage <= 0) return;

    applyBonusDamage(player, bonusDamage);
}

function applyBonusDamage(player, bonusDamage) {
    var temp = player.getTempdata();

    temp.put(BONUS_DOT_FLAG, 1);

    try {
        var current = player.getHealth();
        var newHealth = current - bonusDamage;

        if (newHealth < 0) {
            newHealth = 0;
        }

        player.setHealth(newHealth);
    } finally {
        temp.remove(BONUS_DOT_FLAG);
    }
}

function getMaxHealth(player) {
    try {
        return parseFloat(player.getMaxHealth());
    } catch (e) {}

    try {
        return parseFloat(player.getMCEntity().getMaxHealth());
    } catch (e2) {}

    return 0;
}

function hasPotion(player, potionId) {
    try {
        var effects = player.getMCEntity().getActiveEffects().toArray();

        for (var i = 0; i < effects.length; i++) {
            var eff = effects[i];
            if (eff == null) continue;

            try {
                var id = String(
                    eff.getEffect().builtInRegistryHolder().key().location().toString()
                );
                if (id == potionId) {
                    return true;
                }
            } catch (err) {}
        }
    } catch (e) {}

    return false;
}
