/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  lombok.Generated
 *  net.minecraft.nbt.CompoundTag
 *  net.minecraft.server.level.ServerPlayer
 *  net.minecraft.world.entity.player.Player
 *  net.minecraftforge.common.MinecraftForge
 *  net.minecraftforge.eventbus.api.Event
 */
package com.dragonminez.common.stats.character;

import com.dragonminez.common.events.DMZEvent;
import com.dragonminez.common.stats.StatsData;
import com.dragonminez.server.dynamicgrowth.DynamicGrowthService;
import lombok.Generated;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.player.Player;
import net.minecraftforge.common.MinecraftForge;
import net.minecraftforge.eventbus.api.Event;

public class Resources {
    private float currentEnergy = 0.0f;
    private float currentStamina = 0.0f;
    private float currentPoise = 0.0f;
    private int release = 5;
    private int releaseLimit = 0;
    private int actionCharge = 0;
    private int alignment = 100;
    private float trainingPoints = 0.0f;
    private int pendingAttributePoints = 0;
    private int racialSkillCount = 0;
    private Player player;
    private transient StatsData statsData;

    public void reset() {
        this.currentEnergy = 0.0f;
        this.currentStamina = 0.0f;
        this.currentPoise = 0.0f;
        this.release = 5;
        this.releaseLimit = 0;
        this.actionCharge = 0;
        this.alignment = 100;
        this.racialSkillCount = 0;
    }

    private static float roundToQuarter(float value) {
        return (float)Math.round(value * 4.0f) / 4.0f;
    }

    private static float truncateToInt(float value) {
        return (float)Math.floor(value);
    }

    public int getPowerRelease() {
        return this.release;
    }

    public void setCurrentEnergy(float energy) {
        if (energy <= 1.0f) {
            this.setPowerRelease(0);
        }
        this.currentEnergy = Resources.roundToQuarter(Math.min(Math.max(0.0f, energy), this.statsData.getMaxEnergy()));
    }

    public void setCurrentStamina(float stamina) {
        float max = Math.max(0.0f, this.statsData.getMaxStamina());
        this.currentStamina = Resources.roundToQuarter(Math.min(Math.max(0.0f, stamina), max));
    }

    public void setCurrentPoise(float poise) {
        this.currentPoise = Resources.roundToQuarter(Math.min(Math.max(0.0f, poise), this.statsData.getMaxPoise()));
    }

    public void setPowerRelease(int release) {
        this.release = Math.max(0, release);
    }

    public void setReleaseLimit(int releaseLimit) {
        this.releaseLimit = Math.max(0, releaseLimit);
    }

    public void setActionCharge(int actionCharge) {
        this.actionCharge = Math.max(0, Math.min(100, actionCharge));
    }

    public void setAlignment(int alignment) {
        if (this.statsData != null && this.statsData.getEffects().hasEffect("majin")) {
            this.alignment = 0;
            return;
        }
        this.alignment = Math.max(0, Math.min(100, alignment));
    }

    public void setTrainingPoints(float points) {
        float clamped = Math.max(0.0f, Math.min(Float.MAX_VALUE, points));
        this.trainingPoints = Resources.truncateToInt(clamped);
    }

    public void setPendingAttributePoints(int points) {
        this.pendingAttributePoints = Math.max(0, points);
    }

    public void addPendingAttributePoints(int amount) {
        this.setPendingAttributePoints(this.pendingAttributePoints + amount);
    }

    public void removePendingAttributePoints(int amount) {
        this.setPendingAttributePoints(this.pendingAttributePoints - amount);
    }

    public void setRacialSkillCount(int count) {
        this.racialSkillCount = Math.max(0, count);
    }

    public void addEnergy(float amount) {
        this.setCurrentEnergy(this.currentEnergy + amount);
    }

    public void addStamina(float amount) {
        this.setCurrentStamina(this.currentStamina + amount);
    }

    public void addPoise(float amount) {
        this.setCurrentPoise(this.currentPoise + amount);
    }

    public void addAlignment(int amount) {
        this.setAlignment(this.alignment + amount);
    }

    public void addTrainingPoints(float amount) {
        this.addTrainingPoints(amount, true);
    }

    public void addTrainingPoints(float amount, boolean shareWithParty) {
        if (amount <= 0.0f || this.player == null) {
            this.setTrainingPoints(this.trainingPoints + amount);
            return;
        }
        float oldValue = this.trainingPoints;
        DMZEvent.TPGainEvent event = new DMZEvent.TPGainEvent(this.player, (int)oldValue, (int)amount, shareWithParty);
        if (!MinecraftForge.EVENT_BUS.post((Event)event)) {
            this.setTrainingPoints(oldValue + (float)event.getTpGain());
        }
    }

    public void addRacialSkillCount(int amount) {
        this.setRacialSkillCount(this.racialSkillCount + amount);
    }

    public void removeEnergy(float amount) {
        float before = this.currentEnergy;
        this.setCurrentEnergy(this.currentEnergy - amount);
        this.awardDynamicGrowthEnergy(before - this.currentEnergy);
    }

    public void removeStamina(float amount) {
        float before = this.currentStamina;
        this.setCurrentStamina(this.currentStamina - amount);
        this.awardDynamicGrowthStamina(before - this.currentStamina);
    }

    private void awardDynamicGrowthStamina(float spent) {
        Player player;
        if (spent > 0.0f && this.statsData != null && (player = this.player) instanceof ServerPlayer) {
            ServerPlayer serverPlayer = (ServerPlayer)player;
            DynamicGrowthService.awardStaminaSpent(serverPlayer, this.statsData, spent);
        }
    }

    private void awardDynamicGrowthEnergy(float spent) {
        Player player;
        if (spent > 0.0f && this.statsData != null && (player = this.player) instanceof ServerPlayer) {
            ServerPlayer serverPlayer = (ServerPlayer)player;
            DynamicGrowthService.awardEnergySpent(serverPlayer, this.statsData, spent);
        }
    }

    public void removePoise(float amount) {
        this.setCurrentPoise(this.currentPoise - amount);
    }

    public void removeAlignment(int amount) {
        this.setAlignment(this.alignment - amount);
    }

    public void removeTrainingPoints(float amount) {
        this.setTrainingPoints(this.trainingPoints - amount);
    }

    public CompoundTag save() {
        CompoundTag tag = new CompoundTag();
        tag.m_128350_("CurrentEnergy", this.currentEnergy);
        tag.m_128350_("CurrentStamina", this.currentStamina);
        tag.m_128350_("CurrentPoise", this.currentPoise);
        tag.m_128405_("Release", this.release);
        tag.m_128405_("ReleaseLimit", this.releaseLimit);
        tag.m_128405_("FormRelease", this.actionCharge);
        tag.m_128405_("Alignment", this.alignment);
        tag.m_128350_("TrainingPointsF", this.trainingPoints);
        tag.m_128405_("PendingAttributePoints", this.pendingAttributePoints);
        tag.m_128405_("ZenkaiCount", this.racialSkillCount);
        return tag;
    }

    public void load(CompoundTag tag) {
        this.currentEnergy = tag.m_128425_("CurrentEnergy", 5) ? tag.m_128457_("CurrentEnergy") : (float)tag.m_128451_("CurrentEnergy");
        this.currentStamina = tag.m_128425_("CurrentStamina", 5) ? tag.m_128457_("CurrentStamina") : (float)tag.m_128451_("CurrentStamina");
        this.currentPoise = tag.m_128425_("CurrentPoise", 5) ? tag.m_128457_("CurrentPoise") : (float)tag.m_128451_("CurrentPoise");
        this.release = tag.m_128451_("Release");
        this.releaseLimit = tag.m_128451_("ReleaseLimit");
        this.actionCharge = tag.m_128451_("FormRelease");
        this.alignment = tag.m_128451_("Alignment");
        this.trainingPoints = tag.m_128425_("TrainingPointsF", 5) ? tag.m_128457_("TrainingPointsF") : (float)tag.m_128451_("TrainingPoints");
        this.pendingAttributePoints = tag.m_128451_("PendingAttributePoints");
        this.racialSkillCount = tag.m_128451_("ZenkaiCount");
    }

    public void copyFrom(Resources other) {
        this.currentEnergy = other.currentEnergy;
        this.currentStamina = other.currentStamina;
        this.currentPoise = other.currentPoise;
        this.release = other.release;
        this.releaseLimit = other.releaseLimit;
        this.actionCharge = other.actionCharge;
        this.alignment = other.alignment;
        this.trainingPoints = other.trainingPoints;
        this.pendingAttributePoints = other.pendingAttributePoints;
        this.racialSkillCount = other.racialSkillCount;
    }

    @Generated
    public float getCurrentEnergy() {
        return this.currentEnergy;
    }

    @Generated
    public float getCurrentStamina() {
        return this.currentStamina;
    }

    @Generated
    public float getCurrentPoise() {
        return this.currentPoise;
    }

    @Generated
    public int getRelease() {
        return this.release;
    }

    @Generated
    public int getReleaseLimit() {
        return this.releaseLimit;
    }

    @Generated
    public int getActionCharge() {
        return this.actionCharge;
    }

    @Generated
    public int getAlignment() {
        return this.alignment;
    }

    @Generated
    public float getTrainingPoints() {
        return this.trainingPoints;
    }

    @Generated
    public int getPendingAttributePoints() {
        return this.pendingAttributePoints;
    }

    @Generated
    public int getRacialSkillCount() {
        return this.racialSkillCount;
    }

    @Generated
    public Player getPlayer() {
        return this.player;
    }

    @Generated
    public StatsData getStatsData() {
        return this.statsData;
    }

    @Generated
    public void setRelease(int release) {
        this.release = release;
    }

    @Generated
    public void setPlayer(Player player) {
        this.player = player;
    }

    @Generated
    public void setStatsData(StatsData statsData) {
        this.statsData = statsData;
    }
}

