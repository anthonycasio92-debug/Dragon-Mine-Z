/*
 * DBZ Legacy Reborn - Disable Tinkers' Construct Necrotic (life steal).
 *
 * Pure ASCII so KubeJS UTF-8 reader never hits MalformedInputException.
 *
 * 1) Removes the Necrotic upgrade + salvage recipes (cannot apply / crystal).
 * 2) Datapack overrides (kubejs/data + highPriorityData) zero the modifier
 *    modules and strip the trait from necrotic_bone material.
 *
 * Existing tools may still list Necrotic, but it will no longer life steal.
 * Reload: /reload  or  /kubejs reload server_scripts then /reload
 */

console.info(
    "[Tinkers Necrotic] Disabling Necrotic life-steal modifier..."
);

ServerEvents.recipes(function (event) {
    var ids = [
        "tconstruct:tools/modifiers/upgrade/necrotic",
        "tconstruct:tools/modifiers/salvage/upgrade/necrotic"
    ];
    var removed = 0;
    for (var i = 0; i < ids.length; i++) {
        try {
            event.remove({ id: ids[i] });
            removed++;
            console.info("[Tinkers Necrotic] Removed recipe " + ids[i]);
        } catch (eRem) {
            console.info(
                "[Tinkers Necrotic] Could not remove " + ids[i] + ": " + eRem
            );
        }
    }

    /* Catch any other recipe that results in tconstruct:necrotic. */
    try {
        event.forEachRecipe({ type: "tconstruct:modifier" }, function (recipe) {
            var keep = true;
            try {
                var rid = String(recipe.getId()).toLowerCase();
                if (rid.indexOf("necrotic") >= 0) keep = false;
            } catch (eId) {}
            try {
                var json = recipe.json;
                var result = null;
                try {
                    result = json.get("result");
                } catch (e1) {
                    try {
                        result = json.result;
                    } catch (e2) {}
                }
                if (result != null && String(result).indexOf("necrotic") >= 0) {
                    keep = false;
                }
            } catch (eJ) {}
            if (!keep) {
                try {
                    event.remove({ id: recipe.getId() });
                    removed++;
                    console.info(
                        "[Tinkers Necrotic] Removed modifier recipe " +
                            recipe.getId()
                    );
                } catch (eR2) {}
            }
        });
    } catch (eForEach) {}

    console.info(
        "[DBZ Legacy Reborn] Tinkers Necrotic recipes removed (" +
            removed +
            "). Modifier datapack zeroed; necrotic_bone trait stripped."
    );
});

/*
 * highPriorityData mirrors kubejs/data overrides so /reload applies even if
 * the data folder copy is missing on the server.
 */
ServerEvents.highPriorityData(function (event) {
    event.addJson("tconstruct:tinkering/modifiers/necrotic", {
        level_display: "tconstruct:default",
        modules: [],
        tooltip_display: "never"
    });

    event.addJson("tconstruct:tinkering/materials/traits/necrotic_bone", {
        default: [],
        perStat: {
            "tconstruct:armor": [
                { level: 1, name: "tconstruct:restore" }
            ],
            "tconstruct:skull": [
                { level: 1, name: "tconstruct:rebuff" },
                { level: 1, name: "tconstruct:wither_skeleton_disguise" }
            ]
        }
    });

    console.info(
        "[Tinkers Necrotic] highPriorityData applied (modifier empty, bone trait cleared)."
    );
});
