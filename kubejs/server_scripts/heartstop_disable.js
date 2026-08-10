/*
 * DBZ Legacy Reborn - Disable Iron's Spells Heartstop (server)
 *
 * Pure ASCII.
 *
 * 1) Removes recipes whose id mentions heartstop (scrolls, etc.).
 * 2) Strips active Heartstop mob effect if somehow applied.
 *
 * Cast cancel is ONLY in startup_scripts/heartstop_disable_hook.js via
 * Forge SpellPreCastEvent (no PlayerEvents.spellPreCast - that needs the
 * optional irons_spells_js addon, which this pack does not use).
 *
 * Optional hard config (1.20.1 TOML): in
 *   <world>/serverconfig/irons_spellbooks-server.toml
 * under [Spells."irons_spellbooks:heartstop"] set Enabled = false
 *
 * Reload: /kubejs reload server_scripts
 * Startup hook: full restart once.
 */

var SPELL_ID = "irons_spellbooks:heartstop";

console.info("[Heartstop Disable] server script loading...");

ServerEvents.recipes(function (event) {
    var removed = 0;

    try {
        event.remove({ id: "irons_spellbooks:heartstop" });
        removed++;
    } catch (e1) {}

    try {
        event.forEachRecipe({}, function (recipe) {
            var rid = "";
            try {
                rid = String(recipe.getId()).toLowerCase();
            } catch (eId) {
                return;
            }
            if (rid.indexOf("heartstop") < 0) return;
            try {
                event.remove({ id: recipe.getId() });
                removed++;
                console.info("[Heartstop Disable] Removed recipe " + rid);
            } catch (eRem) {}
        });
    } catch (eForEach) {
        console.info(
            "[Heartstop Disable] Recipe scan skipped: " + eForEach
        );
    }

    console.info(
        "[Heartstop Disable] Recipe cleanup done (removed=" + removed + ")."
    );
});

/* Addon path (only if irons_spells_js is installed). */
try {
    if (typeof PlayerEvents !== "undefined" && PlayerEvents.spellPreCast) {
        PlayerEvents.spellPreCast(function (event) {
            try {
                var id = "";
                try {
                    id = String(event.spellId || "");
                } catch (e1) {}
                try {
                    if (!id && event.getSpellId) id = String(event.getSpellId());
                } catch (e2) {}
                if (id.toLowerCase() !== SPELL_ID) return;
                try {
                    event.cancel();
                } catch (eC) {
                    try {
                        event.setCanceled(true);
                    } catch (eC2) {}
                }
                try {
                    event.player.tell("\u00A77Heartstop is disabled on this server.");
                } catch (eT) {}
            } catch (err) {}
        });
        console.info("[Heartstop Disable] PlayerEvents.spellPreCast registered.");
    }
} catch (eAddon) {}

function stripHeartstopEffect(entity) {
    if (entity == null) return;
    try {
        var effects = null;
        try {
            effects = entity.getActiveEffects();
        } catch (e1) {
            try {
                effects = entity.activeEffects;
            } catch (e2) {
                return;
            }
        }
        if (effects == null) return;
        var it = effects.iterator();
        while (it.hasNext()) {
            var inst = it.next();
            var eff = null;
            try {
                eff = inst.getEffect();
            } catch (e3) {
                continue;
            }
            var key = "";
            try {
                key = String(eff.getDescriptionId()).toLowerCase();
            } catch (e4) {
                key = String(eff).toLowerCase();
            }
            if (key.indexOf("heartstop") < 0) continue;
            try {
                entity.removeEffect(eff);
            } catch (eR) {}
        }
    } catch (err) {}
}

PlayerEvents.tick(function (event) {
    try {
        var player = event.player;
        if (player == null) return;
        var age = 0;
        try {
            age = player.age;
        } catch (eA) {
            return;
        }
        if (age % 40 !== 0) return;
        stripHeartstopEffect(player);
    } catch (err) {}
});

console.info(
    "[DBZ Legacy Reborn] Heartstop disabled (recipes + effect strip). Cast cancel needs startup hook restart."
);
