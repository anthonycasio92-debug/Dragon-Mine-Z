/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  com.google.common.base.Preconditions
 *  org.bukkit.Bukkit
 *  org.bukkit.entity.LivingEntity
 *  org.bukkit.entity.Player
 *  org.bukkit.event.Event
 *  studio.magemonkey.codex.mccore.config.Filter
 */
package studio.magemonkey.fabled.api.player;

import com.google.common.base.Preconditions;
import com.sucy.skill.api.event.PlayerLevelUpEvent;
import org.bukkit.Bukkit;
import org.bukkit.entity.LivingEntity;
import org.bukkit.entity.Player;
import org.bukkit.event.Event;
import studio.magemonkey.codex.mccore.config.Filter;
import studio.magemonkey.fabled.Fabled;
import studio.magemonkey.fabled.api.classes.FabledClass;
import studio.magemonkey.fabled.api.enums.ExpSource;
import studio.magemonkey.fabled.api.enums.PointSource;
import studio.magemonkey.fabled.api.event.PlayerExperienceGainEvent;
import studio.magemonkey.fabled.api.event.PlayerExperienceLostEvent;
import studio.magemonkey.fabled.api.event.PlayerGainSkillPointsEvent;
import studio.magemonkey.fabled.api.event.PlayerLevelDownEvent;
import studio.magemonkey.fabled.api.player.PlayerData;
import studio.magemonkey.fabled.api.skills.Skill;
import studio.magemonkey.fabled.data.TitleType;
import studio.magemonkey.fabled.dynamic.DynamicSkill;
import studio.magemonkey.fabled.language.RPGFilter;
import studio.magemonkey.fabled.manager.TitleManager;

public class PlayerClass {
    private final PlayerData player;
    private FabledClass classData;
    private int level;
    private int points;
    private double exp;

    public PlayerClass(PlayerData player, FabledClass classData) {
        this.player = player;
        this.classData = classData;
        this.level = 1;
        this.points = 0;
        this.exp = 0.0;
        for (Skill skill : classData.getSkills()) {
            player.giveSkill(skill, this);
        }
    }

    public PlayerData getPlayerData() {
        return this.player;
    }

    public FabledClass getData() {
        return this.classData;
    }

    public double getExp() {
        return this.exp;
    }

    public void setExp(double exp) {
        this.exp = Math.max(Math.min(exp, (double)(this.getRequiredExp() - 1)), 0.0);
    }

    public int getRequiredExp() {
        return this.classData.getRequiredExp(this.level);
    }

    public double getTotalExp() {
        double exp = this.exp;
        for (int i = 1; i < this.level; ++i) {
            exp += (double)this.classData.getRequiredExp(i);
        }
        return exp;
    }

    public int getLevel() {
        return this.level;
    }

    public void setLevel(int level) {
        if (level < 1) {
            throw new IllegalArgumentException("Cannot be a level less than 1");
        }
        this.level = level;
    }

    public int getPoints() {
        return Fabled.getSettings().isSharedSkillPoints() ? this.getPlayerData().getPoints() : this.points;
    }

    public void setPoints(int amount) {
        if (Fabled.getSettings().isSharedSkillPoints()) {
            this.getPlayerData().setPoints(amount);
        } else {
            this.points = amount;
        }
    }

    public void setEarnedPoints(int amount) {
        if (!Fabled.getSettings().isSharedSkillPoints()) {
            throw new IllegalStateException("'shared-skill-points' is not enabled");
        }
        this.points = amount;
    }

    public int getEarnedPoints() {
        if (!Fabled.getSettings().isSharedSkillPoints()) {
            throw new IllegalStateException("'shared-skill-points' is not enabled");
        }
        return this.points;
    }

    public boolean isLevelMaxed() {
        return this.level == this.classData.getMaxLevel();
    }

    public double getHealth() {
        return this.classData.getHealth(this.level);
    }

    public double getMana() {
        return this.classData.getMana(this.level);
    }

    public void givePoints(int amount) {
        this.givePoints(amount, PointSource.SPECIAL);
    }

    public void givePoints(int amount, PointSource source) {
        PlayerGainSkillPointsEvent event = new PlayerGainSkillPointsEvent(this, amount, source);
        Bukkit.getPluginManager().callEvent((Event)event);
        if (!event.isCancelled()) {
            if (Fabled.getSettings().isSharedSkillPoints()) {
                this.getPlayerData().setPoints((int)((double)this.getPlayerData().getPoints() + event.getAmount()));
            }
            if (!Fabled.getSettings().isSharedSkillPoints() || source != PointSource.REFUND) {
                this.points = (int)((double)this.points + event.getAmount());
            }
        }
    }

    public void usePoints(int amount) {
        if (amount < 0) {
            throw new IllegalArgumentException("Invalid points amount - cannot be less than 1");
        }
        if (amount > this.getPoints()) {
            throw new IllegalArgumentException("Invalid points amount - more than current total");
        }
        if (Fabled.getSettings().isSharedSkillPoints()) {
            this.getPlayerData().setPoints(this.getPlayerData().getPoints() - amount);
        } else {
            this.points -= amount;
        }
    }

    public void giveExp(double amount, ExpSource source) {
        this.giveExp(amount, source, true);
    }

    public void giveExp(double amount, ExpSource source, boolean showMessage) {
        if (amount <= 0.0) {
            return;
        }
        PlayerExperienceGainEvent event = new PlayerExperienceGainEvent(this, amount, source);
        event.setCancelled(!this.classData.receivesExp(source) || this.level >= this.classData.getMaxLevel());
        Bukkit.getPluginManager().callEvent((Event)event);
        Bukkit.getPluginManager().callEvent((Event)new com.sucy.skill.api.event.PlayerExperienceGainEvent(new com.sucy.skill.api.player.PlayerClass(this), amount, source));
        int rounded = (int)Math.ceil(event.getExp());
        if (!event.isCancelled() && rounded > 0) {
            if (showMessage && Fabled.getSettings().isShowExpMessages() && this.player.getPlayer() != null) {
                TitleManager.show(this.player.getPlayer(), TitleType.EXP_GAINED, "Notifications.gain-exp", RPGFilter.EXP.setReplacement("" + rounded), RPGFilter.CLASS.setReplacement(this.classData.getName()), Filter.AMOUNT.setReplacement("" + rounded));
            }
            this.exp += (double)rounded;
            this.checkLevelUp();
        }
    }

    public void loseExp(double amount, boolean percent, boolean changeLevel, boolean showMessage) {
        Preconditions.checkArgument((amount > 0.0 ? 1 : 0) != 0, (Object)"Amount must be positive");
        if (percent) {
            amount *= (double)this.getRequiredExp();
        }
        PlayerExperienceLostEvent event = new PlayerExperienceLostEvent(this, amount, changeLevel);
        Bukkit.getPluginManager().callEvent((Event)event);
        if (!event.isCancelled()) {
            changeLevel = event.isLevelChangeAllowed();
            if (!changeLevel) {
                amount = Math.min(event.getExp(), this.exp);
            }
            this.exp -= amount;
            if (showMessage && Fabled.getSettings().isShowLossExpMessages() && (int)amount > 0) {
                TitleManager.show(this.player.getPlayer(), TitleType.EXP_LOST, "Notifications.lose-exp", RPGFilter.EXP.setReplacement("" + (int)amount), RPGFilter.CLASS.setReplacement(this.classData.getName()), Filter.AMOUNT.setReplacement("" + (int)amount));
            }
            this.checkLevelDown();
        }
    }

    public void loseExp(double percent) {
        this.loseExp(percent, true, false, true);
    }

    private void checkLevelUp() {
        int levels = 0;
        while (true) {
            int n;
            int required = this.classData.getRequiredExp(this.level + levels);
            if (!(this.exp >= (double)n) || this.level + levels >= this.classData.getMaxLevel()) break;
            this.exp -= (double)required;
            ++levels;
        }
        if (levels > 0) {
            this.giveLevels(levels);
            if (Fabled.getSettings().isShowLevelMessages()) {
                TitleManager.show(this.player.getPlayer(), TitleType.LEVEL_UP, "Notifications.gain-lvl", RPGFilter.LEVEL.setReplacement("" + this.level), RPGFilter.CLASS.setReplacement(this.classData.getName()), RPGFilter.POINTS.setReplacement("" + this.getPoints()), Filter.AMOUNT.setReplacement("" + levels));
            }
        }
    }

    private void checkLevelDown() {
        int levels = 0;
        while (this.exp < 0.0) {
            if (this.level - levels == 1) {
                this.exp = 0.0;
                break;
            }
            this.exp += (double)this.classData.getRequiredExp(this.level - ++levels);
        }
        if (levels == 0) {
            return;
        }
        this.loseLevels(levels);
        if (Fabled.getSettings().isShowLossLevelMessages()) {
            TitleManager.show(this.player.getPlayer(), TitleType.LEVEL_DOWN, "Notifications.lose-lvl", RPGFilter.LEVEL.setReplacement("" + this.level), RPGFilter.CLASS.setReplacement(this.classData.getName()), RPGFilter.POINTS.setReplacement("" + this.getPoints()), Filter.AMOUNT.setReplacement("" + levels));
        }
    }

    public void giveLevels(int amount) {
        if (amount < 1) {
            throw new IllegalArgumentException("Invalid level amount - cannot be less than 1");
        }
        if ((amount = Math.min(amount, this.classData.getMaxLevel() - this.level)) <= 0) {
            return;
        }
        this.level += amount;
        this.givePoints(this.classData.getGroupSettings().getPointsForLevels(this.level, this.level - amount), PointSource.LEVEL);
        this.getPlayerData().giveAttribPoints(this.classData.getGroupSettings().getAttribsForLevels(this.level, this.level - amount));
        Player player = this.getPlayerData().getPlayer();
        if (player != null) {
            this.getPlayerData().updatePlayerStat(this.getPlayerData().getPlayer());
            this.getPlayerData().getEquips().update(this.getPlayerData().getPlayer());
        }
        this.getPlayerData().autoLevel();
        studio.magemonkey.fabled.api.event.PlayerLevelUpEvent event = new studio.magemonkey.fabled.api.event.PlayerLevelUpEvent(this, amount);
        Bukkit.getPluginManager().callEvent((Event)event);
        Bukkit.getPluginManager().callEvent((Event)new PlayerLevelUpEvent(this, amount));
        if (Fabled.getSettings().hasLevelUpEffect()) {
            DynamicSkill skill = Fabled.getSettings().getLevelUpSkill();
            skill.cast((LivingEntity)player, this.level);
        }
    }

    public void loseLevels(int amount) {
        if (amount < 0) {
            throw new IllegalArgumentException("Invalid level amount - cannot be less than 1");
        }
        if ((amount = Math.min(amount, this.level - 1)) <= 0) {
            return;
        }
        this.level -= amount;
        this.givePoints(this.classData.getGroupSettings().getPointsForLevels(this.level, this.level + amount), PointSource.LEVEL);
        this.getPlayerData().giveAttribPoints(this.classData.getGroupSettings().getAttribsForLevels(this.level, this.level + amount));
        Player player = this.getPlayerData().getPlayer();
        if (player != null) {
            this.getPlayerData().updatePlayerStat(this.getPlayerData().getPlayer());
            this.getPlayerData().getEquips().update(this.getPlayerData().getPlayer());
        }
        this.getPlayerData().autoLevel();
        PlayerLevelDownEvent event = new PlayerLevelDownEvent(this, amount);
        Bukkit.getPluginManager().callEvent((Event)event);
        if (Fabled.getSettings().hasLevelUpEffect()) {
            DynamicSkill skill = Fabled.getSettings().getLevelUpSkill();
            skill.cast((LivingEntity)player, this.level);
        }
    }

    public void setClassData(FabledClass classData) {
        FabledClass previous = this.classData;
        this.classData = classData;
        this.getPlayerData().setClass(previous, classData, false);
    }
}

