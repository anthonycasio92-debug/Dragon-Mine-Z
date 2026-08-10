/*
 * DBZ Legacy Reborn - Disable Iron's Spells Heartstop (startup)
 *
 * Pure ASCII. ForgeEvents only work from startup_scripts on this KubeJS build.
 * Cancels SpellPreCastEvent for irons_spellbooks:heartstop so it cannot be
 * cast from books, scrolls, imbued weapons, etc.
 *
 * Requires a FULL server restart once.
 * Companion: kubejs/server_scripts/heartstop_disable.js (recipes + effect strip)
 */

console.info("[Heartstop Disable] startup hook evaluating...");

var SPELL_ID = "irons_spellbooks:heartstop";

function spellIdOf(event) {
    try {
        if (typeof event.getSpellId === "function") {
            return String(event.getSpellId());
        }
    } catch (e1) {}
    try {
        if (event.spellId != null) return String(event.spellId);
    } catch (e2) {}
    return "";
}

function onSpellPreCast(event) {
    try {
        var id = spellIdOf(event).toLowerCase();
        if (id !== SPELL_ID) return;
        try {
            event.setCanceled(true);
        } catch (eC) {
            try {
                event.cancel();
            } catch (eC2) {}
        }
    } catch (err) {}
}

function onEffectAdded(event) {
    try {
        var effect = null;
        try {
            effect = event.getEffectInstance();
        } catch (e1) {
            try {
                effect = event.effectInstance;
            } catch (e2) {}
        }
        if (effect == null) return;

        var eff = null;
        try {
            eff = effect.getEffect();
        } catch (e3) {
            try {
                eff = effect.effect;
            } catch (e4) {}
        }
        if (eff == null) return;

        var key = "";
        try {
            key = String(eff.getDescriptionId()).toLowerCase();
        } catch (e5) {
            try {
                key = String(eff).toLowerCase();
            } catch (e6) {}
        }
        if (key.indexOf("heartstop") < 0) return;

        try {
            event.setCanceled(true);
        } catch (eC) {
            try {
                event.cancel();
            } catch (eC2) {}
        }

        try {
            var entity = event.getEntity();
            if (entity != null && typeof entity.removeEffect === "function") {
                entity.removeEffect(eff);
            }
        } catch (eR) {}
    } catch (err) {}
}

try {
    ForgeEvents.onEvent(
        "io.redspace.ironsspellbooks.api.events.SpellPreCastEvent",
        onSpellPreCast
    );
    console.info(
        "[Heartstop Disable] SpellPreCastEvent registered (irons_spellbooks:heartstop)."
    );
} catch (err) {
    console.error(
        "[Heartstop Disable] SpellPreCastEvent register failed: " + err
    );
}

try {
    ForgeEvents.onEvent(
        "net.minecraftforge.event.entity.living.MobEffectEvent$Added",
        onEffectAdded
    );
    console.info("[Heartstop Disable] MobEffectEvent$Added registered.");
} catch (err) {
    console.error(
        "[Heartstop Disable] MobEffectEvent register failed: " + err
    );
}
