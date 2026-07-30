/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  lombok.Generated
 *  net.minecraft.nbt.CompoundTag
 *  net.minecraft.nbt.Tag
 *  net.minecraft.server.level.ServerPlayer
 *  net.minecraft.world.effect.MobEffect
 *  net.minecraft.world.entity.LivingEntity
 *  net.minecraft.world.entity.ai.attributes.Attribute
 *  net.minecraft.world.entity.ai.attributes.AttributeInstance
 *  net.minecraft.world.entity.ai.attributes.AttributeModifier
 *  net.minecraft.world.entity.ai.attributes.AttributeModifier$Operation
 *  net.minecraft.world.entity.ai.attributes.Attributes
 *  net.minecraft.world.entity.player.Player
 *  net.minecraft.world.item.enchantment.Enchantment
 *  net.minecraft.world.item.enchantment.Enchantments
 */
package com.dragonminez.common.stats;

import com.dragonminez.common.config.CombatConfig;
import com.dragonminez.common.config.ConfigManager;
import com.dragonminez.common.config.FormConfig;
import com.dragonminez.common.config.GeneralServerConfig;
import com.dragonminez.common.config.RaceCharacterConfig;
import com.dragonminez.common.config.RaceStatsConfig;
import com.dragonminez.common.config.TpBoost;
import com.dragonminez.common.config.TpSource;
import com.dragonminez.common.hair.CustomHair;
import com.dragonminez.common.init.MainAttributes;
import com.dragonminez.common.init.MainEffects;
import com.dragonminez.common.init.MainEnchants;
import com.dragonminez.common.quest.Difficulty;
import com.dragonminez.common.quest.PlayerQuestData;
import com.dragonminez.common.stats.character.BonusStats;
import com.dragonminez.common.stats.character.Character;
import com.dragonminez.common.stats.character.Cooldowns;
import com.dragonminez.common.stats.character.Effects;
import com.dragonminez.common.stats.character.Resources;
import com.dragonminez.common.stats.character.SecondaryStatEffects;
import com.dragonminez.common.stats.character.Stats;
import com.dragonminez.common.stats.character.Status;
import com.dragonminez.common.stats.extras.DynamicGrowthData;
import com.dragonminez.common.stats.skills.Skills;
import com.dragonminez.common.stats.techniques.Techniques;
import com.dragonminez.common.util.TransformationsHelper;
import com.dragonminez.server.events.players.StatsEvents;
import com.dragonminez.server.events.players.TickHandler;
import com.dragonminez.server.events.players.statuseffect.TransformStatusHandler;
import com.dragonminez.server.util.FusionLogic;
import com.dragonminez.server.util.GravityLogic;
import com.dragonminez.server.util.PotionEffectHelper;
import com.dragonminez.server.world.dimension.HTCDimension;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import lombok.Generated;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.Tag;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.attributes.Attribute;
import net.minecraft.world.entity.ai.attributes.AttributeInstance;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.enchantment.Enchantment;
import net.minecraft.world.item.enchantment.Enchantments;

public class StatsData {
    private static final double DEFENSE_FLAT_FOLD = 0.12;
    private static final double STAT_COST_PER_POINT = 1.25;
    private static final double STAT_COST_LATE_KNEE_FRACTION = 0.05;
    private static final double STAT_COST_LATE_EXPONENT = 0.7;
    private final Player player;
    private final Stats stats;
    private final Status status;
    private final Cooldowns cooldowns;
    private final Character character;
    private final Resources resources;
    private final Skills skills;
    private final Effects effects;
    private final SecondaryStatEffects secondaryStatEffects;
    private final PlayerQuestData playerQuestData;
    private final BonusStats bonusStats;
    private final Techniques techniques;
    private final DynamicGrowthData dynamicGrowth;
    private boolean hasInitializedHealth = false;
    private boolean isDataLoaded = false;
    private static final double K = 100.0;
    private static final double BP_REF_VALUE = 1200.0;
    private static final double BP_CURVE_EXPONENT = 1.2;
    private static final double SUPPORT_STAT_BP_WEIGHT = 0.5;

    public StatsData(Player player) {
        this.player = player;
        this.stats = new Stats();
        this.stats.setPlayer(player);
        this.status = new Status();
        this.cooldowns = new Cooldowns();
        this.character = new Character();
        this.resources = new Resources();
        this.resources.setPlayer(player);
        this.resources.setStatsData(this);
        this.skills = new Skills();
        this.effects = new Effects();
        this.secondaryStatEffects = new SecondaryStatEffects();
        this.playerQuestData = new PlayerQuestData();
        this.bonusStats = new BonusStats();
        this.techniques = new Techniques();
        this.dynamicGrowth = new DynamicGrowthData();
    }

    public boolean hasInitializedHealth() {
        return this.hasInitializedHealth;
    }

    public void setInitializedHealth(boolean initialized) {
        this.hasInitializedHealth = initialized;
    }

    public int getLevel() {
        int maxLevel = this.getConfiguredMaxValue();
        if (maxLevel <= 1) {
            return 1;
        }
        int initialStats = this.getInitialTotalStats();
        int totalStats = Math.max(initialStats, this.stats.getTotalStats());
        long maxTotalStatsForLevel = Math.max((long)initialStats, this.getConfiguredMaxTotalStatsRaw());
        double denominator = Math.max(1.0, (double)maxTotalStatsForLevel - (double)initialStats);
        double progress = (double)(totalStats - initialStats) / denominator;
        progress = Math.max(0.0, Math.min(1.0, progress));
        int computedLevel = 1 + (int)Math.floor(progress * (double)(maxLevel - 1));
        return Math.max(1, Math.min(maxLevel, computedLevel));
    }

    public int getConfiguredMaxValue() {
        return ConfigManager.getServerConfig().getGameplay().getMaxValue();
    }

    public boolean isMaxLevelValueInsteadOfStats() {
        return ConfigManager.getServerConfig().getGameplay().getMaxLevelValueInsteadOfStats();
    }

    public int getConfiguredMaxTotalStats() {
        long rawMax = this.getConfiguredMaxTotalStatsRaw();
        return rawMax > Integer.MAX_VALUE ? Integer.MAX_VALUE : (int)rawMax;
    }

    public int getRemainingAssignableStats() {
        long remaining = (long)this.getConfiguredMaxTotalStats() - (long)this.stats.getTotalStats();
        return remaining <= 0L ? 0 : (int)Math.min(Integer.MAX_VALUE, remaining);
    }

    public int getCurrentStatValue(String statName) {
        return switch (statName.toUpperCase()) {
            case "STR" -> this.stats.getStrength();
            case "SKP" -> this.stats.getStrikePower();
            case "RES" -> this.stats.getResistance();
            case "VIT" -> this.stats.getVitality();
            case "PWR" -> this.stats.getKiPower();
            case "ENE" -> this.stats.getEnergy();
            default -> 0;
        };
    }

    public int getMaxAllowedIncreaseForStat(String statName, int requestedAmount) {
        int safeRequested = Math.max(0, requestedAmount);
        if (safeRequested <= 0) {
            return 0;
        }
        int remainingTotal = this.getRemainingAssignableStats();
        if (remainingTotal <= 0) {
            return 0;
        }
        int allowedByTotal = Math.min(safeRequested, remainingTotal);
        if (this.isMaxLevelValueInsteadOfStats()) {
            return allowedByTotal;
        }
        int remainingStat = Math.max(0, this.getConfiguredMaxValue() - this.getCurrentStatValue(statName));
        return Math.min(allowedByTotal, remainingStat);
    }

    public float getBattlePower() {
        double exact = this.getBattlePowerExact();
        return exact >= 3.4028234663852886E38 ? Float.MAX_VALUE : (float)exact;
    }

    public double getBattlePowerExact() {
        if (this.status.isAndroidUpgraded()) {
            return 3.4028234663852886E38;
        }
        double str = this.stats.getStrength();
        double skp = this.stats.getStrikePower();
        double res = this.stats.getResistance();
        double vit = this.stats.getVitality();
        double pwr = this.stats.getKiPower();
        double ene = this.stats.getEnergy();
        double multBonusStr = this.bonusStats.calculateBonus("STR", (int)Math.round(str), true);
        double flatBonusStr = this.bonusStats.calculateBonus("STR", (int)Math.round(str), false);
        double multBonusSkp = this.bonusStats.calculateBonus("SKP", (int)Math.round(skp), true);
        double flatBonusSkp = this.bonusStats.calculateBonus("SKP", (int)Math.round(skp), false);
        double multBonusDef = this.bonusStats.calculateBonus("DEF", (int)Math.round(res), true);
        double flatBonusDef = this.bonusStats.calculateBonus("DEF", (int)Math.round(res), false);
        double multBonusVit = this.bonusStats.calculateBonus("VIT", (int)Math.round(vit), true);
        double flatBonusVit = this.bonusStats.calculateBonus("VIT", (int)Math.round(vit), false);
        double multBonusPwr = this.bonusStats.calculateBonus("PWR", (int)Math.round(pwr), true);
        double flatBonusPwr = this.bonusStats.calculateBonus("PWR", (int)Math.round(pwr), false);
        double multBonusEne = this.bonusStats.calculateBonus("ENE", (int)Math.round(ene), true);
        double flatBonusEne = this.bonusStats.calculateBonus("ENE", (int)Math.round(ene), false);
        double rawPower = (str + multBonusStr) * this.getStatScaling("STR") * this.getTotalMultiplier("STR") + flatBonusStr * this.getStatScaling("STR") + (skp + multBonusSkp) * this.getStatScaling("SKP") * this.getTotalMultiplier("SKP") + flatBonusSkp * this.getStatScaling("SKP") + (res + multBonusDef) * this.getStatScaling("DEF") * this.getTotalMultiplier("RES") + flatBonusDef * this.getStatScaling("DEF") + (pwr + multBonusPwr) * this.getStatScaling("PWR") * this.getTotalMultiplier("PWR") + flatBonusPwr * this.getStatScaling("PWR");
        if (Double.isNaN(rawPower += 0.5 * ((vit + multBonusVit) * this.getStatScaling("VIT") * this.getTotalMultiplier("VIT") + flatBonusVit * this.getStatScaling("VIT") + (ene + multBonusEne) * this.getStatScaling("ENE") * this.getTotalMultiplier("ENE") + flatBonusEne * this.getStatScaling("ENE"))) || rawPower <= 0.0) {
            return 0.0;
        }
        double releaseMultiplier = (double)this.resources.getPowerRelease() / 100.0;
        double bp = 1200.0 * Math.pow(rawPower / 100.0, 1.2) * releaseMultiplier;
        if (Double.isNaN(bp) || bp <= 0.0) {
            return 0.0;
        }
        return bp;
    }

    private double getSecondaryAttributeValue(Attribute attribute, double fallback) {
        if (this.player == null) {
            return fallback;
        }
        AttributeInstance instance = this.player.m_21051_(attribute);
        return instance != null ? instance.m_22135_() : fallback;
    }

    private double getSecondaryAttributeBaseValue(Attribute attribute, double fallback) {
        if (this.player == null) {
            return fallback;
        }
        AttributeInstance instance = this.player.m_21051_(attribute);
        return instance != null ? instance.m_22115_() : fallback;
    }

    private double getArmorToughnessValue() {
        if (this.player == null) {
            return 0.0;
        }
        AttributeInstance toughness = this.player.m_21051_(Attributes.f_22285_);
        return toughness != null ? toughness.m_22135_() : 0.0;
    }

    public float getHealthBonus() {
        double vitality = this.stats.getVitality();
        double vitScaling = this.getStatScaling("VIT");
        double vitMult = this.getTotalMultiplier("VIT");
        double flatBonusVit = this.bonusStats.calculateBonus("VIT", (int)Math.round(vitality), false);
        double multBonusVit = this.bonusStats.calculateBonus("VIT", (int)Math.round(vitality), true);
        return (float)Math.min((vitality + multBonusVit) * vitScaling * vitMult + flatBonusVit * vitScaling, 3.4028234663852886E38);
    }

    public float getMaxHealth() {
        return (float)this.getSecondaryAttributeValue(Attributes.f_22276_, 20.0);
    }

    public float getMaxEnergy() {
        double energy = this.stats.getEnergy();
        double eneScaling = this.getStatScaling("ENE");
        double eneMult = this.getTotalMultiplier("ENE");
        double flatBonusEne = this.bonusStats.calculateBonus("ENE", (int)Math.round(energy), false);
        double multBonusEne = this.bonusStats.calculateBonus("ENE", (int)Math.round(energy), true);
        double secondaryMaxEnergy = this.getSecondaryAttributeValue((Attribute)MainAttributes.MAX_ENERGY.get(), 20.0);
        return Math.min((float)(secondaryMaxEnergy + (energy + multBonusEne) * eneScaling * eneMult + flatBonusEne * eneScaling), Float.MAX_VALUE);
    }

    public float getMaxStamina() {
        double resistance = this.stats.getResistance();
        double stmScaling = this.getStatScaling("STM");
        double stmMult = this.getTotalMultiplier("STM");
        double flatBonusStm = this.bonusStats.calculateBonus("STM", (int)Math.round(resistance), false);
        double multBonusStm = this.bonusStats.calculateBonus("STM", (int)Math.round(resistance), true);
        double secondaryMaxStamina = this.getSecondaryAttributeValue((Attribute)MainAttributes.MAX_STAMINA.get(), 20.0);
        double maxStamina = secondaryMaxStamina + (resistance + multBonusStm) * stmScaling * stmMult + flatBonusStm * stmScaling;
        return Math.min((float)Math.max(0.0, maxStamina), Float.MAX_VALUE);
    }

    public double getStaminaRegenPerSecond() {
        RaceStatsConfig raceConfig = ConfigManager.getRaceStats(this.character.getRaceName());
        RaceStatsConfig.ClassStats classStats = this.getClassStats(raceConfig, this.character.getCharacterClass());
        int baseVit = this.stats.getVitality();
        double flatBonusVit = this.bonusStats.calculateBonus("VIT", baseVit, false);
        double multBonusVit = this.bonusStats.calculateBonus("VIT", baseVit, true);
        double vitMult = this.getTotalMultiplier("VIT");
        double effectiveVit = ((double)baseVit + multBonusVit) * vitMult + flatBonusVit;
        double sp5 = classStats.getBaseSp5() + effectiveVit * classStats.getSp5StmScaling();
        int totalEnchLvl = TickHandler.getTotalArmorEnchantmentLevel((Enchantment)MainEnchants.RESISTANCE_RECOVERY.get(), (LivingEntity)this.player);
        double enchMult = TickHandler.getRecoveryMultiplier(totalEnchLvl);
        int meditationLevel = this.skills.getSkillLevel("meditation");
        double meditationBonus = meditationLevel > 0 ? 1.0 + (double)meditationLevel * 0.075 : 1.0;
        double adjustedStaminaDrain = this.getAdjustedStaminaDrain();
        double regenMultiplier = 1.0;
        if (adjustedStaminaDrain > 0.0) {
            regenMultiplier = Math.max(0.0, 1.0 - adjustedStaminaDrain / 50.0);
        } else if (adjustedStaminaDrain < 0.0) {
            regenMultiplier = 1.0 + Math.abs(adjustedStaminaDrain);
        }
        double actionMod = this.player != null && this.player.getPersistentData().m_128441_("dmz_stamina_regen_mod") ? this.player.getPersistentData().m_128459_("dmz_stamina_regen_mod") : 1.0;
        double regenPerSecond = sp5 / 5.0 * meditationBonus * enchMult * regenMultiplier * actionMod * this.secondaryStatEffects.getMultiplier("STM_REGEN");
        return PotionEffectHelper.applyStaminaRegenMultiplier((LivingEntity)this.player, regenPerSecond);
    }

    public double getHealthRegenPerSecond() {
        RaceStatsConfig raceConfig = ConfigManager.getRaceStats(this.character.getRaceName());
        RaceStatsConfig.ClassStats classStats = this.getClassStats(raceConfig, this.character.getCharacterClass());
        int baseVit = this.stats.getVitality();
        double flatBonusVit = this.bonusStats.calculateBonus("VIT", baseVit, false);
        double multBonusVit = this.bonusStats.calculateBonus("VIT", baseVit, true);
        double vitMult = this.getTotalMultiplier("VIT");
        double effectiveVit = ((double)baseVit + multBonusVit) * vitMult + flatBonusVit;
        double hp5 = classStats.getBaseHp5() + effectiveVit * classStats.getHp5VitScaling();
        int totalEnchLvl = TickHandler.getTotalArmorEnchantmentLevel((Enchantment)MainEnchants.VITALITY_RECOVERY.get(), (LivingEntity)this.player);
        double enchMult = TickHandler.getRecoveryMultiplier(totalEnchLvl);
        double adjustedHealthDrain = this.getAdjustedHealthDrain();
        double regenMultiplier = 1.0;
        if (adjustedHealthDrain > 0.0) {
            regenMultiplier = Math.max(0.0, 1.0 - adjustedHealthDrain / 10.0);
        } else if (adjustedHealthDrain < 0.0) {
            regenMultiplier = 1.0 + Math.abs(adjustedHealthDrain);
        }
        return hp5 / 5.0 * enchMult * regenMultiplier * this.secondaryStatEffects.getMultiplier("HP_REGEN");
    }

    public double getEnergyRegenPerSecond(boolean activeCharging) {
        RaceStatsConfig raceConfig = ConfigManager.getRaceStats(this.character.getRaceName());
        RaceStatsConfig.ClassStats classStats = this.getClassStats(raceConfig, this.character.getCharacterClass());
        float currentEnergy = this.resources.getCurrentEnergy();
        float maxEnergy = this.getMaxEnergy();
        boolean hasActiveForm = this.character.hasActiveForm();
        FormConfig.FormData activeForm = hasActiveForm ? this.character.getActiveFormData() : null;
        boolean hasActiveStackForm = this.character.hasActiveStackForm();
        FormConfig.FormData activeStackForm = hasActiveStackForm ? this.character.getActiveStackFormData() : null;
        int baseEne = this.stats.getEnergy();
        double flatBonusEne = this.bonusStats.calculateBonus("ENE", baseEne, false);
        double multBonusEne = this.bonusStats.calculateBonus("ENE", baseEne, true);
        double eneMult = this.getTotalMultiplier("ENE");
        double effectiveEne = ((double)baseEne + multBonusEne) * eneMult + flatBonusEne;
        double ep5 = classStats.getBaseEp5() + effectiveEne * classStats.getEp5EneScaling();
        int totalEnchLvl = TickHandler.getTotalArmorEnchantmentLevel((Enchantment)MainEnchants.ENERGY_RECOVERY.get(), (LivingEntity)this.player);
        double enchMult = TickHandler.getRecoveryMultiplier(totalEnchLvl);
        int meditationLevel = this.skills.getSkillLevel("meditation");
        double meditationBonus = meditationLevel > 0 ? 1.0 + (double)meditationLevel * 0.075 : 1.0;
        double kiConductivityMult = TickHandler.getRecoveryMultiplier(TickHandler.getTotalArmorEnchantmentLevel((Enchantment)MainEnchants.KI_CONDUCTIVITY.get(), (LivingEntity)this.player));
        double baseRegenPerSecond = ep5 / 5.0 * meditationBonus * enchMult * kiConductivityMult;
        double androidRegenMult = this.isAndroidRacialActive() ? 2.0 : 1.0;
        double energyChange = 0.0;
        if (activeCharging) {
            int kiBoostLevel = this.skills.getSkillLevel("kiboost");
            double kiBoostMult = 1.0 + (double)kiBoostLevel * 0.25;
            double regenAmount = PotionEffectHelper.applyKiRegenMultiplier((LivingEntity)this.player, baseRegenPerSecond * 1.5) * androidRegenMult * kiBoostMult;
            if (regenAmount < 1.0) {
                regenAmount = 1.0;
            }
            energyChange += regenAmount;
        } else if (currentEnergy < maxEnergy) {
            double regenAmount = PotionEffectHelper.applyKiRegenMultiplier((LivingEntity)this.player, baseRegenPerSecond) * androidRegenMult;
            double formRawDrain = 0.0;
            if (hasActiveForm && activeForm != null) {
                formRawDrain = activeForm.getEnergyDrain();
            } else if (hasActiveStackForm && activeStackForm != null) {
                formRawDrain = activeStackForm.getEnergyDrain();
            }
            double regenMultiplier = 1.0;
            if (formRawDrain > 0.0) {
                regenMultiplier = Math.max(0.0, 1.0 - formRawDrain * 2.5);
            } else if (formRawDrain < 0.0) {
                regenMultiplier = 1.0 + Math.abs(formRawDrain);
            }
            energyChange += regenAmount * regenMultiplier;
        }
        return energyChange * this.secondaryStatEffects.getMultiplier("ENE_REGEN");
    }

    public float getMaxPoise() {
        double secondaryMaxPoise = this.getSecondaryAttributeValue((Attribute)MainAttributes.MAX_POISE.get(), 25.0);
        return Math.min((float)(secondaryMaxPoise + this.getDefenseLegacyUnits()), Float.MAX_VALUE);
    }

    public double getMaxMeleeDamage() {
        double strength = this.stats.getStrength();
        double strScaling = this.getStatScaling("STR");
        double strMult = this.getTotalMultiplier("STR");
        double flatBonusStr = this.bonusStats.calculateBonus("STR", (int)Math.round(strength), false);
        double multBonusStr = this.bonusStats.calculateBonus("STR", (int)Math.round(strength), true);
        double secondaryMeleeDamage = this.getSecondaryAttributeValue((Attribute)MainAttributes.MELEE_DAMAGE.get(), 1.0);
        return secondaryMeleeDamage + (strength + multBonusStr) * strScaling * strMult + flatBonusStr * strScaling;
    }

    public double getMeleeDamage() {
        double strength = this.stats.getStrength();
        double strScaling = this.getStatScaling("STR");
        double strMult = this.getTotalMultiplier("STR");
        double releaseMultiplier = (double)this.resources.getPowerRelease() / 100.0;
        double flatBonusStr = this.bonusStats.calculateBonus("STR", (int)Math.round(strength), false);
        double multBonusStr = this.bonusStats.calculateBonus("STR", (int)Math.round(strength), true);
        double secondaryMeleeDamage = this.getSecondaryAttributeValue((Attribute)MainAttributes.MELEE_DAMAGE.get(), 1.0);
        return secondaryMeleeDamage + ((strength + multBonusStr) * strScaling * strMult + flatBonusStr * strScaling) * releaseMultiplier;
    }

    public double getMeleeDamageNoMultipliers() {
        double strength = this.stats.getStrength();
        double strScaling = this.getStatScaling("STR");
        double releaseMultiplier = (double)this.resources.getPowerRelease() / 100.0;
        double flatBonusStr = this.bonusStats.calculateBonus("STR", (int)Math.round(strength), false);
        double multBonusStr = this.bonusStats.calculateBonus("STR", (int)Math.round(strength), true);
        double secondaryMeleeDamage = this.getSecondaryAttributeValue((Attribute)MainAttributes.MELEE_DAMAGE.get(), 1.0);
        return secondaryMeleeDamage + ((strength + multBonusStr) * strScaling + flatBonusStr * strScaling) * releaseMultiplier;
    }

    public double getMaxStrikeDamage() {
        double strikePower = this.stats.getStrikePower();
        double strength = this.stats.getStrength();
        double skpScaling = this.getStatScaling("SKP");
        double strScaling = this.getStatScaling("STR");
        double skpMult = this.getTotalMultiplier("SKP");
        double strMult = this.getTotalMultiplier("STR");
        double flatBonusSkp = this.bonusStats.calculateBonus("SKP", (int)Math.round(strikePower), false);
        double multBonusSkp = this.bonusStats.calculateBonus("SKP", (int)Math.round(strikePower), true);
        double flatBonusStr = this.bonusStats.calculateBonus("STR", (int)Math.round(strength), false);
        double multBonusStr = this.bonusStats.calculateBonus("STR", (int)Math.round(strength), true);
        double secondaryStrikeDamage = this.getSecondaryAttributeValue((Attribute)MainAttributes.STRIKE_DAMAGE.get(), 1.0);
        return secondaryStrikeDamage + (strikePower + multBonusSkp) * skpScaling * skpMult + flatBonusSkp * skpScaling + ((strength + multBonusStr) * strScaling * strMult + flatBonusStr * strScaling) * 0.25;
    }

    public double getStrikeDamage() {
        double strikePower = this.stats.getStrikePower();
        double strength = this.stats.getStrength();
        double skpScaling = this.getStatScaling("SKP");
        double strScaling = this.getStatScaling("STR");
        double skpMult = this.getTotalMultiplier("SKP");
        double strMult = this.getTotalMultiplier("STR");
        double releaseMultiplier = (double)this.resources.getPowerRelease() / 100.0;
        double flatBonusSkp = this.bonusStats.calculateBonus("SKP", (int)Math.round(strikePower), false);
        double multBonusSkp = this.bonusStats.calculateBonus("SKP", (int)Math.round(strikePower), true);
        double flatBonusStr = this.bonusStats.calculateBonus("STR", (int)Math.round(strength), false);
        double multBonusStr = this.bonusStats.calculateBonus("STR", (int)Math.round(strength), true);
        double secondaryStrikeDamage = this.getSecondaryAttributeValue((Attribute)MainAttributes.STRIKE_DAMAGE.get(), 1.0);
        double baseDamage = (strikePower + multBonusSkp) * skpScaling * skpMult + flatBonusSkp * skpScaling + ((strength + multBonusStr) * strScaling * strMult + flatBonusStr * strScaling) * 0.25;
        return secondaryStrikeDamage + baseDamage * releaseMultiplier;
    }

    public double getStrikeDamageNoForms() {
        double strikePower = this.stats.getStrikePower();
        double strength = this.stats.getStrength();
        double skpScaling = this.getStatScaling("SKP");
        double strScaling = this.getStatScaling("STR");
        double releaseMultiplier = (double)this.resources.getPowerRelease() / 100.0;
        double flatBonusSkp = this.bonusStats.calculateBonus("SKP", (int)Math.round(strikePower), false);
        double multBonusSkp = this.bonusStats.calculateBonus("SKP", (int)Math.round(strikePower), true);
        double flatBonusStr = this.bonusStats.calculateBonus("STR", (int)Math.round(strength), false);
        double multBonusStr = this.bonusStats.calculateBonus("STR", (int)Math.round(strength), true);
        double secondaryStrikeDamage = this.getSecondaryAttributeValue((Attribute)MainAttributes.STRIKE_DAMAGE.get(), 1.0);
        double baseDamage = (strikePower + multBonusSkp) * skpScaling + flatBonusSkp * skpScaling + ((strength + multBonusStr) * strScaling + flatBonusStr * strScaling) * 0.25;
        return secondaryStrikeDamage + baseDamage * releaseMultiplier;
    }

    public double getMaxKiDamage() {
        double kiPower = this.stats.getKiPower();
        double pwrScaling = this.getStatScaling("PWR");
        double pwrMult = this.getTotalMultiplier("PWR");
        double flatBonusPwr = this.bonusStats.calculateBonus("PWR", (int)Math.round(kiPower), false);
        double multBonusPwr = this.bonusStats.calculateBonus("PWR", (int)Math.round(kiPower), true);
        double secondaryKiDamage = this.getSecondaryAttributeValue((Attribute)MainAttributes.KI_DAMAGE.get(), 0.0);
        return secondaryKiDamage + (kiPower + multBonusPwr) * pwrScaling * pwrMult + flatBonusPwr * pwrScaling;
    }

    public double getKiDamage() {
        double kiPower = this.stats.getKiPower();
        double pwrScaling = this.getStatScaling("PWR");
        double pwrMult = this.getTotalMultiplier("PWR");
        double releaseMultiplier = (double)this.resources.getPowerRelease() / 100.0;
        double flatBonusPwr = this.bonusStats.calculateBonus("PWR", (int)Math.round(kiPower), false);
        double multBonusPwr = this.bonusStats.calculateBonus("PWR", (int)Math.round(kiPower), true);
        double secondaryKiDamage = this.getSecondaryAttributeValue((Attribute)MainAttributes.KI_DAMAGE.get(), 0.0);
        return secondaryKiDamage + ((kiPower + multBonusPwr) * pwrScaling * pwrMult + flatBonusPwr * pwrScaling) * releaseMultiplier;
    }

    public double getKiDamageNoForms() {
        double kiPower = this.stats.getKiPower();
        double pwrScaling = this.getStatScaling("PWR");
        double releaseMultiplier = (double)this.resources.getPowerRelease() / 100.0;
        double flatBonusPwr = this.bonusStats.calculateBonus("PWR", (int)Math.round(kiPower), false);
        double multBonusPwr = this.bonusStats.calculateBonus("PWR", (int)Math.round(kiPower), true);
        double secondaryKiDamage = this.getSecondaryAttributeValue((Attribute)MainAttributes.KI_DAMAGE.get(), 0.0);
        return secondaryKiDamage + ((kiPower + multBonusPwr) * pwrScaling + flatBonusPwr * pwrScaling) * releaseMultiplier;
    }

    public double getMaxDefense() {
        double resistance = this.stats.getResistance();
        double defScaling = this.getStatScaling("DEF");
        double flatBonusDef = this.bonusStats.calculateBonus("DEF", (int)Math.round(resistance), false);
        double multBonusDef = this.bonusStats.calculateBonus("DEF", (int)Math.round(resistance), true);
        double armor = this.player.m_21230_();
        double toughness = this.getArmorToughnessValue();
        double secondaryDefense = this.getSecondaryAttributeValue((Attribute)MainAttributes.DEFENSE.get(), 0.0);
        double statDef = (resistance + multBonusDef) * defScaling + flatBonusDef * defScaling;
        double armorComponent = armor * 0.5 + toughness * 0.7;
        return (secondaryDefense + statDef + armorComponent) * this.secondaryStatEffects.getMultiplier("DEF");
    }

    public double getDefense() {
        double resistance = this.stats.getResistance();
        double defScaling = this.getStatScaling("DEF");
        double releaseMultiplier = (double)this.resources.getPowerRelease() / 100.0;
        double flatBonusDef = this.bonusStats.calculateBonus("DEF", (int)Math.round(resistance), false);
        double multBonusDef = this.bonusStats.calculateBonus("DEF", (int)Math.round(resistance), true);
        double armor = this.player.m_21230_();
        double toughness = this.getArmorToughnessValue();
        double secondaryDefense = this.getSecondaryAttributeValue((Attribute)MainAttributes.DEFENSE.get(), 0.0);
        double statDef = (resistance + multBonusDef) * defScaling + flatBonusDef * defScaling;
        double armorComponent = armor * 0.5 + toughness * 0.7;
        return (secondaryDefense + statDef + armorComponent) * releaseMultiplier * this.secondaryStatEffects.getMultiplier("DEF");
    }

    public double calculatePostMitigationDamage(double incomingDamage, boolean isGuardBroken, double armorPenetration) {
        double defMult = this.getTotalMultiplier("DEF");
        double baseDefense = this.getDefense() * Math.max(1.0, defMult);
        if (isGuardBroken) {
            baseDefense *= 1.0 - ConfigManager.getCombatConfig().getDefenseDecayOnGuardBreak();
        }
        if (baseDefense > 0.0) {
            baseDefense *= 1.0 - armorPenetration;
        }
        double rawFlatMitigation = baseDefense;
        if (ConfigManager.getCombatConfig().getCancelDamageEventIfMitigationTooHigh() && incomingDamage > 0.0 && rawFlatMitigation >= incomingDamage * ConfigManager.getCombatConfig().getCancelDamageMitigationThreshold()) {
            return 0.0;
        }
        double flatAbsorbCap = incomingDamage * ConfigManager.getCombatConfig().getFlatMitigationMaxAbsorbFraction();
        double flatMitigation = Math.min(rawFlatMitigation, flatAbsorbCap);
        double postFlatDamage = Math.max(0.0, incomingDamage - flatMitigation);
        int maxValue = this.getConfiguredMaxValue();
        double expectedMaxStats = this.isMaxLevelValueInsteadOfStats() ? (double)maxValue * 6.0 / 2.0 : (double)maxValue;
        double expectedMaxDef = expectedMaxStats * this.getStatScaling("DEF");
        double k_factor = Math.max(12.0, expectedMaxDef * ConfigManager.getCombatConfig().getDefenseReductionScale());
        double baseReduction = baseDefense >= 0.0 ? baseDefense / (k_factor + baseDefense) : baseDefense / (k_factor - baseDefense);
        double baseCap = ConfigManager.getCombatConfig().getBaseDamageReductionCap();
        baseReduction = Math.min(baseReduction, baseCap);
        double remainingDamage = postFlatDamage * (1.0 - baseReduction);
        int totalProtection = 0;
        if (this.player != null) {
            totalProtection = TickHandler.getTotalArmorEnchantmentLevel(Enchantments.f_44965_, (LivingEntity)this.player);
        }
        double enchReduction = 0.0;
        if (totalProtection > 0) {
            double rawEffective = 0.0;
            int remaining = totalProtection;
            double mult = 1.0;
            while (remaining > 0) {
                int chunk = Math.min(remaining, 4);
                rawEffective += (double)chunk * mult;
                remaining -= chunk;
                mult *= 0.5;
            }
            double effectiveProtection = rawEffective * (1.0 - armorPenetration);
            double k_ench = 20.0;
            enchReduction = effectiveProtection / (k_ench + effectiveProtection);
            double totalCap = ConfigManager.getCombatConfig().getEnchantmentDamageReductionCap();
            double maxEnchReductionAllowed = (totalCap - baseReduction) / (1.0 - baseReduction);
            enchReduction = Math.min(enchReduction, Math.max(0.0, maxEnchReductionAllowed));
        }
        double afterEnchant = remainingDamage * (1.0 - enchReduction);
        if (ConfigManager.getCombatConfig().getEnableAdaptativeDefenseMitigation() && rawFlatMitigation > 0.0 && incomingDamage > 0.0) {
            double ratio = incomingDamage / rawFlatMitigation;
            afterEnchant *= 1.0 - this.computeAdaptativeDefenseMitigation(ratio);
        }
        return afterEnchant;
    }

    private double computeAdaptativeDefenseMitigation(double ratio) {
        if (!Double.isFinite(ratio) || ratio <= 0.0) {
            return 0.0;
        }
        CombatConfig cfg = ConfigManager.getCombatConfig();
        double parityRatio = cfg.getAdaptativeMitigationParityRatio();
        double parityValue = cfg.getAdaptativeMitigationParityValue();
        double zeroRatio = cfg.getAdaptativeMitigationZeroRatio();
        double cap = cfg.getAdaptativeDefenseMitigationCap();
        double slope = parityValue / (zeroRatio - parityRatio);
        double mitigation = parityValue + slope * (parityRatio - ratio);
        if (!Double.isFinite(mitigation) || mitigation <= 0.0) {
            return 0.0;
        }
        return Math.min(mitigation, cap);
    }

    public double getFlatMitigation() {
        double defMult = this.getTotalMultiplier("DEF");
        return this.getDefense() * Math.max(1.0, defMult);
    }

    public double getMaxFlatMitigation() {
        double defMult = this.getTotalMultiplier("DEF");
        return this.getMaxDefense() * Math.max(1.0, defMult);
    }

    public double getDefenseLegacyUnits() {
        return this.getDefense() / 0.12;
    }

    public double getStaminaPerHit() {
        double staminaDamage = this.getMeleeDamageNoMultipliers();
        int baseStaminaRequired = (int)Math.ceil(staminaDamage * ConfigManager.getCombatConfig().getStaminaConsumptionRatio());
        return (double)baseStaminaRequired * this.getAdjustedStaminaDrainMultiplier();
    }

    private double getFormOffenseCostFactor() {
        boolean hasStackMult;
        boolean hasFormMult = this.character.hasActiveForm() && this.character.getActiveFormData() != null;
        boolean bl = hasStackMult = this.character.hasActiveStackForm() && this.character.getActiveStackFormData() != null;
        double formCostMultiplier = hasFormMult && hasStackMult ? (this.character.getActiveFormData().getMaxCostMultiplier() + this.character.getActiveStackFormData().getMaxCostMultiplier()) / 2.0 : (hasFormMult ? this.character.getActiveFormData().getMaxCostMultiplier() : (hasStackMult ? this.character.getActiveStackFormData().getMaxCostMultiplier() : 1.0));
        return Math.min(1.0, formCostMultiplier);
    }

    private double getReducedOffense() {
        double totalOffense = this.getMeleeDamageNoBonus() + this.getStrikeDamageNoBonus() + this.getKiDamageNoBonus();
        return totalOffense * this.getFormOffenseCostFactor();
    }

    private double getMeleeDamageNoBonus() {
        double strength = this.stats.getStrength();
        double strScaling = this.getStatScaling("STR");
        double strMult = this.getTotalMultiplier("STR");
        double releaseMultiplier = (double)this.resources.getPowerRelease() / 100.0;
        double secondaryMeleeDamage = this.getSecondaryAttributeValue((Attribute)MainAttributes.MELEE_DAMAGE.get(), 1.0);
        return secondaryMeleeDamage + strength * strScaling * strMult * releaseMultiplier;
    }

    private double getStrikeDamageNoBonus() {
        double strikePower = this.stats.getStrikePower();
        double strength = this.stats.getStrength();
        double skpScaling = this.getStatScaling("SKP");
        double strScaling = this.getStatScaling("STR");
        double skpMult = this.getTotalMultiplier("SKP");
        double strMult = this.getTotalMultiplier("STR");
        double releaseMultiplier = (double)this.resources.getPowerRelease() / 100.0;
        double secondaryStrikeDamage = this.getSecondaryAttributeValue((Attribute)MainAttributes.STRIKE_DAMAGE.get(), 1.0);
        double baseDamage = strikePower * skpScaling * skpMult + strength * strScaling * strMult * 0.25;
        return secondaryStrikeDamage + baseDamage * releaseMultiplier;
    }

    private double getKiDamageNoBonus() {
        double kiPower = this.stats.getKiPower();
        double pwrScaling = this.getStatScaling("PWR");
        double pwrMult = this.getTotalMultiplier("PWR");
        double releaseMultiplier = (double)this.resources.getPowerRelease() / 100.0;
        double secondaryKiDamage = this.getSecondaryAttributeValue((Attribute)MainAttributes.KI_DAMAGE.get(), 0.0);
        return secondaryKiDamage + kiPower * pwrScaling * pwrMult * releaseMultiplier;
    }

    public double getEffectiveEnergyDrain() {
        double base = this.getAdjustedEnergyDrain();
        if (base <= 0.0) {
            return base;
        }
        double maxEnergy = this.getMaxEnergy();
        double rawEnergyRatio = this.getReducedOffense() / Math.max(1.0, maxEnergy * 1.5);
        double energyRatio = Math.max(1.0, Math.sqrt(rawEnergyRatio));
        double formRawEneDrain = 0.0;
        if (this.character.hasActiveForm() && this.character.getActiveFormData() != null) {
            formRawEneDrain += Math.max(0.0, this.character.getActiveFormData().getEnergyDrain());
        }
        if (this.character.hasActiveStackForm() && this.character.getActiveStackFormData() != null) {
            formRawEneDrain += Math.max(0.0, this.character.getActiveStackFormData().getEnergyDrain());
        }
        double percentageEnergy = maxEnergy * (formRawEneDrain * 0.01) * 0.75;
        return base * energyRatio + percentageEnergy;
    }

    public double getEffectiveStaminaDrain() {
        double base = this.getAdjustedStaminaDrain();
        if (base <= 0.0) {
            return base;
        }
        double maxStamina = this.getMaxStamina();
        double staminaRatio = Math.max(1.0, this.getReducedOffense() / Math.max(1.0, maxStamina * 1.5));
        double percentageStamina = maxStamina * 0.005;
        return base * staminaRatio + percentageStamina;
    }

    public double getEffectiveHealthDrain() {
        double base = this.getAdjustedHealthDrain();
        if (base <= 0.0) {
            return base;
        }
        double maxHealth = this.getMaxHealth();
        double healthRatio = Math.max(1.0, this.getReducedOffense() / Math.max(1.0, maxHealth * 1.5));
        double percentageHealth = maxHealth * 0.005;
        return base * healthRatio + percentageHealth;
    }

    public double getTotalMultiplier(String statName) {
        double secondary;
        double form = this.getFormMultiplier(statName);
        double stack = this.getStackFormMultiplier(statName);
        double effect = this.getEffectsMultiplier(statName);
        double d = secondary = statName.equalsIgnoreCase("DEF") ? 1.0 : this.secondaryStatEffects.getMultiplier(statName);
        if (ConfigManager.getServerConfig().getGameplay().getMultiplicationInsteadOfAdditionForMultipliers().booleanValue()) {
            return form * stack * effect * secondary;
        }
        return 1.0 + (form - 1.0) + (stack - 1.0) + (effect - 1.0) + (secondary - 1.0);
    }

    public double getFormMultiplier(String statName) {
        String currentForm = this.character.getActiveForm();
        String currentFormGroup = this.character.getActiveFormGroup();
        if (currentForm == null || currentForm.isEmpty() || currentForm.equals("base")) {
            return 1.0;
        }
        if (currentFormGroup == null || currentFormGroup.isEmpty()) {
            return 1.0;
        }
        FormConfig formConfig = ConfigManager.getFormGroup(this.character.getRaceName(), currentFormGroup);
        if (formConfig == null) {
            return 1.0;
        }
        FormConfig.FormData formData = formConfig.getForm(currentForm);
        if (formData == null) {
            return 1.0;
        }
        double baseMult = switch (statName.toUpperCase()) {
            case "STR" -> formData.getStrMultiplier();
            case "SKP" -> formData.getSkpMultiplier();
            case "STM" -> formData.getStmMultiplier();
            case "DEF" -> formData.getDefMultiplier();
            case "RES" -> (formData.getDefMultiplier() + formData.getStmMultiplier()) / 2.0;
            case "VIT" -> formData.getVitMultiplier();
            case "PWR" -> formData.getPwrMultiplier();
            case "ENE" -> formData.getEneMultiplier();
            default -> 1.0;
        };
        double mastery = this.character.getFormMasteries().getMastery(currentFormGroup, currentForm);
        double result = this.applyMasteryStatBonus(formData, baseMult, mastery);
        return this.applyMutantFormPowerModifier(currentFormGroup, result);
    }

    private double applyMutantFormPowerModifier(String groupName, double multiplier) {
        GeneralServerConfig.MutantConfig mutantConfig;
        if (multiplier <= 1.0) {
            return multiplier;
        }
        if (!this.effects.hasEffect("mutant")) {
            return multiplier;
        }
        GeneralServerConfig.MutantConfig mutantConfig2 = mutantConfig = ConfigManager.getServerConfig() != null ? ConfigManager.getServerConfig().getMutant() : null;
        if (mutantConfig == null) {
            return multiplier;
        }
        String legendaryGroup = mutantConfig.getLegendaryGroupName();
        if (groupName == null || !groupName.equalsIgnoreCase(legendaryGroup)) {
            return multiplier;
        }
        boolean hasSkill = this.skills.getSkillLevel("legendaryforms") > 0;
        double factor = hasSkill ? 1.0 + mutantConfig.getPowerBonusBoostWithSkill() : 1.0 - mutantConfig.getPowerBonusReductionNoSkill();
        return 1.0 + (multiplier - 1.0) * factor;
    }

    private double getBaseFormMultiplier(FormConfig.FormData formData, String statName) {
        return switch (statName.toUpperCase()) {
            case "STR" -> formData.getStrMultiplier();
            case "SKP" -> formData.getSkpMultiplier();
            case "STM" -> formData.getStmMultiplier();
            case "DEF" -> formData.getDefMultiplier();
            case "RES" -> (formData.getDefMultiplier() + formData.getStmMultiplier()) / 2.0;
            case "VIT" -> formData.getVitMultiplier();
            case "PWR" -> formData.getPwrMultiplier();
            case "ENE" -> formData.getEneMultiplier();
            default -> 1.0;
        };
    }

    private double getMasteryAdjustedMultiplier(FormConfig.FormData formData, String statName, double mastery) {
        double baseMult = this.getBaseFormMultiplier(formData, statName);
        return this.applyMasteryStatBonus(formData, baseMult, mastery);
    }

    private double applyMasteryStatBonus(FormConfig.FormData formData, double baseMult, double mastery) {
        if (baseMult <= 1.0) {
            return baseMult;
        }
        double maxMastery = formData.getMaxMastery();
        if (maxMastery <= 0.0) {
            return baseMult;
        }
        double ratio = Math.min(1.0, Math.max(0.0, mastery) / maxMastery);
        double factor = 1.0 + ratio * (formData.getMaxStatsMultiplier() - 1.0);
        return baseMult * factor;
    }

    private double getMasteryCostFactor(FormConfig.FormData formData, double mastery) {
        double maxMastery = formData.getMaxMastery();
        if (maxMastery <= 0.0) {
            return 1.0;
        }
        double ratio = Math.min(1.0, Math.max(0.0, mastery) / maxMastery);
        return 1.0 + ratio * (formData.getMaxCostMultiplier() - 1.0);
    }

    private FormConfig.FormData getBestUltimateBaseForm() {
        String raceName = this.character.getRaceName();
        Map<String, FormConfig> groups = ConfigManager.getAllFormsForRace(raceName);
        if (groups == null || groups.isEmpty()) {
            return null;
        }
        FormConfig.FormData best = null;
        double bestAverage = -1.0;
        for (Map.Entry<String, FormConfig> entry : groups.entrySet()) {
            String groupName = entry.getKey();
            FormConfig group = entry.getValue();
            if (group == null) continue;
            List<FormConfig.FormData> unlocked = TransformationsHelper.getUnlockedForms(this, raceName, groupName);
            for (FormConfig.FormData formData : unlocked) {
                double mastery;
                double average;
                if (formData == null || formData.isIncompatibleWith("ultimate", "ultimate") || !((average = (this.getMasteryAdjustedMultiplier(formData, "STR", mastery = this.character.getFormMasteries().getMastery(groupName, formData.getName())) + this.getMasteryAdjustedMultiplier(formData, "SKP", mastery) + this.getMasteryAdjustedMultiplier(formData, "DEF", mastery) + this.getMasteryAdjustedMultiplier(formData, "VIT", mastery) + this.getMasteryAdjustedMultiplier(formData, "PWR", mastery) + this.getMasteryAdjustedMultiplier(formData, "ENE", mastery)) / 6.0) > bestAverage)) continue;
                bestAverage = average;
                best = formData;
            }
        }
        return best;
    }

    private Object[] getBestUltimateBaseFormWithGroup() {
        String raceName = this.character.getRaceName();
        Map<String, FormConfig> groups = ConfigManager.getAllFormsForRace(raceName);
        if (groups == null || groups.isEmpty()) {
            return new Object[]{null, null};
        }
        FormConfig.FormData best = null;
        String bestGroup = null;
        double bestAverage = -1.0;
        for (Map.Entry<String, FormConfig> entry : groups.entrySet()) {
            String groupName = entry.getKey();
            FormConfig group = entry.getValue();
            if (group == null) continue;
            List<FormConfig.FormData> unlocked = TransformationsHelper.getUnlockedForms(this, raceName, groupName);
            for (FormConfig.FormData formData : unlocked) {
                double mastery;
                double average;
                if (formData == null || formData.isIncompatibleWith("ultimate", "ultimate") || !((average = (this.getMasteryAdjustedMultiplier(formData, "STR", mastery = this.character.getFormMasteries().getMastery(groupName, formData.getName())) + this.getMasteryAdjustedMultiplier(formData, "SKP", mastery) + this.getMasteryAdjustedMultiplier(formData, "DEF", mastery) + this.getMasteryAdjustedMultiplier(formData, "VIT", mastery) + this.getMasteryAdjustedMultiplier(formData, "PWR", mastery) + this.getMasteryAdjustedMultiplier(formData, "ENE", mastery)) / 6.0) > bestAverage)) continue;
                bestAverage = average;
                best = formData;
                bestGroup = groupName;
            }
        }
        return new Object[]{bestGroup, best};
    }

    private boolean isUltimateStackFormActive() {
        String group = this.character.getActiveStackFormGroup();
        return group != null && "ultimate".equalsIgnoreCase(group);
    }

    public double getStackFormMultiplier(String statName) {
        String currentForm = this.character.getActiveStackForm();
        String currentFormGroup = this.character.getActiveStackFormGroup();
        if (currentForm == null || currentForm.isEmpty()) {
            return 1.0;
        }
        if (currentFormGroup == null || currentFormGroup.isEmpty()) {
            return 1.0;
        }
        FormConfig formConfig = ConfigManager.getStackFormGroup(currentFormGroup);
        if (formConfig == null) {
            return 1.0;
        }
        FormConfig.FormData formData = formConfig.getForm(currentForm);
        if (formData == null) {
            return 1.0;
        }
        if ("ultimate".equalsIgnoreCase(currentFormGroup) && !ConfigManager.getServerConfig().getGameplay().getUltimateFormFixedValue().booleanValue()) {
            double bestMult;
            Object[] bestResult = this.getBestUltimateBaseFormWithGroup();
            String bestGroup = (String)bestResult[0];
            FormConfig.FormData bestForm = (FormConfig.FormData)bestResult[1];
            if (bestForm != null) {
                double bestMastery = this.character.getFormMasteries().getMastery(bestGroup, bestForm.getName());
                bestMult = this.getMasteryAdjustedMultiplier(bestForm, statName, bestMastery);
            } else {
                bestMult = 1.0;
            }
            double ultimateMult = this.getBaseFormMultiplier(formData, statName);
            return bestMult + ultimateMult - 1.0;
        }
        double mastery = this.character.getStackFormMasteries().getMastery(currentFormGroup, currentForm);
        return this.getMasteryAdjustedMultiplier(formData, statName, mastery);
    }

    public double getEffectsMultiplier(String statName) {
        double rawEffect = this.effects.getTotalEffectMultiplier();
        return switch (statName.toUpperCase()) {
            case "STR", "SKP", "PWR" -> rawEffect;
            case "DEF" -> 1.0 + (rawEffect - 1.0) * 0.5;
            default -> 1.0;
        };
    }

    public double getLoadDrainMultiplier() {
        GeneralServerConfig.GravityConfig g = ConfigManager.getServerConfig().getGravity();
        return switch (GravityLogic.getTrainingZone(this.player)) {
            case 1 -> g.getLoadDrainComfort();
            case 2 -> g.getLoadDrainIdeal();
            case 3 -> g.getLoadDrainHeavy();
            case 4 -> g.getLoadDrainOverload();
            default -> 1.0;
        };
    }

    public double getAdjustedStaminaDrainMultiplier() {
        double baseDrainMult = 1.0;
        double stackDrainMult = 1.0;
        if (this.character.hasActiveForm() || this.character.hasActiveStackForm()) {
            FormConfig.FormData formData = this.character.getActiveFormData();
            FormConfig.FormData stackFormData = this.character.getActiveStackFormData();
            if (this.character.hasActiveForm() && formData != null) {
                baseDrainMult = formData.getStaminaDrainMultiplier();
            }
            if (this.character.hasActiveStackForm() && stackFormData != null) {
                stackDrainMult = stackFormData.getStaminaDrainMultiplier();
            }
        }
        return Math.max(0.001, baseDrainMult * stackDrainMult * this.getLoadDrainMultiplier());
    }

    public double getAdjustedEnergyDrain() {
        double drainAmount;
        if (!this.character.hasActiveForm() && !this.character.hasActiveStackForm()) {
            return 0.0;
        }
        FormConfig.FormData formData = this.character.getActiveFormData();
        FormConfig.FormData stackFormData = this.character.getActiveStackFormData();
        double powerRelease = (double)this.resources.getPowerRelease() / 100.0;
        if (formData == null && stackFormData == null) {
            return 0.0;
        }
        double adjustedBaseDrain = 0.0;
        if (this.character.hasActiveForm() && formData != null) {
            double baseDrain = formData.getEnergyDrain();
            if (this.character.hasActiveStackForm() && stackFormData != null) {
                baseDrain *= formData.getStackDrainMultiplier() * stackFormData.getStackDrainMultiplier();
            }
            double mastery = this.character.getFormMasteries().getMastery(this.character.getActiveFormGroup(), this.character.getActiveForm());
            double costFactor = this.getMasteryCostFactor(formData, mastery);
            adjustedBaseDrain = baseDrain < 0.0 ? baseDrain / costFactor * powerRelease : baseDrain * costFactor * powerRelease;
        }
        double adjustedStackDrain = 0.0;
        if (this.character.hasActiveStackForm() && stackFormData != null) {
            double stackDrain = stackFormData.getEnergyDrain();
            if (this.character.hasActiveForm() && formData != null) {
                stackDrain *= formData.getStackDrainMultiplier() * stackFormData.getStackDrainMultiplier();
            }
            double stackMastery = this.isUltimateStackFormActive() ? 0.0 : this.character.getStackFormMasteries().getMastery(this.character.getActiveStackFormGroup(), this.character.getActiveStackForm());
            double stackCostFactor = this.getMasteryCostFactor(stackFormData, stackMastery);
            adjustedStackDrain = stackDrain < 0.0 ? stackDrain / stackCostFactor * powerRelease : stackDrain * stackCostFactor * powerRelease;
        }
        if ((drainAmount = adjustedBaseDrain + adjustedStackDrain) == 0.0) {
            return 0.0;
        }
        double scaledDrain = drainAmount * (double)ConfigManager.getCombatConfig().getBaselineFormDrain().intValue() * this.getLoadDrainMultiplier();
        if (drainAmount < 0.0) {
            return Math.min(-1.0, scaledDrain);
        }
        return Math.max(1.0, scaledDrain);
    }

    public double getAdjustedStaminaDrain() {
        double drainAmount;
        if (!this.character.hasActiveForm() && !this.character.hasActiveStackForm()) {
            return 0.0;
        }
        FormConfig.FormData formData = this.character.getActiveFormData();
        FormConfig.FormData stackFormData = this.character.getActiveStackFormData();
        double powerRelease = (double)this.resources.getPowerRelease() / 100.0;
        if (formData == null && stackFormData == null) {
            return 0.0;
        }
        double adjustedBaseDrain = 0.0;
        if (this.character.hasActiveForm() && formData != null) {
            double baseDrain = formData.getStaminaDrain();
            if (this.character.hasActiveStackForm() && stackFormData != null) {
                baseDrain *= formData.getStackDrainMultiplier() * stackFormData.getStackDrainMultiplier();
            }
            double mastery = this.character.getFormMasteries().getMastery(this.character.getActiveFormGroup(), this.character.getActiveForm());
            double costFactor = this.getMasteryCostFactor(formData, mastery);
            adjustedBaseDrain = baseDrain < 0.0 ? baseDrain / costFactor * powerRelease : baseDrain * costFactor * powerRelease;
        }
        double adjustedStackDrain = 0.0;
        if (this.character.hasActiveStackForm() && stackFormData != null) {
            double stackDrain = stackFormData.getStaminaDrain();
            if (this.character.hasActiveForm() && formData != null) {
                stackDrain *= formData.getStackDrainMultiplier() * stackFormData.getStackDrainMultiplier();
            }
            double stackMastery = this.isUltimateStackFormActive() ? 0.0 : this.character.getStackFormMasteries().getMastery(this.character.getActiveStackFormGroup(), this.character.getActiveStackForm());
            double stackCostFactor = this.getMasteryCostFactor(stackFormData, stackMastery);
            adjustedStackDrain = stackDrain < 0.0 ? stackDrain / stackCostFactor * powerRelease : stackDrain * stackCostFactor * powerRelease;
        }
        if ((drainAmount = adjustedBaseDrain + adjustedStackDrain) == 0.0) {
            return 0.0;
        }
        double scaledDrain = drainAmount * (double)ConfigManager.getCombatConfig().getBaselineFormDrain().intValue() * this.getLoadDrainMultiplier();
        if (drainAmount < 0.0) {
            return Math.min(-1.0, scaledDrain);
        }
        return Math.max(1.0, scaledDrain);
    }

    public double getAdjustedHealthDrain() {
        double drainAmount;
        if (!this.character.hasActiveForm() && !this.character.hasActiveStackForm()) {
            return 0.0;
        }
        FormConfig.FormData formData = this.character.getActiveFormData();
        FormConfig.FormData stackFormData = this.character.getActiveStackFormData();
        double powerRelease = (double)this.resources.getPowerRelease() / 100.0;
        if (formData == null && stackFormData == null) {
            return 0.0;
        }
        double adjustedBaseDrain = 0.0;
        if (this.character.hasActiveForm() && formData != null) {
            double baseDrain = formData.getHealthDrain();
            if (this.character.hasActiveStackForm() && stackFormData != null) {
                baseDrain *= formData.getStackDrainMultiplier() * stackFormData.getStackDrainMultiplier();
            }
            double mastery = this.character.getFormMasteries().getMastery(this.character.getActiveFormGroup(), this.character.getActiveForm());
            double costFactor = this.getMasteryCostFactor(formData, mastery);
            adjustedBaseDrain = baseDrain < 0.0 ? baseDrain / costFactor * powerRelease : baseDrain * costFactor * powerRelease;
        }
        double adjustedStackDrain = 0.0;
        if (this.character.hasActiveStackForm() && stackFormData != null) {
            double stackDrain = stackFormData.getHealthDrain();
            if (this.character.hasActiveForm() && formData != null) {
                stackDrain *= formData.getStackDrainMultiplier() * stackFormData.getStackDrainMultiplier();
            }
            double stackMastery = this.isUltimateStackFormActive() ? 0.0 : this.character.getStackFormMasteries().getMastery(this.character.getActiveStackFormGroup(), this.character.getActiveStackForm());
            double stackCostFactor = this.getMasteryCostFactor(stackFormData, stackMastery);
            adjustedStackDrain = stackDrain < 0.0 ? stackDrain / stackCostFactor * powerRelease : stackDrain * stackCostFactor * powerRelease;
        }
        if ((drainAmount = adjustedBaseDrain + adjustedStackDrain) == 0.0) {
            return 0.0;
        }
        double scaledDrain = drainAmount * (double)ConfigManager.getCombatConfig().getBaselineFormDrain().intValue() * this.getLoadDrainMultiplier();
        if (drainAmount < 0.0) {
            return Math.min(-1.0, scaledDrain);
        }
        return Math.max(1.0, scaledDrain);
    }

    public float[] snapshotMultiplierResources() {
        return new float[]{this.getMaxHealth(), this.getMaxEnergy(), this.getMaxStamina()};
    }

    public void restoreMultiplierGains(ServerPlayer player, float[] snapshot) {
        float newMaxStamina;
        float staminaDelta;
        float newMaxEnergy;
        float energyDelta;
        if (snapshot == null || snapshot.length < 3) {
            return;
        }
        StatsEvents.applyHealthBonus(player);
        float newMaxHealth = this.getMaxHealth();
        float healthDelta = newMaxHealth - snapshot[0];
        if (healthDelta > 0.0f) {
            player.m_21153_(Math.min(newMaxHealth, player.m_21223_() + healthDelta));
        }
        if ((energyDelta = (newMaxEnergy = this.getMaxEnergy()) - snapshot[1]) > 0.0f) {
            this.resources.setCurrentEnergy(Math.min(newMaxEnergy, this.resources.getCurrentEnergy() + energyDelta));
        }
        if ((staminaDelta = (newMaxStamina = this.getMaxStamina()) - snapshot[2]) > 0.0f) {
            this.resources.setCurrentStamina(Math.min(newMaxStamina, this.resources.getCurrentStamina() + staminaDelta));
        }
    }

    public void initializeWithRaceAndClass(String raceName, String characterClass, String gender, int hairId, CustomHair customHair, int bodyType, int eyesType, int noseType, int mouthType, int tattooType, float boobScale, String activeHeadBone, String hairColor, String bodyColor, String bodyColor2, String bodyColor3, String eye1Color, String eye2Color, String auraColor) {
        boolean hasDefaultStats;
        this.character.setRace(raceName);
        this.character.setGender(gender);
        this.character.setCharacterClass(characterClass);
        this.character.setHairId(hairId);
        if (customHair != null) {
            this.character.setHairBase(customHair);
        }
        this.character.setBodyType(bodyType);
        this.character.setEyesType(eyesType);
        this.character.setNoseType(noseType);
        this.character.setMouthType(mouthType);
        this.character.setTattooType(tattooType);
        this.character.setBoobScale(boobScale);
        this.character.setActiveHeadBone(activeHeadBone);
        this.character.setHairColor(hairColor);
        this.character.setBodyColor(bodyColor);
        this.character.setBodyColor2(bodyColor2);
        this.character.setBodyColor3(bodyColor3);
        this.character.setEye1Color(eye1Color);
        this.character.setEye2Color(eye2Color);
        this.character.setAuraColor(auraColor);
        this.status.setHasCreatedCharacter(true);
        RaceStatsConfig raceConfig = ConfigManager.getRaceStats(raceName);
        RaceStatsConfig.ClassStats classStats = this.getClassStats(raceConfig, characterClass);
        RaceStatsConfig.BaseStats baseStats = classStats.getBaseStats();
        if (baseStats == null) {
            baseStats = new RaceStatsConfig().getClassStats(characterClass).getBaseStats();
        }
        boolean bl = hasDefaultStats = this.stats.getStrength() == 0 && this.stats.getStrikePower() == 0 && this.stats.getResistance() == 0 && this.stats.getVitality() == 0 && this.stats.getKiPower() == 0 && this.stats.getEnergy() == 0;
        if (hasDefaultStats) {
            this.stats.setStrength(baseStats.getStrength());
            this.stats.setStrikePower(baseStats.getStrikePower());
            this.stats.setResistance(baseStats.getResistance());
            this.stats.setVitality(baseStats.getVitality());
            this.stats.setKiPower(baseStats.getKiPower());
            this.stats.setEnergy(baseStats.getEnergy());
        }
        this.resources.setCurrentEnergy(this.getMaxEnergy());
        this.resources.setCurrentStamina(this.getMaxStamina());
        this.resources.setCurrentPoise(this.getMaxPoise());
        this.resources.setPowerRelease(0);
        this.resources.setAlignment(100);
        this.character.setSelectedFormGroup(TransformationsHelper.getGroupWithFirstAvailableForm(this));
        this.updateTransformationSkillLimits(raceName);
    }

    public void updateTransformationSkillLimits(String raceName) {
        this.skills.refreshNonFormSkillMaxLevels();
        this.status.validateKiWeaponType();
        RaceCharacterConfig charConfig = ConfigManager.getRaceCharacter(raceName);
        if (charConfig != null) {
            Collection<String> formSkills = charConfig.getFormSkills();
            List<String> androidBlacklistedForms = ConfigManager.getSkillsConfig().getAndroidBlacklistedForms();
            for (String skillName : formSkills) {
                int maxLevel;
                if (this.status.isAndroidUpgraded() && androidBlacklistedForms.contains(skillName) || !this.status.isAndroidUpgraded() && "androidforms".equalsIgnoreCase(skillName)) continue;
                Integer[] tpCosts = charConfig.getFormSkillTpCosts(skillName);
                int n = maxLevel = tpCosts != null ? tpCosts.length : 0;
                if (charConfig.isFormSkillBuyFromMaster(skillName)) {
                    if (!this.skills.hasSkill(skillName)) continue;
                    this.skills.registerDefaultSkill(skillName, maxLevel);
                    continue;
                }
                this.skills.registerDefaultSkill(skillName, maxLevel);
            }
        }
    }

    public double getStatScaling(String statName) {
        String raceName = this.character.getRaceName();
        String characterClass = this.character.getCharacterClass();
        RaceStatsConfig raceConfig = ConfigManager.getRaceStats(raceName);
        RaceStatsConfig.ClassStats classStats = this.getClassStats(raceConfig, characterClass);
        RaceStatsConfig.StatScaling scaling = classStats.getStatScaling();
        if (scaling == null) {
            return switch (statName.toUpperCase()) {
                case "STR" -> new RaceStatsConfig().getClassStats(characterClass).getStatScaling().getStrengthScaling();
                case "SKP" -> new RaceStatsConfig().getClassStats(characterClass).getStatScaling().getStrikePowerScaling();
                case "STM" -> new RaceStatsConfig().getClassStats(characterClass).getStatScaling().getStaminaScaling();
                case "DEF" -> new RaceStatsConfig().getClassStats(characterClass).getStatScaling().getDefenseScaling();
                case "VIT" -> new RaceStatsConfig().getClassStats(characterClass).getStatScaling().getVitalityScaling();
                case "PWR" -> new RaceStatsConfig().getClassStats(characterClass).getStatScaling().getKiPowerScaling();
                case "ENE" -> new RaceStatsConfig().getClassStats(characterClass).getStatScaling().getEnergyScaling();
                default -> 1.0;
            };
        }
        return switch (statName.toUpperCase()) {
            case "STR" -> scaling.getStrengthScaling();
            case "SKP" -> scaling.getStrikePowerScaling();
            case "STM" -> scaling.getStaminaScaling();
            case "DEF" -> scaling.getDefenseScaling();
            case "VIT" -> scaling.getVitalityScaling();
            case "PWR" -> scaling.getKiPowerScaling();
            case "ENE" -> scaling.getEnergyScaling();
            default -> 1.0;
        };
    }

    private RaceStatsConfig.ClassStats getClassStats(RaceStatsConfig config, String characterClass) {
        if (config == null) {
            return new RaceStatsConfig().getClassStats(characterClass);
        }
        return config.getClassStats(characterClass);
    }

    private int getInitialTotalStats() {
        RaceStatsConfig.BaseStats baseStats = this.getInitialBaseStats();
        return baseStats.getStrength() + baseStats.getStrikePower() + baseStats.getResistance() + baseStats.getVitality() + baseStats.getKiPower() + baseStats.getEnergy();
    }

    private RaceStatsConfig.BaseStats getInitialBaseStats() {
        String raceName = this.character.getRaceName();
        String characterClass = this.character.getCharacterClass();
        RaceStatsConfig raceConfig = ConfigManager.getRaceStats(raceName);
        RaceStatsConfig.ClassStats classStats = this.getClassStats(raceConfig, characterClass);
        RaceStatsConfig.BaseStats baseStats = classStats.getBaseStats();
        if (baseStats == null) {
            baseStats = new RaceStatsConfig().getClassStats(characterClass).getBaseStats();
        }
        return baseStats;
    }

    public int getPendingAttributePoints() {
        return this.resources.getPendingAttributePoints();
    }

    public int relocateStats(ServerPlayer serverPlayer) {
        RaceStatsConfig.BaseStats baseStats = this.getInitialBaseStats();
        int gained = 0;
        gained += Math.max(0, this.stats.getStrength() - baseStats.getStrength());
        gained += Math.max(0, this.stats.getStrikePower() - baseStats.getStrikePower());
        gained += Math.max(0, this.stats.getResistance() - baseStats.getResistance());
        gained += Math.max(0, this.stats.getVitality() - baseStats.getVitality());
        gained += Math.max(0, this.stats.getKiPower() - baseStats.getKiPower());
        if ((gained += Math.max(0, this.stats.getEnergy() - baseStats.getEnergy())) <= 0) {
            return 0;
        }
        float oldHealthBonus = this.getHealthBonus();
        this.stats.setStrength(baseStats.getStrength());
        this.stats.setStrikePower(baseStats.getStrikePower());
        this.stats.setResistance(baseStats.getResistance());
        this.stats.setVitality(baseStats.getVitality());
        this.stats.setKiPower(baseStats.getKiPower());
        this.stats.setEnergy(baseStats.getEnergy());
        float newHealthBonus = this.getHealthBonus();
        if (newHealthBonus < oldHealthBonus) {
            AttributeInstance attribute = serverPlayer.m_21051_(Attributes.f_22276_);
            if (attribute != null) {
                attribute.m_22127_(StatsEvents.DMZ_HEALTH_MODIFIER_UUID);
                attribute.m_22125_(new AttributeModifier(StatsEvents.DMZ_HEALTH_MODIFIER_UUID, "DMZ Health", (double)newHealthBonus, AttributeModifier.Operation.ADDITION));
            }
            if (serverPlayer.m_21223_() > serverPlayer.m_21233_()) {
                serverPlayer.m_21153_(serverPlayer.m_21233_());
            }
        }
        this.resources.setCurrentEnergy(Math.min(this.resources.getCurrentEnergy(), this.getMaxEnergy()));
        this.resources.setCurrentStamina(Math.min(this.resources.getCurrentStamina(), this.getMaxStamina()));
        this.resources.addPendingAttributePoints(gained);
        return gained;
    }

    private long getConfiguredMaxTotalStatsRaw() {
        return (long)this.getConfiguredMaxValue() * 6L;
    }

    public boolean isHumanRacialActive() {
        return ConfigManager.getServerConfig().getRacialSkills().getEnableRacialSkills() != false && ConfigManager.getServerConfig().getRacialSkills().getHumanRacialSkill() != false && ConfigManager.getRaceCharacter(this.character.getRace()).getRacialSkill().equals("human");
    }

    public boolean isAndroidRacialActive() {
        return this.isHumanRacialActive() && this.status.isAndroidUpgraded();
    }

    public double getKiAttackCostModifier() {
        if (this.isAndroidRacialActive()) {
            return 0.5;
        }
        if (this.isHumanRacialActive()) {
            return 0.75;
        }
        return 1.0;
    }

    public double getKiAttackDamageModifier() {
        if (this.isAndroidRacialActive()) {
            return 0.85;
        }
        return 1.0;
    }

    public double getRaceTpCostMultiplier() {
        String raceName = this.character.getRaceName();
        String characterClass = this.character.getCharacterClass();
        RaceStatsConfig raceConfig = ConfigManager.getRaceStats(raceName);
        if (raceConfig == null) {
            return 1.0;
        }
        RaceStatsConfig.ClassStats classStats = raceConfig.getClassStats(characterClass);
        if (classStats == null) {
            return 1.0;
        }
        Double classMult = classStats.getTpCostMultiplier();
        return classMult != null ? classMult : 1.0;
    }

    public double getTpAdditiveMultiplier() {
        double total = 1.0;
        total += this.getTpClassMultiplier() - 1.0;
        total += this.getTpFrostDemonMultiplier() - 1.0;
        total += this.getTpHTCMultiplier() - 1.0;
        total += this.getMutantTpMultiplier() - 1.0;
        total += this.getTpGlobalMultiplier() - 1.0;
        total += this.getTpPotionEffectMultiplier() - 1.0;
        total += this.getDifficultyTpMultiplier() - 1.0;
        total += this.getTpWeightBellMultiplier() - 1.0;
        if (ConfigManager.getServerConfig().getGameplay() != null && ConfigManager.getServerConfig().getGameplay().getGravityBonusEnabled().booleanValue()) {
            total += this.getTpGravityMultiplier() - 1.0;
        }
        return Math.max(0.0, total);
    }

    public double getTpGlobalMultiplier() {
        return ConfigManager.getServerConfig().getGameplay().getTpsGainMultiplier();
    }

    public double getTpClassMultiplier() {
        String race = this.character.getRace();
        RaceStatsConfig raceStats = ConfigManager.getRaceStats(race);
        if (raceStats == null) {
            return 1.0;
        }
        RaceStatsConfig.ClassStats classStats = raceStats.getClassStats(this.character.getCharacterClass());
        if (classStats == null) {
            return 1.0;
        }
        Double classMult = classStats.getTpGainMultiplier();
        return classMult != null ? classMult : 1.0;
    }

    public boolean isFrostDemonTpPassiveActive() {
        return ConfigManager.getServerConfig().getRacialSkills().getEnableRacialSkills() != false && ConfigManager.getServerConfig().getRacialSkills().getFrostDemonRacialSkill() != false && "frostdemon".equals(ConfigManager.getRaceCharacter(this.character.getRace()).getRacialSkill());
    }

    public double getTpFrostDemonMultiplier() {
        if (!this.isFrostDemonTpPassiveActive()) {
            return 1.0;
        }
        return ConfigManager.getServerConfig().getRacialSkills().getFrostDemonTPBoost();
    }

    public double getTpHTCMultiplier() {
        if (!this.player.m_9236_().m_46472_().equals(HTCDimension.HTC_KEY)) {
            return 1.0;
        }
        return ConfigManager.getServerConfig().getGameplay().getHTCTpMultiplier();
    }

    public double getTpGravityMultiplier() {
        GeneralServerConfig.GravityConfig gravityConfig = ConfigManager.getServerConfig().getGravity();
        if (!gravityConfig.getTpEnabled().booleanValue()) {
            return 1.0;
        }
        double bonusGravity = GravityLogic.getTrainingBonusGravity(this.player);
        if (bonusGravity <= 0.0) {
            return 1.0;
        }
        return 1.0 + bonusGravity * gravityConfig.getTpGravityBonusPerGravity();
    }

    public double getGravityPenalizationGravity() {
        return GravityLogic.getPenalizationGravity(this.player);
    }

    public double getGravityEnvironmentalMultiplier() {
        return GravityLogic.getGravityMultiplier(this.player);
    }

    public double getGravityStatMultiplier() {
        return 1.0 - GravityLogic.getStatReduction(this.player);
    }

    public double getTpWeightBellMultiplier() {
        return GravityLogic.getWeightTpMultiplier(this.player);
    }

    public int getTpIdealWeight() {
        return GravityLogic.getIdealWeight(this.player);
    }

    public int getGravityTotalWeight() {
        return GravityLogic.getTotalWeight(this.player);
    }

    public double getTpPotionEffectMultiplier() {
        if (this.player == null) {
            return 1.0;
        }
        return PotionEffectHelper.getMultiplierFromEffect((LivingEntity)this.player, (MobEffect)MainEffects.TP_GAIN.get(), "tp_gain");
    }

    public double getMutantTpMultiplier() {
        if (!this.effects.hasEffect("mutant")) {
            return 1.0;
        }
        GeneralServerConfig.MutantConfig mutantConfig = ConfigManager.getServerConfig() != null ? ConfigManager.getServerConfig().getMutant() : null;
        return mutantConfig != null ? mutantConfig.getTpGainMultiplier() : 1.0;
    }

    public double getTpTotalMultiplier() {
        double finalTotal = this.getTpAdditiveMultiplier();
        return Math.max(0.0, finalTotal += this.getProgressionTpGainMultiplier() - 1.0);
    }

    public double getTpSourceMultiplier(TpSource source) {
        List<TpBoost> boosts = ConfigManager.getServerConfig().getGameplay().getTpGainBoosts(source);
        if (boosts.isEmpty()) {
            return 1.0;
        }
        double total = 1.0;
        boolean gravityEnabled = ConfigManager.getServerConfig().getGameplay() == null || ConfigManager.getServerConfig().getGameplay().getGravityBonusEnabled() != false;
        for (TpBoost boost : boosts) {
            switch (boost) {
                case CLASS: {
                    total += this.getTpClassMultiplier() - 1.0;
                    break;
                }
                case RACIALSKILL: {
                    total += this.getTpFrostDemonMultiplier() - 1.0;
                    break;
                }
                case HTC: {
                    total += this.getTpHTCMultiplier() - 1.0;
                    break;
                }
                case GRAVITY: {
                    if (!gravityEnabled) break;
                    total += this.getTpGravityMultiplier() - 1.0;
                    break;
                }
                case WEIGHTS: {
                    total += this.getTpWeightBellMultiplier() - 1.0;
                    break;
                }
                case GLOBAL: {
                    total += this.getTpGlobalMultiplier() - 1.0;
                    break;
                }
                case POTION: {
                    total += this.getTpPotionEffectMultiplier() - 1.0;
                    break;
                }
                case MUTANT: {
                    total += this.getMutantTpMultiplier() - 1.0;
                    break;
                }
                case DIFFICULTY: {
                    total += this.getDifficultyTpMultiplier() - 1.0;
                }
            }
        }
        return Math.max(0.0, total += this.getProgressionTpGainMultiplier() - 1.0);
    }

    public double getDifficultyTpMultiplier() {
        if (this.getPlayerQuestData() == null) {
            return 1.0;
        }
        Difficulty difficulty = this.getPlayerQuestData().getDifficulty();
        return difficulty != null ? difficulty.tpMultiplier() : 1.0;
    }

    public int applyTpBoosts(TpSource source, int baseTp) {
        if (baseTp <= 0) {
            return baseTp;
        }
        double mult = this.getTpSourceMultiplier(source);
        int result = (int)Math.max(0.0, (double)baseTp * mult);
        return result == 0 && mult > 0.0 ? 1 : result;
    }

    public int calculateTPGain(int baseTP) {
        return this.calculateTPGain(baseTP, TpSource.STORY);
    }

    public int calculateTPGain(int baseTP, TpSource source) {
        if (baseTP <= 0) {
            return 0;
        }
        double total = (double)baseTP * this.getTpSourceMultiplier(source);
        return (int)Math.max(0.0, total);
    }

    public double getProgressionTpGainMultiplier() {
        double strength = ConfigManager.getServerConfig().getGameplay().getIncreaseTPGainRelativeToTPCost();
        if (strength <= 0.0) {
            return 1.0;
        }
        if (!ConfigManager.getServerConfig().getDynamicGrowth().isManualTpPurchasesEnabled().booleanValue()) {
            return 1.0;
        }
        int maxCost = this.getSingleStatCost(this.getConfiguredMaxTotalStats());
        if (maxCost <= 0) {
            return 1.0;
        }
        int currentCost = this.getSingleStatCost(this.stats.getTotalStats());
        double factor = Math.max(0.0, Math.min(1.0, (double)currentCost / (double)maxCost));
        return 1.0 + strength * factor;
    }

    private double statCostVariableComponent(int simulatedTotalStats) {
        double totalStats = Math.max(0.0, (double)simulatedTotalStats);
        double knee = (double)this.getConfiguredMaxTotalStats() * 0.05;
        if (knee <= 0.0 || totalStats <= knee) {
            return totalStats * 1.25;
        }
        double kneeCost = knee * 1.25;
        double ratio = totalStats / knee;
        return kneeCost + kneeCost / 0.7 * (Math.pow(ratio, 0.7) - 1.0);
    }

    public int getSingleStatCost(int simulatedTotalStats) {
        GeneralServerConfig.DynamicGrowthConfig dynamicGrowthConfig = ConfigManager.getServerConfig().getDynamicGrowth();
        if (!dynamicGrowthConfig.isManualTpPurchasesEnabled().booleanValue()) {
            return Integer.MAX_VALUE;
        }
        double globalMult = ConfigManager.getServerConfig().getGameplay().getGlobalTpCostMultiplier();
        double raceMult = this.getRaceTpCostMultiplier();
        double totalMult = globalMult * raceMult;
        int minCost = ConfigManager.getServerConfig().getGameplay().getMinTPCost();
        int discountThreshold = ConfigManager.getServerConfig().getGameplay().getMaxTPDiscount();
        double baseCost = (double)minCost + this.statCostVariableComponent(simulatedTotalStats);
        int earlyGameDiscount = 0;
        if (simulatedTotalStats < discountThreshold) {
            earlyGameDiscount = discountThreshold - simulatedTotalStats;
        }
        int finalCost = (int)(baseCost * totalMult) - earlyGameDiscount;
        finalCost = Math.max(minCost, finalCost);
        double tpCostMultiplier = dynamicGrowthConfig.getAttributeTpCostMultiplier();
        if (tpCostMultiplier > 1.0) {
            double scaled = Math.ceil((double)finalCost * tpCostMultiplier);
            finalCost = scaled >= 2.147483647E9 ? Integer.MAX_VALUE : (int)scaled;
        }
        return finalCost;
    }

    public int calculateRecursiveCost(int statsToAdd, int maxStats) {
        if (!ConfigManager.getServerConfig().getDynamicGrowth().isManualTpPurchasesEnabled().booleanValue()) {
            return statsToAdd <= 0 ? 0 : Integer.MAX_VALUE;
        }
        int totalCost = 0;
        int currentTotalStats = this.stats.getTotalStats();
        int totalCap = this.getConfiguredMaxTotalStats();
        for (int i = 0; i < statsToAdd && currentTotalStats + i < totalCap; ++i) {
            totalCost += this.getSingleStatCost(currentTotalStats + i);
        }
        return totalCost;
    }

    public int calculateStatIncrease(int maxStatsToAdd, float availableTPs, int maxStats) {
        int costForNext;
        int statsIncreased;
        if (!ConfigManager.getServerConfig().getDynamicGrowth().isManualTpPurchasesEnabled().booleanValue()) {
            return 0;
        }
        int costAccumulated = 0;
        int currentTotalStats = this.stats.getTotalStats();
        int totalCap = this.getConfiguredMaxTotalStats();
        for (statsIncreased = 0; statsIncreased < maxStatsToAdd && currentTotalStats + statsIncreased < totalCap && !((float)(costAccumulated + (costForNext = this.getSingleStatCost(currentTotalStats + statsIncreased))) > availableTPs); ++statsIncreased) {
            costAccumulated += costForNext;
        }
        return statsIncreased;
    }

    public void resetPlayerProgress(ServerPlayer player, Integer keepPercentage, boolean keepSkills, boolean forceSaiyanTail) {
        Stats currentStats = this.getStats();
        if (keepPercentage != null) {
            int newStr = currentStats.getStrength() * keepPercentage / 100;
            int newSkp = currentStats.getStrikePower() * keepPercentage / 100;
            int newRes = currentStats.getResistance() * keepPercentage / 100;
            int newVit = currentStats.getVitality() * keepPercentage / 100;
            int newPwr = currentStats.getKiPower() * keepPercentage / 100;
            int newEne = currentStats.getEnergy() * keepPercentage / 100;
            float currentTPs = this.getResources().getTrainingPoints();
            float newTPs = currentTPs * (float)keepPercentage.intValue() / 100.0f;
            currentStats.setStrength(Math.max(0, newStr));
            currentStats.setStrikePower(Math.max(0, newSkp));
            currentStats.setResistance(Math.max(0, newRes));
            currentStats.setVitality(Math.max(0, newVit));
            currentStats.setKiPower(Math.max(0, newPwr));
            currentStats.setEnergy(Math.max(0, newEne));
            this.getResources().setTrainingPoints(newTPs);
        } else {
            currentStats.setStrength(0);
            currentStats.setStrikePower(0);
            currentStats.setResistance(0);
            currentStats.setVitality(0);
            currentStats.setKiPower(0);
            currentStats.setEnergy(0);
            this.getResources().setTrainingPoints(0.0f);
        }
        if (this.getStatus().isFused()) {
            FusionLogic.endFusion(player, this, false);
        }
        this.getCharacter().clearActiveForm((LivingEntity)player);
        this.getCharacter().clearActiveStackForm((LivingEntity)player);
        TransformStatusHandler.clearAllPersistentFormEffects(player);
        this.getStatus().reset();
        this.getResources().reset();
        this.getResources().setPendingAttributePoints(0);
        this.getResources().setPowerRelease(0);
        this.getSkills().setSkillActive("kisense", false);
        this.getPlayerQuestData().resetAll();
        this.getCharacter().clearInteractedMasters();
        this.getDynamicGrowth().clear();
        if (!keepSkills) {
            this.getSkills().removeAllSkills();
            this.getEffects().removeAllEffects();
            this.getSecondaryStatEffects().clear();
            this.getTechniques().clearAllTechniques();
        }
        this.getCooldowns().clearCooldowns();
        this.getBonusStats().clearAllStats();
        if (forceSaiyanTail) {
            this.getCharacter().setHasSaiyanTail(true);
        }
        player.m_6210_();
        player.m_21153_(20.0f);
        AttributeInstance attribute = player.m_21051_(Attributes.f_22276_);
        if (attribute != null) {
            attribute.m_22127_(StatsEvents.DMZ_HEALTH_MODIFIER_UUID);
        }
        player.m_21153_(20.0f);
    }

    public void tick() {
        this.cooldowns.tick();
    }

    public CompoundTag save() {
        CompoundTag nbt = new CompoundTag();
        nbt.m_128365_("Stats", (Tag)this.stats.save());
        nbt.m_128365_("Status", (Tag)this.status.save());
        nbt.m_128365_("Cooldowns", (Tag)this.cooldowns.save());
        nbt.m_128365_("Character", (Tag)this.character.save());
        nbt.m_128365_("Resources", (Tag)this.resources.save());
        nbt.m_128365_("Skills", (Tag)this.skills.save());
        nbt.m_128365_("Effects", (Tag)this.effects.save());
        nbt.m_128365_("SecondaryStatEffects", (Tag)this.secondaryStatEffects.save());
        nbt.m_128365_("PlayerQuestData", (Tag)this.playerQuestData.serializeNBT());
        nbt.m_128365_("BonusStats", (Tag)this.bonusStats.save());
        nbt.m_128365_("Techniques", (Tag)this.techniques.save());
        nbt.m_128365_("DynamicGrowth", (Tag)this.dynamicGrowth.save());
        nbt.m_128379_("HasInitializedHealth", this.hasInitializedHealth);
        return nbt;
    }

    public void load(CompoundTag nbt) throws ClassNotFoundException {
        if (nbt.m_128441_("Stats")) {
            this.stats.load(nbt.m_128469_("Stats"));
        }
        if (nbt.m_128441_("Status")) {
            this.status.load(nbt.m_128469_("Status"));
        }
        if (nbt.m_128441_("Cooldowns")) {
            this.cooldowns.load(nbt.m_128469_("Cooldowns"));
        }
        if (nbt.m_128441_("Character")) {
            this.character.load(nbt.m_128469_("Character"));
        }
        if (nbt.m_128441_("Resources")) {
            this.resources.load(nbt.m_128469_("Resources"));
        }
        if (nbt.m_128441_("Skills")) {
            this.skills.load(nbt.m_128469_("Skills"));
        }
        if (nbt.m_128441_("Effects")) {
            this.effects.load(nbt.m_128469_("Effects"));
        }
        if (nbt.m_128441_("SecondaryStatEffects")) {
            this.secondaryStatEffects.load(nbt.m_128469_("SecondaryStatEffects"));
        } else {
            this.secondaryStatEffects.clear();
        }
        if (!nbt.m_128441_("PlayerQuestData")) {
            throw new ClassNotFoundException("PlayerQuestData not found in NBT. This is required for quest progression to work correctly. Please update the mod or re-generate your config files.");
        }
        this.playerQuestData.deserializeNBT(nbt.m_128469_("PlayerQuestData"));
        if (nbt.m_128441_("BonusStats")) {
            this.bonusStats.load(nbt.m_128469_("BonusStats"));
        }
        if (nbt.m_128441_("Techniques")) {
            this.techniques.load(nbt.m_128469_("Techniques"));
        }
        if (nbt.m_128441_("DynamicGrowth")) {
            this.dynamicGrowth.load(nbt.m_128469_("DynamicGrowth"));
        }
        if (nbt.m_128441_("HasInitializedHealth")) {
            this.hasInitializedHealth = nbt.m_128471_("HasInitializedHealth");
        }
        if (this.character.getRaceName() != null && !this.character.getRaceName().isEmpty()) {
            this.updateTransformationSkillLimits(this.character.getRaceName());
        }
        this.isDataLoaded = true;
    }

    public void copyFrom(StatsData other) {
        this.stats.copyFrom(other.stats);
        this.status.copyFrom(other.status);
        this.cooldowns.copyFrom(other.cooldowns);
        this.character.copyFrom(other.character);
        this.resources.copyFrom(other.resources);
        this.skills.copyFrom(other.skills);
        this.effects.copyFrom(other.effects);
        this.secondaryStatEffects.copyFrom(other.secondaryStatEffects);
        this.playerQuestData.deserializeNBT(other.playerQuestData.serializeNBT());
        this.bonusStats.copyFrom(other.bonusStats);
        this.techniques.copyFrom(other.techniques);
        this.dynamicGrowth.copyFrom(other.dynamicGrowth);
        this.hasInitializedHealth = other.hasInitializedHealth;
        if (this.character.getRaceName() != null && !this.character.getRaceName().isEmpty()) {
            this.updateTransformationSkillLimits(this.character.getRaceName());
        }
        this.isDataLoaded = true;
    }

    @Generated
    public Player getPlayer() {
        return this.player;
    }

    @Generated
    public Stats getStats() {
        return this.stats;
    }

    @Generated
    public Status getStatus() {
        return this.status;
    }

    @Generated
    public Cooldowns getCooldowns() {
        return this.cooldowns;
    }

    @Generated
    public Character getCharacter() {
        return this.character;
    }

    @Generated
    public Resources getResources() {
        return this.resources;
    }

    @Generated
    public Skills getSkills() {
        return this.skills;
    }

    @Generated
    public Effects getEffects() {
        return this.effects;
    }

    @Generated
    public SecondaryStatEffects getSecondaryStatEffects() {
        return this.secondaryStatEffects;
    }

    @Generated
    public PlayerQuestData getPlayerQuestData() {
        return this.playerQuestData;
    }

    @Generated
    public BonusStats getBonusStats() {
        return this.bonusStats;
    }

    @Generated
    public Techniques getTechniques() {
        return this.techniques;
    }

    @Generated
    public DynamicGrowthData getDynamicGrowth() {
        return this.dynamicGrowth;
    }

    @Generated
    public boolean isHasInitializedHealth() {
        return this.hasInitializedHealth;
    }

    @Generated
    public boolean isDataLoaded() {
        return this.isDataLoaded;
    }
}

