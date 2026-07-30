/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  lombok.Generated
 *  net.minecraft.nbt.CompoundTag
 *  net.minecraft.nbt.ListTag
 *  net.minecraft.nbt.StringTag
 *  net.minecraft.nbt.Tag
 *  net.minecraft.resources.ResourceLocation
 */
package com.dragonminez.common.stats.character;

import com.dragonminez.common.config.ConfigManager;
import com.dragonminez.common.stats.extras.ActionMode;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import lombok.Generated;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.ListTag;
import net.minecraft.nbt.StringTag;
import net.minecraft.nbt.Tag;
import net.minecraft.resources.ResourceLocation;

public class Status {
    public static final int FLIGHT_SEARCH = 0;
    public static final int FLIGHT_COMBAT = 1;
    private boolean isAlive = true;
    private boolean forceHalo = false;
    private boolean isHasCreatedCharacter = false;
    private boolean isAuraActive = false;
    private boolean isActionCharging = false;
    private boolean isTailVisible = true;
    private boolean isDescending = false;
    private boolean isInKaioPlanet = false;
    private boolean isChargingKi = false;
    private boolean isBlocking = false;
    private long lastBlockTime = 0L;
    private long lastHurtTime = 0L;
    private boolean friendlyFistEnabled = false;
    private boolean stunEffect = false;
    private boolean isKnockedDown = false;
    private ActionMode selectedAction = ActionMode.FORM;
    private String kiWeaponType = "blade";
    private int drainingTargetId = -1;
    private boolean isFused = false;
    private boolean isFusionLeader = false;
    private UUID fusionPartnerUUID = null;
    private int fusionTimer = 0;
    private String fusionType = "";
    private String fusionName = "";
    private boolean fusionPartyManaged = false;
    private UUID fusionPrevPartyId = null;
    private boolean fusionPrevPartyLeader = false;
    private int potaraPoseTimer = 0;
    private UUID potaraPartnerUUID = null;
    private boolean potaraLeader = false;
    private CompoundTag originalAppearance = new CompoundTag();
    private boolean androidUpgraded = false;
    private boolean renderKatana = false;
    private String backWeapon = "";
    private String scouterItem = "";
    private String pothalaColor = "";
    private boolean isPermanentAura = false;
    private boolean isStrikeLocked = false;
    private int flightMode = 0;
    private final Set<String> visitedDimensions = new LinkedHashSet<String>();
    private UUID activeShadowDummyUUID = null;
    private int shadowDummyPercent = 0;
    private int shadowDummyKillCount = 0;

    public void reset() {
        this.isAlive = true;
        this.forceHalo = false;
        this.isHasCreatedCharacter = false;
        this.isAuraActive = false;
        this.isActionCharging = false;
        this.isTailVisible = true;
        this.isDescending = false;
        this.isInKaioPlanet = false;
        this.isChargingKi = false;
        this.isBlocking = false;
        this.lastBlockTime = 0L;
        this.lastHurtTime = 0L;
        this.friendlyFistEnabled = false;
        this.stunEffect = false;
        this.isKnockedDown = false;
        this.selectedAction = ActionMode.FORM;
        this.kiWeaponType = "blade";
        this.drainingTargetId = -1;
        this.isFused = false;
        this.isFusionLeader = false;
        this.fusionPartnerUUID = null;
        this.fusionTimer = 0;
        this.fusionType = "";
        this.fusionName = "";
        this.fusionPartyManaged = false;
        this.fusionPrevPartyId = null;
        this.fusionPrevPartyLeader = false;
        this.potaraPoseTimer = 0;
        this.potaraPartnerUUID = null;
        this.potaraLeader = false;
        this.originalAppearance = new CompoundTag();
        this.androidUpgraded = false;
        this.renderKatana = false;
        this.backWeapon = "";
        this.scouterItem = "";
        this.pothalaColor = "";
        this.isPermanentAura = false;
        this.isStrikeLocked = false;
        this.flightMode = 0;
        this.visitedDimensions.clear();
        this.activeShadowDummyUUID = null;
        this.shadowDummyPercent = 0;
        this.shadowDummyKillCount = 0;
    }

    public boolean isStunned() {
        return this.stunEffect || this.isKnockedDown || this.isStrikeLocked;
    }

    public void validateKiWeaponType() {
        List<String> types = ConfigManager.getCombatConfig().getKiWeaponTypes();
        if (types.isEmpty()) {
            return;
        }
        if (this.kiWeaponType == null || !types.contains(this.kiWeaponType.toLowerCase())) {
            this.kiWeaponType = types.get(0);
        }
    }

    public boolean hasActiveShadowDummy() {
        return this.activeShadowDummyUUID != null;
    }

    public void markVisitedDimension(String dimensionId) {
        if (dimensionId == null || dimensionId.isBlank() || ResourceLocation.m_135820_((String)dimensionId) == null) {
            return;
        }
        this.visitedDimensions.add(dimensionId);
    }

    public boolean hasVisitedDimension(String dimensionId) {
        return dimensionId != null && this.visitedDimensions.contains(dimensionId);
    }

    public CompoundTag save() {
        CompoundTag tag = new CompoundTag();
        tag.m_128379_("IsAlive", this.isAlive);
        tag.m_128379_("ForceHalo", this.forceHalo);
        tag.m_128379_("HasCreatedChar", this.isHasCreatedCharacter);
        tag.m_128379_("AuraActive", this.isAuraActive);
        tag.m_128379_("Transforming", this.isActionCharging);
        tag.m_128379_("TailVisible", this.isTailVisible);
        tag.m_128379_("Descending", this.isDescending);
        tag.m_128379_("InKaioPlanet", this.isInKaioPlanet);
        tag.m_128379_("IsChargingKi", this.isChargingKi);
        tag.m_128379_("IsBlocking", this.isBlocking);
        tag.m_128356_("LastBlockTime", this.lastBlockTime);
        tag.m_128356_("LastHurtTime", this.lastHurtTime);
        tag.m_128379_("FriendlyFistEnabled", this.friendlyFistEnabled);
        tag.m_128379_("IsStunned", this.stunEffect);
        tag.m_128379_("IsKnockedDown", this.isKnockedDown);
        tag.m_128405_("SelectedAction", this.selectedAction.ordinal());
        tag.m_128359_("KiWeaponType", this.kiWeaponType);
        tag.m_128405_("DrainingTargetId", this.drainingTargetId);
        tag.m_128379_("IsFused", this.isFused);
        tag.m_128379_("IsFusionLeader", this.isFusionLeader);
        if (this.fusionPartnerUUID != null) {
            tag.m_128362_("FusionPartnerUUID", this.fusionPartnerUUID);
        }
        tag.m_128405_("FusionTimer", this.fusionTimer);
        tag.m_128359_("FusionType", this.fusionType);
        tag.m_128359_("FusionName", this.fusionName);
        tag.m_128379_("FusionPartyManaged", this.fusionPartyManaged);
        if (this.fusionPrevPartyId != null) {
            tag.m_128362_("FusionPrevPartyId", this.fusionPrevPartyId);
        }
        tag.m_128379_("FusionPrevPartyLeader", this.fusionPrevPartyLeader);
        tag.m_128405_("PotaraPoseTimer", this.potaraPoseTimer);
        if (this.potaraPartnerUUID != null) {
            tag.m_128362_("PotaraPartnerUUID", this.potaraPartnerUUID);
        }
        tag.m_128379_("PotaraLeader", this.potaraLeader);
        tag.m_128365_("OriginalAppearance", (Tag)this.originalAppearance);
        tag.m_128379_("AndroidUpgraded", this.androidUpgraded);
        tag.m_128379_("RenderKatana", this.renderKatana);
        tag.m_128359_("BackWeapon", this.backWeapon);
        tag.m_128359_("ScouterItem", this.scouterItem);
        tag.m_128359_("PothalaColor", this.pothalaColor);
        tag.m_128379_("IsPermanentAura", this.isPermanentAura);
        tag.m_128379_("IsStrikeLocked", this.isStrikeLocked);
        tag.m_128405_("FlightMode", this.flightMode);
        ListTag visitedDimensionsTag = new ListTag();
        for (String dimensionId : this.visitedDimensions) {
            visitedDimensionsTag.add((Object)StringTag.m_129297_((String)dimensionId));
        }
        tag.m_128365_("VisitedDimensions", (Tag)visitedDimensionsTag);
        if (this.activeShadowDummyUUID != null) {
            tag.m_128362_("ActiveShadowDummyUUID", this.activeShadowDummyUUID);
        }
        tag.m_128405_("ShadowDummyPercent", this.shadowDummyPercent);
        tag.m_128405_("ShadowDummyKillCount", this.shadowDummyKillCount);
        return tag;
    }

    public void load(CompoundTag tag) {
        this.isAlive = tag.m_128471_("IsAlive");
        this.forceHalo = tag.m_128471_("ForceHalo");
        this.isHasCreatedCharacter = tag.m_128471_("HasCreatedChar");
        this.isAuraActive = tag.m_128471_("AuraActive");
        this.isActionCharging = tag.m_128471_("Transforming");
        this.isTailVisible = tag.m_128471_("TailVisible");
        this.isDescending = tag.m_128471_("Descending");
        this.isInKaioPlanet = tag.m_128471_("InKaioPlanet");
        this.isChargingKi = tag.m_128471_("IsChargingKi");
        this.isBlocking = tag.m_128471_("IsBlocking");
        this.lastBlockTime = tag.m_128454_("LastBlockTime");
        this.lastHurtTime = tag.m_128454_("LastHurtTime");
        this.friendlyFistEnabled = tag.m_128471_("FriendlyFistEnabled");
        this.stunEffect = tag.m_128471_("IsStunned");
        this.isKnockedDown = tag.m_128471_("IsKnockedDown");
        this.selectedAction = tag.m_128441_("SelectedAction") ? ActionMode.values()[tag.m_128451_("SelectedAction")] : ActionMode.FORM;
        this.kiWeaponType = tag.m_128461_("KiWeaponType");
        this.drainingTargetId = tag.m_128451_("DrainingTargetId");
        this.isFused = tag.m_128471_("IsFused");
        this.isFusionLeader = tag.m_128471_("IsFusionLeader");
        this.fusionPartnerUUID = tag.m_128403_("FusionPartnerUUID") ? tag.m_128342_("FusionPartnerUUID") : null;
        this.fusionTimer = tag.m_128451_("FusionTimer");
        this.fusionType = tag.m_128461_("FusionType");
        this.fusionName = tag.m_128461_("FusionName");
        this.fusionPartyManaged = tag.m_128471_("FusionPartyManaged");
        this.fusionPrevPartyId = tag.m_128403_("FusionPrevPartyId") ? tag.m_128342_("FusionPrevPartyId") : null;
        this.fusionPrevPartyLeader = tag.m_128471_("FusionPrevPartyLeader");
        this.potaraPoseTimer = tag.m_128451_("PotaraPoseTimer");
        this.potaraPartnerUUID = tag.m_128403_("PotaraPartnerUUID") ? tag.m_128342_("PotaraPartnerUUID") : null;
        this.potaraLeader = tag.m_128471_("PotaraLeader");
        this.originalAppearance = tag.m_128441_("OriginalAppearance") ? tag.m_128469_("OriginalAppearance") : new CompoundTag();
        this.androidUpgraded = tag.m_128471_("AndroidUpgraded");
        this.renderKatana = tag.m_128471_("RenderKatana");
        this.backWeapon = tag.m_128461_("BackWeapon");
        this.scouterItem = tag.m_128461_("ScouterItem");
        this.pothalaColor = tag.m_128461_("PothalaColor");
        this.isPermanentAura = tag.m_128471_("IsPermanentAura");
        this.isStrikeLocked = tag.m_128471_("IsStrikeLocked");
        this.flightMode = tag.m_128451_("FlightMode");
        this.visitedDimensions.clear();
        if (tag.m_128425_("VisitedDimensions", 9)) {
            ListTag visitedDimensionsTag = tag.m_128437_("VisitedDimensions", 8);
            for (Tag dimensionTag : visitedDimensionsTag) {
                this.markVisitedDimension(dimensionTag.m_7916_());
            }
        }
        this.activeShadowDummyUUID = tag.m_128403_("ActiveShadowDummyUUID") ? tag.m_128342_("ActiveShadowDummyUUID") : null;
        this.shadowDummyPercent = tag.m_128451_("ShadowDummyPercent");
        this.shadowDummyKillCount = tag.m_128441_("ShadowDummyKillCount") ? tag.m_128451_("ShadowDummyKillCount") : 0;
    }

    public void copyFrom(Status other) {
        this.isAlive = other.isAlive;
        this.forceHalo = other.forceHalo;
        this.isHasCreatedCharacter = other.isHasCreatedCharacter;
        this.isAuraActive = other.isAuraActive;
        this.isActionCharging = other.isActionCharging;
        this.isTailVisible = other.isTailVisible;
        this.isDescending = other.isDescending;
        this.isInKaioPlanet = other.isInKaioPlanet;
        this.isChargingKi = other.isChargingKi;
        this.isBlocking = other.isBlocking;
        this.lastBlockTime = other.lastBlockTime;
        this.lastHurtTime = other.lastHurtTime;
        this.friendlyFistEnabled = other.friendlyFistEnabled;
        this.stunEffect = other.stunEffect;
        this.isKnockedDown = other.isKnockedDown;
        this.selectedAction = other.selectedAction;
        this.kiWeaponType = other.kiWeaponType;
        this.drainingTargetId = other.drainingTargetId;
        this.isFused = other.isFused;
        this.isFusionLeader = other.isFusionLeader;
        this.fusionPartnerUUID = other.fusionPartnerUUID;
        this.fusionTimer = other.fusionTimer;
        this.fusionType = other.fusionType;
        this.fusionName = other.fusionName;
        this.fusionPartyManaged = other.fusionPartyManaged;
        this.fusionPrevPartyId = other.fusionPrevPartyId;
        this.fusionPrevPartyLeader = other.fusionPrevPartyLeader;
        this.potaraPoseTimer = other.potaraPoseTimer;
        this.potaraPartnerUUID = other.potaraPartnerUUID;
        this.potaraLeader = other.potaraLeader;
        this.originalAppearance = other.originalAppearance.m_6426_();
        this.androidUpgraded = other.androidUpgraded;
        this.renderKatana = other.renderKatana;
        this.backWeapon = other.backWeapon;
        this.pothalaColor = other.pothalaColor;
        this.scouterItem = other.scouterItem;
        this.isPermanentAura = other.isPermanentAura;
        this.isStrikeLocked = other.isStrikeLocked;
        this.flightMode = other.flightMode;
        this.visitedDimensions.clear();
        this.visitedDimensions.addAll(other.visitedDimensions);
        this.activeShadowDummyUUID = other.activeShadowDummyUUID;
        this.shadowDummyPercent = other.shadowDummyPercent;
        this.shadowDummyKillCount = other.shadowDummyKillCount;
    }

    @Generated
    public boolean isAlive() {
        return this.isAlive;
    }

    @Generated
    public boolean isForceHalo() {
        return this.forceHalo;
    }

    @Generated
    public boolean isHasCreatedCharacter() {
        return this.isHasCreatedCharacter;
    }

    @Generated
    public boolean isAuraActive() {
        return this.isAuraActive;
    }

    @Generated
    public boolean isActionCharging() {
        return this.isActionCharging;
    }

    @Generated
    public boolean isTailVisible() {
        return this.isTailVisible;
    }

    @Generated
    public boolean isDescending() {
        return this.isDescending;
    }

    @Generated
    public boolean isInKaioPlanet() {
        return this.isInKaioPlanet;
    }

    @Generated
    public boolean isChargingKi() {
        return this.isChargingKi;
    }

    @Generated
    public boolean isBlocking() {
        return this.isBlocking;
    }

    @Generated
    public long getLastBlockTime() {
        return this.lastBlockTime;
    }

    @Generated
    public long getLastHurtTime() {
        return this.lastHurtTime;
    }

    @Generated
    public boolean isFriendlyFistEnabled() {
        return this.friendlyFistEnabled;
    }

    @Generated
    public boolean isStunEffect() {
        return this.stunEffect;
    }

    @Generated
    public boolean isKnockedDown() {
        return this.isKnockedDown;
    }

    @Generated
    public ActionMode getSelectedAction() {
        return this.selectedAction;
    }

    @Generated
    public String getKiWeaponType() {
        return this.kiWeaponType;
    }

    @Generated
    public int getDrainingTargetId() {
        return this.drainingTargetId;
    }

    @Generated
    public boolean isFused() {
        return this.isFused;
    }

    @Generated
    public boolean isFusionLeader() {
        return this.isFusionLeader;
    }

    @Generated
    public UUID getFusionPartnerUUID() {
        return this.fusionPartnerUUID;
    }

    @Generated
    public int getFusionTimer() {
        return this.fusionTimer;
    }

    @Generated
    public String getFusionType() {
        return this.fusionType;
    }

    @Generated
    public String getFusionName() {
        return this.fusionName;
    }

    @Generated
    public boolean isFusionPartyManaged() {
        return this.fusionPartyManaged;
    }

    @Generated
    public UUID getFusionPrevPartyId() {
        return this.fusionPrevPartyId;
    }

    @Generated
    public boolean isFusionPrevPartyLeader() {
        return this.fusionPrevPartyLeader;
    }

    @Generated
    public int getPotaraPoseTimer() {
        return this.potaraPoseTimer;
    }

    @Generated
    public UUID getPotaraPartnerUUID() {
        return this.potaraPartnerUUID;
    }

    @Generated
    public boolean isPotaraLeader() {
        return this.potaraLeader;
    }

    @Generated
    public CompoundTag getOriginalAppearance() {
        return this.originalAppearance;
    }

    @Generated
    public boolean isAndroidUpgraded() {
        return this.androidUpgraded;
    }

    @Generated
    public boolean isRenderKatana() {
        return this.renderKatana;
    }

    @Generated
    public String getBackWeapon() {
        return this.backWeapon;
    }

    @Generated
    public String getScouterItem() {
        return this.scouterItem;
    }

    @Generated
    public String getPothalaColor() {
        return this.pothalaColor;
    }

    @Generated
    public boolean isPermanentAura() {
        return this.isPermanentAura;
    }

    @Generated
    public boolean isStrikeLocked() {
        return this.isStrikeLocked;
    }

    @Generated
    public int getFlightMode() {
        return this.flightMode;
    }

    @Generated
    public Set<String> getVisitedDimensions() {
        return this.visitedDimensions;
    }

    @Generated
    public UUID getActiveShadowDummyUUID() {
        return this.activeShadowDummyUUID;
    }

    @Generated
    public int getShadowDummyPercent() {
        return this.shadowDummyPercent;
    }

    @Generated
    public int getShadowDummyKillCount() {
        return this.shadowDummyKillCount;
    }

    @Generated
    public void setAlive(boolean isAlive) {
        this.isAlive = isAlive;
    }

    @Generated
    public void setForceHalo(boolean forceHalo) {
        this.forceHalo = forceHalo;
    }

    @Generated
    public void setHasCreatedCharacter(boolean isHasCreatedCharacter) {
        this.isHasCreatedCharacter = isHasCreatedCharacter;
    }

    @Generated
    public void setAuraActive(boolean isAuraActive) {
        this.isAuraActive = isAuraActive;
    }

    @Generated
    public void setActionCharging(boolean isActionCharging) {
        this.isActionCharging = isActionCharging;
    }

    @Generated
    public void setTailVisible(boolean isTailVisible) {
        this.isTailVisible = isTailVisible;
    }

    @Generated
    public void setDescending(boolean isDescending) {
        this.isDescending = isDescending;
    }

    @Generated
    public void setInKaioPlanet(boolean isInKaioPlanet) {
        this.isInKaioPlanet = isInKaioPlanet;
    }

    @Generated
    public void setChargingKi(boolean isChargingKi) {
        this.isChargingKi = isChargingKi;
    }

    @Generated
    public void setBlocking(boolean isBlocking) {
        this.isBlocking = isBlocking;
    }

    @Generated
    public void setLastBlockTime(long lastBlockTime) {
        this.lastBlockTime = lastBlockTime;
    }

    @Generated
    public void setLastHurtTime(long lastHurtTime) {
        this.lastHurtTime = lastHurtTime;
    }

    @Generated
    public void setFriendlyFistEnabled(boolean friendlyFistEnabled) {
        this.friendlyFistEnabled = friendlyFistEnabled;
    }

    @Generated
    public void setStunEffect(boolean stunEffect) {
        this.stunEffect = stunEffect;
    }

    @Generated
    public void setKnockedDown(boolean isKnockedDown) {
        this.isKnockedDown = isKnockedDown;
    }

    @Generated
    public void setSelectedAction(ActionMode selectedAction) {
        this.selectedAction = selectedAction;
    }

    @Generated
    public void setKiWeaponType(String kiWeaponType) {
        this.kiWeaponType = kiWeaponType;
    }

    @Generated
    public void setDrainingTargetId(int drainingTargetId) {
        this.drainingTargetId = drainingTargetId;
    }

    @Generated
    public void setFused(boolean isFused) {
        this.isFused = isFused;
    }

    @Generated
    public void setFusionLeader(boolean isFusionLeader) {
        this.isFusionLeader = isFusionLeader;
    }

    @Generated
    public void setFusionPartnerUUID(UUID fusionPartnerUUID) {
        this.fusionPartnerUUID = fusionPartnerUUID;
    }

    @Generated
    public void setFusionTimer(int fusionTimer) {
        this.fusionTimer = fusionTimer;
    }

    @Generated
    public void setFusionType(String fusionType) {
        this.fusionType = fusionType;
    }

    @Generated
    public void setFusionName(String fusionName) {
        this.fusionName = fusionName;
    }

    @Generated
    public void setFusionPartyManaged(boolean fusionPartyManaged) {
        this.fusionPartyManaged = fusionPartyManaged;
    }

    @Generated
    public void setFusionPrevPartyId(UUID fusionPrevPartyId) {
        this.fusionPrevPartyId = fusionPrevPartyId;
    }

    @Generated
    public void setFusionPrevPartyLeader(boolean fusionPrevPartyLeader) {
        this.fusionPrevPartyLeader = fusionPrevPartyLeader;
    }

    @Generated
    public void setPotaraPoseTimer(int potaraPoseTimer) {
        this.potaraPoseTimer = potaraPoseTimer;
    }

    @Generated
    public void setPotaraPartnerUUID(UUID potaraPartnerUUID) {
        this.potaraPartnerUUID = potaraPartnerUUID;
    }

    @Generated
    public void setPotaraLeader(boolean potaraLeader) {
        this.potaraLeader = potaraLeader;
    }

    @Generated
    public void setOriginalAppearance(CompoundTag originalAppearance) {
        this.originalAppearance = originalAppearance;
    }

    @Generated
    public void setAndroidUpgraded(boolean androidUpgraded) {
        this.androidUpgraded = androidUpgraded;
    }

    @Generated
    public void setRenderKatana(boolean renderKatana) {
        this.renderKatana = renderKatana;
    }

    @Generated
    public void setBackWeapon(String backWeapon) {
        this.backWeapon = backWeapon;
    }

    @Generated
    public void setScouterItem(String scouterItem) {
        this.scouterItem = scouterItem;
    }

    @Generated
    public void setPothalaColor(String pothalaColor) {
        this.pothalaColor = pothalaColor;
    }

    @Generated
    public void setPermanentAura(boolean isPermanentAura) {
        this.isPermanentAura = isPermanentAura;
    }

    @Generated
    public void setStrikeLocked(boolean isStrikeLocked) {
        this.isStrikeLocked = isStrikeLocked;
    }

    @Generated
    public void setFlightMode(int flightMode) {
        this.flightMode = flightMode;
    }

    @Generated
    public void setActiveShadowDummyUUID(UUID activeShadowDummyUUID) {
        this.activeShadowDummyUUID = activeShadowDummyUUID;
    }

    @Generated
    public void setShadowDummyPercent(int shadowDummyPercent) {
        this.shadowDummyPercent = shadowDummyPercent;
    }

    @Generated
    public void setShadowDummyKillCount(int shadowDummyKillCount) {
        this.shadowDummyKillCount = shadowDummyKillCount;
    }
}

