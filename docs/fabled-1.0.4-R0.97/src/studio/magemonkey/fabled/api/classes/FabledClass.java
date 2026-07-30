/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  lombok.Generated
 *  org.bukkit.Bukkit
 *  org.bukkit.ChatColor
 *  org.bukkit.Material
 *  org.bukkit.entity.Player
 *  org.bukkit.event.Listener
 *  org.bukkit.inventory.ItemStack
 *  org.bukkit.inventory.meta.ItemMeta
 *  org.bukkit.plugin.Plugin
 *  org.jetbrains.annotations.Nullable
 *  studio.magemonkey.codex.CodexEngine
 *  studio.magemonkey.codex.mccore.config.parse.DataSection
 *  studio.magemonkey.codex.util.StringUT
 */
package studio.magemonkey.fabled.api.classes;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Supplier;
import lombok.Generated;
import org.bukkit.Bukkit;
import org.bukkit.ChatColor;
import org.bukkit.Material;
import org.bukkit.entity.Player;
import org.bukkit.event.Listener;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.plugin.Plugin;
import org.jetbrains.annotations.Nullable;
import studio.magemonkey.codex.CodexEngine;
import studio.magemonkey.codex.mccore.config.parse.DataSection;
import studio.magemonkey.codex.util.StringUT;
import studio.magemonkey.fabled.Fabled;
import studio.magemonkey.fabled.api.ReadOnlySettings;
import studio.magemonkey.fabled.api.Settings;
import studio.magemonkey.fabled.api.classes.DefaultTreeType;
import studio.magemonkey.fabled.api.classes.TreeType;
import studio.magemonkey.fabled.api.enums.ExpSource;
import studio.magemonkey.fabled.api.player.PlayerData;
import studio.magemonkey.fabled.api.skills.Skill;
import studio.magemonkey.fabled.api.util.Data;
import studio.magemonkey.fabled.data.Click;
import studio.magemonkey.fabled.data.GroupSettings;
import studio.magemonkey.fabled.gui.tool.IconHolder;
import studio.magemonkey.fabled.log.LogType;
import studio.magemonkey.fabled.log.Logger;
import studio.magemonkey.fabled.tree.basic.InventoryTree;

public abstract class FabledClass
implements IconHolder {
    private static final String SKILLS = "skills";
    private static final String PARENT = "parent";
    private static final String NAME = "name";
    private static final String PREFIX = "prefix";
    private static final String ACTION_BAR = "action-bar";
    private static final String GROUP = "group";
    private static final String MANA = "mana";
    private static final String MAX = "max-level";
    private static final String EXP = "exp-source";
    private static final String REGEN = "mana-regen";
    private static final String PERM = "needs-permission";
    private static final String ATTR = "attributes";
    private static final String OLD_TREE = "tree";
    private static final String TREE = "skill-tree";
    private static final String BLACKLIST = "blacklist";
    protected final Settings settings = new Settings();
    private final Map<String, Skill> skillMap = new HashMap<String, Skill>();
    private final List<Skill> skills = new ArrayList<Skill>();
    private final Set<Material> blacklist = new HashSet<Material>();
    private final Map<Click, ComboStarter> comboStarters = new HashMap<Click, ComboStarter>();
    private final ReadOnlySettings readOnlySettings = new ReadOnlySettings(this.settings);
    protected boolean needsPermission;
    protected String actionBar = "";
    private InventoryTree skillTree;
    private String parent;
    private Supplier<ItemStack> iconFn;
    private TreeType tree;
    private String name;
    private String prefix;
    private String group;
    private String mana;
    private int maxLevel;
    private int expSources;
    private double manaRegen;

    protected FabledClass(String name, ItemStack icon, int maxLevel) {
        this(name, icon, maxLevel, null, null);
    }

    protected FabledClass(String name, ItemStack icon, int maxLevel, String parent) {
        this(name, icon, maxLevel, null, parent);
    }

    protected FabledClass(String name, ItemStack icon, int maxLevel, String group, String parent) {
        this.parent = parent;
        this.iconFn = () -> icon;
        this.name = name;
        this.prefix = name;
        this.group = group == null ? "class" : group.toLowerCase();
        this.mana = "Mana";
        this.maxLevel = maxLevel;
        this.tree = DefaultTreeType.REQUIREMENT;
        this.setAllowedExpSources(ExpSource.MOB, ExpSource.COMMAND, ExpSource.QUEST);
        if (this instanceof Listener) {
            Bukkit.getPluginManager().registerEvents((Listener)this, (Plugin)Fabled.inst());
        }
    }

    public String getName() {
        return this.name;
    }

    public String getPrefix() {
        return this.prefix;
    }

    public void setPrefix(String prefix) {
        this.prefix = prefix;
    }

    public ChatColor getPrefixColor() {
        String colors = ChatColor.getLastColors((String)this.prefix);
        if (colors.length() < 2) {
            return ChatColor.WHITE;
        }
        return ChatColor.getByChar((char)colors.charAt(1));
    }

    public InventoryTree getSkillTree() {
        return this.skillTree;
    }

    public String getGroup() {
        return this.group;
    }

    public GroupSettings getGroupSettings() {
        return Fabled.getSettings().getGroupSettings(this.group);
    }

    public boolean hasParent() {
        return this.getParent() != null;
    }

    public FabledClass getParent() {
        return Fabled.getClass(this.parent);
    }

    public FabledClass getRoot() {
        FabledClass root = this;
        while (root.parent != null) {
            root = root.getParent();
        }
        return root;
    }

    public ItemStack getIcon() {
        return this.iconFn.get();
    }

    public Map<String, Skill> getSkillMap() {
        if (this.skillMap.isEmpty()) {
            for (FabledClass current = this; current != null; current = current.getParent()) {
                for (Skill skill : current.skills) {
                    this.skillMap.put(skill.getName().toLowerCase(), skill);
                }
            }
        }
        return this.skillMap;
    }

    @Override
    public ItemStack getIcon(PlayerData data) {
        return this.getIcon();
    }

    @Override
    public boolean isAllowed(Player player) {
        return !this.needsPermission || player.hasPermission("fabled.class") || player.hasPermission("fabled.class." + this.name.toLowerCase().replace(" ", "-"));
    }

    public ItemStack getToolIcon() {
        ItemStack item = new ItemStack(this.getIcon().getType());
        ItemMeta iconMeta = this.getIcon().getItemMeta();
        if (iconMeta != null) {
            List lore;
            ItemMeta meta = item.getItemMeta();
            List list = lore = iconMeta.hasLore() ? iconMeta.getLore() : new ArrayList();
            if (iconMeta.hasDisplayName()) {
                lore.add(0, iconMeta.getDisplayName());
            }
            meta.setDisplayName(this.name);
            meta.setLore(lore);
            item.setItemMeta(meta);
        }
        return item;
    }

    public String getActionBarText() {
        return this.actionBar;
    }

    public void setActionBarText(String text) {
        this.actionBar = text;
    }

    public boolean hasActionBarText() {
        return this.actionBar.trim().length() > 0;
    }

    public boolean receivesExp(ExpSource source) {
        return (this.expSources & source.getId()) != 0;
    }

    public int getMaxLevel() {
        return this.maxLevel;
    }

    public int getRequiredExp(int level) {
        return Fabled.getSettings().getRequiredExp(level);
    }

    public double getHealth(int level) {
        return this.settings.getAttr("health", level);
    }

    public double getBaseHealth() {
        return this.settings.getBase("health");
    }

    public double getHealthScale() {
        return this.settings.getScale("health");
    }

    public double getMana(int level) {
        return this.settings.getAttr(MANA, level);
    }

    public double getBaseMana() {
        return this.settings.getBase(MANA);
    }

    public double getManaScale() {
        return this.settings.getScale(MANA);
    }

    public int getAttribute(String key, int level) {
        return (int)this.settings.getAttr(key, level, 0.0);
    }

    public ReadOnlySettings getSettings() {
        return this.readOnlySettings;
    }

    public String getManaName() {
        return this.mana;
    }

    public void setManaName(String name) {
        this.mana = name;
    }

    public List<Skill> getSkills() {
        return this.getSkills(true);
    }

    public List<Skill> getSkills(boolean includeParent) {
        ArrayList<Skill> skills = new ArrayList<Skill>();
        skills.addAll(this.skills);
        if (this.hasParent() && includeParent) {
            skills.addAll(this.getParent().getSkills());
        }
        return skills;
    }

    public boolean hasManaRegen() {
        return this.manaRegen > 0.0;
    }

    public double getManaRegen() {
        return this.manaRegen;
    }

    public void setManaRegen(double amount) {
        this.manaRegen = amount;
    }

    public ArrayList<FabledClass> getOptions() {
        ArrayList<FabledClass> list = new ArrayList<FabledClass>();
        for (FabledClass c : Fabled.getClasses().values()) {
            if (c.getParent() != this) continue;
            list.add(c);
        }
        return list;
    }

    public boolean canUse(Material type) {
        return !this.blacklist.contains(type);
    }

    public void addSkill(String name) {
        Skill skill = Fabled.getSkill(name);
        if (skill != null) {
            this.skills.add(skill);
        } else {
            Logger.invalid("Class \"" + this.name + "\" tried to add an invalid skill - \"" + name + "\"");
        }
    }

    public void addSkills(String ... names) {
        for (String name : names) {
            this.addSkill(name);
        }
    }

    public void setAllowedExpSources(ExpSource ... sources) {
        this.expSources = 0;
        for (ExpSource source : sources) {
            this.allowExpSource(source);
        }
    }

    public void allowExpSource(ExpSource source) {
        this.expSources |= source.getId();
    }

    public void disallowExpSource(ExpSource source) {
        this.expSources &= ~source.getId();
    }

    public void save(DataSection config) {
        config.set(NAME, (Object)this.name);
        config.set(ACTION_BAR, (Object)this.actionBar.replace('\u00a7', '&'));
        config.set(PREFIX, (Object)this.prefix.replace('\u00a7', '&'));
        config.set(GROUP, (Object)this.group);
        config.set(MANA, (Object)this.mana.replace('\u00a7', '&'));
        config.set(MAX, (Object)this.maxLevel);
        config.set(PARENT, (Object)this.parent);
        config.set(PERM, (Object)this.needsPermission);
        this.settings.save(config.createSection(ATTR));
        config.set(REGEN, (Object)this.manaRegen);
        config.set(TREE, (Object)this.tree.toString());
        config.set(BLACKLIST, new ArrayList<Material>(this.blacklist));
        ArrayList<String> skillNames = new ArrayList<String>();
        for (Skill skill : this.skills) {
            skillNames.add(skill.getName());
        }
        config.set(SKILLS, skillNames);
        Data.serializeIcon(this.getIcon(), config);
        config.set(EXP, (Object)this.expSources);
        DataSection comboStartersSection = config.createSection("combo-starters");
        for (Map.Entry<Click, ComboStarter> entry : this.comboStarters.entrySet()) {
            DataSection dataSection = comboStartersSection.createSection(entry.getKey().getKey());
            ComboStarter comboStarter = entry.getValue();
            dataSection.set("inverted", (Object)comboStarter.blacklist);
            dataSection.set("whitelist", comboStarter.itemTypes);
        }
    }

    public void softSave(DataSection config) {
        boolean neededOnly;
        boolean bl = neededOnly = config.keys().size() > 0;
        if (!neededOnly) {
            this.save(config);
        }
    }

    public void load(DataSection config) {
        this.parent = config.getString(PARENT);
        this.name = config.getString(NAME, this.name);
        this.iconFn = () -> {
            ItemStack icon = Data.parseIcon(config);
            ItemMeta iconMeta = icon.getItemMeta();
            if (iconMeta != null && !iconMeta.hasDisplayName()) {
                iconMeta.setDisplayName(this.name);
                icon.setItemMeta(iconMeta);
            }
            return icon;
        };
        this.actionBar = StringUT.color((String)config.getString(ACTION_BAR, ""));
        this.prefix = StringUT.color((String)config.getString(PREFIX, this.prefix));
        this.group = config.getString(GROUP, "class");
        this.mana = StringUT.color((String)config.getString(MANA, this.mana));
        this.maxLevel = config.getInt(MAX, this.maxLevel);
        this.expSources = config.getInt(EXP, this.expSources);
        this.manaRegen = config.getDouble(REGEN, this.manaRegen);
        this.needsPermission = config.getString(PERM, "" + this.needsPermission).equalsIgnoreCase("true");
        String skillTree = config.getString(TREE);
        if (skillTree == null) {
            this.tree = DefaultTreeType.CUSTOM;
            config.remove(OLD_TREE);
        } else {
            this.tree = DefaultTreeType.getByName(skillTree);
        }
        for (String type : config.getList(BLACKLIST)) {
            if (type.isEmpty()) continue;
            Material mat = Material.matchMaterial((String)type.toUpperCase(Locale.US).replace(' ', '_'));
            if (mat != null) {
                this.blacklist.add(mat);
                continue;
            }
            Logger.invalid(type + " is not a valid material for class " + this.name);
        }
        this.settings.load(config.getSection(ATTR));
        if (config.isList(SKILLS)) {
            this.skills.clear();
            for (String name : config.getList(SKILLS)) {
                Skill skill = Fabled.getSkill(name);
                if (skill != null) {
                    this.skills.add(skill);
                    continue;
                }
                Logger.invalid("Invalid skill for class " + this.name + " - " + name);
            }
        }
        this.comboStarters.clear();
        DataSection section = config.getSection("combo-starters");
        if (section != null) {
            for (String key : section.keys()) {
                DataSection subSection;
                Click click = Click.getByName(key);
                if (click == null || (subSection = section.getSection(key)) == null) continue;
                this.comboStarters.put(click, new ComboStarter(subSection));
            }
        }
        this.skillTree = this.tree.getTree(Fabled.inst(), this);
    }

    public void reloadSkillTree() {
        this.skillTree = this.tree.getTree(Fabled.inst(), this);
        this.arrange();
    }

    public void arrange() {
        try {
            Logger.log(LogType.REGISTRATION, 2, "Arranging for \"" + this.name + "\" - " + this.skills.size() + " skills");
            this.skillTree.arrange();
        }
        catch (Exception ex) {
            Logger.invalid("Failed to arrange skill tree for class \"" + this.name + "\" - " + ex.getMessage());
        }
    }

    public boolean canStartCombo(Click click, @Nullable ItemStack itemStack) {
        ComboStarter comboStarter = this.comboStarters.get((Object)click);
        if (comboStarter == null) {
            return true;
        }
        return comboStarter.isAllowed(itemStack);
    }

    @Generated
    public boolean isNeedsPermission() {
        return this.needsPermission;
    }

    private static class ComboStarter {
        private final List<String> itemTypes;
        private final boolean blacklist;

        public ComboStarter(DataSection dataSection) {
            ArrayList<String> itemTypes = new ArrayList<String>();
            for (String itemType : dataSection.getList("whitelist")) {
                if (itemTypes.contains(itemType)) continue;
                itemTypes.add(itemType);
            }
            this.itemTypes = List.copyOf(itemTypes);
            this.blacklist = dataSection.getBoolean("inverted", false);
        }

        public boolean isAllowed(@Nullable ItemStack itemStack) {
            boolean contains = false;
            for (String itemType : this.itemTypes) {
                if (!CodexEngine.getEngine().getItemManager().isCustomItemOfId(itemStack, itemType)) continue;
                contains = true;
                break;
            }
            return contains != this.blacklist;
        }
    }
}

