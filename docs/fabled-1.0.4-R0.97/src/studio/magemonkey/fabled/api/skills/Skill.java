/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  lombok.Generated
 *  org.bukkit.Bukkit
 *  org.bukkit.Location
 *  org.bukkit.Material
 *  org.bukkit.OfflinePlayer
 *  org.bukkit.entity.Entity
 *  org.bukkit.entity.LivingEntity
 *  org.bukkit.entity.Player
 *  org.bukkit.event.Event
 *  org.bukkit.event.entity.EntityDamageEvent$DamageCause
 *  org.bukkit.inventory.ItemStack
 *  org.bukkit.inventory.meta.ItemMeta
 *  org.bukkit.metadata.FixedMetadataValue
 *  org.bukkit.metadata.MetadataValue
 *  org.bukkit.plugin.Plugin
 *  org.bukkit.util.Vector
 *  studio.magemonkey.codex.compat.VersionManager
 *  studio.magemonkey.codex.mccore.config.CustomFilter
 *  studio.magemonkey.codex.mccore.config.Filter
 *  studio.magemonkey.codex.mccore.config.FilterType
 *  studio.magemonkey.codex.mccore.config.parse.DataSection
 *  studio.magemonkey.codex.mccore.config.parse.NumberParser
 *  studio.magemonkey.codex.mccore.util.TextFormatter
 *  studio.magemonkey.codex.registry.DamageRegistry
 *  studio.magemonkey.codex.util.StringUT
 */
package studio.magemonkey.fabled.api.skills;

import java.text.DecimalFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Supplier;
import lombok.Generated;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.OfflinePlayer;
import org.bukkit.entity.Entity;
import org.bukkit.entity.LivingEntity;
import org.bukkit.entity.Player;
import org.bukkit.event.Event;
import org.bukkit.event.entity.EntityDamageEvent;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.metadata.FixedMetadataValue;
import org.bukkit.metadata.MetadataValue;
import org.bukkit.plugin.Plugin;
import org.bukkit.util.Vector;
import studio.magemonkey.codex.compat.VersionManager;
import studio.magemonkey.codex.mccore.config.CustomFilter;
import studio.magemonkey.codex.mccore.config.Filter;
import studio.magemonkey.codex.mccore.config.FilterType;
import studio.magemonkey.codex.mccore.config.parse.DataSection;
import studio.magemonkey.codex.mccore.config.parse.NumberParser;
import studio.magemonkey.codex.mccore.util.TextFormatter;
import studio.magemonkey.codex.registry.DamageRegistry;
import studio.magemonkey.codex.util.StringUT;
import studio.magemonkey.fabled.Fabled;
import studio.magemonkey.fabled.api.ReadOnlySettings;
import studio.magemonkey.fabled.api.Settings;
import studio.magemonkey.fabled.api.event.SkillDamageEvent;
import studio.magemonkey.fabled.api.event.TrueDamageEvent;
import studio.magemonkey.fabled.api.player.PlayerCombos;
import studio.magemonkey.fabled.api.player.PlayerData;
import studio.magemonkey.fabled.api.player.PlayerSkill;
import studio.magemonkey.fabled.api.skills.SkillShot;
import studio.magemonkey.fabled.api.skills.TargetSkill;
import studio.magemonkey.fabled.api.util.Buff;
import studio.magemonkey.fabled.api.util.BuffManager;
import studio.magemonkey.fabled.api.util.BuffType;
import studio.magemonkey.fabled.api.util.DamageLoreRemover;
import studio.magemonkey.fabled.api.util.Data;
import studio.magemonkey.fabled.dynamic.TempEntity;
import studio.magemonkey.fabled.gui.tool.IconHolder;
import studio.magemonkey.fabled.hook.NoCheatHook;
import studio.magemonkey.fabled.hook.PluginChecker;
import studio.magemonkey.fabled.language.RPGFilter;
import studio.magemonkey.fabled.log.Logger;

public abstract class Skill
implements IconHolder {
    private static final DecimalFormat FORMAT = new DecimalFormat("#########0.0#");
    private static final String NAME = "name";
    private static final String TYPE = "type";
    private static final String LAYOUT = "icon-lore";
    private static final String MAX = "max-level";
    private static final String REQ = "skill-req";
    private static final String REQLVL = "skill-req-lvl";
    private static final String MSG = "msg";
    private static final String PERM = "needs-permission";
    private static final String COOLDOWN_MESSAGE = "cooldown-message";
    private static final String INCOMPATIBLE = "incompatible";
    private static final String DESC = "desc";
    private static final String ATTR = "attributes";
    private static final String COMBO = "combo";
    private static boolean skillDamage = false;
    protected final Settings settings = new Settings();
    private final ArrayList<String> description = new ArrayList();
    private final ReadOnlySettings readOnlySettings = new ReadOnlySettings(this.settings);
    private final String key;
    private List<String> iconLore;
    private Supplier<ItemStack> indicatorFn;
    private String name;
    private String type;
    private String message;
    private String skillReq;
    private int maxLevel;
    private int skillReqLevel;
    private boolean needsPermission;
    private boolean cooldownMessage;
    private List<String> incompatibleSkills;
    private int combo;

    public Skill(String name, String type, Material indicator, int maxLevel) {
        this(name, type, new ItemStack(indicator), maxLevel, null, 0);
    }

    public Skill(String name, String type, Material indicator, int maxLevel, String skillReq, int skillReqLevel) {
        this(name, type, new ItemStack(indicator), maxLevel, skillReq, skillReqLevel);
    }

    public Skill(String name, String type, ItemStack indicator, int maxLevel) {
        this(name, type, indicator, maxLevel, null, 0);
    }

    public Skill(String name, String type, ItemStack indicator, int maxLevel, String skillReq, int skillReqLevel) {
        this(name, type, indicator, maxLevel, skillReq, skillReqLevel, null);
    }

    public Skill(String name, String type, ItemStack indicator, int maxLevel, String skillReq, int skillReqLevel, Map<String, Map.Entry<Double, Double>> attributes) {
        if (name == null) {
            throw new IllegalArgumentException("Skill name cannot be null");
        }
        if (type == null) {
            type = "Unknown type";
        }
        if (indicator == null) {
            indicator = new ItemStack(Material.APPLE);
        }
        if (maxLevel < 1) {
            maxLevel = 1;
        }
        if (attributes != null) {
            for (Map.Entry<String, Map.Entry<Double, Double>> attribute : attributes.entrySet()) {
                this.settings.set(attribute.getKey(), attribute.getValue().getKey(), attribute.getValue().getValue());
            }
        }
        this.key = name.toLowerCase();
        this.type = type;
        this.name = name;
        ItemStack finalIndicator = indicator;
        this.indicatorFn = () -> finalIndicator;
        this.maxLevel = maxLevel;
        this.skillReq = skillReq;
        this.skillReqLevel = skillReqLevel;
        this.needsPermission = false;
        this.message = (String)Fabled.getLanguage().getMessage("Notifications.cast", true, FilterType.COLOR, new CustomFilter[0]).get(0);
        this.iconLore = Fabled.getLanguage().getMessage("Skill Tree.layout", true, FilterType.COLOR, new CustomFilter[0]);
    }

    public ItemStack getIndicator() {
        return this.indicatorFn.get();
    }

    public boolean hasCombo() {
        return this.combo >= 0;
    }

    public boolean canAutoLevel(int level) {
        return this.getCost(level) == 0 && !this.doesRequireAttributes(level);
    }

    public boolean hasMessage() {
        return this.message != null && this.message.length() > 0;
    }

    public void clearCombo() {
        this.combo = -1;
    }

    public boolean needsPermission() {
        return this.needsPermission;
    }

    public boolean hasSkillReq() {
        return Fabled.getSkill(this.skillReq) != null && this.skillReqLevel > 0;
    }

    public List<String> getDescription() {
        return this.description;
    }

    public int getLevelReq(int level) {
        return (int)this.settings.getAttr("level", level + 1);
    }

    public double getManaCost(int level) {
        return this.settings.getAttr("mana", level);
    }

    public double getManaCost(int level, PlayerData player) {
        return player.scaleStat("mana-cost", this.settings.getAttr("mana", level));
    }

    public double getManaCost(int level, Player player) {
        return this.getManaCost(level, Fabled.getData((OfflinePlayer)player));
    }

    public double getCooldown(int level) {
        return this.settings.getAttr("cooldown", level);
    }

    private boolean doesRequireAttributes(int level) {
        Set<String> attributes = Fabled.getAttributesManager().getKeys();
        for (String key : attributes) {
            if (this.settings.getAttr(key, level, 0.0) == 0.0) continue;
            return true;
        }
        return false;
    }

    public boolean cooldownMessage() {
        return this.cooldownMessage;
    }

    public double getRange(int level) {
        return this.settings.getAttr("range", level);
    }

    public int getCost(int level) {
        return (int)this.settings.getAttr("cost", level + 1);
    }

    public ReadOnlySettings getSettings() {
        return this.readOnlySettings;
    }

    public boolean canCast() {
        return this instanceof SkillShot || this instanceof TargetSkill;
    }

    public ItemStack getToolIndicator() {
        ItemStack item = this.indicatorFn.get();
        ItemMeta meta = item.getItemMeta();
        if (meta != null) {
            List lore;
            List list = lore = meta.hasLore() ? meta.getLore() : new ArrayList();
            if (meta.hasDisplayName()) {
                lore.add(0, meta.getDisplayName());
            }
            lore.add("Level: " + this.getLevelReq(0));
            lore.add("Cost: " + this.getCost(0));
            meta.setLore(lore);
            meta.setDisplayName(this.name);
            item.setItemMeta(meta);
        }
        return item;
    }

    @Override
    public ItemStack getIcon(PlayerData data) {
        PlayerSkill skill = data.getSkill(this.name);
        if (skill != null) {
            return this.getIndicator(skill, false);
        }
        return this.getIndicator();
    }

    @Override
    public boolean isAllowed(Player player) {
        return !this.needsPermission() || player.hasPermission("fabled.skill") || player.hasPermission("fabled.skill." + this.name.toLowerCase().replace(" ", "-"));
    }

    public boolean hasDependency(PlayerData playerData) {
        if (this.getSkillReq() != null) {
            PlayerSkill req = playerData.getSkill(this.getSkillReq());
            return req == null || req.getLevel() >= this.getSkillReqLevel();
        }
        return true;
    }

    public boolean isCompatible(PlayerData playerData) {
        for (String skillName : this.incompatibleSkills) {
            PlayerSkill skill = playerData.getSkill(skillName);
            if (skill == null || skill.getLevel() <= 0) continue;
            return false;
        }
        return true;
    }

    public boolean hasInvestedEnough(PlayerData playerData) {
        PlayerSkill skill = playerData.getSkill(this.name);
        if (skill == null) {
            return false;
        }
        double reqPoints = this.settings.getAttr("points-spent-req", skill.getLevel(), 0.0);
        return (double)playerData.getInvestedSkillPoints() >= reqPoints;
    }

    public boolean hasEnoughAttributes(PlayerData playerData) {
        Set<String> attributes = Fabled.getAttributesManager().getKeys();
        for (String attr : attributes) {
            if (this.checkSingleAttribute(playerData, attr)) continue;
            return false;
        }
        return true;
    }

    public boolean checkSingleAttribute(PlayerData playerData, String key) {
        PlayerSkill skill = playerData.getSkill(this.name);
        double reqAttr = this.settings.getAttr(key, skill.getLevel() + 1);
        return (double)playerData.getAttribute(key) >= reqAttr;
    }

    public ItemStack getIndicator(PlayerSkill skillData, boolean brief) {
        PlayerCombos combos;
        Player player = skillData.getPlayerData().getPlayer();
        ItemStack item = this.indicatorFn.get();
        item.setAmount(Math.max(1, skillData.getLevel()));
        ItemMeta meta = item.hasItemMeta() ? item.getItemMeta() : Bukkit.getItemFactory().getItemMeta(item.getType());
        ArrayList<String> lore = new ArrayList<String>();
        String MET = (String)Fabled.getLanguage().getMessage("Skill Tree.requirement.met", true, FilterType.COLOR, new CustomFilter[0]).get(0);
        String NOT_MET = (String)Fabled.getLanguage().getMessage("Skill Tree.requirement.not-met", true, FilterType.COLOR, new CustomFilter[0]).get(0);
        MET = MET.substring(0, MET.length() - 2);
        NOT_MET = NOT_MET.substring(0, NOT_MET.length() - 2);
        String lvlReq = skillData.getLevelReq() <= skillData.getPlayerClass().getLevel() ? MET : NOT_MET;
        String costReq = skillData.getCost() <= skillData.getPlayerClass().getPoints() ? MET : NOT_MET;
        String spentReq = this.hasInvestedEnough(skillData.getPlayerData()) ? MET : NOT_MET;
        String branchReq = this.isCompatible(skillData.getPlayerData()) ? MET : NOT_MET;
        String skillReq = this.isCompatible(skillData.getPlayerData()) ? MET : NOT_MET;
        String attrReq = this.hasEnoughAttributes(skillData.getPlayerData()) ? MET : NOT_MET;
        HashMap<String, String> attributeSpecificReq = new HashMap<String, String>();
        for (String key : Fabled.getAttributesManager().getKeys()) {
            attributeSpecificReq.put(key, this.checkSingleAttribute(skillData.getPlayerData(), key) ? MET : NOT_MET);
        }
        String attrChanging = (String)Fabled.getLanguage().getMessage("Skill Tree.attribute.changing", true, FilterType.COLOR, new CustomFilter[0]).get(0);
        String attrStatic = (String)Fabled.getLanguage().getMessage("Skill Tree.attribute.not-changing", true, FilterType.COLOR, new CustomFilter[0]).get(0);
        for (String line : this.iconLore) {
            try {
                line = line.replace("{level}", "" + skillData.getLevel()).replace("{req:lvl}", lvlReq).replace("{req:level}", lvlReq).replace("{req:cost}", costReq).replace("{req:spent}", spentReq).replace("{req:branch}", branchReq).replace("{req:skill}", skillReq).replace("{req:attribute}", attrReq).replace("{max}", "" + this.maxLevel).replace("{name}", this.name).replace("{type}", this.type).replace("{skill_points}", String.valueOf(skillData.getPlayerClass().getPoints()));
                for (Map.Entry entry : attributeSpecificReq.entrySet()) {
                    line = line.replace("{req:" + (String)entry.getKey() + "}", (CharSequence)entry.getValue());
                }
                while (line.contains("{attr:")) {
                    int start = line.indexOf("{attr:");
                    int end = line.indexOf("}", start);
                    String attr = line.substring(start + 6, end);
                    Object currValue = this.getAttr((LivingEntity)player, attr, Math.max(1, skillData.getLevel()));
                    Object nextValue = this.getAttr((LivingEntity)player, attr, Math.min(skillData.getLevel() + 1, this.maxLevel));
                    if (attr.equals("level") || attr.equals("cost")) {
                        currValue = nextValue = Integer.valueOf((int)Math.floor(NumberParser.parseDouble((String)nextValue.toString().replace(',', '.'))));
                    }
                    if (currValue.equals(nextValue) || brief) {
                        line = line.replace("{attr:" + attr + "}", attrStatic.replace("{name}", this.getAttrName(attr)).replace("{value}", currValue.toString()));
                        continue;
                    }
                    line = line.replace("{attr:" + attr + "}", attrChanging.replace("{name}", this.getAttrName(attr)).replace("{value}", currValue.toString()).replace("{new}", nextValue.toString()));
                }
                if (line.contains("{desc}")) {
                    for (String descLine : this.description) {
                        lore.add(line.replace("{desc}", descLine));
                    }
                    continue;
                }
                if (line.contains("{desc:")) {
                    String[] stringArray;
                    int end;
                    int start = line.indexOf("{desc:");
                    String lineInfo = line.substring(start + 6, end = line.indexOf("}", start));
                    if (lineInfo.contains("-")) {
                        stringArray = lineInfo.split("-");
                    } else {
                        String[] stringArray2 = new String[2];
                        stringArray2[0] = lineInfo;
                        stringArray = stringArray2;
                        stringArray2[1] = lineInfo;
                    }
                    String[] split = stringArray;
                    start = Integer.parseInt(split[0]) - 1;
                    end = split[1].equals("x") ? this.description.size() : Integer.parseInt(split[1]);
                    for (int i = start; i < end && i < this.description.size(); ++i) {
                        lore.add(line.replace("{desc:" + lineInfo + "}", this.description.get(i)));
                    }
                    continue;
                }
                lore.add(line);
            }
            catch (Exception ex) {
                Logger.invalid("Skill icon filter for the skill \"" + this.name + "\" is invalid (Line = \"" + line + "\") - " + ex.getMessage());
            }
        }
        if (Fabled.getSettings().isCombosEnabled() && this.canCast() && (combos = skillData.getPlayerData().getComboData()).hasCombo(this)) {
            lore.addAll(Arrays.asList("", combos.getComboString(this)));
        }
        if (Fabled.getSettings().isShowBinds() && skillData.getBind() != null) {
            lore.add("");
            String type = TextFormatter.format((String)skillData.getBind().name().replace("LEGACY_", ""));
            lore.add(Fabled.getSettings().getBindText().replace("{material}", type));
        }
        if (!lore.isEmpty()) {
            meta.setDisplayName((String)lore.remove(0));
        }
        meta.setLore(lore);
        item.setItemMeta(meta);
        return DamageLoreRemover.removeAttackDmg(item);
    }

    protected String getAttrName(String key) {
        return TextFormatter.format((String)key);
    }

    protected Object getAttr(LivingEntity caster, String key, int level) {
        Object result = this.settings.getObj(key, level);
        if (result instanceof Double) {
            return this.format((Double)result);
        }
        return result;
    }

    protected String format(double value) {
        String result = FORMAT.format(value);
        if (result.endsWith(".0")) {
            return result.substring(0, result.length() - 2);
        }
        return result;
    }

    public void sendMessage(Player player, double radius) {
        if (this.hasMessage()) {
            radius *= radius;
            Location l = player.getLocation();
            for (Player p : player.getWorld().getPlayers()) {
                if (!(p.getLocation().distanceSquared(l) < radius)) continue;
                p.sendMessage(RPGFilter.SKILL.setReplacement(this.getName()).apply(Filter.PLAYER.setReplacement(player.getName()).apply(this.message)));
            }
        }
    }

    public void damage(LivingEntity target, double damage, LivingEntity source) {
        this.damage(target, damage, source, "default");
    }

    public void damage(LivingEntity target, double damage, LivingEntity source, String classification) {
        this.damage(target, damage, source, classification, true, true);
    }

    public void damage(LivingEntity target, double damage, LivingEntity source, String classification, boolean knockback, boolean ignoreDivinity) {
        this.damage(target, damage, source, classification, knockback, ignoreDivinity, EntityDamageEvent.DamageCause.ENTITY_ATTACK);
    }

    public void damage(LivingEntity target, double damage, LivingEntity source, String classification, boolean knockback, boolean ignoreDivinity, EntityDamageEvent.DamageCause cause) {
        this.damage(target, damage, source, classification, knockback, ignoreDivinity, cause, false);
    }

    /*
     * WARNING - Removed try catching itself - possible behaviour change.
     */
    public void damage(LivingEntity target, double damage, LivingEntity source, String classification, boolean knockback, boolean ignoreDivinity, EntityDamageEvent.DamageCause cause, boolean noShake) {
        if (target instanceof TempEntity) {
            return;
        }
        if (target.equals((Object)source)) {
            knockback = false;
        }
        if (!Fabled.getSettings().canAttack(source, target, cause)) {
            return;
        }
        SkillDamageEvent event = new SkillDamageEvent(this, source, target, damage, classification, knockback, ignoreDivinity, noShake);
        Bukkit.getPluginManager().callEvent((Event)event);
        if (event.isCancelled()) {
            return;
        }
        damage = event.getDamage();
        knockback = event.isKnockback();
        noShake = event.isNoShake();
        target.setMetadata("damageCause", (MetadataValue)new FixedMetadataValue((Plugin)Fabled.inst(), (Object)cause));
        if (source instanceof Player && PluginChecker.isNoCheatActive()) {
            NoCheatHook.exempt((Player)source);
        }
        int ticks = target.getNoDamageTicks();
        target.setNoDamageTicks(0);
        skillDamage = true;
        try {
            Vector velocity = target.getVelocity();
            if (noShake) {
                BuffManager.addBuff(target, BuffType.NO_SCREEN_SHAKE, new Buff("damage-" + classification, 0.0, false), 1);
            }
            if (!DamageRegistry.dealDamage((LivingEntity)target, (double)damage, (String)classification, (LivingEntity)source)) {
                target.damage(damage, (Entity)source);
            }
            if (!knockback) {
                target.setVelocity(velocity);
            }
            target.setNoDamageTicks(ticks);
            if (source instanceof Player && PluginChecker.isNoCheatActive()) {
                NoCheatHook.unexempt((Player)source);
            }
        }
        finally {
            skillDamage = false;
        }
    }

    public void trueDamage(LivingEntity target, double damage, LivingEntity source) {
        if (target instanceof TempEntity) {
            return;
        }
        TrueDamageEvent event = new TrueDamageEvent(this, source, target, damage);
        Bukkit.getPluginManager().callEvent((Event)event);
        if (!event.isCancelled() && event.getDamage() != 0.0) {
            target.setHealth(Math.max(Math.min(target.getHealth() - event.getDamage(), target.getAttribute(VersionManager.getNms().getAttribute("MAX_HEALTH")).getValue()), 0.0));
        }
    }

    public void playPreview(PlayerData playerData, int level) {
    }

    public void save(DataSection config) {
        config.set(NAME, (Object)this.name);
        config.set(TYPE, (Object)this.type.replace('\u00a7', '&'));
        config.set(MAX, (Object)this.maxLevel);
        config.set(REQ, (Object)this.skillReq);
        config.set(REQLVL, (Object)this.skillReqLevel);
        config.set(PERM, (Object)this.needsPermission);
        config.set(COOLDOWN_MESSAGE, (Object)this.cooldownMessage);
        config.set(INCOMPATIBLE, this.incompatibleSkills);
        if (this.combo >= 0 && this.canCast()) {
            config.set(COMBO, (Object)Fabled.getComboManager().getSaveString(this.combo));
        }
        this.settings.save(config.createSection(ATTR));
        if (this.hasMessage()) {
            config.set(MSG, (Object)this.message.replace('\u00a7', '&'));
        }
        Data.serializeIcon(this.getIndicator(), config);
        config.set(DESC, this.description);
    }

    public void softSave(DataSection config) {
        boolean neededOnly;
        boolean bl = neededOnly = !config.keys().isEmpty();
        if (!neededOnly) {
            this.save(config);
        }
    }

    public void load(DataSection config) {
        this.name = config.getString(NAME, this.name);
        this.type = StringUT.color((String)config.getString(TYPE, this.name));
        this.indicatorFn = () -> Data.parseIcon(config);
        this.maxLevel = config.getInt(MAX, this.maxLevel);
        this.skillReq = config.getString(REQ);
        if (this.skillReq == null || this.skillReq.isEmpty()) {
            this.skillReq = null;
        }
        this.skillReqLevel = config.getInt(REQLVL, this.skillReqLevel);
        this.message = StringUT.color((String)config.getString(MSG, this.message));
        this.needsPermission = config.getString(PERM, "" + this.needsPermission).equalsIgnoreCase("true");
        this.cooldownMessage = config.getBoolean(COOLDOWN_MESSAGE, true);
        this.incompatibleSkills = config.getList(INCOMPATIBLE, new ArrayList());
        this.combo = Fabled.getComboManager().parseCombo(config.getString(COMBO));
        if (config.isList(DESC)) {
            this.description.clear();
            this.description.addAll(config.getList(DESC));
        }
        if (config.isList(LAYOUT)) {
            this.iconLore = StringUT.color((List)config.getList(LAYOUT));
        }
        this.settings.load(config.getSection(ATTR));
    }

    @Generated
    public static boolean isSkillDamage() {
        return skillDamage;
    }

    @Generated
    public String getKey() {
        return this.key;
    }

    @Generated
    public String getName() {
        return this.name;
    }

    @Generated
    public String getType() {
        return this.type;
    }

    @Generated
    public String getMessage() {
        return this.message;
    }

    @Generated
    public String getSkillReq() {
        return this.skillReq;
    }

    @Generated
    public int getMaxLevel() {
        return this.maxLevel;
    }

    @Generated
    public int getSkillReqLevel() {
        return this.skillReqLevel;
    }

    @Generated
    public void setCombo(int combo) {
        this.combo = combo;
    }

    @Generated
    public int getCombo() {
        return this.combo;
    }
}

