/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  lombok.Generated
 *  org.bukkit.Material
 */
package studio.magemonkey.fabled.api.player;

import lombok.Generated;
import org.bukkit.Material;
import studio.magemonkey.fabled.Fabled;
import studio.magemonkey.fabled.api.enums.SkillStatus;
import studio.magemonkey.fabled.api.player.PlayerClass;
import studio.magemonkey.fabled.api.player.PlayerData;
import studio.magemonkey.fabled.api.skills.Skill;

public final class PlayerSkill {
    private Skill skill;
    private PlayerData player;
    private PlayerClass parent;
    private long cooldown;
    private int level;
    private boolean external;

    public PlayerSkill(PlayerData player, Skill skill, PlayerClass parent) {
        this.player = player;
        this.skill = skill;
        this.parent = parent;
        this.external = false;
    }

    public PlayerSkill(PlayerData player, Skill skill, PlayerClass parent, boolean external) {
        this.player = player;
        this.skill = skill;
        this.parent = parent;
        this.external = external;
    }

    public boolean isUnlocked() {
        return this.level > 0;
    }

    public Skill getData() {
        return this.skill;
    }

    public PlayerClass getPlayerClass() {
        return this.parent;
    }

    public PlayerData getPlayerData() {
        return this.player;
    }

    public Material getBind() {
        return null;
    }

    public int getLevel() {
        return this.level;
    }

    public boolean isExternal() {
        return this.external;
    }

    public int getCost() {
        return this.skill.getCost(this.level);
    }

    public int getInvestedCost() {
        int total = 0;
        for (int i = 0; i < this.level; ++i) {
            total += this.skill.getCost(i);
        }
        return total;
    }

    public double getManaCost() {
        return this.skill.getManaCost(this.level, this.player);
    }

    public int getLevelReq() {
        return this.skill.getLevelReq(this.level);
    }

    public boolean isOnCooldown() {
        return this.cooldown > System.currentTimeMillis();
    }

    public boolean isMaxed() {
        return this.level >= this.skill.getMaxLevel();
    }

    public int getCooldownLeft() {
        if (this.isOnCooldown()) {
            return (int)((this.cooldown - System.currentTimeMillis() + 999L) / 1000L);
        }
        return 0;
    }

    public float getPreciseCooldownLeft() {
        if (this.isOnCooldown()) {
            return (float)(this.cooldown - System.currentTimeMillis()) / 1000.0f;
        }
        return 0.0f;
    }

    public SkillStatus getStatus() {
        if (this.isOnCooldown()) {
            return SkillStatus.ON_COOLDOWN;
        }
        if (Fabled.getSettings().isManaEnabled() && this.player.getMana() < this.getManaCost()) {
            return SkillStatus.MISSING_MANA;
        }
        return SkillStatus.READY;
    }

    public void addLevels(int amount) {
        this.level = Math.min(this.level + amount, this.skill.getMaxLevel());
    }

    @Deprecated
    public void setBind(Material mat) {
    }

    public void revert() {
        this.parent.givePoints(this.getInvestedCost());
        this.level = 0;
    }

    public void startCooldown() {
        long cd = (long)this.player.scaleStat("cooldown", this.skill.getCooldown(this.level) * 1000.0);
        this.cooldown = System.currentTimeMillis() + cd;
    }

    public void refreshCooldown() {
        this.cooldown = 0L;
    }

    public void subtractCooldown(double seconds) {
        this.addCooldown(-seconds);
    }

    public void addCooldown(double seconds) {
        this.cooldown = this.isOnCooldown() ? (this.cooldown += (long)((int)(seconds * 1000.0))) : System.currentTimeMillis() + (long)((int)(seconds * 1000.0));
    }

    public void startPreview() {
        this.skill.playPreview(this.player, this.level);
    }

    @Generated
    public long getCooldown() {
        return this.cooldown;
    }

    @Generated
    public void setCooldown(long cooldown) {
        this.cooldown = cooldown;
    }

    @Generated
    public void setLevel(int level) {
        this.level = level;
    }
}

