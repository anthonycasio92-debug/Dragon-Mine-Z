/*
 * DBZ Legacy Reborn - Disable Apotheosis Spawner Upgrades
 *
 * Removes every apotheosis:spawner_modifier recipe so players cannot
 * upgrade vanilla / Apotheosis spawners (spawn count, delays, ignore
 * light, no AI, redstone control, silent, baby, etc.).
 *
 * Still allowed:
 * - Changing spawner mob type with spawn eggs
 * - Silk-touching / moving spawners (see config/apotheosis/spawner.cfg)
 *
 * Reload with /reload (or full restart). Keep this file on both
 * client and server so JEI stays accurate.
 */

console.info("[Apotheosis Spawner] Disabling spawner upgrade recipes...");

ServerEvents.recipes(function (event) {
    event.remove({ type: "apotheosis:spawner_modifier" });

    console.info(
        "[DBZ Legacy Reborn] Apotheosis spawner upgrade recipes removed."
    );
});
