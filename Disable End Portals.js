/*
============================================================
 Disable End Portals
 Version: 1.0.0

 Blocks vanilla End Portal / End Gateway travel so players can
 only reach The End through your teleport system (commands,
 script TPs, CMI, etc.).

 HOW IT WORKS:
 - Cancels Forge EntityTravelToDimensionEvent → minecraft:the_end
   when the entity is standing in an end_portal / end_gateway.
 - Intentional TPs (not inside a portal block) are NOT canceled.
 - Optional: blocks placing Eyes of Ender into portal frames so
   new stronghold portals cannot be lit.
 - Player-tick eject is a backup if something still pulls them in.

 INSTALL (CustomNPCs):
   Preferred — Global Forge Scripts (enables the cancel event):
     CustomNPCs → Global → Forge → paste this file → Enable
     Required forge events (auto-named by CNPC):
       - init
       - entityTravelToDimensionEvent
       - playerInteractEventRightClickBlock
       - tickEventPlayerTickEvent

   Also works as Global Player Script for the eject backup only:
     events: tick
     (Forge cancel will not run unless installed as Forge script)

 OPTIONAL BYPASS (rare — only if a TP stands inside a portal):
   player.getTempdata().put("end.travel.allow", "" + (Date.now() + 10000));
============================================================
*/

var NpcAPI = Java.type("noppes.npcs.api.NpcAPI");

/* ========================= CONFIG ========================= */

/* Cancel dimension travel into The End while inside portal blocks. */
var BLOCK_END_PORTAL_TRAVEL = true;

/* Also treat end gateways as blocked portal travel (to The End). */
var BLOCK_END_GATEWAY_TRAVEL = true;

/* Stop Eyes of Ender from lighting end portal frames. */
var BLOCK_ENDER_EYE_ON_FRAMES = true;

/* Backup: shove players out of portal blocks each tick. */
var EJECT_FROM_PORTAL_BLOCKS = true;

/* Message when portal travel / eye placement is blocked. */
var SHOW_MESSAGES = true;
var MSG_PORTAL_BLOCKED =
    "\u00A7cEnd portals are disabled. Use a teleport to reach The End.";
var MSG_EYE_BLOCKED =
    "\u00A7cEnd portals cannot be activated. Use a teleport to reach The End.";

/* Ops / permission level 2+ ignore the block (set false on production). */
var ALLOW_OPS_BYPASS = false;

/* Tempdata key: temporary allow window in epoch-ms string. */
var TEMP_BYPASS = "end.travel.allow";

/* Anti-spam for messages (ms). */
var MSG_COOLDOWN_MS = 2500;
var TEMP_MSG = "end.portal.msg";

/* ========================= HELPERS ========================= */

function nowMs() {
    try { return Number(new Date().getTime()); }
    catch (e) {
        try { return Number(Java.type("java.lang.System").currentTimeMillis()); }
        catch (e2) { return 0; }
    }
}

function str(v) { return v == null ? "" : String(v); }

function msg(player, text) {
    if (SHOW_MESSAGES !== true || player == null) return;
    try {
        var temp = player.getTempdata();
        if (temp != null && temp.has(TEMP_MSG)) {
            var last = Number(temp.get(TEMP_MSG));
            if (!isNaN(last) && nowMs() - last < MSG_COOLDOWN_MS) return;
        }
        if (temp != null) temp.put(TEMP_MSG, "" + nowMs());
    } catch (e1) {}
    try { player.message(text); } catch (e2) {}
}

function hasBypass(entity) {
    if (entity == null) return false;
    try {
        if (ALLOW_OPS_BYPASS === true) {
            var mc = entity.getMCEntity ? entity.getMCEntity() : null;
            if (mc != null) {
                try {
                    if (mc.hasPermissions && mc.hasPermissions(2)) return true;
                } catch (e0) {}
                try {
                    if (mc.m_20310_ && mc.m_20310_(2)) return true;
                } catch (e1) {}
            }
        }
    } catch (e2) {}
    try {
        var temp = entity.getTempdata();
        if (temp != null && temp.has(TEMP_BYPASS)) {
            var until = Number(temp.get(TEMP_BYPASS));
            if (!isNaN(until) && until > nowMs()) return true;
            try { temp.remove(TEMP_BYPASS); } catch (e3) {}
        }
    } catch (e4) {}
    return false;
}

function dimensionIdOf(entity) {
    try {
        var mc = entity.getMCEntity();
        if (mc != null) {
            try { return str(mc.level().dimension().location()); } catch (e1) {}
            try { return str(mc.m_9236_().m_46472_().m_135782_()); } catch (e2) {}
        }
    } catch (e3) {}
    try {
        var world = entity.getWorld();
        if (world != null && world.getDimension != null) {
            return str(world.getDimension().getId());
        }
    } catch (e4) {}
    return "";
}

function isTheEndDimensionId(id) {
    id = str(id).toLowerCase();
    return id === "minecraft:the_end" || id === "the_end" || id.indexOf("the_end") >= 0;
}

function forgeDimensionIsEnd(forgeEvent) {
    try {
        var dim = forgeEvent.getDimension();
        if (dim == null) return false;
        try { return isTheEndDimensionId(dim.location()); } catch (e1) {}
        try { return isTheEndDimensionId(dim.m_135782_()); } catch (e2) {}
        try { return isTheEndDimensionId(dim); } catch (e3) {}
    } catch (e4) {}
    return false;
}

function blockNameAt(world, x, y, z) {
    if (world == null) return "";
    try {
        var b = world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
        if (b == null) return "";
        try { return str(b.getName()).toLowerCase(); } catch (e1) {}
        try { return str(b.getBlockName()).toLowerCase(); } catch (e2) {}
    } catch (e3) {}
    return "";
}

function isPortalTravelBlockName(name) {
    name = str(name).toLowerCase();
    if (name === "") return false;
    /* end_portal_frame is solid — not a travel portal */
    if (name.indexOf("end_portal_frame") >= 0) return false;
    if (BLOCK_END_PORTAL_TRAVEL === true && name.indexOf("end_portal") >= 0) return true;
    if (BLOCK_END_GATEWAY_TRAVEL === true && name.indexOf("end_gateway") >= 0) return true;
    return false;
}

function entityTouchesEndPortal(entity) {
    if (entity == null) return false;
    var world = null;
    try { world = entity.getWorld(); } catch (e0) {}
    if (world == null) return false;

    var x = entity.getX();
    var y = entity.getY();
    var z = entity.getZ();
    var dx, dy, dz;
    for (dx = -1; dx <= 1; dx++) {
        for (dy = -1; dy <= 2; dy++) {
            for (dz = -1; dz <= 1; dz++) {
                if (isPortalTravelBlockName(blockNameAt(world, x + dx, y + dy, z + dz))) {
                    return true;
                }
            }
        }
    }

    /* MC entity AABB scan as fallback */
    try {
        var mc = entity.getMCEntity();
        if (mc == null) return false;
        var level = null;
        try { level = mc.level(); } catch (e1) { try { level = mc.m_9236_(); } catch (e2) {} }
        if (level == null) return false;
        var bb = null;
        try { bb = mc.getBoundingBox(); } catch (e3) { try { bb = mc.m_20191_(); } catch (e4) {} }
        if (bb == null) return false;

        var Blocks = Java.type("net.minecraft.world.level.block.Blocks");
        var BlockPos = Java.type("net.minecraft.core.BlockPos");
        var minX = Math.floor(bb.minX);
        var minY = Math.floor(bb.minY);
        var minZ = Math.floor(bb.minZ);
        var maxX = Math.floor(bb.maxX);
        var maxY = Math.floor(bb.maxY);
        var maxZ = Math.floor(bb.maxZ);
        var px, py, pz;
        for (px = minX; px <= maxX; px++) {
            for (py = minY; py <= maxY; py++) {
                for (pz = minZ; pz <= maxZ; pz++) {
                    var pos = new BlockPos(px, py, pz);
                    var state = null;
                    try { state = level.getBlockState(pos); } catch (e5) {
                        try { state = level.m_8055_(pos); } catch (e6) {}
                    }
                    if (state == null) continue;
                    var block = null;
                    try { block = state.getBlock(); } catch (e7) { try { block = state.m_60734_(); } catch (e8) {} }
                    if (block == null) continue;
                    if (BLOCK_END_PORTAL_TRAVEL === true) {
                        try { if (block === Blocks.END_PORTAL || block === Blocks.f_50259_) return true; } catch (e9) {}
                    }
                    if (BLOCK_END_GATEWAY_TRAVEL === true) {
                        try { if (block === Blocks.END_GATEWAY || block === Blocks.f_50260_) return true; } catch (e10) {}
                    }
                    try {
                        var bn = str(block).toLowerCase();
                        if (isPortalTravelBlockName(bn)) return true;
                    } catch (e11) {}
                }
            }
        }
    } catch (e12) {}
    return false;
}

function ejectFromPortal(player) {
    if (player == null) return false;
    try {
        var x = player.getX();
        var y = player.getY();
        var z = player.getZ();
        /* Nudge back toward overworld-safe footing */
        var nx = x;
        var nz = z;
        var found = false;
        var ox, oz, tx, tz;
        for (ox = -2; ox <= 2 && !found; ox++) {
            for (oz = -2; oz <= 2 && !found; oz++) {
                if (ox === 0 && oz === 0) continue;
                tx = x + ox;
                tz = z + oz;
                if (!isPortalTravelBlockName(blockNameAt(player.getWorld(), tx, y, tz))
                    && !isPortalTravelBlockName(blockNameAt(player.getWorld(), tx, y - 1, tz))) {
                    nx = tx;
                    nz = tz;
                    found = true;
                }
            }
        }
        if (!found) {
            nx = x + 2;
            nz = z + 2;
        }
        try { player.setPosition(nx, y + 0.5, nz); } catch (e1) {
            try {
                var mc = player.getMCEntity();
                mc.teleportTo(nx, y + 0.5, nz);
            } catch (e2) {}
        }
        try {
            var mc2 = player.getMCEntity();
            if (mc2 != null) {
                try { mc2.setDeltaMovement(0, 0.1, 0); } catch (e3) {
                    try { mc2.m_20256_(new (Java.type("net.minecraft.world.phys.Vec3"))(0, 0.1, 0)); } catch (e4) {}
                }
                try { mc2.fallDistance = 0; } catch (e5) {}
            }
        } catch (e6) {}
        return true;
    } catch (e) {
        return false;
    }
}

function cancelForge(scriptEvent, forgeEvent) {
    try { if (scriptEvent != null) scriptEvent.setCanceled(true); } catch (e1) {}
    try { if (forgeEvent != null) forgeEvent.setCanceled(true); } catch (e2) {}
}

function isPlayerEntity(entity) {
    if (entity == null) return false;
    try { if (entity.getType && entity.getType() == 1) return true; } catch (e1) {}
    try {
        var mc = entity.getMCEntity ? entity.getMCEntity() : entity;
        var ServerPlayer = Java.type("net.minecraft.server.level.ServerPlayer");
        if (mc instanceof ServerPlayer) return true;
    } catch (e2) {}
    try {
        var Player = Java.type("net.minecraft.world.entity.player.Player");
        var mc2 = entity.getMCEntity ? entity.getMCEntity() : entity;
        if (mc2 instanceof Player) return true;
    } catch (e3) {}
    return false;
}

/* ========================= FORGE / PLAYER EVENTS ========================= */

function init(event) {
    try {
        print("[DisableEndPortals] Loaded v1.0.0 — End portal travel blocked; script/command TPs still work.");
    } catch (e) {}
}

/*
 * Forge: EntityTravelToDimensionEvent
 * Only cancel when heading to The End AND currently inside a portal block.
 * Normal /tp and script teleports are not inside portals, so they pass.
 */
function entityTravelToDimensionEvent(event) {
    try {
        if (BLOCK_END_PORTAL_TRAVEL !== true && BLOCK_END_GATEWAY_TRAVEL !== true) return;

        var forgeEvent = event.event;
        if (forgeEvent == null) return;
        if (!forgeDimensionIsEnd(forgeEvent)) return;

        var entity = event.entity;
        if (entity == null) return;
        if (!isPlayerEntity(entity)) return;
        if (hasBypass(entity)) return;

        if (!entityTouchesEndPortal(entity)) {
            /* Not in a portal — allow intentional dimension TPs */
            return;
        }

        cancelForge(event, forgeEvent);
        msg(entity, MSG_PORTAL_BLOCKED);
        try { ejectFromPortal(entity); } catch (e1) {}
    } catch (error) {
        try { print("[DisableEndPortals] entityTravelToDimensionEvent: " + error); } catch (e) {}
    }
}

/*
 * Forge: PlayerInteractEvent$RightClickBlock
 * Prevent lighting portal frames with Eyes of Ender.
 */
function playerInteractEventRightClickBlock(event) {
    try {
        if (BLOCK_ENDER_EYE_ON_FRAMES !== true) return;
        var forgeEvent = event.event;
        if (forgeEvent == null) return;

        var entity = event.entity;
        if (entity == null) {
            try { entity = NpcAPI.Instance().getIEntity(forgeEvent.getEntity()); } catch (e0) {}
        }
        if (!isPlayerEntity(entity)) return;
        if (hasBypass(entity)) return;

        var itemName = "";
        try {
            var stack = forgeEvent.getItemStack();
            if (stack != null && !stack.isEmpty()) {
                try { itemName = str(stack.getItem()).toLowerCase(); } catch (e1) {
                    try { itemName = str(stack.m_41720_()).toLowerCase(); } catch (e2) {}
                }
            }
        } catch (e3) {}
        try {
            if (itemName === "" && entity.getMainhandItem) {
                var hand = entity.getMainhandItem();
                if (hand != null) itemName = str(hand.getName()).toLowerCase();
            }
        } catch (e4) {}

        if (itemName.indexOf("ender_eye") < 0 && itemName.indexOf("eye_of_ender") < 0) return;

        var blockName = "";
        try {
            var pos = forgeEvent.getPos();
            var world = entity.getWorld();
            if (pos != null && world != null) {
                blockName = blockNameAt(world, pos.m_123341_ ? pos.m_123341_() : pos.getX(),
                    pos.m_123342_ ? pos.m_123342_() : pos.getY(),
                    pos.m_123343_ ? pos.m_123343_() : pos.getZ());
            }
        } catch (e5) {}

        if (blockName.indexOf("end_portal_frame") < 0) return;

        cancelForge(event, forgeEvent);
        msg(entity, MSG_EYE_BLOCKED);
    } catch (error) {
        try { print("[DisableEndPortals] playerInteractEventRightClickBlock: " + error); } catch (e) {}
    }
}

/* Forge player tick — eject backup */
function tickEventPlayerTickEvent(event) {
    try {
        if (EJECT_FROM_PORTAL_BLOCKS !== true) return;
        var forgeEvent = event.event;
        if (forgeEvent == null) return;
        try {
            var Phase = Java.type("net.minecraftforge.event.TickEvent$Phase");
            if (forgeEvent.phase != null && forgeEvent.phase !== Phase.END) return;
        } catch (e0) {}

        var player = null;
        try { player = event.entity; } catch (e1) {}
        try {
            if (player == null && forgeEvent.player != null) {
                player = NpcAPI.Instance().getIEntity(forgeEvent.player);
            }
        } catch (e2) {}
        if (!isPlayerEntity(player)) return;
        if (hasBypass(player)) return;
        /* Already in The End via TP — don't eject from gateways there unless configured */
        if (isTheEndDimensionId(dimensionIdOf(player))) return;
        if (!entityTouchesEndPortal(player)) return;
        ejectFromPortal(player);
        msg(player, MSG_PORTAL_BLOCKED);
    } catch (error) {
        try { print("[DisableEndPortals] tickEventPlayerTickEvent: " + error); } catch (e) {}
    }
}

/*
 * Global Player Script fallback (if this file is also placed there).
 * Only handles eject — install as Forge script for full cancel support.
 */
function tick(event) {
    try {
        if (EJECT_FROM_PORTAL_BLOCKS !== true) return;
        var player = event.player;
        if (!isPlayerEntity(player)) return;
        if (hasBypass(player)) return;
        if (isTheEndDimensionId(dimensionIdOf(player))) return;
        if (!entityTouchesEndPortal(player)) return;
        ejectFromPortal(player);
        msg(player, MSG_PORTAL_BLOCKED);
    } catch (error) {
        try { print("[DisableEndPortals] tick: " + error); } catch (e) {}
    }
}
