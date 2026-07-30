/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  net.minecraft.nbt.CompoundTag
 *  net.minecraft.nbt.ListTag
 *  net.minecraft.nbt.StringTag
 *  net.minecraft.nbt.Tag
 *  net.minecraft.server.level.ServerLevel
 *  net.minecraft.world.level.Level
 *  net.minecraftforge.event.level.LevelEvent$Save
 *  net.minecraftforge.eventbus.api.SubscribeEvent
 */
package noppes.npcs.controllers;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;
import javax.script.Invocable;
import javax.script.ScriptEngine;
import javax.script.ScriptEngineFactory;
import javax.script.ScriptEngineManager;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.ListTag;
import net.minecraft.nbt.StringTag;
import net.minecraft.nbt.Tag;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.Level;
import net.minecraftforge.event.level.LevelEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import noppes.npcs.CustomNpcs;
import noppes.npcs.api.wrapper.WorldWrapper;
import noppes.npcs.controllers.IScriptExecutor;
import noppes.npcs.controllers.Jsr223Executor;
import noppes.npcs.controllers.data.ForgeScriptData;
import noppes.npcs.controllers.data.PlayerScriptData;
import noppes.npcs.shared.common.util.LogWriter;
import noppes.npcs.util.NBTJsonUtil;

public class ScriptController {
    public static ScriptController Instance;
    public static boolean HasStart;
    private ScriptEngineManager manager;
    public Map<String, String> languages = new HashMap<String, String>();
    public Map<String, ScriptEngineFactory> factories = new HashMap<String, ScriptEngineFactory>();
    public Map<String, String> scripts = new HashMap<String, String>();
    public PlayerScriptData playerScripts = new PlayerScriptData(null);
    public ForgeScriptData forgeScripts = new ForgeScriptData();
    public long lastLoaded = 0L;
    public long lastPlayerUpdate = 0L;
    public File dir;
    public File localDir;
    public CompoundTag compound = new CompoundTag();
    public Map<String, Supplier<IScriptExecutor>> executorProviders = new HashMap<String, Supplier<IScriptExecutor>>();
    private boolean loaded = false;
    public boolean shouldSave = false;

    public ScriptController() {
        Instance = this;
        if (!CustomNpcs.NashorArguments.isEmpty()) {
            System.setProperty("nashorn.args", CustomNpcs.NashorArguments);
        }
        LogWriter.info("Script Engines Available:");
        try {
            ScriptEngineFactory factory;
            Object c3;
            this.manager = new ScriptEngineManager();
            try {
                if (this.manager.getEngineByName("ecmascript") == null) {
                    c3 = Class.forName("org.openjdk.nashorn.api.scripting.NashornScriptEngineFactory");
                    factory = (ScriptEngineFactory)((Class)c3).newInstance();
                    factory.getScriptEngine();
                    LogWriter.info(factory.getLanguageName() + ": .js");
                    this.manager.registerEngineName("ecmascript", factory);
                    this.manager.registerEngineExtension("js", factory);
                    this.manager.registerEngineMimeType("application/ecmascript", factory);
                    this.languages.put(factory.getLanguageName(), ".js");
                    this.executorProviders.put(factory.getLanguageName().toLowerCase(), Jsr223Executor::new);
                    this.factories.put(factory.getLanguageName().toLowerCase(), factory);
                }
            }
            catch (Throwable c2) {
                // empty catch block
            }
            try {
                c3 = Class.forName("org.jetbrains.kotlin.script.jsr223.KotlinJsr223JvmLocalScriptEngineFactory");
                factory = (ScriptEngineFactory)((Class)c3).newInstance();
                factory.getScriptEngine();
                LogWriter.info(factory.getLanguageName() + ": .ktl");
                this.manager.registerEngineName("kotlin", factory);
                this.manager.registerEngineExtension("ktl", factory);
                this.manager.registerEngineMimeType("application/kotlin", factory);
                this.languages.put(factory.getLanguageName(), ".ktl");
                this.executorProviders.put(factory.getLanguageName().toLowerCase(), Jsr223Executor::new);
                this.factories.put(factory.getLanguageName().toLowerCase(), factory);
            }
            catch (Throwable c3) {
                // empty catch block
            }
            try {
                c3 = Class.forName("noppes.scriptengines.ScriptEngines");
                List seFactories = (List)((Class)c3).getDeclaredField("factories").get(null);
                for (ScriptEngineFactory fac : seFactories) {
                    if (fac.getExtensions().size() == 0 || this.languages.containsKey(fac.getLanguageName()) || !(fac.getScriptEngine() instanceof Invocable) && !fac.getLanguageName().equals("lua")) continue;
                    String ext = "." + fac.getExtensions().get(0).toLowerCase();
                    LogWriter.info(fac.getLanguageName() + ": " + ext);
                    this.languages.put(fac.getLanguageName(), ext);
                    this.executorProviders.put(fac.getLanguageName().toLowerCase(), Jsr223Executor::new);
                    this.factories.put(fac.getLanguageName().toLowerCase(), fac);
                }
            }
            catch (Throwable c4) {
                // empty catch block
            }
            for (ScriptEngineFactory fac : this.manager.getEngineFactories()) {
                try {
                    if (fac.getExtensions().size() == 0 || this.languages.containsKey(fac.getLanguageName()) || !(fac.getScriptEngine() instanceof Invocable) && !fac.getLanguageName().equals("lua")) continue;
                    String ext = "." + fac.getExtensions().get(0).toLowerCase();
                    LogWriter.info(fac.getLanguageName() + ": " + ext);
                    this.languages.put(fac.getLanguageName(), ext);
                    this.executorProviders.put(fac.getLanguageName().toLowerCase(), Jsr223Executor::new);
                    this.factories.put(fac.getLanguageName().toLowerCase(), fac);
                }
                catch (Throwable e) {
                    LogWriter.except(e);
                }
            }
        }
        catch (Throwable e) {
            LogWriter.except(e);
        }
    }

    public void loadCategories() {
        this.dir = CustomNpcs.getLevelSaveDirectory("scripts", false);
        this.localDir = CustomNpcs.getLevelSaveDirectory("scripts", true);
        if (!this.worldDataFile().exists()) {
            this.shouldSave = true;
        }
        WorldWrapper.tempData.clear();
        this.scripts.clear();
        for (String language : this.languages.keySet()) {
            String ext = this.languages.get(language);
            File scriptDir = new File(this.dir, language.toLowerCase());
            if (!scriptDir.exists()) {
                scriptDir.mkdir();
                continue;
            }
            this.loadDir(scriptDir, "", ext);
        }
        this.lastLoaded = System.currentTimeMillis();
    }

    private void loadDir(File dir, String name, String ext) {
        for (File file : dir.listFiles()) {
            String filename = name + file.getName().toLowerCase();
            if (file.isDirectory()) {
                this.loadDir(file, filename + "/", ext);
                continue;
            }
            if (!filename.endsWith(ext)) continue;
            try {
                this.scripts.put(filename, this.readFile(file));
            }
            catch (IOException e) {
                e.printStackTrace();
            }
        }
    }

    public boolean loadStoredData() {
        this.compound = new CompoundTag();
        File file = this.worldDataFile();
        try {
            if (!file.exists()) {
                return false;
            }
            this.compound = NBTJsonUtil.LoadFile(file);
            this.shouldSave = false;
        }
        catch (Exception e) {
            LogWriter.error("Error loading: " + file.getAbsolutePath(), e);
            return false;
        }
        return true;
    }

    private File worldDataFile() {
        return new File(this.localDir, "world_data.json");
    }

    private File playerScriptsFile() {
        return new File(this.dir, "player_scripts.json");
    }

    private File forgeScriptsFile() {
        return new File(this.dir, "forge_scripts.json");
    }

    public boolean loadPlayerScripts() {
        this.playerScripts.clear();
        File file = this.playerScriptsFile();
        try {
            if (!file.exists()) {
                return false;
            }
            this.playerScripts.load(NBTJsonUtil.LoadFile(file));
        }
        catch (Exception e) {
            LogWriter.error("Error loading: " + file.getAbsolutePath(), e);
            return false;
        }
        return true;
    }

    public void setPlayerScripts(CompoundTag compound) {
        this.playerScripts.load(compound);
        File file = this.playerScriptsFile();
        try {
            NBTJsonUtil.SaveFile(file, compound);
            this.lastPlayerUpdate = System.currentTimeMillis();
        }
        catch (IOException e) {
            e.printStackTrace();
        }
        catch (NBTJsonUtil.JsonException e) {
            e.printStackTrace();
        }
    }

    public boolean loadForgeScripts() {
        this.forgeScripts.clear();
        File file = this.forgeScriptsFile();
        try {
            if (!file.exists()) {
                return false;
            }
            this.forgeScripts.load(NBTJsonUtil.LoadFile(file));
        }
        catch (Exception e) {
            LogWriter.error("Error loading: " + file.getAbsolutePath(), e);
            return false;
        }
        return true;
    }

    public void setForgeScripts(CompoundTag compound) {
        this.forgeScripts.load(compound);
        File file = this.forgeScriptsFile();
        try {
            NBTJsonUtil.SaveFile(file, compound);
            this.forgeScripts.lastInited = -1L;
        }
        catch (IOException e) {
            e.printStackTrace();
        }
        catch (NBTJsonUtil.JsonException e) {
            e.printStackTrace();
        }
    }

    /*
     * WARNING - Removed try catching itself - possible behaviour change.
     */
    private String readFile(File file) throws IOException {
        try (BufferedReader br = new BufferedReader(new InputStreamReader((InputStream)new FileInputStream(file), "UTF8"));){
            StringBuilder sb = new StringBuilder();
            String line = br.readLine();
            while (line != null) {
                sb.append(line);
                sb.append("\n");
                line = br.readLine();
            }
            String string = sb.toString();
            return string;
        }
    }

    public ScriptEngine getEngineByName(String language) {
        ScriptEngineFactory fac = this.factories.get(language.toLowerCase());
        if (fac == null) {
            return null;
        }
        return fac.getScriptEngine();
    }

    public ListTag nbtLanguages() {
        ListTag list = new ListTag();
        for (String language : this.languages.keySet()) {
            CompoundTag compound = new CompoundTag();
            ListTag scripts = new ListTag();
            for (String script : this.getScripts(language)) {
                scripts.add((Object)StringTag.m_129297_((String)script));
            }
            compound.m_128365_("Scripts", (Tag)scripts);
            compound.m_128359_("Language", language);
            list.add((Object)compound);
        }
        return list;
    }

    private List<String> getScripts(String language) {
        ArrayList<String> list = new ArrayList<String>();
        String ext = this.languages.get(language);
        if (ext == null) {
            return list;
        }
        for (String script : this.scripts.keySet()) {
            if (!script.endsWith(ext)) continue;
            list.add(script);
        }
        return list;
    }

    @SubscribeEvent
    public void saveLevel(LevelEvent.Save event) {
        if (!this.shouldSave || !(event.getLevel() instanceof ServerLevel) || ((ServerLevel)event.getLevel()).m_46472_() != Level.f_46428_) {
            return;
        }
        try {
            NBTJsonUtil.SaveFile(this.worldDataFile(), this.compound.m_6426_());
        }
        catch (Exception e) {
            LogWriter.except(e);
        }
        this.shouldSave = false;
    }

    static {
        HasStart = false;
    }
}

