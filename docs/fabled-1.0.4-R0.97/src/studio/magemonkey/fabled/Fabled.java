/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  lombok.Generated
 *  org.bukkit.Bukkit
 *  org.bukkit.ChatColor
 *  org.bukkit.OfflinePlayer
 *  org.bukkit.entity.Player
 *  org.bukkit.event.HandlerList
 *  org.bukkit.event.Listener
 *  org.bukkit.metadata.FixedMetadataValue
 *  org.bukkit.metadata.MetadataValue
 *  org.bukkit.metadata.Metadatable
 *  org.bukkit.plugin.Plugin
 *  org.bukkit.plugin.PluginDescriptionFile
 *  org.bukkit.plugin.java.JavaPlugin
 *  org.bukkit.plugin.java.JavaPluginLoader
 *  org.bukkit.scheduler.BukkitRunnable
 *  org.bukkit.scheduler.BukkitTask
 *  studio.magemonkey.codex.CodexEngine
 *  studio.magemonkey.codex.manager.api.menu.YAMLMenu
 *  studio.magemonkey.codex.mccore.config.CommentedConfig
 *  studio.magemonkey.codex.mccore.config.CommentedLanguageConfig
 *  studio.magemonkey.codex.migration.MigrationUtil
 *  studio.magemonkey.codex.registry.AttributeRegistry
 *  studio.magemonkey.codex.registry.BuffRegistry
 *  studio.magemonkey.codex.registry.provider.AttributeProvider
 *  studio.magemonkey.codex.registry.provider.BuffProvider
 */
package studio.magemonkey.fabled;

import com.sucy.skill.SkillAPI;
import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Random;
import lombok.Generated;
import org.bukkit.Bukkit;
import org.bukkit.ChatColor;
import org.bukkit.OfflinePlayer;
import org.bukkit.entity.Player;
import org.bukkit.event.HandlerList;
import org.bukkit.event.Listener;
import org.bukkit.metadata.FixedMetadataValue;
import org.bukkit.metadata.MetadataValue;
import org.bukkit.metadata.Metadatable;
import org.bukkit.plugin.Plugin;
import org.bukkit.plugin.PluginDescriptionFile;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.plugin.java.JavaPluginLoader;
import org.bukkit.scheduler.BukkitRunnable;
import org.bukkit.scheduler.BukkitTask;
import studio.magemonkey.codex.CodexEngine;
import studio.magemonkey.codex.manager.api.menu.YAMLMenu;
import studio.magemonkey.codex.mccore.config.CommentedConfig;
import studio.magemonkey.codex.mccore.config.CommentedLanguageConfig;
import studio.magemonkey.codex.migration.MigrationUtil;
import studio.magemonkey.codex.registry.AttributeRegistry;
import studio.magemonkey.codex.registry.BuffRegistry;
import studio.magemonkey.codex.registry.provider.AttributeProvider;
import studio.magemonkey.codex.registry.provider.BuffProvider;
import studio.magemonkey.fabled.DependencyRequirement;
import studio.magemonkey.fabled.api.FabledAttributeProvider;
import studio.magemonkey.fabled.api.armorstand.ArmorStandManager;
import studio.magemonkey.fabled.api.classes.FabledClass;
import studio.magemonkey.fabled.api.particle.EffectManager;
import studio.magemonkey.fabled.api.player.PlayerAccounts;
import studio.magemonkey.fabled.api.player.PlayerClass;
import studio.magemonkey.fabled.api.player.PlayerData;
import studio.magemonkey.fabled.api.player.PlayerSkill;
import studio.magemonkey.fabled.api.skills.Skill;
import studio.magemonkey.fabled.api.util.BuffManager;
import studio.magemonkey.fabled.data.PlayerStats;
import studio.magemonkey.fabled.data.Settings;
import studio.magemonkey.fabled.data.io.ConfigIO;
import studio.magemonkey.fabled.data.io.IOManager;
import studio.magemonkey.fabled.data.io.PlayerLoader;
import studio.magemonkey.fabled.data.sql.SQLManager;
import studio.magemonkey.fabled.dynamic.DynamicClass;
import studio.magemonkey.fabled.dynamic.DynamicSkill;
import studio.magemonkey.fabled.exception.FabledNotEnabledException;
import studio.magemonkey.fabled.gui.tool.GUITool;
import studio.magemonkey.fabled.hook.PlaceholderAPIHook;
import studio.magemonkey.fabled.hook.PluginChecker;
import studio.magemonkey.fabled.hook.mimic.MimicHook;
import studio.magemonkey.fabled.listener.AddonListener;
import studio.magemonkey.fabled.listener.BarListener;
import studio.magemonkey.fabled.listener.BindListener;
import studio.magemonkey.fabled.listener.BuffListener;
import studio.magemonkey.fabled.listener.CastBarsListener;
import studio.magemonkey.fabled.listener.CastCombatListener;
import studio.magemonkey.fabled.listener.CastItemListener;
import studio.magemonkey.fabled.listener.CastOffhandListener;
import studio.magemonkey.fabled.listener.CastTextListener;
import studio.magemonkey.fabled.listener.CastWheelListener;
import studio.magemonkey.fabled.listener.ClickListener;
import studio.magemonkey.fabled.listener.ComboListener;
import studio.magemonkey.fabled.listener.ExperienceListener;
import studio.magemonkey.fabled.listener.FabledListener;
import studio.magemonkey.fabled.listener.ItemListener;
import studio.magemonkey.fabled.listener.KillListener;
import studio.magemonkey.fabled.listener.LingeringPotionListener;
import studio.magemonkey.fabled.listener.MainListener;
import studio.magemonkey.fabled.listener.MechanicListener;
import studio.magemonkey.fabled.listener.PacketListener;
import studio.magemonkey.fabled.listener.ProjectileListener;
import studio.magemonkey.fabled.listener.ShieldBlockListener;
import studio.magemonkey.fabled.listener.StatusListener;
import studio.magemonkey.fabled.listener.ToolListener;
import studio.magemonkey.fabled.listener.attribute.AttributeListener;
import studio.magemonkey.fabled.manager.AttributeManager;
import studio.magemonkey.fabled.manager.ClassBoardManager;
import studio.magemonkey.fabled.manager.CmdManager;
import studio.magemonkey.fabled.manager.ComboManager;
import studio.magemonkey.fabled.manager.IAttributeManager;
import studio.magemonkey.fabled.manager.NullAttributeManager;
import studio.magemonkey.fabled.manager.RegistrationManager;
import studio.magemonkey.fabled.manager.ResourceManager;
import studio.magemonkey.fabled.shield.ShieldManager;
import studio.magemonkey.fabled.task.CooldownTask;
import studio.magemonkey.fabled.task.GUITask;
import studio.magemonkey.fabled.task.ManaTask;
import studio.magemonkey.fabled.task.SaveTask;
import studio.magemonkey.fabled.thread.MainThread;

public class Fabled
extends SkillAPI {
    private static Fabled singleton;
    public static Random RANDOM;
    private final Map<String, Skill> skills = new HashMap<String, Skill>();
    private final Map<String, FabledClass> classes = new HashMap<String, FabledClass>();
    private final List<String> groups = new ArrayList<String>();
    private final List<FabledListener> listeners = new ArrayList<FabledListener>();
    private CommentedLanguageConfig language;
    private Settings settings;
    private IOManager io;
    private CmdManager cmd;
    private ComboManager comboManager;
    private RegistrationManager registrationManager;
    private IAttributeManager attributeManager = new NullAttributeManager();
    private AttributeProvider fabledProvider = null;
    private BuffProvider buffManager = null;
    private ShieldManager shieldManager;
    private MainThread mainThread;
    private BukkitTask manaTask;
    private boolean loaded = false;
    private boolean disabling = false;

    public Fabled() throws IOException {
    }

    public Fabled(JavaPluginLoader loader, PluginDescriptionFile description, File dataFolder, File file) throws IOException {
        super(loader, description, dataFolder, file);
    }

    public static boolean isLoaded() {
        return singleton != null && Fabled.singleton.loaded;
    }

    public static Fabled inst() {
        if (singleton == null) {
            throw new FabledNotEnabledException("Cannot use Fabled methods before it is enabled - add it to your plugin.yml as a dependency");
        }
        return singleton;
    }

    public static Settings getSettings() {
        return Fabled.inst().settings;
    }

    public static IOManager getIO() {
        return Fabled.inst().io;
    }

    public static CommentedLanguageConfig getLanguage() {
        return Fabled.inst().language;
    }

    public static ComboManager getComboManager() {
        return Fabled.inst().comboManager;
    }

    public static IAttributeManager getAttributesManager() {
        return Fabled.inst().attributeManager;
    }

    public static Skill getSkill(String name) {
        if (name == null) {
            return null;
        }
        return Fabled.inst().skills.get(name.toLowerCase());
    }

    public static Map<String, Skill> getSkills() {
        return Fabled.inst().skills;
    }

    public static boolean isSkillRegistered(String name) {
        return Fabled.getSkill(name) != null;
    }

    public static boolean isSkillRegistered(PlayerSkill skill) {
        return Fabled.isSkillRegistered(skill.getData().getName());
    }

    public static boolean isSkillRegistered(Skill skill) {
        return Fabled.isSkillRegistered(skill.getName());
    }

    public static FabledClass getClass(String name) {
        if (name == null) {
            return null;
        }
        return Fabled.inst().classes.get(name.toLowerCase());
    }

    public static Map<String, FabledClass> getClasses() {
        return Fabled.inst().classes;
    }

    public static List<FabledClass> getBaseClasses(String group) {
        ArrayList<FabledClass> list = new ArrayList<FabledClass>();
        for (FabledClass c : Fabled.singleton.classes.values()) {
            if (c.hasParent() || !c.getGroup().equals(group)) continue;
            list.add(c);
        }
        return list;
    }

    public static boolean isClassRegistered(String name) {
        return Fabled.getClass(name) != null;
    }

    public static boolean isClassRegistered(PlayerClass playerClass) {
        return Fabled.isClassRegistered(playerClass.getData().getName());
    }

    public static boolean isClassRegistered(FabledClass fabledClass) {
        return Fabled.isClassRegistered(fabledClass.getName());
    }

    public static PlayerData getData(OfflinePlayer player) {
        if (player == null) {
            return null;
        }
        return Fabled.getPlayerAccounts(player).getActiveData();
    }

    public static boolean hasPlayerData(OfflinePlayer player) {
        return PlayerLoader.hasPlayerAccounts(player);
    }

    public static void unloadPlayerData(OfflinePlayer player, boolean skipSaving) {
        if (singleton == null || player == null || Fabled.singleton.disabling || !PlayerLoader.hasPlayerAccounts(player)) {
            return;
        }
        singleton.getServer().getScheduler().runTaskAsynchronously((Plugin)singleton, () -> {
            if (!skipSaving) {
                PlayerLoader.unloadPlayer(player);
            }
        });
    }

    public static PlayerAccounts getPlayerAccounts(OfflinePlayer player) {
        if (player == null) {
            return null;
        }
        return PlayerLoader.getPlayerAccounts(player);
    }

    public static List<String> getGroups() {
        return Fabled.inst().groups;
    }

    public static BukkitTask schedule(BukkitRunnable runnable, int delay) {
        return runnable.runTaskLater((Plugin)Fabled.inst(), (long)delay);
    }

    public static BukkitTask schedule(Runnable runnable, int delay) {
        return Bukkit.getScheduler().runTaskLater((Plugin)singleton, runnable, (long)delay);
    }

    public static BukkitTask schedule(BukkitRunnable runnable, int delay, int period) {
        return runnable.runTaskTimer((Plugin)Fabled.inst(), (long)delay, (long)period);
    }

    public static void setMeta(Metadatable target, String key, Object value) {
        target.setMetadata(key, (MetadataValue)new FixedMetadataValue((Plugin)Fabled.inst(), value));
    }

    public static Object getMeta(Metadatable target, String key) {
        List meta = target.getMetadata(key);
        return meta == null || meta.isEmpty() ? null : ((MetadataValue)meta.get(0)).value();
    }

    public static int getMetaInt(Metadatable target, String key) {
        return ((MetadataValue)target.getMetadata(key).get(0)).asInt();
    }

    public static double getMetaDouble(Metadatable target, String key) {
        return ((MetadataValue)target.getMetadata(key).get(0)).asDouble();
    }

    public static void removeMeta(Metadatable target, String key) {
        target.removeMetadata(key, (Plugin)Fabled.inst());
    }

    public static CommentedConfig getConfig(String name) {
        return new CommentedConfig((JavaPlugin)singleton, name);
    }

    public static void reload() {
        Fabled inst = Fabled.inst();
        inst.onDisable();
        inst.onEnable();
        YAMLMenu.reloadMenus((Plugin)inst);
    }

    public void onLoad() {
        try {
            MigrationUtil.renameDirectory((String)"plugins/ProSkillAPI", (String)"plugins/Fabled");
            MigrationUtil.replace((String)"plugins/Fabled/config.yml", (String)"%sapi_", (String)"%fabled_");
        }
        catch (IOException e) {
            this.getLogger().warning("Failed to migrate ProSkillAPI data to Fabled. " + e.getMessage());
        }
        MimicHook.init((Plugin)this);
    }

    public void onDisable() {
        if (singleton != this) {
            return;
        }
        this.disabling = true;
        AttributeRegistry.unregisterProvider((AttributeProvider)this.fabledProvider);
        BuffRegistry.unregisterProvider((BuffProvider)this.buffManager);
        BuffRegistry.unregisterProvider((BuffProvider)this.shieldManager);
        GUITool.cleanUp();
        EffectManager.cleanUp();
        ArmorStandManager.cleanUp();
        for (FabledListener listener : this.listeners) {
            listener.cleanup();
        }
        this.listeners.clear();
        this.mainThread.disable();
        this.mainThread = null;
        if (this.manaTask != null) {
            this.manaTask.cancel();
            this.manaTask = null;
        }
        ClassBoardManager.clearAll();
        for (Player player : Bukkit.getOnlinePlayers()) {
            MainListener.unload(player);
        }
        this.io.saveAll();
        this.skills.clear();
        this.classes.clear();
        PlayerLoader.saveAllPlayerAccounts();
        HandlerList.unregisterAll((Plugin)this);
        this.cmd.clear();
        this.loaded = false;
        this.disabling = false;
        singleton = null;
    }

    public void onEnable() {
        if (singleton != null) {
            throw new IllegalStateException("Cannot enable Fabled twice!");
        }
        String coreVersion = CodexEngine.getEngine().getDescription().getVersion();
        if (!DependencyRequirement.meetsVersion("1.2.0-R0.1-SNAPSHOT", coreVersion)) {
            this.getLogger().severe("\n\n===== [ INITIALIZATION ERROR ] =====\nMissing required Codex version. " + coreVersion + " installed. 1.2.0-R0.1-SNAPSHOT required. Disabling.\n\n");
            Bukkit.getPluginManager().disablePlugin((Plugin)this);
            return;
        }
        singleton = this;
        this.mainThread = new MainThread();
        EffectManager.init();
        ArmorStandManager.init();
        this.settings = new Settings(this);
        this.settings.reload();
        this.language = new CommentedLanguageConfig((JavaPlugin)this, "language");
        this.language.checkDefaults();
        this.language.trim();
        this.language.save();
        if (Bukkit.getPluginManager().getPlugin("PlaceholderAPI") != null) {
            new PlaceholderAPIHook().register();
            this.getLogger().info("Fabled hook into PlaceholderAPI: " + String.valueOf(ChatColor.GREEN) + "success.");
        }
        boolean protocolLib = Bukkit.getPluginManager().getPlugin("ProtocolLib") != null;
        this.comboManager = new ComboManager();
        this.registrationManager = new RegistrationManager(this);
        this.cmd = new CmdManager(this);
        if (this.settings.isUseSql()) {
            SQLManager.reload();
            SQLManager.runMigrations();
            this.io = SQLManager.players();
        } else {
            this.io = new ConfigIO(this);
        }
        PlayerStats.init();
        ClassBoardManager.registerText();
        if (this.settings.isAttributesEnabled()) {
            this.attributeManager = new AttributeManager();
            ((AttributeManager)this.attributeManager).load(this);
        }
        this.registrationManager.initialize();
        this.settings.loadGroupSettings();
        this.listen(new BindListener(), true);
        this.listen(new BuffListener(), true);
        this.listen(new MainListener(), true);
        this.listen(new MechanicListener(), true);
        if (protocolLib) {
            this.listen(new PacketListener(), true);
        }
        this.listen(new ProjectileListener(), true);
        this.listen(new ShieldBlockListener(), true);
        this.listen(new StatusListener(), true);
        this.listen(new ToolListener(), true);
        this.listen(new KillListener(), true);
        this.listen(new AddonListener(), true);
        this.listen(new ClickListener(), true);
        this.listen(new BarListener(), this.settings.isSkillBarEnabled());
        this.listen(new ComboListener(), this.settings.isCombosEnabled());
        this.listen(new AttributeListener(), this.settings.isAttributesEnabled());
        this.listen(new ItemListener(), this.settings.isCheckLore() || this.settings.isCheckAttributes());
        if (this.settings.isCastEnabled()) {
            switch (this.settings.getCastMode()) {
                case ITEM: {
                    this.listen(new CastItemListener(), true);
                    this.listen(new CastOffhandListener(), true);
                    break;
                }
                case BARS: {
                    this.listen(new CastBarsListener(), true);
                    this.listen(new CastOffhandListener(), true);
                    break;
                }
                case COMBAT: {
                    this.listen(new CastCombatListener(), true);
                    this.listen(new CastOffhandListener(), true);
                    break;
                }
                case ACTION_BAR: 
                case TITLE: 
                case SUBTITLE: 
                case CHAT: {
                    this.listen(new CastTextListener(this.settings.getCastMode()), true);
                    break;
                }
                case WHEEL: {
                    this.listen(new CastWheelListener(), true);
                }
            }
        }
        this.listen(new LingeringPotionListener(), true);
        this.listen(new ExperienceListener(), this.settings.isYieldsEnabled());
        this.listen(new PluginChecker(), true);
        if (this.settings.isManaEnabled()) {
            this.manaTask = Bukkit.getScheduler().runTaskTimer((Plugin)this, (Runnable)new ManaTask(), (long)Fabled.getSettings().getGainFreq(), (long)Fabled.getSettings().getGainFreq());
        }
        if (this.settings.isSkillBarCooldowns()) {
            MainThread.register(new CooldownTask());
        }
        if (this.settings.isAutoSave()) {
            MainThread.register(new SaveTask(this));
        }
        MainThread.register(new GUITask(this));
        GUITool.init();
        PlayerLoader.loadAllPlayerAccounts();
        for (PlayerAccounts accounts : PlayerLoader.getAllPlayerAccounts().values()) {
            accounts.getActiveData().init(accounts.getPlayer());
        }
        for (FabledListener listener : this.listeners) {
            listener.init();
        }
        if (Bukkit.getServer().getPluginManager().getPlugin("Quests") != null) {
            ResourceManager.copyQuestsModule();
        }
        this.fabledProvider = new FabledAttributeProvider();
        AttributeRegistry.registerProvider((AttributeProvider)this.fabledProvider);
        this.buffManager = new BuffManager();
        this.shieldManager = new ShieldManager(this);
        BuffRegistry.registerProvider((BuffProvider)this.buffManager);
        BuffRegistry.registerProvider((BuffProvider)this.shieldManager);
        this.loaded = true;
    }

    public void listen(FabledListener listener, boolean enabled) {
        if (!enabled) {
            return;
        }
        Iterator<FabledListener> iterator = this.listeners.iterator();
        while (iterator.hasNext()) {
            FabledListener listener1 = iterator.next();
            if (!listener.getClass().equals(listener1.getClass())) continue;
            HandlerList.unregisterAll((Listener)listener1);
            iterator.remove();
        }
        Bukkit.getPluginManager().registerEvents((Listener)listener, (Plugin)this);
        this.listeners.add(listener);
    }

    public void addDynamicSkill(DynamicSkill skill) {
        if (!this.registrationManager.isAddingDynamicSkills()) {
            throw new IllegalStateException("Cannot add dynamic skills from outside Fabled");
        }
        this.skills.put(skill.getName().toLowerCase(), skill);
    }

    public void addSkill(Skill skill) {
        if ((skill = this.registrationManager.validate(skill)) != null) {
            this.skills.put(skill.getName().toLowerCase(), skill);
        }
    }

    public void addSkills(Skill ... skills) {
        for (Skill skill : skills) {
            this.addSkill(skill);
        }
    }

    public void addClass(FabledClass fabledClass) {
        if ((fabledClass = this.registrationManager.validate(fabledClass)) != null) {
            this.classes.put(fabledClass.getName().toLowerCase(), fabledClass);
            ClassBoardManager.registerClass(fabledClass);
            if (!this.groups.contains(fabledClass.getGroup())) {
                this.groups.add(fabledClass.getGroup());
            }
        }
    }

    public void addDynamicClass(DynamicClass rpgClass) {
        String key;
        if (rpgClass != null && !this.classes.containsKey(key = rpgClass.getName().toLowerCase())) {
            this.classes.put(key, rpgClass);
            ClassBoardManager.registerClass(rpgClass);
            if (!this.groups.contains(rpgClass.getGroup())) {
                this.groups.add(rpgClass.getGroup());
            }
        }
    }

    public void addClasses(FabledClass ... classes) {
        for (FabledClass fabledClass : classes) {
            this.addClass(fabledClass);
        }
    }

    @Generated
    public ShieldManager getShieldManager() {
        return this.shieldManager;
    }

    static {
        RANDOM = new Random();
    }
}

