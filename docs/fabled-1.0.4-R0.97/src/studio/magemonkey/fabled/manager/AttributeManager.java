/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  lombok.Generated
 *  org.bukkit.plugin.java.JavaPlugin
 *  studio.magemonkey.codex.mccore.config.CommentedConfig
 *  studio.magemonkey.codex.mccore.config.parse.DataSection
 */
package studio.magemonkey.fabled.manager;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import lombok.Generated;
import org.bukkit.plugin.java.JavaPlugin;
import studio.magemonkey.codex.mccore.config.CommentedConfig;
import studio.magemonkey.codex.mccore.config.parse.DataSection;
import studio.magemonkey.fabled.Fabled;
import studio.magemonkey.fabled.dynamic.EffectComponent;
import studio.magemonkey.fabled.gui.tool.GUIData;
import studio.magemonkey.fabled.gui.tool.GUIPage;
import studio.magemonkey.fabled.gui.tool.GUITool;
import studio.magemonkey.fabled.log.LogType;
import studio.magemonkey.fabled.log.Logger;
import studio.magemonkey.fabled.manager.FabledAttribute;
import studio.magemonkey.fabled.manager.IAttributeManager;

public class AttributeManager
implements IAttributeManager {
    public static final String ARMOR = "armor";
    public static final String ARMOR_TOUGHNESS = "armor-toughness";
    public static final String ATTACK_SPEED = "attack-speed";
    public static final String COOLDOWN = "cooldown";
    public static final String EXPERIENCE = "exp";
    public static final String HEALTH = "health";
    public static final String HUNGER = "hunger";
    public static final String HUNGER_HEAL = "hunger-heal";
    public static final String KNOCKBACK_RESIST = "knockback-resist";
    public static final String LUCK = "luck";
    public static final String MANA = "mana";
    public static final String MANA_COST = "mana-cost";
    public static final String MANA_REGEN = "mana-regen";
    public static final String MELEE_DAMAGE = "melee-damage";
    public static final String MELEE_DEFENSE = "melee-defense";
    public static final String MOVE_SPEED = "move-speed";
    public static final String PHYSICAL_DAMAGE = "physical-damage";
    public static final String PHYSICAL_DEFENSE = "physical-defense";
    public static final String PROJECTILE_DAMAGE = "projectile-damage";
    public static final String PROJECTILE_DEFENSE = "projectile-defense";
    public static final String SKILL_DAMAGE = "skill-damage";
    public static final String SKILL_DEFENSE = "skill-defense";
    public static final String ABSORPTION = "absorption";
    public static final String ATTACK_DAMAGE = "attack-damage";
    public static final String ATTACK_KNOCKBACK = "attack-knockback";
    public static final String BURNING_TIME = "burning-time";
    public static final String EXPLOSION_KNOCKBACK_RESISTANCE = "explosion-knockback-resistance";
    public static final String FALL_DAMAGE_MULTIPLIER = "fall-damage-multiplier";
    public static final String GRAVITY = "gravity";
    public static final String JUMP_STRENGTH = "jump-strength";
    public static final String MOVEMENT_EFFICIENCY = "movement-efficiency";
    public static final String OXYGEN_BONUS = "oxygen-bonus";
    public static final String SAFE_FALL_DISTANCE = "safe-fall-distance";
    public static final String SCALE = "scale";
    public static final String STEP_HEIGHT = "step-height";
    public static final String WATER_MOVEMENT_EFFICIENCY = "water-movement-efficiency";
    public static final String BLOCK_BREAK_SPEED = "block-break-speed";
    public static final String BLOCK_INTERACTION_RANGE = "block-interaction-range";
    public static final String ENTITY_INTERACTION_RANGE = "entity-interaction-range";
    public static final String MINING_EFFICIENCY = "mining-efficiency";
    public static final String SNEAKING_SPEED = "sneaking-speed";
    public static final String SUBMERGED_MINING_SPEED = "submerged-mining-speed";
    public static final String SWEEPING_DAMAGE_RATIO = "sweeping-damage-ratio";
    private final Map<String, FabledAttribute> attributes = new LinkedHashMap<String, FabledAttribute>();
    private final Map<String, FabledAttribute> lookup = new HashMap<String, FabledAttribute>();
    private final Map<String, List<FabledAttribute>> byStat = new HashMap<String, List<FabledAttribute>>();
    private final Map<String, List<FabledAttribute>> byComponent = new HashMap<String, List<FabledAttribute>>();

    @Override
    public FabledAttribute getAttribute(String key) {
        return this.lookup.get(key.toLowerCase());
    }

    @Override
    public List<FabledAttribute> forStat(String key) {
        return this.byStat.get(key);
    }

    @Override
    public List<FabledAttribute> forComponent(EffectComponent component, String key) {
        return this.byComponent.get(component.getKey() + "-" + key.toLowerCase());
    }

    @Override
    public Set<String> getKeys() {
        return this.attributes.keySet();
    }

    @Override
    public Set<String> getLookupKeys() {
        return this.lookup.keySet();
    }

    @Override
    public String normalize(String key) {
        FabledAttribute fabledAttribute = this.lookup.get(key.toLowerCase());
        if (fabledAttribute == null) {
            throw new IllegalArgumentException("Invalid attribute - " + key);
        }
        return fabledAttribute.getKey();
    }

    public void load(Fabled api) {
        CommentedConfig config = new CommentedConfig((JavaPlugin)api, "attributes");
        config.saveDefaultConfig();
        DataSection data = config.getConfig();
        Logger.log(LogType.ATTRIBUTE_LOAD, 1, "Loading attributes...");
        for (String key : data.keys()) {
            Logger.log(LogType.ATTRIBUTE_LOAD, 2, "  - " + key);
            FabledAttribute fabledAttribute = new FabledAttribute(data.getSection(key), key);
            this.attributes.put(fabledAttribute.getKey(), fabledAttribute);
            this.lookup.put(fabledAttribute.getKey(), fabledAttribute);
            this.lookup.put(fabledAttribute.getName().toLowerCase(), fabledAttribute);
        }
        GUIData attribs = GUITool.getAttributesMenu();
        if (!attribs.isValid()) {
            int i = 0;
            GUIPage page = attribs.getPage(0);
            for (String key : this.attributes.keySet()) {
                if (i >= 54) continue;
                page.set(i++, key);
            }
            attribs.resize((this.attributes.size() + 8) / 9);
        }
    }

    @Override
    public void addByComponent(String key, FabledAttribute fabledAttribute) {
        this.byComponent.computeIfAbsent(key, k -> new ArrayList()).add(fabledAttribute);
    }

    @Override
    public void addByStat(String key, FabledAttribute fabledAttribute) {
        this.byStat.computeIfAbsent(key, k -> new ArrayList()).add(fabledAttribute);
    }

    @Override
    @Generated
    public Map<String, FabledAttribute> getAttributes() {
        return this.attributes;
    }
}

