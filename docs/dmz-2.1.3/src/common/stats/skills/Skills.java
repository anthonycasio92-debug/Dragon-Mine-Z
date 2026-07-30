/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  net.minecraft.nbt.CompoundTag
 *  net.minecraft.nbt.ListTag
 *  net.minecraft.nbt.Tag
 *  net.minecraft.network.FriendlyByteBuf
 */
package com.dragonminez.common.stats.skills;

import com.dragonminez.common.config.ConfigManager;
import com.dragonminez.common.config.SkillsConfig;
import com.dragonminez.common.stats.skills.Skill;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.ListTag;
import net.minecraft.nbt.Tag;
import net.minecraft.network.FriendlyByteBuf;

public class Skills {
    private static final double NAME_SIMILARITY_THRESHOLD = 0.8;
    private final Map<String, Skill> skillMap = new HashMap<String, Skill>();

    public void registerDefaultSkill(String skillName, int maxLevel) {
        String lowerName = skillName.toLowerCase();
        if (this.skillMap.containsKey(lowerName)) {
            this.skillMap.get(lowerName).setMaxLevel(maxLevel);
        } else {
            this.skillMap.put(lowerName, new Skill(skillName, maxLevel));
        }
    }

    public Skill getSkill(String name) {
        return this.skillMap.get(name.toLowerCase());
    }

    public boolean hasSkill(String name) {
        return this.skillMap.containsKey(name.toLowerCase());
    }

    public boolean isUnlockedAtLevel(String name, int requiredLevel) {
        Skill skill = this.skillMap.get(name.toLowerCase());
        return skill != null && skill.isUnlockedAt(requiredLevel);
    }

    public int getSkillLevel(String name) {
        Skill skill = this.skillMap.get(name.toLowerCase());
        return skill != null ? skill.getLevel() : 0;
    }

    public int getMaxSkillLevel(String name) {
        Skill skill = this.skillMap.get(name.toLowerCase());
        return skill != null ? skill.getMaxLevel() : 0;
    }

    private int calculateMaxLevel(String skillName) {
        int costBasedMaxLevel = 0;
        try {
            SkillsConfig.SkillCosts skillCosts;
            SkillsConfig config = ConfigManager.getSkillsConfig();
            if (config != null && (skillCosts = config.getSkillCosts(skillName)) != null && skillCosts.getCosts() != null) {
                costBasedMaxLevel = skillCosts.getCosts().size();
            }
        }
        catch (Exception exception) {
            // empty catch block
        }
        if (skillName.equalsIgnoreCase("potentialunlock")) {
            return Math.min(costBasedMaxLevel, 30);
        }
        return Math.min(costBasedMaxLevel, 50);
    }

    public void refreshNonFormSkillMaxLevels() {
        List<String> formSkills = ConfigManager.getSkillsConfig().getFormSkills();
        for (Skill skill : this.skillMap.values()) {
            int newMax;
            String skillName = skill.getName().toLowerCase();
            if (formSkills.contains(skillName) || (newMax = this.calculateMaxLevel(skillName)) <= 0) continue;
            skill.setMaxLevel(newMax);
        }
    }

    public void setSkillLevel(String name, int level) {
        String lowerName = name.toLowerCase();
        if (!this.skillMap.containsKey(lowerName)) {
            int finalMaxLevel = this.calculateMaxLevel(lowerName);
            this.skillMap.put(lowerName, new Skill(name, 0, false, finalMaxLevel));
        }
        this.skillMap.get(lowerName).setLevel(level);
    }

    public void removeSkill(String name) {
        this.skillMap.remove(name.toLowerCase());
    }

    public void removeAllSkills() {
        this.skillMap.clear();
    }

    public Map<String, String> repairSkillNames() {
        LinkedHashMap<String, String> renamed = new LinkedHashMap<String, String>();
        SkillsConfig config = ConfigManager.getSkillsConfig();
        if (config == null) {
            return renamed;
        }
        HashSet<String> validNames = new HashSet<String>();
        validNames.addAll(config.getSkills().keySet());
        validNames.addAll(config.getFormSkills());
        validNames.addAll(config.getStackSkills());
        validNames.addAll(config.getKiSkills());
        validNames.addAll(config.getStrikeSkills());
        if (validNames.isEmpty()) {
            return renamed;
        }
        ArrayList<String> invalidKeys = new ArrayList<String>();
        for (String key : this.skillMap.keySet()) {
            if (validNames.contains(key)) continue;
            invalidKeys.add(key);
        }
        for (String badKey : invalidKeys) {
            Skill legacy;
            String canonical = Skills.resolveCanonicalAlias(badKey, validNames);
            if (canonical == null) {
                canonical = Skills.findClosestSkill(badKey, validNames);
            }
            if (canonical == null || canonical.equals(badKey) || (legacy = this.skillMap.remove(badKey)) == null) continue;
            int maxLevel = config.getFormSkills().contains(canonical) ? legacy.getMaxLevel() : this.calculateMaxLevel(canonical);
            Skill target = this.skillMap.get(canonical);
            if (target != null) {
                target.setMaxLevel(Math.max(target.getMaxLevel(), maxLevel));
                target.setLevel(Math.max(target.getLevel(), legacy.getLevel()));
                target.setActive(target.isActive() || legacy.isActive());
            } else {
                Skill migrated = new Skill(canonical, maxLevel);
                migrated.setLevel(legacy.getLevel());
                migrated.setActive(legacy.isActive());
                this.skillMap.put(canonical, migrated);
            }
            renamed.put(badKey, canonical);
        }
        return renamed;
    }

    private static String resolveCanonicalAlias(String input, Set<String> candidates) {
        if (input == null || input.isEmpty()) {
            return null;
        }
        if (candidates.contains(input + "s")) {
            return input + "s";
        }
        if (input.endsWith("s") && candidates.contains(input.substring(0, input.length() - 1))) {
            return input.substring(0, input.length() - 1);
        }
        return null;
    }

    private static String findClosestSkill(String input, Set<String> candidates) {
        String best = null;
        double bestSimilarity = 0.0;
        for (String candidate : candidates) {
            double similarity;
            int maxLen = Math.max(input.length(), candidate.length());
            if (maxLen == 0 || !((similarity = 1.0 - (double)Skills.levenshtein(input, candidate) / (double)maxLen) > bestSimilarity)) continue;
            bestSimilarity = similarity;
            best = candidate;
        }
        return bestSimilarity >= 0.8 ? best : null;
    }

    private static int levenshtein(String a, String b) {
        int[] prev = new int[b.length() + 1];
        int[] curr = new int[b.length() + 1];
        for (int j = 0; j <= b.length(); ++j) {
            prev[j] = j;
        }
        for (int i = 1; i <= a.length(); ++i) {
            curr[0] = i;
            for (int j = 1; j <= b.length(); ++j) {
                int cost = a.charAt(i - 1) == b.charAt(j - 1) ? 0 : 1;
                curr[j] = Math.min(Math.min(curr[j - 1] + 1, prev[j] + 1), prev[j - 1] + cost);
            }
            int[] tmp = prev;
            prev = curr;
            curr = tmp;
        }
        return prev[b.length()];
    }

    public void addSkillLevel(String name, int amount) {
        Skill skill = this.skillMap.get(name.toLowerCase());
        if (skill != null) {
            skill.addLevel(amount);
        }
    }

    public boolean isSkillActive(String name) {
        Skill skill = this.skillMap.get(name.toLowerCase());
        return skill != null && skill.isActive();
    }

    public void setSkillActive(String name, boolean active) {
        Skill skill = this.skillMap.get(name.toLowerCase());
        if (skill != null) {
            skill.setActive(active);
        }
    }

    public void toggleSkillActive(String name) {
        Skill skill = this.skillMap.get(name.toLowerCase());
        if (skill != null) {
            skill.setActive(!skill.isActive());
        }
    }

    public Map<String, Skill> getAllSkills() {
        return new HashMap<String, Skill>(this.skillMap);
    }

    public CompoundTag save() {
        CompoundTag nbt = new CompoundTag();
        ListTag skillsList = new ListTag();
        for (Skill skill : this.skillMap.values()) {
            skillsList.add((Object)skill.save());
        }
        nbt.m_128365_("SkillsList", (Tag)skillsList);
        return nbt;
    }

    public void load(CompoundTag nbt) {
        if (nbt.m_128425_("SkillsList", 9)) {
            ListTag skillsList = nbt.m_128437_("SkillsList", 10);
            this.skillMap.clear();
            for (int i = 0; i < skillsList.size(); ++i) {
                int newMax;
                CompoundTag skillTag = skillsList.m_128728_(i);
                Skill skill = Skill.load(skillTag);
                String skillName = skill.getName().toLowerCase();
                if (!ConfigManager.getSkillsConfig().getFormSkills().contains(skillName) && (newMax = this.calculateMaxLevel(skillName)) > 0) {
                    skill.setMaxLevel(newMax);
                }
                this.skillMap.put(skillName, skill);
            }
        }
    }

    public void toBytes(FriendlyByteBuf buf) {
        buf.writeInt(this.skillMap.size());
        for (Skill skill : this.skillMap.values()) {
            skill.toBytes(buf);
        }
    }

    public void fromBytes(FriendlyByteBuf buf) {
        int size = buf.readInt();
        this.skillMap.clear();
        for (int i = 0; i < size; ++i) {
            Skill skill = Skill.fromBytes(buf);
            this.skillMap.put(skill.getName().toLowerCase(), skill);
        }
    }

    public void copyFrom(Skills other) {
        this.skillMap.clear();
        for (Map.Entry<String, Skill> entry : other.skillMap.entrySet()) {
            Skill newSkill = new Skill(entry.getValue().getName(), entry.getValue().getLevel(), entry.getValue().isActive(), entry.getValue().getMaxLevel());
            this.skillMap.put(entry.getKey(), newSkill);
        }
    }
}

