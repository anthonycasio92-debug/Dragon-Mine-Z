/*
 * DBZ Legacy Reborn - Apotheosis Spawner Chunk Hook (startup)
 *
 * Pure ASCII so KubeJS UTF-8 reader never hits MalformedInputException.
 *
 * ForgeEvents.onEvent only works from startup_scripts on KubeJS 1.20.1.
 * Queue loaded chunk positions for the server script to vanillaize.
 *
 * Requires a full restart (or /kubejs reload startup_scripts) once.
 */

console.info("[Apotheosis Spawner] startup chunk hook evaluating...");

global.apothSpawnerChunkQueue = global.apothSpawnerChunkQueue || [];

function queueChunkFromEvent(event) {
    try {
        var level = null;
        var chunk = null;
        try {
            level = event.getLevel();
        } catch (e1) {
            try {
                level = event.level;
            } catch (e2) {}
        }
        try {
            chunk = event.getChunk();
        } catch (e3) {
            try {
                chunk = event.chunk;
            } catch (e4) {}
        }
        if (level == null || chunk == null) return;

        try {
            if (level.isClientSide && level.isClientSide()) return;
        } catch (eClient) {
            try {
                if (level.clientSide) return;
            } catch (eClient2) {}
        }

        var cx = 0;
        var cz = 0;
        try {
            var pos = chunk.getPos();
            cx = pos.x;
            cz = pos.z;
        } catch (ePos) {
            try {
                cx = chunk.x;
                cz = chunk.z;
            } catch (ePos2) {
                return;
            }
        }

        var dim = "minecraft:overworld";
        try {
            dim = String(level.dimension);
        } catch (eDim) {
            try {
                dim = String(level.dimension.toString());
            } catch (eDim2) {
                try {
                    dim = String(level.getDimensionKey().location());
                } catch (eDim3) {}
            }
        }

        global.apothSpawnerChunkQueue.push({
            dim: dim,
            x: cx,
            z: cz,
            at: Date.now()
        });

        /* Cap queue so a huge world load cannot grow forever. */
        if (global.apothSpawnerChunkQueue.length > 2048) {
            global.apothSpawnerChunkQueue.splice(0, global.apothSpawnerChunkQueue.length - 2048);
        }
    } catch (err) {}
}

try {
    ForgeEvents.onEvent(
        "net.minecraftforge.event.level.ChunkEvent$Load",
        queueChunkFromEvent
    );
    console.info(
        "[Apotheosis Spawner] startup Forge ChunkEvent$Load queue registered."
    );
} catch (err) {
    console.error(
        "[Apotheosis Spawner] startup ForgeEvents failed: " + err
    );
}
