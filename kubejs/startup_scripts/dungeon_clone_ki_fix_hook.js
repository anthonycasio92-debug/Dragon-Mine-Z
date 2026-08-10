/*
 * DBZ Legacy Reborn - Dungeon Clone Ki Fix (KubeJS startup join queue)
 *
 * Pure ASCII. ForgeEvents only work from startup_scripts on this build.
 * Queues EntityJoinLevelEvent entities for the server script to process
 * (kubejs/server_scripts/dungeon_clone_ki_fix.js).
 *
 * Requires a FULL server restart once.
 */

console.info("[Dungeon Clone Fix] startup join-queue hook evaluating...");

global.dungeonCloneKiJoinQueue = global.dungeonCloneKiJoinQueue || [];

function queueJoinEntity(entity) {
    if (entity == null) return;
    try {
        /* Keep queue bounded. */
        if (global.dungeonCloneKiJoinQueue.length > 512) {
            global.dungeonCloneKiJoinQueue.splice(
                0,
                global.dungeonCloneKiJoinQueue.length - 512
            );
        }
        global.dungeonCloneKiJoinQueue.push(entity);
    } catch (e) {}
}

function onEntityJoin(event) {
    try {
        var level = null;
        try {
            level = event.getLevel();
        } catch (eL) {
            level = event.level;
        }
        try {
            if (level != null) {
                if (typeof level.isClientSide === "function") {
                    if (level.isClientSide()) return;
                } else if (level.clientSide) {
                    return;
                }
            }
        } catch (eC) {}

        var entity = null;
        try {
            entity = event.getEntity();
        } catch (e1) {
            entity = event.entity;
        }
        if (entity == null) return;

        /* Cheap filter: only queue likely SDU fighters. */
        var cn = "";
        try {
            cn = String(entity.getClass().getName());
        } catch (e2) {
            try {
                if (entity.minecraftEntity != null) {
                    cn = String(entity.minecraftEntity.getClass().getName());
                    entity = entity.minecraftEntity;
                }
            } catch (e3) {}
        }
        if (cn.indexOf("SduDmzFighter") < 0 && cn.indexOf("sdu") < 0) {
            /* Also accept unknown wrappers; server script filters. */
            try {
                var typeId = "";
                try {
                    typeId = String(entity.getType());
                } catch (e4) {
                    try {
                        typeId = String(entity.type);
                    } catch (e5) {}
                }
                if (typeId.indexOf("dmz_fighter") < 0 && typeId.indexOf("sdu") < 0) {
                    /* Still queue Living entities near spawners is too broad.
                     * Only queue if class string looks related OR persistent tags. */
                    var tagged = false;
                    try {
                        var tag = entity.getPersistentData();
                        tagged =
                            tag != null &&
                            (tag.contains("sdd_spawner") ||
                                tag.contains("sdu_clone_ref"));
                    } catch (e6) {}
                    if (!tagged) return;
                }
            } catch (e7) {
                return;
            }
        }

        queueJoinEntity(entity);
    } catch (err) {}
}

try {
    ForgeEvents.onEvent(
        "net.minecraftforge.event.entity.EntityJoinLevelEvent",
        onEntityJoin
    );
    console.info(
        "[Dungeon Clone Fix] startup EntityJoinLevelEvent queue registered."
    );
} catch (err) {
    console.error("[Dungeon Clone Fix] startup ForgeEvents failed: " + err);
}
