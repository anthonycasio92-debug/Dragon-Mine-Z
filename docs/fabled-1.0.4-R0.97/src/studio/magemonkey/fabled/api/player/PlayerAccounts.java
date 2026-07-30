/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  lombok.Generated
 *  org.bukkit.Bukkit
 *  org.bukkit.OfflinePlayer
 *  org.bukkit.entity.HumanEntity
 *  org.bukkit.entity.Player
 *  org.bukkit.event.Event
 */
package studio.magemonkey.fabled.api.player;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import lombok.Generated;
import org.bukkit.Bukkit;
import org.bukkit.OfflinePlayer;
import org.bukkit.entity.HumanEntity;
import org.bukkit.entity.Player;
import org.bukkit.event.Event;
import studio.magemonkey.fabled.Fabled;
import studio.magemonkey.fabled.api.event.PlayerAccountChangeEvent;
import studio.magemonkey.fabled.api.player.PlayerData;
import studio.magemonkey.fabled.cast.CastMode;
import studio.magemonkey.fabled.manager.ClassBoardManager;

public class PlayerAccounts {
    private final Map<Integer, PlayerData> classData = new HashMap<Integer, PlayerData>();
    private final UUID player;
    private int active;
    private boolean isLoaded = false;

    public PlayerAccounts(OfflinePlayer player) {
        this.player = player.getUniqueId();
        PlayerData data = new PlayerData(player, true);
        this.classData.put(1, data);
        this.active = 1;
    }

    public int getActiveId() {
        return this.active;
    }

    public PlayerData getActiveData() {
        return this.classData.get(this.active);
    }

    public Player getPlayer() {
        return Bukkit.getPlayer((UUID)this.player);
    }

    public OfflinePlayer getOfflinePlayer() {
        return Bukkit.getOfflinePlayer((UUID)this.player);
    }

    public String getPlayerName() {
        return this.getOfflinePlayer().getName();
    }

    public int getAccountLimit() {
        return Fabled.getSettings().getMaxAccounts(this.getPlayer());
    }

    public boolean hasData(int id) {
        return this.classData.containsKey(id);
    }

    public PlayerData getData(int id) {
        return this.classData.get(id);
    }

    public PlayerData getData(int id, OfflinePlayer player, boolean init) {
        if (!this.hasData(id) && id > 0 && player != null) {
            this.classData.put(id, new PlayerData(player, init));
        }
        return this.classData.get(id);
    }

    public Map<Integer, PlayerData> getAllData() {
        return this.classData;
    }

    public void setAccount(int id) {
        this.setAccount(id, true);
    }

    public void setAccount(int id, boolean apply) {
        Player player = this.getPlayer();
        if (player == null || id == this.active || !apply) {
            this.active = id;
            return;
        }
        if (id <= this.getAccountLimit() && id > 0 && !this.classData.containsKey(id)) {
            this.classData.put(id, new PlayerData((OfflinePlayer)player, false));
        }
        if (this.classData.containsKey(id)) {
            PlayerAccountChangeEvent event = new PlayerAccountChangeEvent(this, this.active, id);
            Bukkit.getPluginManager().callEvent((Event)event);
            if (event.isCancelled()) {
                return;
            }
            if (Fabled.getSettings().isWorldEnabled(player.getWorld())) {
                ClassBoardManager.clear(player);
                this.getActiveData().stopSkills(player);
                this.getActiveData().clearAllModifiers();
                this.active = event.getNewID();
                this.getActiveData().startPassives(player);
                this.getActiveData().updateScoreboard();
                if (this.getActiveData().hasClass() && Fabled.getSettings().isSkillBarEnabled() && !Fabled.getSettings().getCastMode().equals((Object)CastMode.COMBAT)) {
                    this.getActiveData().getSkillBar().setup((HumanEntity)player);
                }
                this.getActiveData().getEquips().update(player);
                this.getActiveData().updatePlayerStat(player);
                this.getActiveData().updateHealth(player);
            } else {
                this.active = event.getNewID();
            }
        }
    }

    @Generated
    public boolean isLoaded() {
        return this.isLoaded;
    }

    @Generated
    public PlayerAccounts isLoaded(boolean isLoaded) {
        this.isLoaded = isLoaded;
        return this;
    }
}

