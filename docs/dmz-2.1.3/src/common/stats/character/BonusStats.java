/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  net.minecraft.nbt.CompoundTag
 *  net.minecraft.nbt.ListTag
 *  net.minecraft.nbt.Tag
 */
package com.dragonminez.common.stats.character;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.ListTag;
import net.minecraft.nbt.Tag;

public class BonusStats {
    private final Map<String, List<StatBonus>> bonuses = new HashMap<String, List<StatBonus>>();

    public BonusStats() {
        this.initializeStat("STR");
        this.initializeStat("SKP");
        this.initializeStat("DEF");
        this.initializeStat("STM");
        this.initializeStat("VIT");
        this.initializeStat("PWR");
        this.initializeStat("ENE");
    }

    private void initializeStat(String stat) {
        this.bonuses.put(stat, new ArrayList());
    }

    public void addBonusSplit(String stat, String bonusName, String operation, double value, boolean applyMultipliers) {
        if (stat.equalsIgnoreCase("RES")) {
            this.addBonus("DEF", bonusName, operation, value, applyMultipliers);
            this.addBonus("STM", bonusName, operation, value, applyMultipliers);
        } else {
            this.addBonus(stat, bonusName, operation, value, applyMultipliers);
        }
    }

    public void removeBonusSplit(String stat, String bonusName) {
        if (stat.equalsIgnoreCase("RES")) {
            this.removeBonus("DEF", bonusName);
            this.removeBonus("STM", bonusName);
        } else {
            this.removeBonus(stat, bonusName);
        }
    }

    public void clearBonusSplit(String stat, String bonusName) {
        if (stat.equalsIgnoreCase("RES")) {
            this.clearBonus("DEF", bonusName);
            this.clearBonus("STM", bonusName);
        } else {
            this.clearBonus(stat, bonusName);
        }
    }

    public void clearAllSplit(String stat) {
        if (stat.equalsIgnoreCase("RES")) {
            this.clearAll("DEF");
            this.clearAll("STM");
        } else {
            this.clearAll(stat);
        }
    }

    public void addBonus(String stat, String bonusName, String operation, double value) {
        this.addBonus(stat, bonusName, operation, value, false);
    }

    public void addBonus(String stat, String bonusName, String operation, double value, boolean applyMultipliers) {
        if (!this.bonuses.containsKey(stat = stat.toUpperCase())) {
            return;
        }
        List<StatBonus> statBonuses = this.bonuses.get(stat);
        statBonuses.removeIf(bonus -> bonus.name.equals(bonusName));
        statBonuses.add(new StatBonus(bonusName, operation, value, applyMultipliers));
    }

    public void removeBonus(String stat, String bonusName) {
        if (!this.bonuses.containsKey(stat = stat.toUpperCase())) {
            return;
        }
        List<StatBonus> statBonuses = this.bonuses.get(stat);
        statBonuses.removeIf(bonus -> bonus.name.equals(bonusName));
    }

    public void removeAllBonuses(String bonusName) {
        for (List<StatBonus> statBonuses : this.bonuses.values()) {
            statBonuses.removeIf(bonus -> bonus.name.equals(bonusName));
        }
    }

    public void clearBonus(String stat, String bonusName) {
        if (!this.bonuses.containsKey(stat = stat.toUpperCase())) {
            return;
        }
        List<StatBonus> statBonuses = this.bonuses.get(stat);
        statBonuses.removeIf(bonus -> bonus.name.contains(bonusName));
    }

    public void clearAll(String stat) {
        if (!this.bonuses.containsKey(stat = stat.toUpperCase())) {
            return;
        }
        this.bonuses.get(stat).clear();
    }

    public void clearAllStats() {
        for (List<StatBonus> bonusList : this.bonuses.values()) {
            bonusList.clear();
        }
    }

    public double calculateBonus(String stat, int baseStat, boolean getMultiplicable) {
        if (!this.bonuses.containsKey(stat = stat.toUpperCase())) {
            return 0.0;
        }
        double flatResult = 0.0;
        double multiplierProduct = 1.0;
        List<StatBonus> statBonuses = this.bonuses.get(stat);
        for (StatBonus bonus : statBonuses) {
            if (bonus.applyMultipliers != getMultiplicable) continue;
            switch (bonus.operation) {
                case "+": {
                    flatResult += bonus.value;
                    break;
                }
                case "-": {
                    flatResult -= bonus.value;
                    break;
                }
                case "*": {
                    multiplierProduct *= bonus.value;
                }
            }
        }
        return (double)baseStat * multiplierProduct - (double)baseStat + flatResult;
    }

    public List<StatBonus> getBonuses(String stat) {
        if (!this.bonuses.containsKey(stat = stat.toUpperCase())) {
            return new ArrayList<StatBonus>();
        }
        return new ArrayList<StatBonus>((Collection)this.bonuses.get(stat));
    }

    public boolean hasBonus(String stat, String bonusName) {
        if (!this.bonuses.containsKey(stat = stat.toUpperCase())) {
            return false;
        }
        return this.bonuses.get(stat).stream().anyMatch(bonus -> bonus.name.equals(bonusName));
    }

    public CompoundTag save() {
        CompoundTag tag = new CompoundTag();
        for (Map.Entry<String, List<StatBonus>> entry : this.bonuses.entrySet()) {
            ListTag bonusList = new ListTag();
            for (StatBonus bonus : entry.getValue()) {
                CompoundTag bonusTag = new CompoundTag();
                bonusTag.m_128359_("Name", bonus.name);
                bonusTag.m_128359_("Operation", bonus.operation);
                bonusTag.m_128347_("Value", bonus.value);
                bonusTag.m_128379_("ApplyMultipliers", bonus.applyMultipliers);
                bonusList.add((Object)bonusTag);
            }
            tag.m_128365_(entry.getKey(), (Tag)bonusList);
        }
        return tag;
    }

    public void load(CompoundTag tag) {
        for (String stat : this.bonuses.keySet()) {
            if (!tag.m_128441_(stat)) continue;
            List<StatBonus> statBonuses = this.bonuses.get(stat);
            statBonuses.clear();
            ListTag bonusList = tag.m_128437_(stat, 10);
            for (int i = 0; i < bonusList.size(); ++i) {
                CompoundTag bonusTag = bonusList.m_128728_(i);
                String name = bonusTag.m_128461_("Name");
                String operation = bonusTag.m_128461_("Operation");
                double value = bonusTag.m_128459_("Value");
                boolean applyMultipliers = bonusTag.m_128471_("ApplyMultipliers");
                statBonuses.add(new StatBonus(name, operation, value, applyMultipliers));
            }
        }
    }

    public void copyFrom(BonusStats other) {
        for (Map.Entry<String, List<StatBonus>> entry : other.bonuses.entrySet()) {
            List<StatBonus> thisList = this.bonuses.get(entry.getKey());
            thisList.clear();
            for (StatBonus bonus : entry.getValue()) {
                thisList.add(new StatBonus(bonus.name, bonus.operation, bonus.value, bonus.applyMultipliers));
            }
        }
    }

    public static class StatBonus {
        public final String name;
        public final String operation;
        public final double value;
        public final boolean applyMultipliers;

        public StatBonus(String name, String operation, double value, boolean applyMultipliers) {
            this.name = name;
            this.operation = operation;
            this.value = value;
            this.applyMultipliers = applyMultipliers;
        }
    }
}

