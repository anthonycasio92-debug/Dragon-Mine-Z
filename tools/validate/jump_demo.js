/*
 * "Hello world" execution demo for the Dragon-Mine-Z script pack.
 *
 * Runs the REAL Jump.js `tick()` function on the same Nashorn engine the
 * Minecraft server uses. The only things mocked are the external game APIs
 * (DragonMineZ stats/skills, CustomNPCs player object) that a live server would
 * provide. This exercises the core progression logic: as a player's Strength
 * grows, their Jump skill should level up according to JUMP_STRENGTH_REQUIREMENTS.
 *
 * Run with: nashorn Shell -> jump_demo.js <path-to-Jump.js>
 */

var jumpPath = (typeof arguments !== "undefined" && arguments.length > 0)
    ? arguments[0]
    : "Jump.js";

var captured = [];

// Mock clock, advanced manually so the script's 1s throttle never blocks us.
var fakeNow = 100000;

// Override the Nashorn `Java` global so top-level Java.type(...) imports in
// Jump.js resolve to lightweight JS mocks instead of the (absent) mod classes.
Java = {
    type: function (name) {
        if (name === "java.lang.System") {
            return { currentTimeMillis: function () { return fakeNow; } };
        }
        if (name.indexOf("StatsCapability") !== -1) {
            return { INSTANCE: {} };
        }
        if (name.indexOf("StatsProvider") !== -1) {
            return {
                get: function (cap, mcPlayer) {
                    return { orElse: function (d) { return mcPlayer.__statData; } };
                }
            };
        }
        if (name.indexOf("StatsSyncS2C") !== -1) {
            // Returned as a constructor; `new StatsSyncS2C(x)` must work.
            return function (mcPlayer) { this.mcPlayer = mcPlayer; };
        }
        if (name.indexOf("NetworkHandler") !== -1) {
            return { sendToTrackingEntityAndSelf: function () { captured.push("[net] StatsSync sent"); } };
        }
        throw new Error("Unexpected Java.type in demo: " + name);
    }
};

// ---- Build a fake CustomNPCs player backed by DragonMineZ stat/skill data ----
function makeSkills() {
    var levels = {};
    var maxLevels = {};
    return {
        registerDefaultSkill: function (id, max) { if (maxLevels[id] == null) maxLevels[id] = max; if (levels[id] == null) levels[id] = 0; },
        refreshNonFormSkillMaxLevels: function () {},
        getSkillLevel: function (id) { return levels[id] || 0; },
        getMaxSkillLevel: function (id) { return maxLevels[id] || 0; },
        setSkillLevel: function (id, lvl) { levels[id] = lvl; }
    };
}

function makePlayer(skills, strengthRef) {
    var temp = {};
    var mcPlayer = {};
    var player = {
        getTempdata: function () {
            return {
                has: function (k) { return temp.hasOwnProperty(k); },
                get: function (k) { return temp[k]; },
                put: function (k, v) { temp[k] = v; }
            };
        },
        getMCEntity: function () { return mcPlayer; },
        message: function (m) { captured.push(m); }
    };
    mcPlayer.__statData = {
        getStats: function () { return { getStrength: function () { return strengthRef.value; } }; },
        getSkills: function () { return skills; }
    };
    return player;
}

// ---- Load the real Jump.js so tick() is the production implementation ----
load(jumpPath);

var skills = makeSkills();
var strengthRef = { value: 0 };
var player = makePlayer(skills, strengthRef);
var event = { player: player };

function runTick(label, strength) {
    strengthRef.value = strength;
    fakeNow += 5000; // pass the throttle window each call
    captured = [];
    tick(event);
    var lvl = skills.getSkillLevel("jump");
    print("  Strength=" + strength + "  ->  Jump level=" + lvl
        + (captured.length ? ("   msgs: " + captured.join(" | ")) : ""));
    return lvl;
}

print("=== Dragon-Mine-Z hello-world: running real Jump.js tick() on Nashorn ===\n");

var ok = true;
if (runTick("start", 0) !== 0) ok = false;      // below first requirement -> stays 0
if (runTick("t1", 20) !== 1) ok = false;         // >=20 strength -> level 1 (unlock)
if (runTick("t2", 300) !== 3) ok = false;        // >=250 -> level 3
if (runTick("t3", 3500) !== 10) ok = false;      // >=3500 -> maxed at 10

print("\n---------------------------------------------");
if (ok) {
    print("PASS: Jump progression logic executed correctly on Nashorn.");
} else {
    print("FAIL: unexpected Jump levels.");
    throw new Error("jump_demo assertions failed");
}
