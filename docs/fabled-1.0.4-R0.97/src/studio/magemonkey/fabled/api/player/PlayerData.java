/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  com.google.common.base.Preconditions
 *  lombok.Generated
 *  org.bukkit.Bukkit
 *  org.bukkit.Location
 *  org.bukkit.Material
 *  org.bukkit.NamespacedKey
 *  org.bukkit.OfflinePlayer
 *  org.bukkit.attribute.Attribute
 *  org.bukkit.attribute.AttributeInstance
 *  org.bukkit.command.CommandSender
 *  org.bukkit.entity.Entity
 *  org.bukkit.entity.LivingEntity
 *  org.bukkit.entity.Player
 *  org.bukkit.event.Event
 *  org.bukkit.metadata.FixedMetadataValue
 *  org.bukkit.metadata.MetadataValue
 *  org.bukkit.plugin.Plugin
 *  org.bukkit.scheduler.BukkitRunnable
 *  org.bukkit.scheduler.BukkitTask
 *  org.jetbrains.annotations.Nullable
 *  studio.magemonkey.codex.CodexEngine
 *  studio.magemonkey.codex.compat.VersionManager
 *  studio.magemonkey.codex.core.Version
 *  studio.magemonkey.codex.mccore.config.CustomFilter
 *  studio.magemonkey.codex.mccore.config.Filter
 *  studio.magemonkey.codex.mccore.config.FilterType
 *  studio.magemonkey.codex.mccore.config.parse.DataSection
 *  studio.magemonkey.codex.util.EnumUT
 */
package studio.magemonkey.fabled.api.player;

import com.google.common.base.Preconditions;
import com.sucy.skill.api.classes.RPGClass;
import com.sucy.skill.api.event.PlayerClassChangeEvent;
import com.sucy.skill.api.event.PlayerSkillUnlockEvent;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.Generated;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.NamespacedKey;
import org.bukkit.OfflinePlayer;
import org.bukkit.attribute.Attribute;
import org.bukkit.attribute.AttributeInstance;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Entity;
import org.bukkit.entity.LivingEntity;
import org.bukkit.entity.Player;
import org.bukkit.event.Event;
import org.bukkit.metadata.FixedMetadataValue;
import org.bukkit.metadata.MetadataValue;
import org.bukkit.plugin.Plugin;
import org.bukkit.scheduler.BukkitRunnable;
import org.bukkit.scheduler.BukkitTask;
import org.jetbrains.annotations.Nullable;
import studio.magemonkey.codex.CodexEngine;
import studio.magemonkey.codex.compat.VersionManager;
import studio.magemonkey.codex.core.Version;
import studio.magemonkey.codex.mccore.config.CustomFilter;
import studio.magemonkey.codex.mccore.config.Filter;
import studio.magemonkey.codex.mccore.config.FilterType;
import studio.magemonkey.codex.mccore.config.parse.DataSection;
import studio.magemonkey.codex.util.EnumUT;
import studio.magemonkey.fabled.Fabled;
import studio.magemonkey.fabled.api.classes.FabledClass;
import studio.magemonkey.fabled.api.enums.ExpSource;
import studio.magemonkey.fabled.api.enums.ManaCost;
import studio.magemonkey.fabled.api.enums.ManaSource;
import studio.magemonkey.fabled.api.enums.PointSource;
import studio.magemonkey.fabled.api.enums.SkillStatus;
import studio.magemonkey.fabled.api.event.PlayerAttributeChangeEvent;
import studio.magemonkey.fabled.api.event.PlayerCastSkillEvent;
import studio.magemonkey.fabled.api.event.PlayerManaGainEvent;
import studio.magemonkey.fabled.api.event.PlayerManaLossEvent;
import studio.magemonkey.fabled.api.event.PlayerMaxManaChangeEvent;
import studio.magemonkey.fabled.api.event.PlayerPreClassChangeEvent;
import studio.magemonkey.fabled.api.event.PlayerSkillCastFailedEvent;
import studio.magemonkey.fabled.api.event.PlayerSkillDowngradeEvent;
import studio.magemonkey.fabled.api.event.PlayerSkillUpgradeEvent;
import studio.magemonkey.fabled.api.event.PlayerUpAttributeEvent;
import studio.magemonkey.fabled.api.player.PlayerAttributeModifier;
import studio.magemonkey.fabled.api.player.PlayerClass;
import studio.magemonkey.fabled.api.player.PlayerCombos;
import studio.magemonkey.fabled.api.player.PlayerSkill;
import studio.magemonkey.fabled.api.player.PlayerSkillBar;
import studio.magemonkey.fabled.api.player.PlayerStatModifier;
import studio.magemonkey.fabled.api.skills.PassiveSkill;
import studio.magemonkey.fabled.api.skills.Skill;
import studio.magemonkey.fabled.api.skills.SkillShot;
import studio.magemonkey.fabled.api.skills.TargetSkill;
import studio.magemonkey.fabled.api.target.TargetHelper;
import studio.magemonkey.fabled.cast.PlayerCastBars;
import studio.magemonkey.fabled.cast.PlayerCastWheel;
import studio.magemonkey.fabled.cast.PlayerTextCastingData;
import studio.magemonkey.fabled.data.GroupSettings;
import studio.magemonkey.fabled.data.PlayerEquips;
import studio.magemonkey.fabled.dynamic.DynamicSkill;
import studio.magemonkey.fabled.dynamic.EffectComponent;
import studio.magemonkey.fabled.dynamic.TempEntity;
import studio.magemonkey.fabled.gui.handlers.AttributeHandler;
import studio.magemonkey.fabled.gui.handlers.DetailsHandler;
import studio.magemonkey.fabled.gui.handlers.ProfessHandler;
import studio.magemonkey.fabled.gui.handlers.SkillHandler;
import studio.magemonkey.fabled.gui.tool.GUITool;
import studio.magemonkey.fabled.language.RPGFilter;
import studio.magemonkey.fabled.log.LogType;
import studio.magemonkey.fabled.log.Logger;
import studio.magemonkey.fabled.manager.FabledAttribute;
import studio.magemonkey.fabled.manager.IAttributeManager;
import studio.magemonkey.fabled.task.ScoreboardTask;

public class PlayerData {
    public final Map<String, Integer> attributes = new HashMap<String, Integer>();
    public final Map<String, Integer> attrUpStages = new HashMap<String, Integer>();
    private final Map<String, PlayerClass> classes = new HashMap<String, PlayerClass>();
    private final Map<String, PlayerSkill> skills = new HashMap<String, PlayerSkill>();
    private final Set<ExternallyAddedSkill> extSkills = new HashSet<ExternallyAddedSkill>();
    private final Map<String, List<PlayerAttributeModifier>> attributesModifiers = new HashMap<String, List<PlayerAttributeModifier>>();
    private final Map<String, List<PlayerStatModifier>> statModifiers = new HashMap<String, List<PlayerStatModifier>>();
    private final Map<String, String> persistentData = new HashMap<String, String>();
    private final Map<String, Long> cooldownCache = new HashMap<String, Long>();
    private final DataSection extraData = new DataSection();
    private final UUID playerUUID;
    private PlayerSkillBar skillBar;
    private PlayerCastBars castBars;
    private PlayerTextCastingData textCastingData;
    private PlayerCastWheel castWheel;
    private final PlayerCombos comboData;
    private final PlayerEquips equips;
    private final List<UUID> onCooldown = new ArrayList<UUID>();
    public int attribPoints;
    private String scheme;
    private String menuClass;
    private double mana;
    private double maxMana;
    private double lastHealth;
    private double maxHealth;
    private int points;
    private double hungerValue;
    private boolean init;
    private boolean passive;
    private long skillTimer;
    private BukkitTask removeTimer;
    private Runnable onPreviewStop;

    PlayerData(OfflinePlayer player, boolean init) {
        this.playerUUID = player.getUniqueId();
        this.castBars = new PlayerCastBars(this);
        this.comboData = new PlayerCombos(this);
        this.equips = new PlayerEquips(this);
        this.init = Fabled.isLoaded() && init;
        this.scheme = "default";
        this.hungerValue = 1.0;
        for (String group : Fabled.getGroups()) {
            GroupSettings settings = Fabled.getSettings().getGroupSettings(group);
            FabledClass fabledClass = settings.getDefault();
            if (fabledClass == null || settings.getPermission() != null) continue;
            this.setClass(null, fabledClass, true);
        }
    }

    public Player getPlayer() {
        return Bukkit.getPlayer((UUID)this.playerUUID);
    }

    public String getPlayerName() {
        return this.getPlayer().getName();
    }

    public UUID getUUID() {
        return this.playerUUID;
    }

    public PlayerSkillBar getSkillBar() {
        if (this.skillBar == null) {
            this.skillBar = new PlayerSkillBar(this);
        }
        return this.skillBar;
    }

    public PlayerCastBars getCastBars() {
        if (this.castBars == null) {
            this.castBars = new PlayerCastBars(this);
        }
        return this.castBars;
    }

    public PlayerTextCastingData getTextCastingData() {
        if (this.textCastingData == null) {
            this.textCastingData = new PlayerTextCastingData(this);
        }
        return this.textCastingData;
    }

    public PlayerCastWheel getCastWheel() {
        if (this.castWheel == null) {
            this.castWheel = new PlayerCastWheel(this);
        }
        return this.castWheel;
    }

    public int subtractHungerValue(double amount) {
        double scaled = amount / this.scaleStat("hunger", amount, 0.0, Double.MAX_VALUE);
        int lost = scaled >= this.hungerValue ? (int)(scaled - this.hungerValue) + 1 : 0;
        this.hungerValue += (double)lost - amount;
        return lost;
    }

    public void endInit() {
        this.init = false;
    }

    public HashMap<String, Integer> getAttributes() {
        HashMap<String, Integer> map = new HashMap<String, Integer>();
        for (String key : Fabled.getAttributesManager().getKeys()) {
            map.put(key, this.getAttribute(key));
        }
        return map;
    }

    public HashMap<String, Integer> getInvestedAttributes() {
        return new HashMap<String, Integer>(this.attributes);
    }

    public HashMap<String, Integer> getInvestedAttributesStages() {
        return new HashMap<String, Integer>(this.attrUpStages);
    }

    public int getAttribute(String key) {
        key = key.toLowerCase();
        double total = 0.0;
        for (PlayerClass playerClass : this.classes.values()) {
            total += (double)playerClass.getData().getAttribute(key, playerClass.getLevel());
        }
        if (this.attrUpStages.containsKey(key)) {
            total += (double)this.attrUpStages.get(key).intValue();
        }
        if (this.attributesModifiers.containsKey(key)) {
            double multiplier = 1.0;
            for (PlayerAttributeModifier modifier : this.getAttributeModifiers(key)) {
                switch (modifier.getOperation()) {
                    case ADD_NUMBER: {
                        total = modifier.applyOn(total);
                        break;
                    }
                    case MULTIPLY_PERCENTAGE: {
                        multiplier = modifier.applyOn(multiplier);
                    }
                }
            }
            total *= multiplier;
        }
        return Math.max(0, (int)Math.round(total));
    }

    public int getInvestedAttribute(String key) {
        return this.attributes.getOrDefault(key.toLowerCase(), 0);
    }

    public int getInvestedAttributeStage(String key) {
        return this.attrUpStages.getOrDefault(key.toLowerCase(), 0);
    }

    public boolean hasAttribute(String key) {
        return this.getAttribute(key) > 0;
    }

    public boolean upAttribute(String key) {
        key = key.toLowerCase();
        FabledAttribute fabledAttribute = Fabled.getAttributesManager().getAttribute(key);
        if (fabledAttribute == null) {
            return false;
        }
        int max = fabledAttribute.getMax();
        int currentStage = this.getInvestedAttributeStage(key);
        if (currentStage >= max) {
            return false;
        }
        PlayerUpAttributeEvent event = new PlayerUpAttributeEvent(this, key, 1);
        Bukkit.getPluginManager().callEvent((Event)event);
        if (event.isCancelled() || event.getChange() == 0) {
            return false;
        }
        int newStage = currentStage + event.getChange();
        int currentInvested = this.getInvestedAttribute(key);
        int cost = this.getAttributeUpCost(key, currentStage, newStage);
        if (this.attribPoints < cost) {
            return false;
        }
        this.attributes.put(key, currentInvested + cost);
        this.attrUpStages.put(key, newStage);
        this.attribPoints -= cost;
        this.updatePlayerStat(this.getPlayer());
        return true;
    }

    public int getAttributeUpCost(String key) {
        FabledAttribute fabledAttribute = Fabled.getAttributesManager().getAttribute(key);
        if (fabledAttribute == null) {
            return 0;
        }
        int currentStage = this.getInvestedAttributeStage(key);
        return this.getAttributeUpCost(key, currentStage, currentStage + 1);
    }

    public int getAttributeUpCost(String key, Integer modifier) {
        FabledAttribute fabledAttribute = Fabled.getAttributesManager().getAttribute(key);
        if (fabledAttribute == null) {
            return 0;
        }
        int currentStage = this.getInvestedAttributeStage(key);
        int selectedStage = currentStage + modifier;
        return this.getAttributeUpCost(key, currentStage, selectedStage);
    }

    public int getAttributeUpCost(String key, Integer from, Integer to) {
        FabledAttribute fabledAttribute = Fabled.getAttributesManager().getAttribute(key);
        if (fabledAttribute == null) {
            return 0;
        }
        int totalCost = 0;
        boolean reverse = false;
        if (from > to) {
            int temp = from;
            from = to;
            to = temp;
            reverse = true;
        }
        for (int i = from + 1; i <= to; ++i) {
            totalCost += Math.max(0, fabledAttribute.getCostBase() + (int)Math.floor((double)(i - 1) * fabledAttribute.getCostModifier()));
        }
        return totalCost * (reverse ? -1 : 1);
    }

    public boolean giveAttribute(String key, int amount) {
        key = key.toLowerCase();
        FabledAttribute fabledAttribute = Fabled.getAttributesManager().getAttribute(key);
        if (fabledAttribute == null) {
            return false;
        }
        int max = fabledAttribute.getMax();
        int currentStage = this.getInvestedAttributeStage(key);
        int invested = this.getInvestedAttribute(key);
        if (amount + currentStage > max) {
            amount = max - currentStage;
        }
        if (amount == 0) {
            return false;
        }
        PlayerAttributeChangeEvent event = new PlayerAttributeChangeEvent(this, key, amount);
        Bukkit.getPluginManager().callEvent((Event)event);
        if (event.isCancelled() || event.getChange() == 0) {
            return false;
        }
        amount = event.getChange();
        int newStage = Math.min(amount + currentStage, max);
        int cost = this.getAttributeUpCost(key, currentStage, newStage);
        this.attrUpStages.put(key, newStage);
        this.attributes.put(key, invested + cost);
        this.updatePlayerStat(this.getPlayer());
        return true;
    }

    public void addStatModifier(String key, PlayerStatModifier modifier, boolean update) {
        List<PlayerStatModifier> modifiers = this.getStatModifiers(key);
        modifiers.add(modifier);
        this.statModifiers.put(key, modifiers);
        if (update) {
            this.updatePlayerStat(this.getPlayer());
        }
    }

    public List<PlayerStatModifier> getStatModifiers(String key) {
        if (this.statModifiers.containsKey(key)) {
            return this.statModifiers.get(key);
        }
        return new ArrayList<PlayerStatModifier>();
    }

    public void addAttributeModifier(String key, PlayerAttributeModifier modifier, boolean update) {
        key = Fabled.getAttributesManager().normalize(key);
        List<PlayerAttributeModifier> modifiers = this.getAttributeModifiers(key);
        modifiers.add(modifier);
        this.attributesModifiers.put(key, modifiers);
        if (update) {
            this.updatePlayerStat(this.getPlayer());
        }
    }

    public List<PlayerAttributeModifier> getAttributeModifiers(String key) {
        if (this.attributesModifiers.containsKey(key)) {
            return this.attributesModifiers.get(key);
        }
        return new ArrayList<PlayerAttributeModifier>();
    }

    public boolean refundAttributeAll(String key) {
        return this.refundAttribute(key, this.getInvestedAttributeStage(key));
    }

    public boolean refundAttribute(String key, int refundAmount) {
        int current = this.getInvestedAttributeStage(key = key.toLowerCase());
        if (current <= 0) {
            return false;
        }
        PlayerAttributeChangeEvent event = new PlayerAttributeChangeEvent(this, key, -refundAmount);
        Bukkit.getPluginManager().callEvent((Event)event);
        if (event.isCancelled()) {
            return false;
        }
        int newStage = Math.max(0, current + event.getChange());
        int invested = this.getInvestedAttribute(key);
        int currentCost = this.getAttributeUpCost(key, current, newStage);
        this.attribPoints -= currentCost;
        this.attributes.put(key, invested + currentCost);
        this.attrUpStages.put(key, newStage);
        this.updatePlayerStat(this.getPlayer());
        return true;
    }

    public boolean resetAttribute(String key, boolean refund) {
        int change = -this.getInvestedAttributeStage(key = key.toLowerCase());
        if (change == 0) {
            return true;
        }
        PlayerAttributeChangeEvent event = new PlayerAttributeChangeEvent(this, key, change);
        Bukkit.getPluginManager().callEvent((Event)event);
        if (event.isCancelled() || event.getChange() == 0) {
            return false;
        }
        int currentStage = this.getInvestedAttributeStage(key);
        int newStage = Math.max(0, currentStage + event.getChange());
        int refundAmount = this.getAttributeUpCost(key, currentStage, newStage);
        if (event.getChange() > 0 && this.attribPoints < refundAmount) {
            return false;
        }
        if (refund) {
            this.attribPoints -= refundAmount;
        }
        this.attributes.put(key, this.getInvestedAttribute(key) + refundAmount);
        this.attrUpStages.put(key, newStage);
        this.updatePlayerStat(this.getPlayer());
        return true;
    }

    public List<String> refundAttributes() {
        return this.attributes.keySet().stream().filter(this::refundAttributeAll).collect(Collectors.toList());
    }

    public int getAttributePoints() {
        return this.attribPoints;
    }

    public void giveAttribPoints(int amount) {
        this.attribPoints += amount;
    }

    public double scaleStat(String stat, double baseValue) {
        return this.scaleStat(stat, baseValue, 0.0, Double.MAX_VALUE);
    }

    public double scaleStat(String stat, double defaultValue, double min, double max) {
        Player player = this.getPlayer();
        if (player != null && !Fabled.getSettings().isWorldEnabled(player.getWorld())) {
            return defaultValue;
        }
        IAttributeManager manager = Fabled.getAttributesManager();
        if (manager == null) {
            return defaultValue;
        }
        double modified = defaultValue;
        List<FabledAttribute> matches = manager.forStat(stat);
        if (matches != null) {
            for (FabledAttribute fabledAttribute : matches) {
                int amount = this.getAttribute(fabledAttribute.getKey());
                if (amount <= 0) continue;
                modified = fabledAttribute.modifyStat(stat, modified, amount);
            }
        }
        if (this.statModifiers.containsKey(stat)) {
            double multiplier = 1.0;
            for (PlayerStatModifier modifier : this.getStatModifiers(stat)) {
                switch (modifier.getOperation()) {
                    case ADD_NUMBER: {
                        modified = modifier.applyOn(modified);
                        break;
                    }
                    case MULTIPLY_PERCENTAGE: {
                        multiplier = modifier.applyOn(multiplier);
                    }
                }
            }
            modified *= multiplier;
        }
        return Math.max(min, Math.min(max, modified));
    }

    public double scaleDynamic(EffectComponent component, String key, double value) {
        IAttributeManager manager = Fabled.getAttributesManager();
        if (manager == null) {
            return value;
        }
        List<FabledAttribute> matches = manager.forComponent(component, key);
        if (matches == null) {
            return value;
        }
        for (FabledAttribute fabledAttribute : matches) {
            int amount = this.getAttribute(fabledAttribute.getKey());
            if (amount <= 0) continue;
            value = fabledAttribute.modify(component, key, value, amount);
        }
        return value;
    }

    public boolean openAttributeMenu() {
        Player player = this.getPlayer();
        if (Fabled.getSettings().isAttributesEnabled() && player != null) {
            GUITool.getAttributesMenu().show(new AttributeHandler(), this, (String)Fabled.getLanguage().getMessage("GUI.attribute-title", true, FilterType.COLOR, new CustomFilter[]{RPGFilter.POINTS.setReplacement("" + this.attribPoints), Filter.PLAYER.setReplacement(player.getName())}).get(0), Fabled.getAttributesManager().getAttributes());
            return true;
        }
        return false;
    }

    public Map<String, Integer> getAttributeData() {
        return this.attributes;
    }

    public Map<String, Integer> getAttributeStageData() {
        return this.attrUpStages;
    }

    public boolean hasSkill(String name) {
        return name != null && this.skills.containsKey(name.toLowerCase());
    }

    public PlayerSkill getSkill(String name) {
        if (name == null) {
            return null;
        }
        PlayerSkill skill = this.skills.get(name.toLowerCase());
        if (skill != null) {
            return skill;
        }
        for (PlayerSkill playerSkill : this.skills.values()) {
            if (!playerSkill.getData().getName().equalsIgnoreCase(name)) continue;
            return playerSkill;
        }
        return null;
    }

    public int getInvestedSkillPoints() {
        int total = 0;
        for (PlayerSkill playerSkill : this.skills.values()) {
            total += playerSkill.getInvestedCost();
        }
        return total;
    }

    public Collection<PlayerSkill> getSkills() {
        return this.skills.values();
    }

    public Set<ExternallyAddedSkill> getExternallyAddedSkills() {
        return Collections.unmodifiableSet(this.extSkills);
    }

    public int getSkillLevel(String name) {
        PlayerSkill skill = this.getSkill(name);
        return skill == null ? 0 : skill.getLevel();
    }

    public void giveSkill(Skill skill) {
        this.giveSkill(skill, null);
    }

    public void giveSkill(Skill skill, PlayerClass parent) {
        String key = skill.getKey();
        if (!this.skills.containsKey(key)) {
            this.addSkill(skill, parent);
            this.autoLevel(skill);
        }
    }

    public void addSkill(Skill skill, PlayerClass parent) {
        String key = skill.getKey();
        PlayerSkill existing = this.skills.get(key);
        if (existing == null || !existing.isExternal()) {
            PlayerSkill data = new PlayerSkill(this, skill, parent);
            this.skills.put(key, data);
            this.comboData.addSkill(skill);
        }
    }

    public void addSkillExternally(Skill skill, PlayerClass parent, NamespacedKey namespacedKey, int level) {
        String key = skill.getKey();
        this.extSkills.removeIf(extSkill -> extSkill.getId().equals(key) && extSkill.getKey().equals((Object)namespacedKey));
        this.extSkills.add(new ExternallyAddedSkill(key, namespacedKey, level));
        PlayerSkill existing = this.skills.get(key);
        if (existing == null || existing.getLevel() == 0) {
            PlayerSkill data = new PlayerSkill(this, skill, parent, true);
            data.setCooldown(this.cooldownCache.getOrDefault(key, 0L));
            this.cooldownCache.remove(key);
            this.skills.put(key, data);
            this.comboData.addSkill(skill);
            this.forceUpSkill(data, level);
        } else if (existing.isExternal() && level > existing.getLevel()) {
            this.forceUpSkill(existing, level - existing.getLevel());
        }
    }

    public void removeSkillExternally(Skill skill, NamespacedKey namespacedKey) {
        String key = skill.getKey();
        this.extSkills.removeIf(extSkill -> extSkill.getId().equals(key) && extSkill.getKey().equals((Object)namespacedKey));
        PlayerSkill existing = this.skills.get(key);
        if (existing != null && existing.isExternal()) {
            ExternallyAddedSkill max = null;
            int maxLevel = Integer.MIN_VALUE;
            for (ExternallyAddedSkill extSkill2 : this.extSkills) {
                int level;
                if (!extSkill2.getId().equals(key) || (level = extSkill2.getLevel()) <= maxLevel) continue;
                maxLevel = level;
                max = extSkill2;
            }
            if (max == null) {
                this.cooldownCache.put(key, existing.getCooldown());
                this.skills.remove(key);
                this.comboData.removeSkill(existing.getData());
                this.forceDownSkill(existing, existing.getLevel());
            } else {
                this.forceDownSkill(existing, existing.getLevel() - maxLevel);
            }
        }
    }

    public void autoLevel() {
        if (this.init) {
            return;
        }
        Player player = this.getPlayer();
        if (player == null) {
            return;
        }
        for (PlayerSkill skill : this.skills.values()) {
            if (!skill.getData().isAllowed(player)) continue;
            this.autoLevel(skill.getData());
        }
    }

    private void autoLevel(Skill skill) {
        PlayerSkill data = this.skills.get(skill.getKey());
        if (data == null || this.getPlayer() == null || !skill.isAllowed(this.getPlayer())) {
            return;
        }
        int lastLevel = data.getLevel();
        while (data.getData().canAutoLevel(lastLevel) && !data.isMaxed() && data.getLevelReq() <= data.getPlayerClass().getLevel()) {
            this.upgradeSkill(skill);
            if (lastLevel == data.getLevel()) break;
            ++lastLevel;
        }
    }

    public boolean upgradeSkill(Skill skill) {
        if (skill == null) {
            return false;
        }
        PlayerSkill data = this.getSkill(skill.getName());
        if (data == null) {
            return false;
        }
        if (!(skill.isCompatible(this) && skill.hasInvestedEnough(this) && skill.hasEnoughAttributes(this) && skill.hasDependency(this))) {
            return false;
        }
        int level = data.getPlayerClass().getLevel();
        int points = data.getPlayerClass().getPoints();
        int cost = data.getCost();
        if (!data.isMaxed() && level >= data.getLevelReq() && points >= cost) {
            PlayerSkillUpgradeEvent event = new PlayerSkillUpgradeEvent(this, data, cost);
            Bukkit.getPluginManager().callEvent((Event)event);
            Bukkit.getPluginManager().callEvent((Event)new com.sucy.skill.api.event.PlayerSkillUpgradeEvent(this, data, cost));
            if (event.isCancelled()) {
                return false;
            }
            data.getPlayerClass().usePoints(cost);
            this.forceUpSkill(data);
            return true;
        }
        return false;
    }

    public boolean upgradeSkill(Skill skill, int levels) {
        boolean upgraded = false;
        for (int i = 0; i < levels && this.upgradeSkill(skill); ++i) {
            upgraded = true;
        }
        return upgraded;
    }

    public boolean upgradeSkillToMax(Skill skill) {
        boolean upgraded = false;
        while (this.upgradeSkill(skill)) {
            upgraded = true;
        }
        return upgraded;
    }

    public void forceUpSkill(PlayerSkill skill) {
        this.forceUpSkill(skill, 1);
    }

    public void forceUpSkill(PlayerSkill skill, int amount) {
        Preconditions.checkArgument((amount >= 0 ? 1 : 0) != 0);
        if (amount == 0) {
            return;
        }
        int oldLevel = skill.getLevel();
        skill.addLevels(amount);
        if (this.passive) {
            Player player = this.getPlayer();
            if (player != null && skill.getData() instanceof PassiveSkill) {
                if (oldLevel == 0) {
                    ((PassiveSkill)((Object)skill.getData())).initialize((LivingEntity)player, skill.getLevel());
                } else {
                    ((PassiveSkill)((Object)skill.getData())).update((LivingEntity)player, oldLevel, skill.getLevel());
                }
            }
            if (skill.getLevel() == 1) {
                Bukkit.getPluginManager().callEvent((Event)new studio.magemonkey.fabled.api.event.PlayerSkillUnlockEvent(this, skill));
                Bukkit.getPluginManager().callEvent((Event)new PlayerSkillUnlockEvent(this, skill));
                this.autoLevel();
            }
        }
    }

    public boolean downgradeSkill(Skill skill) {
        if (skill == null) {
            return false;
        }
        PlayerSkill data = this.skills.get(skill.getName().toLowerCase());
        if (data == null) {
            return false;
        }
        if (data.getCost() == 0) {
            return false;
        }
        for (PlayerSkill s : this.skills.values()) {
            if (s.getData().getSkillReq() == null || !s.getData().getSkillReq().equalsIgnoreCase(skill.getName()) || data.getLevel() > s.getData().getSkillReqLevel() || s.getLevel() <= 0) continue;
            return false;
        }
        int cost = skill.getCost(data.getLevel() - 1);
        if (data.getLevel() > 0) {
            PlayerSkillDowngradeEvent event = new PlayerSkillDowngradeEvent(this, data, cost);
            Bukkit.getPluginManager().callEvent((Event)event);
            Bukkit.getPluginManager().callEvent((Event)new com.sucy.skill.api.event.PlayerSkillDowngradeEvent(this, data, cost));
            if (event.isCancelled()) {
                return false;
            }
            data.getPlayerClass().givePoints(cost, PointSource.REFUND);
            this.forceDownSkill(data);
            return true;
        }
        return false;
    }

    public void forceDownSkill(PlayerSkill skill) {
        this.forceDownSkill(skill, 1);
    }

    public void forceDownSkill(PlayerSkill skill, int amount) {
        Preconditions.checkArgument((amount >= 0 ? 1 : 0) != 0);
        if (amount == 0) {
            return;
        }
        skill.addLevels(-amount);
        Player player = this.getPlayer();
        if (player != null && skill.getData() instanceof PassiveSkill) {
            if (skill.getLevel() == 0) {
                ((PassiveSkill)((Object)skill.getData())).stopEffects((LivingEntity)player);
            } else {
                ((PassiveSkill)((Object)skill.getData())).update((LivingEntity)player, skill.getLevel() + amount, skill.getLevel());
            }
        }
    }

    public void refundSkill(PlayerSkill skill) {
        Player player = this.getPlayer();
        if (skill.getCost() == 0 || skill.getLevel() == 0) {
            return;
        }
        skill.getPlayerClass().givePoints(skill.getInvestedCost(), PointSource.REFUND);
        skill.setLevel(0);
        if (player != null && skill.getData() instanceof PassiveSkill) {
            ((PassiveSkill)((Object)skill.getData())).stopEffects((LivingEntity)player);
        }
    }

    public void refundSkills() {
        for (PlayerSkill skill : this.skills.values()) {
            this.refundSkill(skill);
        }
    }

    public void showSkills() {
        this.showSkills(this.getPlayer());
    }

    public boolean showDetails(Player player) {
        if (!this.classes.isEmpty() && player != null) {
            HashMap<String, FabledClass> iconMap = new HashMap<String, FabledClass>();
            for (Map.Entry<String, PlayerClass> entry : this.classes.entrySet()) {
                iconMap.put(entry.getKey().toLowerCase(), entry.getValue().getData());
            }
            GUITool.getDetailsMenu().show(new DetailsHandler(), this, (String)Fabled.getLanguage().getMessage("GUI.skill-class-list", true, FilterType.COLOR, new CustomFilter[]{Filter.PLAYER.setReplacement(player.getName())}).get(0), iconMap);
            return true;
        }
        return false;
    }

    public boolean showProfession(Player player) {
        for (String group : Fabled.getGroups()) {
            PlayerClass c = this.getClass(group);
            if (c != null && (c.getLevel() != c.getData().getMaxLevel() || c.getData().getOptions().isEmpty())) continue;
            GUITool.getProfessMenu(c == null ? null : c.getData()).show(new ProfessHandler(), this, (String)Fabled.getLanguage().getMessage("GUI.profess-title", true, FilterType.COLOR, new CustomFilter[]{Filter.PLAYER.setReplacement(player.getName()), RPGFilter.GROUP.setReplacement(group)}).get(0), Fabled.getClasses());
            return true;
        }
        return false;
    }

    public boolean showSkills(Player player) {
        if (player == null || this.classes.isEmpty() || this.skills.isEmpty()) {
            return false;
        }
        return this.classes.size() > 1 ? this.showDetails(player) : this.showSkills(player, this.getMainClass());
    }

    public boolean showSkills(Player player, PlayerClass playerClass) {
        if (player == null || playerClass.getData().getSkills().isEmpty()) {
            return false;
        }
        this.menuClass = playerClass.getData().getName();
        GUITool.getSkillTree(playerClass.getData()).show(new SkillHandler(), this, (String)Fabled.getLanguage().getMessage("GUI.skill-tree", true, FilterType.COLOR, new CustomFilter[]{RPGFilter.POINTS.setReplacement("" + playerClass.getPoints()), RPGFilter.LEVEL.setReplacement("" + playerClass.getLevel()), RPGFilter.CLASS.setReplacement(playerClass.getData().getName()), Filter.PLAYER.setReplacement(this.getPlayerName())}).get(0), playerClass.getData().getSkillMap());
        return true;
    }

    public String getShownClassName() {
        return this.menuClass;
    }

    public boolean hasClass() {
        return !this.classes.isEmpty();
    }

    public boolean hasClass(String group) {
        return this.classes.containsKey(group);
    }

    public Collection<PlayerClass> getClasses() {
        return this.classes.values();
    }

    public PlayerClass getClass(String group) {
        return this.classes.get(group);
    }

    @Nullable
    public PlayerClass getMainClass() {
        String main = Fabled.getSettings().getMainGroup();
        if (this.classes.containsKey(main)) {
            return this.classes.get(main);
        }
        return this.classes.values().stream().findFirst().orElse(null);
    }

    public PlayerClass setClass(@Nullable FabledClass previous, FabledClass fabledClass, boolean reset) {
        PlayerClass c = this.classes.remove(fabledClass.getGroup());
        int skillPoints = 0;
        if (c != null) {
            List skTemp = c.getPlayerData().getSkills().stream().filter(skill -> skill.getPlayerClass().getData().getGroup().equals(fabledClass.getGroup())).map(PlayerSkill::getData).collect(Collectors.toList());
            for (Skill skill2 : skTemp) {
                String nm = skill2.getName().toLowerCase();
                PlayerSkill ps = this.skills.get(nm);
                if (previous != null && fabledClass.hasParent() && fabledClass.getParent().getName().equals(previous.getName())) {
                    GroupSettings group = Fabled.getSettings().getGroupSettings(fabledClass.getGroup());
                    if (!group.isProfessReset()) continue;
                    if (group.isProfessRefundSkills() && ps.getInvestedCost() > 0) {
                        skillPoints += ps.getInvestedCost();
                    }
                    if (group.isProfessRefundAttributes()) {
                        this.resetAttribs(true);
                    }
                    this.skills.remove(nm);
                    this.comboData.removeSkill(ps.getData());
                    continue;
                }
                if (!reset && Fabled.getSettings().isRefundOnClassChange() && this.skills.containsKey(nm)) {
                    if (ps.getInvestedCost() > 0) {
                        skillPoints += ps.getInvestedCost();
                    }
                    this.skills.remove(nm);
                    this.comboData.removeSkill(ps.getData());
                }
                if (!reset) continue;
                this.skills.remove(nm);
                this.comboData.removeSkill(ps.getData());
                this.resetAttribs(true);
            }
        } else {
            this.attribPoints += fabledClass.getGroupSettings().getStartingAttribs();
        }
        PlayerClass classData = new PlayerClass(this, fabledClass);
        if (!reset && c != null) {
            classData.setLevel(c.getLevel());
            classData.setExp(c.getExp());
            if (Fabled.getSettings().isSharedSkillPoints()) {
                classData.setEarnedPoints(c.getPoints());
                this.points += skillPoints;
            } else {
                classData.setPoints(c.getPoints() + skillPoints);
            }
        }
        this.classes.put(fabledClass.getGroup(), classData);
        for (Skill skill2 : fabledClass.getSkills()) {
            this.giveSkill(skill2, classData);
        }
        this.updatePlayerStat(this.getPlayer());
        this.updateScoreboard();
        return this.classes.get(fabledClass.getGroup());
    }

    public boolean isExactClass(FabledClass fabledClass) {
        if (fabledClass == null) {
            return false;
        }
        PlayerClass c = this.classes.get(fabledClass.getGroup());
        return c != null && c.getData() == fabledClass;
    }

    public boolean isClass(FabledClass fabledClass) {
        if (fabledClass == null) {
            return false;
        }
        PlayerClass pc = this.classes.get(fabledClass.getGroup());
        if (pc == null) {
            return false;
        }
        for (FabledClass temp = pc.getData(); temp != null; temp = temp.getParent()) {
            if (temp != fabledClass) continue;
            return true;
        }
        return false;
    }

    public boolean canProfess(FabledClass fabledClass) {
        Player p = this.getPlayer();
        if (p == null || !fabledClass.isAllowed(p)) {
            return false;
        }
        if (this.classes.containsKey(fabledClass.getGroup())) {
            PlayerClass current = this.classes.get(fabledClass.getGroup());
            return fabledClass.getParent() == current.getData() && current.getData().getMaxLevel() <= current.getLevel();
        }
        return !fabledClass.hasParent();
    }

    public int reset(String group, boolean toSubclass) {
        FabledClass fabledClass;
        GroupSettings settings = Fabled.getSettings().getGroupSettings(group);
        if (!settings.canReset()) {
            return 0;
        }
        PlayerClass playerClass = this.classes.remove(group);
        int points = 0;
        if (playerClass != null) {
            FabledClass data = playerClass.getData();
            for (Skill skill : data.getSkills()) {
                PlayerSkill ps = this.skills.remove(skill.getName().toLowerCase());
                if (ps != null && ps.isUnlocked() && ps.getData() instanceof PassiveSkill) {
                    ((PassiveSkill)((Object)ps.getData())).stopEffects((LivingEntity)this.getPlayer());
                }
                if (ps != null) {
                    points += ps.getInvestedCost();
                }
                this.comboData.removeSkill(skill);
            }
            if (Fabled.getSettings().isSharedSkillPoints()) {
                this.points += points - playerClass.getEarnedPoints();
            }
            this.updateScoreboard();
            Bukkit.getPluginManager().callEvent((Event)new studio.magemonkey.fabled.api.event.PlayerClassChangeEvent(playerClass, data, null));
            Bukkit.getPluginManager().callEvent((Event)new PlayerClassChangeEvent(new com.sucy.skill.api.player.PlayerClass(playerClass), new RPGClass(data), null));
        }
        if ((fabledClass = settings.getDefault()) != null && settings.getPermission() == null) {
            this.setClass(null, fabledClass, true);
        }
        this.resetAttribs(settings.isProfessRefundAttributes() && toSubclass);
        return settings.isProfessRefundSkills() && toSubclass ? points : 0;
    }

    public void resetAll() {
        ArrayList<String> classNames = new ArrayList<String>(this.classes.keySet());
        for (String clazz : classNames) {
            this.reset(clazz, false);
        }
        if (classNames.isEmpty()) {
            this.resetAttribs(false);
        }
        this.points = 0;
    }

    public void resetAttribs(boolean refund) {
        if (!refund) {
            this.attribPoints = 0;
        }
        for (PlayerClass c : this.classes.values()) {
            GroupSettings s = c.getData().getGroupSettings();
            this.attribPoints += s.getStartingAttribs() + s.getAttribsForLevels(c.getLevel(), 1);
        }
        HashSet<String> toRemove = new HashSet<String>();
        for (String attr : this.attributes.keySet()) {
            boolean refunded = this.resetAttribute(attr, refund);
            if (!refunded) continue;
            toRemove.add(attr);
        }
        for (String attr : toRemove) {
            if (this.attributes.get(attr) != 0) continue;
            this.attributes.remove(attr);
        }
        this.updatePlayerStat(this.getPlayer());
    }

    public boolean profess(FabledClass fabledClass) {
        if (fabledClass != null && this.canProfess(fabledClass)) {
            PlayerClass current;
            int skillPoints;
            PlayerClass previousData = this.classes.get(fabledClass.getGroup());
            FabledClass previous = previousData == null ? null : previousData.getData();
            PlayerPreClassChangeEvent event = new PlayerPreClassChangeEvent(this, previousData, previous, fabledClass);
            Bukkit.getPluginManager().callEvent((Event)event);
            if (event.isCancelled()) {
                return false;
            }
            boolean isResetting = Fabled.getSettings().getGroupSettings(fabledClass.getGroup()).isProfessReset();
            boolean isSubclass = previous != null && fabledClass.getParent().getName().equals(previous.getName());
            int n = skillPoints = isResetting ? this.reset(fabledClass.getGroup(), isSubclass) : 0;
            if (previousData == null || isResetting) {
                current = new PlayerClass(this, fabledClass);
                this.classes.put(fabledClass.getGroup(), current);
                this.attribPoints += fabledClass.getGroupSettings().getStartingAttribs();
            } else {
                current = previousData;
                previousData.setClassData(fabledClass);
            }
            for (Skill skill : fabledClass.getSkills(!isResetting)) {
                if (this.skills.containsKey(skill.getKey())) continue;
                this.skills.put(skill.getKey(), new PlayerSkill(this, skill, current));
                this.comboData.addSkill(skill);
            }
            Bukkit.getPluginManager().callEvent((Event)new studio.magemonkey.fabled.api.event.PlayerClassChangeEvent(current, previous, current.getData()));
            Bukkit.getPluginManager().callEvent((Event)new PlayerClassChangeEvent(new com.sucy.skill.api.player.PlayerClass(current), previous == null ? null : new RPGClass(previous), new RPGClass(current.getData())));
            if (fabledClass.getParent() == null || isResetting) {
                skillPoints += fabledClass.getGroupSettings().getStartingPoints();
            }
            current.givePoints(skillPoints);
            this.updateScoreboard();
            this.updatePlayerStat(this.getPlayer());
            return true;
        }
        return false;
    }

    public void giveExp(double amount, ExpSource source) {
        this.giveExp(amount, source, true);
    }

    public void giveExp(double amount, ExpSource source, boolean message) {
        for (PlayerClass playerClass : this.classes.values()) {
            playerClass.giveExp(amount, source, message);
        }
    }

    public void loseExp(double amount, boolean percent, boolean changeLevel, boolean showMessage) {
        for (PlayerClass playerClass : this.classes.values()) {
            playerClass.loseExp(amount, percent, changeLevel, showMessage);
        }
    }

    public void loseExp() {
        for (PlayerClass playerClass : this.classes.values()) {
            double penalty = playerClass.getData().getGroupSettings().getDeathPenalty();
            if (!(penalty > 0.0)) continue;
            playerClass.loseExp(penalty);
        }
    }

    public void setExp(double amount, ExpSource expSource, boolean showMessage) {
        for (PlayerClass playerClass : this.classes.values()) {
            double diff = amount - playerClass.getExp();
            if (diff > 0.0) {
                playerClass.giveExp(diff, expSource, showMessage);
                continue;
            }
            playerClass.loseExp(-diff, false, true, showMessage);
        }
    }

    public boolean giveLevels(int amount, ExpSource source) {
        boolean success = false;
        for (PlayerClass playerClass : this.classes.values()) {
            FabledClass data = playerClass.getData();
            if (!data.receivesExp(source)) continue;
            success = true;
            playerClass.giveLevels(amount);
        }
        this.updatePlayerStat(this.getPlayer());
        return success;
    }

    public void loseLevels(int amount) {
        this.classes.values().stream().forEach(playerClass -> playerClass.loseLevels(amount));
    }

    public boolean setLevel(int amount, ExpSource source) {
        boolean success = true;
        for (PlayerClass playerClass : this.classes.values()) {
            int diff = amount - playerClass.getLevel();
            if (diff > 0) {
                success = success && this.giveLevels(diff, source);
                continue;
            }
            if (diff >= 0) continue;
            this.loseLevels(-diff);
        }
        return success;
    }

    public int getPoints() {
        if (Fabled.getSettings().isSharedSkillPoints()) {
            return this.points;
        }
        PlayerClass clazz = this.getMainClass();
        if (clazz == null) {
            clazz = this.classes.values().stream().findFirst().orElse(null);
        }
        return clazz == null ? 0 : clazz.getPoints();
    }

    @Deprecated
    public void givePoints(int amount, ExpSource source) {
        if (Fabled.getSettings().isSharedSkillPoints()) {
            this.points += amount;
        } else {
            for (PlayerClass playerClass : this.classes.values()) {
                if (!playerClass.getData().receivesExp(source)) continue;
                playerClass.givePoints(amount);
            }
        }
    }

    public void givePoints(int amount, PointSource source) {
        if (Fabled.getSettings().isSharedSkillPoints()) {
            this.points += amount;
        } else {
            for (PlayerClass playerClass : this.classes.values()) {
                playerClass.givePoints(amount, source);
            }
        }
    }

    public void setPoints(int amount) {
        if (Fabled.getSettings().isSharedSkillPoints()) {
            this.points = amount;
        } else {
            for (PlayerClass playerClass : this.classes.values()) {
                playerClass.setPoints(amount);
            }
        }
    }

    public void updatePlayerStat(Player player) {
        if (!this.hasClass()) {
            this.maxHealth = 0.0;
            if (player != null) {
                this.updateHealth(player);
            }
            return;
        }
        double oldMaxHealth = this.maxHealth;
        this.maxHealth = 0.0;
        this.maxMana = 0.0;
        for (PlayerClass playerClass : this.classes.values()) {
            this.maxHealth += playerClass.getHealth();
            this.maxMana += playerClass.getMana();
        }
        this.maxHealth = this.scaleStat("health", this.maxHealth);
        this.maxMana = this.scaleStat("mana", this.maxMana);
        PlayerMaxManaChangeEvent maxManaEvent = new PlayerMaxManaChangeEvent(this, this.maxMana);
        if (Bukkit.getPluginManager() != null) {
            Bukkit.getPluginManager().callEvent((Event)maxManaEvent);
            this.maxMana = maxManaEvent.getMaxMana();
        }
        this.mana = Math.min(this.mana, this.maxMana);
        if (player == null) {
            return;
        }
        this.updateWalkSpeed(player);
        if (oldMaxHealth != this.maxHealth || player.getAttribute(VersionManager.getNms().getAttribute("MAX_HEALTH")).getValue() != this.maxHealth) {
            this.updateHealth(player);
        } else if (Fabled.getSettings().isOldHealth()) {
            player.setHealthScaled(true);
            player.setHealthScale(20.0);
        } else {
            player.setHealthScaled(false);
        }
        this.updateMCAttribute(player, VersionManager.getNms().getAttribute("ATTACK_SPEED"), "attack-speed", 0.0, 1024.0);
        this.updateMCAttribute(player, VersionManager.getNms().getAttribute("ARMOR"), "armor", 0.0, 30.0);
        this.updateMCAttribute(player, VersionManager.getNms().getAttribute("LUCK"), "luck", -1024.0, 1024.0);
        this.updateMCAttribute(player, VersionManager.getNms().getAttribute("KNOCKBACK_RESISTANCE"), "knockback-resist", 0.0, 1.0);
        this.updateMCAttribute(player, VersionManager.getNms().getAttribute("ARMOR_TOUGHNESS"), "armor-toughness", 0.0, 20.0);
        if (Version.CURRENT.isAtLeast(Version.V1_21_R1)) {
            this.updateMCAttribute(player, VersionManager.getNms().getAttribute("ATTACK_DAMAGE"), "attack-damage", 0.0, 2048.0);
            this.updateMCAttribute(player, VersionManager.getNms().getAttribute("ATTACK_KNOCKBACK"), "attack-knockback", 0.0, 5.0);
            this.updateMCAttribute(player, VersionManager.getNms().getAttribute("MAX_ABSORPTION"), "absorption", 0.0, 2048.0);
            this.updateMCAttribute(player, VersionManager.getNms().getAttribute("SCALE"), "scale", 0.0625, 16.0);
            this.updateMCAttribute(player, VersionManager.getNms().getAttribute("STEP_HEIGHT"), "step-height", 0.0, 10.0);
            this.updateMCAttribute(player, VersionManager.getNms().getAttribute("JUMP_STRENGTH"), "jump-strength", 0.0, 32.0);
            this.updateMCAttribute(player, VersionManager.getNms().getAttribute("GRAVITY"), "gravity", -1.0, 1.0);
            this.updateMCAttribute(player, VersionManager.getNms().getAttribute("SAFE_FALL_DISTANCE"), "safe-fall-distance", -1024.0, 1024.0);
            this.updateMCAttribute(player, VersionManager.getNms().getAttribute("FALL_DAMAGE_MULTIPLIER"), "fall-damage-multiplier", 0.0, 100.0);
            this.updateMCAttribute(player, VersionManager.getNms().getAttribute("BURNING_TIME"), "burning-time", 0.0, 1024.0);
            this.updateMCAttribute(player, VersionManager.getNms().getAttribute("EXPLOSION_KNOCKBACK_RESISTANCE"), "explosion-knockback-resistance", 0.0, 1.0);
            this.updateMCAttribute(player, VersionManager.getNms().getAttribute("MOVEMENT_EFFICIENCY"), "movement-efficiency", 0.0, 1.0);
            this.updateMCAttribute(player, VersionManager.getNms().getAttribute("OXYGEN_BONUS"), "oxygen-bonus", 0.0, 1024.0);
            this.updateMCAttribute(player, VersionManager.getNms().getAttribute("WATER_MOVEMENT_EFFICIENCY"), "water-movement-efficiency", 0.0, 1.0);
            this.updateMCAttribute(player, VersionManager.getNms().getAttribute("BLOCK_INTERACTION_RANGE"), "block-interaction-range", 0.0, 64.0);
            this.updateMCAttribute(player, VersionManager.getNms().getAttribute("ENTITY_INTERACTION_RANGE"), "entity-interaction-range", 0.0, 64.0);
            this.updateMCAttribute(player, VersionManager.getNms().getAttribute("BLOCK_BREAK_SPEED"), "block-break-speed", 0.0, 1024.0);
            this.updateMCAttribute(player, VersionManager.getNms().getAttribute("MINING_EFFICIENCY"), "mining-efficiency", 0.0, 1024.0);
            this.updateMCAttribute(player, VersionManager.getNms().getAttribute("SNEAKING_SPEED"), "sneaking-speed", 0.0, 1.0);
            this.updateMCAttribute(player, VersionManager.getNms().getAttribute("SUBMERGED_MINING_SPEED"), "submerged-mining-speed", 0.0, 20.0);
            this.updateMCAttribute(player, VersionManager.getNms().getAttribute("SWEEPING_DAMAGE_RATIO"), "sweeping-damage-ratio", 0.0, 1.0);
        }
    }

    public void updateWalkSpeed(Player player) {
        float level = (float)this.scaleStat("move-speed", 0.2f, 0.0, Double.MAX_VALUE);
        try {
            player.setWalkSpeed(level);
        }
        catch (IllegalArgumentException e) {
            Fabled.inst().getLogger().warning("Attempted to set player speed to " + level + " but failed: " + e.getMessage());
        }
    }

    public void updateHealth(Player player) {
        if (!Fabled.getSettings().isModifyHealth()) {
            return;
        }
        if (this.maxHealth <= 0.0) {
            this.maxHealth = Fabled.getSettings().getDefaultHealth();
        }
        AttributeInstance attribute = player.getAttribute(VersionManager.getNms().getAttribute("MAX_HEALTH"));
        Objects.requireNonNull(attribute).setBaseValue(this.maxHealth);
        if (Fabled.getSettings().isOldHealth()) {
            if (Fabled.getSettings().isDownScaling() && player.getMaxHealth() < 20.0) {
                player.setHealthScaled(false);
            } else {
                player.setHealthScaled(true);
                player.setHealthScale(20.0);
            }
        } else {
            player.setHealthScaled(false);
        }
    }

    private void updateMCAttribute(Player player, Attribute attribute, String attribKey, double min, double max) {
        try {
            AttributeInstance instance = player.getAttribute(attribute);
            if (instance == null) {
                return;
            }
            double def = instance.getDefaultValue();
            if (attribKey.equalsIgnoreCase("attack-damage")) {
                def = 1.0;
            }
            double modified = this.scaleStat(attribKey, def, min, max);
            instance.setBaseValue(modified);
        }
        catch (Exception e) {
            if (e.getClass().getSimpleName().equals("UnimplementedOperationException")) {
                return;
            }
            Logger.log("Failed to update attribute " + (attribute == null ? "null" : EnumUT.getName((Object)attribute)) + " for " + player.getName() + ": " + e.getMessage());
            e.printStackTrace();
        }
    }

    public void regenMana() {
        double amount = 0.0;
        for (PlayerClass c : this.classes.values()) {
            if (!c.getData().hasManaRegen()) continue;
            amount += c.getData().getManaRegen();
        }
        if (amount > 0.0) {
            double finalAmount = amount;
            Bukkit.getScheduler().runTask((Plugin)CodexEngine.get(), () -> this.giveMana(finalAmount, ManaSource.REGEN));
        }
    }

    public void giveMana(double amount) {
        this.giveMana(amount, ManaSource.SPECIAL);
    }

    public void giveMana(double amount, ManaSource source) {
        PlayerManaGainEvent event = new PlayerManaGainEvent(this, amount, source);
        Bukkit.getPluginManager().callEvent((Event)event);
        if (!event.isCancelled()) {
            Logger.log(LogType.MANA, 2, this.getPlayerName() + " gained " + amount + " mana due to " + event.getSource().name());
            this.mana += event.getAmount();
            if (this.mana > this.maxMana) {
                this.mana = this.maxMana;
            }
            if (this.mana < 0.0) {
                this.mana = 0.0;
            }
        } else {
            Logger.log(LogType.MANA, 2, this.getPlayerName() + " had their mana gain cancelled");
        }
    }

    public void useMana(double amount) {
        this.useMana(amount, ManaCost.SPECIAL);
    }

    public void useMana(double amount, ManaCost cost) {
        PlayerManaLossEvent event = new PlayerManaLossEvent(this, amount, cost);
        Bukkit.getPluginManager().callEvent((Event)event);
        if (!event.isCancelled()) {
            Logger.log(LogType.MANA, 2, this.getPlayerName() + " used " + amount + " mana due to " + event.getSource().name());
            this.mana -= event.getAmount();
            if (this.mana < 0.0) {
                this.mana = 0.0;
            }
        }
    }

    public void removeStatModifier(UUID uuid, boolean update) {
        for (Map.Entry<String, List<PlayerStatModifier>> entry : this.statModifiers.entrySet()) {
            List<PlayerStatModifier> modifiers = entry.getValue();
            Iterator<PlayerStatModifier> i = modifiers.iterator();
            while (i.hasNext()) {
                PlayerStatModifier modifier = i.next();
                if (!modifier.getUUID().equals(uuid)) continue;
                i.remove();
            }
            this.statModifiers.put(entry.getKey(), modifiers);
        }
        if (update) {
            this.updatePlayerStat(this.getPlayer());
        }
    }

    public void clearStatModifier() {
        for (Map.Entry<String, List<PlayerStatModifier>> entry : this.statModifiers.entrySet()) {
            List<PlayerStatModifier> modifiers = entry.getValue();
            Iterator<PlayerStatModifier> i = modifiers.iterator();
            while (i.hasNext()) {
                PlayerStatModifier modifier = i.next();
                if (modifier.isPersistent()) continue;
                i.remove();
            }
            this.statModifiers.put(entry.getKey(), modifiers);
        }
        this.updatePlayerStat(this.getPlayer());
    }

    public void removeAttributeModifier(UUID uuid, boolean update) {
        for (Map.Entry<String, List<PlayerAttributeModifier>> entry : this.attributesModifiers.entrySet()) {
            List<PlayerAttributeModifier> modifiers = entry.getValue();
            Iterator<PlayerAttributeModifier> i = modifiers.iterator();
            while (i.hasNext()) {
                PlayerAttributeModifier modifier = i.next();
                if (!modifier.getUUID().equals(uuid)) continue;
                i.remove();
            }
            this.attributesModifiers.put(entry.getKey(), modifiers);
        }
        if (update) {
            this.updatePlayerStat(this.getPlayer());
        }
    }

    public void clearAttributeModifiers() {
        for (Map.Entry<String, List<PlayerAttributeModifier>> entry : this.attributesModifiers.entrySet()) {
            List<PlayerAttributeModifier> modifiers = entry.getValue();
            Iterator<PlayerAttributeModifier> i = modifiers.iterator();
            while (i.hasNext()) {
                PlayerAttributeModifier modifier = i.next();
                if (modifier.isPersistent()) continue;
                i.remove();
            }
            this.attributesModifiers.put(entry.getKey(), modifiers);
        }
        this.equips.update(this.getPlayer());
        this.updatePlayerStat(this.getPlayer());
    }

    public void clearAllModifiers() {
        this.clearStatModifier();
        this.clearAttributeModifiers();
    }

    @Deprecated
    public PlayerSkill getBoundSkill(Material mat) {
        return null;
    }

    @Deprecated
    public HashMap<Material, PlayerSkill> getBinds() {
        return new HashMap<Material, PlayerSkill>();
    }

    @Deprecated
    public boolean isBound(Material mat) {
        return false;
    }

    @Deprecated
    public boolean bind(Material mat, PlayerSkill skill) {
        return false;
    }

    @Deprecated
    public boolean clearBind(Material mat) {
        return false;
    }

    public Object getPersistentData(String key) {
        String data = this.persistentData.get(key);
        if (data == null) {
            return 0;
        }
        if (data.startsWith("targets")) {
            data = data.substring(8);
            ArrayList targets = new ArrayList();
            Arrays.stream(data.split(";")).forEach(target -> {
                if (target.startsWith("loc")) {
                    String[] loc = target.split(",");
                    Location location = new Location(Bukkit.getWorld((String)loc[1]), Double.parseDouble(loc[2]), Double.parseDouble(loc[3]), Double.parseDouble(loc[4]));
                    targets.add(new TempEntity(location));
                } else if (target.startsWith("entity-")) {
                    Entity entity = Bukkit.getEntity((UUID)UUID.fromString(target.substring(7)));
                    if (entity != null) {
                        targets.add((LivingEntity)entity);
                    }
                } else {
                    Player player = Bukkit.getPlayer((UUID)UUID.fromString(target));
                    if (player == null || !player.isOnline()) {
                        return;
                    }
                    targets.add(player);
                }
            });
            return targets;
        }
        if (data.startsWith("loc")) {
            String[] loc = data.split(",");
            return new Location(Bukkit.getWorld((String)loc[1]), Double.parseDouble(loc[2]), Double.parseDouble(loc[3]), Double.parseDouble(loc[4]));
        }
        try {
            return Double.parseDouble(data);
        }
        catch (NumberFormatException numberFormatException) {
            return data;
        }
    }

    public void setPersistentData(String key, Object data) {
        if (data == null || Objects.equals(data, 0)) {
            this.removePersistentData(key);
            return;
        }
        if (data instanceof List) {
            ArrayList sum = new ArrayList();
            ((List)data).forEach(entry -> {
                if (entry instanceof Player) {
                    sum.add(((Player)entry).getUniqueId().toString());
                } else if (entry instanceof TempEntity) {
                    Location loc = ((TempEntity)entry).getLocation();
                    if (loc.getWorld() == null) {
                        return;
                    }
                    sum.add(String.format("loc,%s,%f,%f,%f", loc.getWorld().getName(), loc.getX(), loc.getY(), loc.getZ()));
                } else if (entry instanceof Entity) {
                    sum.add("entity-" + String.valueOf(((Entity)entry).getUniqueId()));
                }
            });
            if (sum.isEmpty()) {
                return;
            }
            this.persistentData.put(key, "targets-" + String.join((CharSequence)";", sum));
            return;
        }
        if (data instanceof Location) {
            Location loc = (Location)data;
            this.persistentData.put(key, String.format("loc,%s,%f,%f,%f", loc.getWorld().getName(), loc.getX(), loc.getY(), loc.getZ()));
            return;
        }
        this.persistentData.put(key, data.toString());
    }

    public void removePersistentData(String key) {
        this.persistentData.remove(key);
    }

    public Map<String, String> getAllPersistentData() {
        return this.persistentData;
    }

    @Deprecated
    public void clearBinds(Skill skill) {
    }

    @Deprecated
    public void clearAllBinds() {
    }

    public void record(Player player) {
        this.lastHealth = player.getHealth();
    }

    public void updateScoreboard() {
        if (Fabled.getSettings().isShowScoreboard()) {
            Fabled.schedule(new ScoreboardTask(this), 2);
        }
    }

    public void startPassives(final Player player) {
        if (player == null) {
            return;
        }
        if (player.isValid()) {
            this._startPassives(player);
        } else {
            new BukkitRunnable(){
                int tries = 0;

                public void run() {
                    if (player.isValid()) {
                        PlayerData.this._startPassives(player);
                        this.cancel();
                    }
                    if (++this.tries > 10) {
                        this.cancel();
                    }
                }
            }.runTaskTimer((Plugin)Fabled.inst(), 20L, 20L);
        }
    }

    private void _startPassives(Player player) {
        if (player == null) {
            return;
        }
        this.passive = true;
        for (PlayerSkill skill : this.skills.values()) {
            if (!skill.isUnlocked() || !(skill.getData() instanceof PassiveSkill)) continue;
            ((PassiveSkill)((Object)skill.getData())).initialize((LivingEntity)player, skill.getLevel());
        }
    }

    public void stopSkills(Player player) {
        if (player == null) {
            return;
        }
        this.passive = false;
        for (PlayerSkill skill : this.skills.values()) {
            if (!skill.isUnlocked() || !(skill.getData() instanceof DynamicSkill)) continue;
            try {
                ((DynamicSkill)skill.getData()).stopEffects((LivingEntity)player);
            }
            catch (Exception ex) {
                Logger.bug("Failed to stop skill " + skill.getData().getName());
                ex.printStackTrace();
            }
        }
    }

    public boolean cast(String skillName) {
        return this.cast(this.skills.get(skillName.toLowerCase()));
    }

    public boolean cast(PlayerSkill skill) {
        if (skill == null) {
            throw new IllegalArgumentException("Skill cannot be null");
        }
        int level = skill.getLevel();
        if (!this.check(skill, true, true)) {
            return false;
        }
        Player p = this.getPlayer();
        if (p.isDead()) {
            return PlayerSkillCastFailedEvent.invoke(skill, PlayerSkillCastFailedEvent.Cause.CASTER_DEAD);
        }
        if (p.getGameMode().name().equals("SPECTATOR")) {
            return PlayerSkillCastFailedEvent.invoke(skill, PlayerSkillCastFailedEvent.Cause.SPECTATOR);
        }
        if (skill.getData() instanceof SkillShot) {
            PlayerCastSkillEvent event = new PlayerCastSkillEvent(this, skill, p);
            Bukkit.getPluginManager().callEvent((Event)event);
            if (!event.isCancelled()) {
                try {
                    if (((SkillShot)((Object)skill.getData())).cast((LivingEntity)p, level)) {
                        return this.applyUse(p, skill, event.getManaCost());
                    }
                    return PlayerSkillCastFailedEvent.invoke(skill, PlayerSkillCastFailedEvent.Cause.EFFECT_FAILED);
                }
                catch (Exception ex) {
                    Logger.bug("Failed to cast skill - " + skill.getData().getName() + ": Internal skill error");
                    ex.printStackTrace();
                    return PlayerSkillCastFailedEvent.invoke(skill, PlayerSkillCastFailedEvent.Cause.EFFECT_FAILED);
                }
            }
            return PlayerSkillCastFailedEvent.invoke(skill, PlayerSkillCastFailedEvent.Cause.CANCELED);
        }
        if (skill.getData() instanceof TargetSkill) {
            LivingEntity target = TargetHelper.getLivingTarget((LivingEntity)p, skill.getData().getRange(level));
            if (target == null) {
                return PlayerSkillCastFailedEvent.invoke(skill, PlayerSkillCastFailedEvent.Cause.NO_TARGET);
            }
            PlayerCastSkillEvent event = new PlayerCastSkillEvent(this, skill, p);
            Bukkit.getPluginManager().callEvent((Event)event);
            if (!event.isCancelled()) {
                try {
                    boolean canAttack;
                    boolean bl = canAttack = !Fabled.getSettings().canAttack((LivingEntity)p, target);
                    if (((TargetSkill)((Object)skill.getData())).cast((LivingEntity)p, target, level, canAttack)) {
                        return this.applyUse(p, skill, event.getManaCost());
                    }
                    return PlayerSkillCastFailedEvent.invoke(skill, PlayerSkillCastFailedEvent.Cause.EFFECT_FAILED);
                }
                catch (Exception ex) {
                    Logger.bug("Failed to cast skill - " + skill.getData().getName() + ": Internal skill error");
                    ex.printStackTrace();
                    return PlayerSkillCastFailedEvent.invoke(skill, PlayerSkillCastFailedEvent.Cause.EFFECT_FAILED);
                }
            }
            PlayerSkillCastFailedEvent.invoke(skill, PlayerSkillCastFailedEvent.Cause.CANCELED);
        }
        return false;
    }

    private boolean applyUse(Player player, PlayerSkill skill, double manaCost) {
        player.setMetadata("custom-cooldown", (MetadataValue)new FixedMetadataValue((Plugin)Fabled.inst(), (Object)1));
        skill.startCooldown();
        if (Fabled.getSettings().isShowSkillMessages()) {
            skill.getData().sendMessage(player, Fabled.getSettings().getMessageRadius());
        }
        if (Fabled.getSettings().isManaEnabled()) {
            this.useMana(manaCost, ManaCost.SKILL_CAST);
        }
        this.skillTimer = System.currentTimeMillis() + Fabled.getSettings().getCastCooldown();
        if (this.removeTimer != null && !this.removeTimer.isCancelled()) {
            this.removeTimer.cancel();
        }
        this.removeTimer = Bukkit.getScheduler().runTaskLater((Plugin)Fabled.inst(), () -> player.removeMetadata("custom-cooldown", (Plugin)Fabled.inst()), 20L);
        return true;
    }

    public boolean check(PlayerSkill skill, boolean cooldown, boolean mana) {
        if (skill == null || System.currentTimeMillis() < this.skillTimer) {
            return false;
        }
        SkillStatus status = skill.getStatus();
        int level = skill.getLevel();
        double cost = skill.getData().getManaCost(level, this);
        if (level <= 0) {
            return PlayerSkillCastFailedEvent.invoke(skill, PlayerSkillCastFailedEvent.Cause.NOT_UNLOCKED);
        }
        if (status == SkillStatus.ON_COOLDOWN && cooldown) {
            if (skill.getData().cooldownMessage() && !this.onCooldown.contains(this.getUUID())) {
                Fabled.getLanguage().sendMessage("Errors.on-cooldown", (CommandSender)this.getPlayer(), FilterType.COLOR, new CustomFilter[]{RPGFilter.COOLDOWN.setReplacement("" + skill.getCooldownLeft()), RPGFilter.SKILL.setReplacement(skill.getData().getName())});
                this.onCooldown.add(this.getUUID());
                Bukkit.getScheduler().runTaskLater((Plugin)Fabled.inst(), () -> this.onCooldown.remove(this.getUUID()), 40L);
            }
            return PlayerSkillCastFailedEvent.invoke(skill, PlayerSkillCastFailedEvent.Cause.ON_COOLDOWN);
        }
        if (status == SkillStatus.MISSING_MANA && mana) {
            Fabled.getLanguage().sendMessage("Errors.no-mana", (CommandSender)this.getPlayer(), FilterType.COLOR, new CustomFilter[]{RPGFilter.SKILL.setReplacement(skill.getData().getName()), RPGFilter.MANA.setReplacement("" + this.getMana()), RPGFilter.COST.setReplacement("" + (int)Math.ceil(cost)), RPGFilter.MISSING.setReplacement("" + (int)Math.ceil(cost - this.getMana()))});
            return PlayerSkillCastFailedEvent.invoke(skill, PlayerSkillCastFailedEvent.Cause.NO_MANA);
        }
        return true;
    }

    public void setOnPreviewStop(@Nullable Runnable onPreviewStop) {
        if (this.onPreviewStop != null) {
            this.onPreviewStop.run();
        }
        this.onPreviewStop = onPreviewStop;
    }

    public void init(Player player) {
        if (player == null) {
            return;
        }
        if (!Fabled.getSettings().isWorldEnabled(player.getWorld())) {
            return;
        }
        this.getEquips().update(player);
        this.updatePlayerStat(player);
        this.startPassives(player);
        this.updateScoreboard();
        if (this.getLastHealth() > 0.0 && !player.isDead()) {
            player.setHealth(Math.min(this.getLastHealth(), player.getMaxHealth()));
        }
        this.autoLevel();
        this.updateScoreboard();
    }

    public boolean hasMana(double amount) {
        return this.mana >= amount;
    }

    @Generated
    public Map<String, Integer> getAttrUpStages() {
        return this.attrUpStages;
    }

    @Generated
    public Set<ExternallyAddedSkill> getExtSkills() {
        return this.extSkills;
    }

    @Generated
    public Map<String, List<PlayerAttributeModifier>> getAttributesModifiers() {
        return this.attributesModifiers;
    }

    @Generated
    public Map<String, List<PlayerStatModifier>> getStatModifiers() {
        return this.statModifiers;
    }

    @Generated
    public Map<String, String> getPersistentData() {
        return this.persistentData;
    }

    @Generated
    public Map<String, Long> getCooldownCache() {
        return this.cooldownCache;
    }

    @Generated
    public DataSection getExtraData() {
        return this.extraData;
    }

    @Generated
    public UUID getPlayerUUID() {
        return this.playerUUID;
    }

    @Generated
    public PlayerCombos getComboData() {
        return this.comboData;
    }

    @Generated
    public PlayerEquips getEquips() {
        return this.equips;
    }

    @Generated
    public List<UUID> getOnCooldown() {
        return this.onCooldown;
    }

    @Generated
    public int getAttribPoints() {
        return this.attribPoints;
    }

    @Generated
    public String getScheme() {
        return this.scheme;
    }

    @Generated
    public String getMenuClass() {
        return this.menuClass;
    }

    @Generated
    public double getMana() {
        return this.mana;
    }

    @Generated
    public double getMaxMana() {
        return this.maxMana;
    }

    @Generated
    public double getLastHealth() {
        return this.lastHealth;
    }

    @Generated
    public double getMaxHealth() {
        return this.maxHealth;
    }

    @Generated
    public double getHungerValue() {
        return this.hungerValue;
    }

    @Generated
    public boolean isInit() {
        return this.init;
    }

    @Generated
    public boolean isPassive() {
        return this.passive;
    }

    @Generated
    public long getSkillTimer() {
        return this.skillTimer;
    }

    @Generated
    public BukkitTask getRemoveTimer() {
        return this.removeTimer;
    }

    @Generated
    public Runnable getOnPreviewStop() {
        return this.onPreviewStop;
    }

    @Generated
    public void setAttribPoints(int attribPoints) {
        this.attribPoints = attribPoints;
    }

    @Generated
    public void setScheme(String scheme) {
        this.scheme = scheme;
    }

    @Generated
    public void setMana(double mana) {
        this.mana = mana;
    }

    @Generated
    public void setLastHealth(double lastHealth) {
        this.lastHealth = lastHealth;
    }

    @Generated
    public void setHungerValue(double hungerValue) {
        this.hungerValue = hungerValue;
    }

    public static class ExternallyAddedSkill {
        private final String id;
        private final NamespacedKey key;
        private final int level;

        @Generated
        public String getId() {
            return this.id;
        }

        @Generated
        public NamespacedKey getKey() {
            return this.key;
        }

        @Generated
        public int getLevel() {
            return this.level;
        }

        @Generated
        public boolean equals(Object o) {
            if (o == this) {
                return true;
            }
            if (!(o instanceof ExternallyAddedSkill)) {
                return false;
            }
            ExternallyAddedSkill other = (ExternallyAddedSkill)o;
            if (!other.canEqual(this)) {
                return false;
            }
            if (this.getLevel() != other.getLevel()) {
                return false;
            }
            String this$id = this.getId();
            String other$id = other.getId();
            if (this$id == null ? other$id != null : !this$id.equals(other$id)) {
                return false;
            }
            NamespacedKey this$key = this.getKey();
            NamespacedKey other$key = other.getKey();
            return !(this$key == null ? other$key != null : !this$key.equals(other$key));
        }

        @Generated
        protected boolean canEqual(Object other) {
            return other instanceof ExternallyAddedSkill;
        }

        @Generated
        public int hashCode() {
            int PRIME = 59;
            int result = 1;
            result = result * 59 + this.getLevel();
            String $id = this.getId();
            result = result * 59 + ($id == null ? 43 : $id.hashCode());
            NamespacedKey $key = this.getKey();
            result = result * 59 + ($key == null ? 43 : $key.hashCode());
            return result;
        }

        @Generated
        public String toString() {
            return "PlayerData.ExternallyAddedSkill(id=" + this.getId() + ", key=" + String.valueOf(this.getKey()) + ", level=" + this.getLevel() + ")";
        }

        @Generated
        public ExternallyAddedSkill(String id, NamespacedKey key, int level) {
            this.id = id;
            this.key = key;
            this.level = level;
        }
    }
}

