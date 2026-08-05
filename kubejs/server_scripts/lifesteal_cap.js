/*
 * DBZ Legacy Reborn - Hard-cap healing attributes.
 *
 * Caps live AttributesLib values every second so old gear/gems cannot
 * exceed the pack limits:
 *   attributeslib:life_steal        max 0.00  (REMOVED / 0%)
 *   attributeslib:overheal          max 0.05  (5%)
 *   attributeslib:healing_received  max 1.05  (base 1.0 + 5%)
 *
 * IMPORTANT: Healing Received uses MULTIPLY_* modifiers. An ADDITION
 * "delta" cap does not work on it. All caps use MULTIPLY_TOTAL:
 *   final = value * (1 + (max/value - 1)) = max
 *
 * Pure ASCII. Reload: /kubejs reload server_scripts
 */

var TICK_INTERVAL = 20;

var CAPS = [
    {
        attr: "attributeslib:life_steal",
        max: 0.0,
        name: "dbz_lifesteal_cap",
        uuid: "c4a1e8d2-5b73-4f0a-9d6e-2f8b1a0c7e55"
    },
    {
        attr: "attributeslib:overheal",
        max: 0.05,
        name: "dbz_overheal_cap",
        uuid: "d5b2f9e3-6c84-501b-ae7f-309c2b1d8f66"
    },
    {
        attr: "attributeslib:healing_received",
        max: 1.05,
        name: "dbz_healing_received_cap",
        uuid: "e6c3a0f4-7d95-612c-bf80-41ad3c2e9077"
    }
];

var AttributeModifierClass = null;
var OperationClass = null;
var UUIDClass = null;
var JavaReady = false;
var UuidCache = {};

console.info(
    "[DBZ Legacy Reborn] Healing attribute hard caps loading (life steal REMOVED / overheal / healing received)."
);

function ensureJava() {
    if (JavaReady) return AttributeModifierClass != null;
    JavaReady = true;
    try {
        UUIDClass = Java.loadClass("java.util.UUID");
        AttributeModifierClass = Java.loadClass(
            "net.minecraft.world.entity.ai.attributes.AttributeModifier"
        );
        OperationClass = Java.loadClass(
            "net.minecraft.world.entity.ai.attributes.AttributeModifier$Operation"
        );
        for (var i = 0; i < CAPS.length; i++) {
            UuidCache[CAPS[i].name] = UUIDClass.fromString(CAPS[i].uuid);
        }
        console.info("[Heal Cap] Java AttributeModifier ready (MULTIPLY_TOTAL caps).");
    } catch (err) {
        AttributeModifierClass = null;
        console.info(
            "[Heal Cap] Java AttributeModifier unavailable, using KubeJS API: " +
                err
        );
    }
    return AttributeModifierClass != null;
}

function getAttrInstance(entity, attrId) {
    try {
        return entity.getAttribute(attrId);
    } catch (e1) {
        return null;
    }
}

function readAttrValue(entity, attrId) {
    try {
        var inst = getAttrInstance(entity, attrId);
        if (inst != null) return Number(inst.getValue());
    } catch (e1) {}
    try {
        return Number(entity.getAttributeValue(attrId));
    } catch (e2) {}
    return 0;
}

/*
 * Scale final attribute value down to max using MULTIPLY_TOTAL.
 * Works for both ADDITION-heavy attrs (life steal) and MULTIPLY attrs
 * (healing received).
 */
function multiplyCapAmount(value, max) {
    if (!(value > max) || !(value > 0)) return 0;
    return max / value - 1.0;
}

function clampOneJava(entity, cap) {
    var inst = getAttrInstance(entity, cap.attr);
    if (inst == null) return false;
    var uuid = UuidCache[cap.name];
    try {
        inst.removeModifier(uuid);
    } catch (eRem) {}

    var value = 0;
    try {
        value = Number(inst.getValue());
    } catch (eVal) {
        return false;
    }
    var amount = multiplyCapAmount(value, cap.max);
    if (amount === 0) return false;

    try {
        var mod = new AttributeModifierClass(
            uuid,
            cap.name,
            amount,
            OperationClass.MULTIPLY_TOTAL
        );
        try {
            inst.addTransientModifier(mod);
        } catch (eTrans) {
            inst.addPermanentModifier(mod);
        }
        return true;
    } catch (eAdd) {
        console.error("[Heal Cap] multiply cap failed for " + cap.attr + ": " + eAdd);
        return false;
    }
}

function clampOneKube(entity, cap) {
    try {
        entity.removeAttribute(cap.attr, cap.name);
    } catch (e1) {
        try {
            entity.removeAttributeModifier(cap.attr, cap.name);
        } catch (e2) {}
    }

    var value = readAttrValue(entity, cap.attr);
    var amount = multiplyCapAmount(value, cap.max);
    if (amount === 0) return false;

    try {
        entity.modifyAttribute(
            cap.attr,
            cap.name,
            amount,
            "multiply_total"
        );
        return true;
    } catch (e5) {
        try {
            entity.modifyAttribute(
                cap.attr,
                cap.name,
                amount,
                "MULTIPLY_TOTAL"
            );
            return true;
        } catch (e6) {
            return false;
        }
    }
}

function clampAll(entity) {
    if (entity == null) return false;
    var any = false;
    var useJava = ensureJava();
    for (var i = 0; i < CAPS.length; i++) {
        var ok = false;
        if (useJava) ok = clampOneJava(entity, CAPS[i]);
        if (!ok) ok = clampOneKube(entity, CAPS[i]);
        if (ok) any = true;
    }
    return any;
}

function formatHealReceived(value) {
    /* base 1.0 => +0%; 1.05 => +5% */
    var pct = (Number(value) - 1.0) * 100.0;
    if (pct < 0) pct = 0;
    return (Math.round(pct * 10) / 10).toString();
}

function formatPct(value) {
    var pct = Number(value) * 100.0;
    if (pct < 0) pct = 0;
    return (Math.round(pct * 10) / 10).toString();
}

PlayerEvents.loggedIn(function (event) {
    try {
        var player = event.player;
        var hrBefore = readAttrValue(player, "attributeslib:healing_received");
        var ohBefore = readAttrValue(player, "attributeslib:overheal");
        var lsBefore = readAttrValue(player, "attributeslib:life_steal");
        var clamped = clampAll(player);
        var hrAfter = readAttrValue(player, "attributeslib:healing_received");
        var ohAfter = readAttrValue(player, "attributeslib:overheal");
        var lsAfter = readAttrValue(player, "attributeslib:life_steal");
        console.info(
            "[Heal Cap] " +
                player.username +
                " healing_received " +
                hrBefore +
                "->" +
                hrAfter +
                " overheal " +
                ohBefore +
                "->" +
                ohAfter +
                " life_steal " +
                lsBefore +
                "->" +
                lsAfter +
                " clamped=" +
                clamped
        );
        try {
            player.tell(
                "\u00A77Healing caps: Life Steal " +
                    formatPct(lsAfter) +
                    "% (disabled) | Overheal " +
                    formatPct(ohAfter) +
                    "% | Received +" +
                    formatHealReceived(hrAfter) +
                    "%"
            );
        } catch (eTell) {}
    } catch (err) {
        console.error("[Heal Cap] login error: " + err);
    }
});

PlayerEvents.tick(function (event) {
    try {
        var player = event.player;
        if (player == null) return;
        if (player.age % TICK_INTERVAL !== 0) return;
        clampAll(player);
    } catch (err) {}
});

console.info(
    "[DBZ Legacy Reborn] Healing attribute hard caps active (Life Steal=0%, OH<=5%, Healing Received <=+5%)."
);
