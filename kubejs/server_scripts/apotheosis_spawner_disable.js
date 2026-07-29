/*
 * DBZ Legacy Reborn - Disable Apotheosis Spawner Upgrades
 *
 * Removes every apotheosis:spawner_modifier recipe so players cannot
 * upgrade vanilla / Apotheosis spawners (spawn count, delays, ignore
 * light, no AI, redstone control, etc.).
 *
 * Still allowed:
 * - Changing spawner mob type with spawn eggs
 * - Silk-touching / moving spawners (Spawner module silk settings)
 *
 * Reload with /reload (or restart). Client + server both need the
 * script so JEI / recipe book stay in sync.
 */

console.info("[Apotheosis Spawner] Disabling spawner upgrade recipes...");

ServerEvents.recipes(function (event) {
    event.remove({ type: "apotheosis:spawner_modifier" });

    console.info(
        "[DBZ Legacy Reborn] Apotheosis spawner upgrade recipes removed."
    );
});

/*
 * Hard block: if any modifier recipe survives (datapack / other mod),
 * cancel right-clicks on spawners that are not spawn eggs.
 */
BlockEvents.rightClicked("minecraft:spawner", function (event) {
    try {
        var player = event.player;
        if (player == null) return;

        var stack = event.item;
        if (stack == null) return;

        try {
            if (stack.isEmpty && stack.isEmpty()) return;
        } catch (eEmpty) {}

        var id = "";
        try {
            id = String(stack.id);
        } catch (eId) {
            return;
        }

        // Spawn eggs still change the spawner type.
        if (id.indexOf("_spawn_egg") >= 0 || id.indexOf("spawn_egg") >= 0) {
            return;
        }

        // Empty hand / air: leave alone.
        if (id === "minecraft:air" || id === "") return;

        /*
         * Any other held item on a spawner is treated as a blocked
         * Apotheosis upgrade attempt. Vanilla has no useful
         * right-click on spawners besides eggs.
         */
        event.cancel();

        if (!event.level.isClientSide()) {
            try {
                player.tell(
                    "\u00A7cApotheosis spawner upgrades are disabled on this server."
                );
            } catch (eTell) {}
        }
    } catch (err) {
        console.error("[Apotheosis Spawner] rightClicked error: " + err);
    }
});

console.info(
    "[DBZ Legacy Reborn] Apotheosis spawner upgrade disable handlers registered."
);
