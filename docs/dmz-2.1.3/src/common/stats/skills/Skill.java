/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  net.minecraft.nbt.CompoundTag
 *  net.minecraft.network.FriendlyByteBuf
 */
package com.dragonminez.common.stats.skills;

import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.FriendlyByteBuf;

public class Skill {
    private final String name;
    private int level;
    private boolean isActive;
    private int maxLevel;

    public Skill(String name, int maxLevel) {
        this.name = name;
        this.level = 0;
        this.isActive = false;
        this.maxLevel = maxLevel;
    }

    public Skill(String name, int level, boolean isActive, int maxLevel) {
        this.name = name;
        this.level = level;
        this.isActive = isActive;
        this.maxLevel = maxLevel;
    }

    public String getName() {
        return this.name;
    }

    public int getLevel() {
        return this.level;
    }

    public void setLevel(int level) {
        this.level = Math.min(level, this.maxLevel);
    }

    public void addLevel(int amount) {
        this.level = Math.min(this.level + amount, this.maxLevel);
    }

    public boolean isActive() {
        return this.isActive;
    }

    public void setActive(boolean active) {
        this.isActive = active;
    }

    public int getMaxLevel() {
        return this.maxLevel;
    }

    public void setMaxLevel(int maxLevel) {
        this.maxLevel = maxLevel;
        if (this.level > maxLevel) {
            this.level = maxLevel;
        }
    }

    public boolean isMaxLevel() {
        return this.level >= this.maxLevel;
    }

    public boolean isUnlockedAt(int requiredLevel) {
        return this.level >= requiredLevel;
    }

    public CompoundTag save() {
        CompoundTag nbt = new CompoundTag();
        nbt.m_128359_("Name", this.name);
        nbt.m_128405_("Level", this.level);
        nbt.m_128379_("IsActive", this.isActive);
        nbt.m_128405_("MaxLevel", this.maxLevel);
        return nbt;
    }

    public static Skill load(CompoundTag nbt) {
        String name = nbt.m_128461_("Name");
        int level = nbt.m_128451_("Level");
        boolean isActive = nbt.m_128471_("IsActive");
        int maxLevel = nbt.m_128451_("MaxLevel");
        return new Skill(name, level, isActive, maxLevel);
    }

    public void toBytes(FriendlyByteBuf buf) {
        buf.m_130070_(this.name);
        buf.writeInt(this.level);
        buf.writeBoolean(this.isActive);
        buf.writeInt(this.maxLevel);
    }

    public static Skill fromBytes(FriendlyByteBuf buf) {
        String name = buf.m_130277_();
        int level = buf.readInt();
        boolean isActive = buf.readBoolean();
        int maxLevel = buf.readInt();
        return new Skill(name, level, isActive, maxLevel);
    }

    public void copyFrom(Skill other) {
        this.level = other.level;
        this.isActive = other.isActive;
        this.maxLevel = other.maxLevel;
    }
}

