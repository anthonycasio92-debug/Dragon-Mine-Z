/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  lombok.Generated
 *  org.bukkit.entity.Player
 *  org.bukkit.inventory.ItemStack
 *  org.bukkit.inventory.meta.ItemMeta
 *  studio.magemonkey.codex.mccore.config.parse.DataSection
 */
package studio.magemonkey.fabled.manager;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;
import java.util.stream.Collectors;
import lombok.Generated;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
import studio.magemonkey.codex.mccore.config.parse.DataSection;
import studio.magemonkey.fabled.Fabled;
import studio.magemonkey.fabled.api.player.PlayerData;
import studio.magemonkey.fabled.api.util.DamageLoreRemover;
import studio.magemonkey.fabled.api.util.Data;
import studio.magemonkey.fabled.data.formula.Formula;
import studio.magemonkey.fabled.data.formula.value.CustomValue;
import studio.magemonkey.fabled.dynamic.ComponentType;
import studio.magemonkey.fabled.dynamic.EffectComponent;
import studio.magemonkey.fabled.gui.tool.IconHolder;
import studio.magemonkey.fabled.log.LogType;
import studio.magemonkey.fabled.log.Logger;
import studio.magemonkey.fabled.manager.AttributeValue;

public class FabledAttribute
implements IconHolder {
    private static final String DISPLAY = "display";
    private static final String GLOBAL = "global";
    private static final String CONDITION = "condition";
    private static final String MECHANIC = "mechanic";
    private static final String TARGET = "target";
    private static final String STATS = "stats";
    private static final String MAX = "max";
    private static final String COSTBASE = "cost_base";
    private static final String COSTMOD = "cost_modifier";
    private String key;
    private String display;
    private Supplier<ItemStack> iconFn;
    private int max;
    private int costBase;
    private double costModifier;
    private Map<ComponentType, Map<String, AttributeValue[]>> dynamicModifiers = new EnumMap<ComponentType, Map<String, AttributeValue[]>>(ComponentType.class);
    private Map<String, Formula> statModifiers = new HashMap<String, Formula>();

    public FabledAttribute(DataSection data, String key) {
        DataSection stats;
        this.key = key.toLowerCase();
        this.display = data.getString(DISPLAY, key);
        this.iconFn = () -> Data.parseIcon(data);
        this.max = data.getInt(MAX, 999);
        this.costBase = data.getInt(COSTBASE, 1);
        this.costModifier = data.getDouble(COSTMOD, 0.0);
        DataSection globals = data.getSection(GLOBAL);
        if (globals != null) {
            this.loadGroup(globals.getSection(CONDITION), ComponentType.CONDITION);
            this.loadGroup(globals.getSection(MECHANIC), ComponentType.MECHANIC);
            this.loadGroup(globals.getSection(TARGET), ComponentType.TARGET);
        }
        if ((stats = data.getSection(STATS)) != null) {
            for (String stat : stats.keys()) {
                this.loadStatModifier(stats, stat);
            }
        }
    }

    public String getName() {
        return this.display;
    }

    @Override
    public ItemStack getIcon(PlayerData data) {
        ItemStack item = this.iconFn.get();
        ItemMeta meta = item.getItemMeta();
        if (meta != null) {
            meta.setDisplayName(this.filter(data, meta.getDisplayName()));
            List iconLore = meta.getLore();
            ArrayList lore = iconLore != null ? iconLore.stream().map(iconLine -> this.filter(data, (String)iconLine)).collect(Collectors.toList()) : new ArrayList();
            meta.setLore(lore);
            item.setItemMeta(meta);
        }
        return DamageLoreRemover.removeAttackDmg(item);
    }

    @Override
    public boolean isAllowed(Player player) {
        return true;
    }

    private String filter(PlayerData data, String text) {
        return text.replace("{amount}", "" + data.getInvestedAttributeStage(this.key)).replace("{max}", String.valueOf(this.getMax())).replace("{total}", "" + data.getAttribute(this.key)).replace("{cost}", "" + data.getAttributeUpCost(this.key)).replace("{invested}", "" + data.getInvestedAttribute(this.key)).replace("{ap}", "" + data.getAttributePoints());
    }

    public ItemStack getToolIcon() {
        ItemStack icon = this.iconFn.get();
        ItemMeta meta = icon.getItemMeta();
        if (meta == null) {
            return icon;
        }
        meta.setDisplayName(this.key);
        icon.setItemMeta(meta);
        return icon;
    }

    public double modify(EffectComponent component, String key, double value, int amount) {
        key = component.getKey() + "-" + ((String)key).toLowerCase();
        Map<String, AttributeValue[]> map = this.dynamicModifiers.get((Object)component.getType());
        if (map.containsKey(key)) {
            AttributeValue[] list;
            for (AttributeValue attribValue : list = map.get(key)) {
                if (!attribValue.passes(component)) continue;
                return attribValue.apply(value, amount);
            }
        }
        return value;
    }

    public double modifyStat(String key, double base, int amount) {
        if (this.statModifiers.containsKey(key)) {
            return this.statModifiers.get(key).compute(base, amount);
        }
        return base;
    }

    private void loadGroup(DataSection data, ComponentType type) {
        if (data == null) {
            return;
        }
        Map target = this.dynamicModifiers.computeIfAbsent(type, t -> new HashMap());
        for (String key : data.keys()) {
            String lower = key.toLowerCase();
            Logger.log(LogType.ATTRIBUTE_LOAD, 2, "    SkillMod: " + key);
            String value = data.getString(key);
            String[] formulas = value.split("\\|");
            AttributeValue[] values = new AttributeValue[formulas.length];
            int i = 0;
            for (String formula : formulas) {
                values[i++] = new AttributeValue(formula);
            }
            target.put(lower, values);
            Fabled.getAttributesManager().addByComponent(lower, this);
        }
    }

    private void loadStatModifier(DataSection data, String key) {
        if (data.has(key)) {
            Logger.log(LogType.ATTRIBUTE_LOAD, 2, "    StatMod: " + key);
            this.statModifiers.put(key, new Formula(data.getString(key, "v"), new CustomValue("v"), new CustomValue("a")));
            Fabled.getAttributesManager().addByStat(key, this);
        }
    }

    @Generated
    public String getKey() {
        return this.key;
    }

    @Generated
    public int getMax() {
        return this.max;
    }

    @Generated
    public void setMax(int max) {
        this.max = max;
    }

    @Generated
    public int getCostBase() {
        return this.costBase;
    }

    @Generated
    public double getCostModifier() {
        return this.costModifier;
    }

    @Generated
    public void setCostModifier(double costModifier) {
        this.costModifier = costModifier;
    }
}

