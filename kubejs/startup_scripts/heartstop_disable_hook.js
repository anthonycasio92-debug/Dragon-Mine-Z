/*
 * DBZ Legacy Reborn - Disable Iron's Spells Heartstop (startup)
 * Version: 1.1.0
 *
 * Pure ASCII. ForgeEvents only work from startup_scripts on this KubeJS build.
 *
 * Cancels SpellPreCastEvent for irons_spellbooks:heartstop so it cannot be
 * cast from books, scrolls, imbued weapons, etc.
 *
 * NOTE: Do NOT use MobEffectEvent$Added here - it is NOT cancelable on
 * Forge 1.20.1 and can error. Effect strip is handled by the server script.
 *
 * Requires a FULL server restart once.
 * Companion: kubejs/server_scripts/heartstop_disable.js
 */

console.info(
    "[Heartstop Disable] startup hook v1.1.0 evaluating..."
);

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

var registered = false;

try {
    var SpellPreCastEvent = null;
    try {
        SpellPreCastEvent = Java.loadClass(
            "io.redspace.ironsspellbooks.api.events.SpellPreCastEvent"
        );
        console.info(
            "[Heartstop Disable] Loaded Java class SpellPreCastEvent."
        );
    } catch (eLoad) {
        console.error(
            "[Heartstop Disable] SpellPreCastEvent class missing: " + eLoad
        );
    }

    if (SpellPreCastEvent != null) {
        ForgeEvents.onEvent(
            "io.redspace.ironsspellbooks.api.events.SpellPreCastEvent",
            onSpellPreCast
        );
        registered = true;
        console.info(
            "[Heartstop Disable] startup v1.1.0 SpellPreCastEvent registered (irons_spellbooks:heartstop)."
        );
    }
} catch (err) {
    console.error(
        "[Heartstop Disable] SpellPreCastEvent register failed: " + err
    );
}

if (!registered) {
    console.error(
        "[Heartstop Disable] startup v1.1.0 FAILED to register cast cancel. Is Iron's Spells installed?"
    );
}
