/*
 * DBZ Legacy Reborn - LivingHealEvent backup cap for Healing Received.
 *
 * Pure ASCII. ForgeEvents only work from startup_scripts on this KubeJS build.
 * AttributesLib multiplies heals by healing_received at HIGH priority.
 * We correct the amount afterward if the attribute is still above +5%.
 *
 * Requires a full restart (or /kubejs reload startup_scripts) once.
 */

var MAX_HEALING_RECEIVED = 1.05;

console.info("[Heal Cap] startup LivingHealEvent hook evaluating...");

try {
    ForgeEvents.onEvent(
        "net.minecraftforge.event.entity.living.LivingHealEvent",
        function (event) {
            try {
                var entity = null;
                try {
                    entity = event.getEntity();
                } catch (e1) {
                    entity = event.entity;
                }
                if (entity == null) return;

                var isPlayer = false;
                try {
                    isPlayer = entity.isPlayer && entity.isPlayer();
                } catch (e2) {
                    try {
                        isPlayer = !!entity.player;
                    } catch (e3) {}
                }
                if (!isPlayer) {
                    try {
                        var cn = String(entity.getClass().getName());
                        if (cn.indexOf("Player") < 0 && cn.indexOf("player") < 0) {
                            return;
                        }
                        isPlayer = true;
                    } catch (e4) {
                        return;
                    }
                }

                var factor = 1.0;
                try {
                    factor = Number(
                        entity.getAttributeValue("attributeslib:healing_received")
                    );
                } catch (eAttr) {
                    try {
                        var inst = entity.getAttribute(
                            "attributeslib:healing_received"
                        );
                        if (inst != null) factor = Number(inst.getValue());
                    } catch (eAttr2) {
                        return;
                    }
                }

                if (!(factor > MAX_HEALING_RECEIVED)) return;

                var amount = 0;
                try {
                    amount = Number(event.getAmount());
                } catch (eAmt) {
                    amount = Number(event.amount);
                }
                if (!(amount > 0)) return;

                /* amount is already original * factor; scale to original * max */
                var scaled = amount * (MAX_HEALING_RECEIVED / factor);
                try {
                    event.setAmount(scaled);
                } catch (eSet) {
                    try {
                        event.amount = scaled;
                    } catch (eSet2) {}
                }
            } catch (err) {}
        }
    );
    console.info(
        "[Heal Cap] startup LivingHealEvent backup registered (Healing Received max +5%)."
    );
} catch (err) {
    console.error("[Heal Cap] startup ForgeEvents failed: " + err);
}
