/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  net.minecraft.server.level.ServerPlayer
 *  net.minecraft.world.entity.Entity
 *  net.minecraft.world.entity.LivingEntity
 *  net.minecraft.world.entity.ai.attributes.AttributeInstance
 *  net.minecraft.world.entity.ai.attributes.AttributeModifier
 *  net.minecraft.world.entity.ai.attributes.AttributeModifier$Operation
 *  net.minecraft.world.entity.ai.attributes.Attributes
 *  net.minecraft.world.entity.player.Player
 *  net.minecraft.world.item.ItemStack
 *  net.minecraft.world.phys.AABB
 *  top.theillusivec4.curios.api.CuriosApi
 *  top.theillusivec4.curios.api.type.inventory.ICurioStacksHandler
 */
package com.dragonminez.server.util;

import com.dragonminez.common.compat.WorldGuardCompat;
import com.dragonminez.common.config.ConfigManager;
import com.dragonminez.common.config.GeneralServerConfig;
import com.dragonminez.common.init.entities.AllMastersEntity;
import com.dragonminez.common.init.item.WeightItem;
import com.dragonminez.common.quest.QuestUnlocks;
import com.dragonminez.common.stats.StatsCapability;
import com.dragonminez.common.stats.StatsData;
import com.dragonminez.common.stats.StatsProvider;
import com.dragonminez.server.util.GravityDeviceManager;
import com.dragonminez.server.world.dimension.HTCDimension;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.attributes.AttributeInstance;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.phys.AABB;
import top.theillusivec4.curios.api.CuriosApi;
import top.theillusivec4.curios.api.type.inventory.ICurioStacksHandler;

public class GravityLogic {
    public static final UUID GRAVITY_SPEED_UUID = UUID.fromString("019c3047-cd2f-7af4-a3cd-5bca51dd3588");
    private static final UUID GRAVITY_ATTACK_SPEED_UUID = UUID.fromString("019c3047-4e91-74e1-ac87-d4ea8e463688");
    private static final Map<UUID, Double> NPC_GRAVITY_CACHE = new HashMap<UUID, Double>();
    private static final Map<UUID, Long> NPC_GRAVITY_TICK = new HashMap<UUID, Long>();
    private static final Map<UUID, String> NPC_GRAVITY_DIM = new HashMap<UUID, String>();

    private static GeneralServerConfig.GravityConfig cfg() {
        return ConfigManager.getServerConfig().getGravity();
    }

    public static double getGravityMultiplier(Player player) {
        return GravityLogic.computeGravity(player, true);
    }

    public static double getTrainingGravityMultiplier(Player player) {
        boolean htc = player.m_9236_().m_46472_().equals(HTCDimension.HTC_KEY);
        return GravityLogic.computeGravity(player, !htc);
    }

    private static double computeGravity(Player player, boolean includeDimension) {
        double npcGravity;
        GeneralServerConfig.GravityConfig config = GravityLogic.cfg();
        if (!config.isEnabled().booleanValue()) {
            return 1.0;
        }
        String dimId = player.m_9236_().m_46472_().m_135782_().toString();
        double ambient = includeDimension ? config.getWorldGravity(dimId) : config.getDefaultWorldGravity();
        double wgGravity = WorldGuardCompat.getGravity(player.m_9236_(), player.m_20183_(), (Entity)player);
        if (wgGravity > ambient) {
            ambient = wgGravity;
        }
        if ((npcGravity = GravityLogic.getNpcGravity(player)) > ambient) {
            ambient = npcGravity;
        }
        double machineExtra = Math.max(0.0, GravityLogic.getMachineGravity(player) - 1.0);
        return Math.max(0.0, ambient + machineExtra);
    }

    private static double avgEffectiveStats(StatsData data) {
        return ((double)data.getStats().getStrength() * data.getTotalMultiplier("STR") + (double)data.getStats().getStrikePower() * data.getTotalMultiplier("SKP") + (double)data.getStats().getResistance() * data.getTotalMultiplier("RES") + (double)data.getStats().getVitality() * data.getTotalMultiplier("VIT") + (double)data.getStats().getKiPower() * data.getTotalMultiplier("PWR") + (double)data.getStats().getEnergy() * data.getTotalMultiplier("ENE")) / 6.0;
    }

    private static double getResistance(Player player) {
        GeneralServerConfig.GravityConfig config = GravityLogic.cfg();
        return StatsProvider.get(StatsCapability.INSTANCE, (Entity)player).map(data -> {
            int maxStats = ConfigManager.getServerConfig().getGameplay().getMaxValue();
            double div = Math.max(1.0, (double)maxStats * config.getResistanceStatDivisorRatio());
            return GravityLogic.avgEffectiveStats(data) / div * config.getResistanceScale();
        }).orElse(0.0);
    }

    public static double getGravityRoomReliefFraction(Player player) {
        double falloff;
        double base;
        if (GravityLogic.getMachineGravity(player) <= 1.0) {
            return 0.0;
        }
        GeneralServerConfig.GravityConfig config = GravityLogic.cfg();
        if (QuestUnlocks.isCompleted(player, "bulma_gravity_mk3")) {
            base = config.getGravityRoomMk3Relief();
            falloff = config.getGravityRoomMk3Falloff();
        } else if (QuestUnlocks.isCompleted(player, "bulma_gravity_mk2")) {
            base = config.getGravityRoomMk2Relief();
            falloff = config.getGravityRoomMk2Falloff();
        } else {
            return 0.0;
        }
        if (base <= 0.0) {
            return 0.0;
        }
        double powerNorm = StatsProvider.get(StatsCapability.INSTANCE, (Entity)player).map(data -> {
            double div = Math.max(1.0, (double)ConfigManager.getServerConfig().getGameplay().getMaxValue().intValue());
            return Math.max(0.0, GravityLogic.avgEffectiveStats(data) / div);
        }).orElse(0.0);
        double relief = base * Math.exp(-falloff * powerNorm);
        return Math.max(0.0, Math.min(base, relief));
    }

    public static double getNetGravity(Player player) {
        double gravity = GravityLogic.getGravityMultiplier(player);
        if (gravity <= 1.0) {
            return 0.0;
        }
        return Math.max(0.0, gravity - GravityLogic.getResistance(player));
    }

    public static double getBonusGravity(Player player) {
        GeneralServerConfig.GravityConfig config;
        double netGravity = GravityLogic.getNetGravity(player);
        if (netGravity >= (config = GravityLogic.cfg()).getHardStopThreshold()) {
            return 0.0;
        }
        return netGravity;
    }

    public static double getPenalizationGravity(Player player) {
        return GravityLogic.getNetGravity(player);
    }

    public static double getTrainingBonusGravity(Player player) {
        double gravity = GravityLogic.getTrainingGravityMultiplier(player);
        if (gravity <= 1.0) {
            return 0.0;
        }
        double net = Math.max(0.0, gravity - GravityLogic.getResistance(player));
        if (net >= GravityLogic.cfg().getHardStopThreshold()) {
            return 0.0;
        }
        return net;
    }

    private static double getNpcGravity(Player player) {
        boolean expired;
        GeneralServerConfig.GravityConfig config = GravityLogic.cfg();
        UUID id = player.m_20148_();
        long currentTick = player.m_9236_().m_46467_();
        String currentDim = player.m_9236_().m_46472_().m_135782_().toString();
        boolean dimChanged = !currentDim.equals(NPC_GRAVITY_DIM.get(id));
        boolean bl = expired = currentTick - NPC_GRAVITY_TICK.getOrDefault(id, 0L) > 100L;
        if (dimChanged || expired || !NPC_GRAVITY_CACHE.containsKey(id)) {
            double gravity = 0.0;
            double range = config.getNpcGravityRange();
            AABB searchBox = player.m_20191_().m_82400_(range);
            List kais = player.m_9236_().m_45976_(AllMastersEntity.MasterKaiosamaEntity.class, searchBox);
            if (!kais.isEmpty()) {
                gravity = config.getNpcGravityValue();
            }
            NPC_GRAVITY_CACHE.put(id, gravity);
            NPC_GRAVITY_TICK.put(id, currentTick);
            NPC_GRAVITY_DIM.put(id, currentDim);
            return gravity;
        }
        return NPC_GRAVITY_CACHE.getOrDefault(id, 0.0);
    }

    public static double getMachineGravity(Player player) {
        if (!GravityLogic.cfg().getMachineGravityEnabled().booleanValue()) {
            return 0.0;
        }
        return GravityDeviceManager.getGravityFor(player);
    }

    public static int getTotalWeight(Player player) {
        int[] totalWeight = new int[]{0};
        CuriosApi.getCuriosInventory((LivingEntity)player).ifPresent(inv -> {
            ICurioStacksHandler handler = (ICurioStacksHandler)inv.getCurios().get("weights");
            if (handler != null) {
                for (int i = 0; i < handler.getSlots(); ++i) {
                    ItemStack stack = handler.getStacks().getStackInSlot(i);
                    if (stack.m_41720_() instanceof WeightItem) {
                        totalWeight[0] = totalWeight[0] + WeightItem.getWeight(stack);
                        continue;
                    }
                    if (stack.m_41619_()) continue;
                    totalWeight[0] = totalWeight[0] + stack.m_41784_().m_128451_("WeightValue");
                }
            }
        });
        return totalWeight[0];
    }

    private static double computeRelativeLevel(StatsData data) {
        int currentBaseLevel = data.getLevel();
        int totalBaseStats = data.getStats().getTotalStats();
        int initialStats = totalBaseStats - (currentBaseLevel - 1) * 6;
        double boostedTotal = (double)data.getStats().getStrength() * data.getTotalMultiplier("STR") + (double)data.getStats().getStrikePower() * data.getTotalMultiplier("SKP") + (double)data.getStats().getResistance() * data.getTotalMultiplier("RES") + (double)data.getStats().getVitality() * data.getTotalMultiplier("VIT") + (double)data.getStats().getKiPower() * data.getTotalMultiplier("PWR") + (double)data.getStats().getEnergy() * data.getTotalMultiplier("ENE");
        return (boostedTotal - (double)initialStats) / 6.0 + 1.0;
    }

    private static double loadGravityFactor(Player player) {
        double gravity = GravityLogic.getGravityMultiplier(player);
        return Math.max(1.0E-4, 1.0 + (gravity - 1.0) * GravityLogic.cfg().getGravitySensitivity());
    }

    public static int getEffectiveWeight(Player player) {
        return (int)Math.round((double)GravityLogic.getTotalWeight(player) * GravityLogic.loadGravityFactor(player));
    }

    public static int getIdealWeight(Player player) {
        GeneralServerConfig.GravityConfig config = GravityLogic.cfg();
        if (!config.getTpEnabled().booleanValue()) {
            return 0;
        }
        return StatsProvider.get(StatsCapability.INSTANCE, (Entity)player).map(data -> {
            double capacity = GravityLogic.computeRelativeLevel(data) / config.getTpIdealBaseDivisor();
            return (int)Math.max(0L, Math.round(capacity));
        }).orElse(0);
    }

    public static double getLoadRatio(Player player) {
        int ideal = GravityLogic.getIdealWeight(player);
        if (ideal <= 0) {
            return 0.0;
        }
        return (double)GravityLogic.getEffectiveWeight(player) / (double)ideal;
    }

    public static int getTrainingZone(Player player) {
        if (GravityLogic.getTotalWeight(player) <= 0) {
            return 0;
        }
        int ideal = GravityLogic.getIdealWeight(player);
        if (ideal <= 0) {
            return 0;
        }
        GeneralServerConfig.GravityConfig config = GravityLogic.cfg();
        double r = (double)GravityLogic.getEffectiveWeight(player) / (double)ideal;
        if (r < config.getTpIdealRatioLow()) {
            return 1;
        }
        if (r <= config.getTpIdealRatioHigh()) {
            return 2;
        }
        if (r < config.getTpOverloadHardRatio()) {
            return 3;
        }
        return 4;
    }

    public static double getWeightTpMultiplier(Player player) {
        GeneralServerConfig.GravityConfig config = GravityLogic.cfg();
        if (!config.getTpEnabled().booleanValue()) {
            return 1.0;
        }
        if (GravityLogic.getTotalWeight(player) <= 0) {
            return 1.0;
        }
        int ideal = GravityLogic.getIdealWeight(player);
        if (ideal <= 0) {
            return 1.0;
        }
        return GravityLogic.weightTpMultiplierForRatio((double)GravityLogic.getEffectiveWeight(player) / (double)ideal, config);
    }

    private static double weightTpMultiplierForRatio(double r, GeneralServerConfig.GravityConfig config) {
        double comfortLow = config.getTpComfortRatioLow();
        double idealLow = config.getTpIdealRatioLow();
        double idealHigh = config.getTpIdealRatioHigh();
        double overload = config.getTpOverloadRatio();
        double overloadHard = config.getTpOverloadHardRatio();
        double comfortMult = config.getTpComfortMultiplier();
        double peak = config.getTpPeakMultiplier();
        double heavyMult = config.getTpHeavyMultiplier();
        if (r <= 0.0) {
            return 1.0;
        }
        if (comfortLow > 0.0 && r < comfortLow) {
            return GravityLogic.lerp(1.0, comfortMult, r / comfortLow);
        }
        if (r < idealLow) {
            return GravityLogic.lerp(comfortMult, peak, (r - comfortLow) / (idealLow - comfortLow));
        }
        if (r <= idealHigh) {
            return peak;
        }
        if (r <= overload) {
            return GravityLogic.lerp(peak, heavyMult, (r - idealHigh) / (overload - idealHigh));
        }
        if (r < overloadHard) {
            return GravityLogic.lerp(heavyMult, 1.0, (r - overload) / (overloadHard - overload));
        }
        return 1.0;
    }

    public static double getWeightPenaltyFactor(Player player) {
        GeneralServerConfig.GravityConfig config = GravityLogic.cfg();
        if (!config.getTpEnabled().booleanValue()) {
            return 0.0;
        }
        if (GravityLogic.getTotalWeight(player) <= 0) {
            return 0.0;
        }
        int ideal = GravityLogic.getIdealWeight(player);
        if (ideal <= 0) {
            return 0.0;
        }
        double r = (double)GravityLogic.getEffectiveWeight(player) / (double)ideal;
        double idealHigh = config.getTpIdealRatioHigh();
        double overloadHard = config.getTpOverloadHardRatio();
        if (r <= idealHigh) {
            return 0.0;
        }
        double max = config.getMaxWeightPenalty();
        double penalty = r >= overloadHard ? max : max * (r - idealHigh) / (overloadHard - idealHigh);
        double relief = GravityLogic.getGravityRoomReliefFraction(player);
        if (relief > 0.0) {
            penalty *= 1.0 - relief;
        }
        return penalty;
    }

    public static double getStatReduction(Player player) {
        GeneralServerConfig.GravityConfig config = GravityLogic.cfg();
        if (!config.getStatReductionEnabled().booleanValue()) {
            return 0.0;
        }
        double pGravity = GravityLogic.getPenalizationGravity(player);
        double reduction = 0.0;
        if (pGravity > 0.0) {
            reduction = pGravity * config.getStatReductionPerGravity();
            reduction = Math.max(config.getMinStatReduction(), Math.min(config.getMaxStatReduction(), reduction));
        }
        reduction = Math.min(config.getMaxStatReduction(), reduction + GravityLogic.getWeightPenaltyFactor(player));
        return reduction;
    }

    private static double lerp(double a, double b, double t) {
        if (t <= 0.0) {
            return a;
        }
        if (t >= 1.0) {
            return b;
        }
        return a + (b - a) * t;
    }

    public static double getGeneralPenaltyFactor(double pGravity) {
        if (pGravity <= 0.0) {
            return 0.0;
        }
        double baseCurve = Math.sqrt(pGravity / 100.0);
        return baseCurve * GravityLogic.cfg().getPenaltyCurveFactor();
    }

    public static double getJumpFactor(Player player) {
        GeneralServerConfig.GravityConfig config = GravityLogic.cfg();
        if (!config.getPhysicalEnabled().booleanValue()) {
            return 1.0;
        }
        double pGravity = GravityLogic.getPenalizationGravity(player);
        if (pGravity <= 0.0) {
            return 1.0;
        }
        if (pGravity >= config.getHardStopThreshold()) {
            return 1.0 - config.getMaxJumpPenalty();
        }
        double penalty = Math.min(config.getMaxJumpPenalty(), GravityLogic.getGeneralPenaltyFactor(pGravity));
        return 1.0 - penalty;
    }

    public static double getFlyFactor(Player player) {
        GeneralServerConfig.GravityConfig config = GravityLogic.cfg();
        if (!config.getPhysicalEnabled().booleanValue()) {
            return 1.0;
        }
        double pGravity = GravityLogic.getPenalizationGravity(player);
        if (pGravity <= 0.0) {
            return 1.0;
        }
        if (pGravity >= config.getHardStopThreshold()) {
            return 0.0;
        }
        double penalty = Math.min(config.getMaxFlyPenalty(), GravityLogic.getGeneralPenaltyFactor(pGravity));
        return 1.0 - penalty;
    }

    public static boolean isFlightHardStopped(Player player) {
        GeneralServerConfig.GravityConfig config = GravityLogic.cfg();
        if (!config.getPhysicalEnabled().booleanValue()) {
            return false;
        }
        return GravityLogic.getPenalizationGravity(player) >= config.getHardStopThreshold();
    }

    public static double getFallExtra(Player player) {
        GeneralServerConfig.GravityConfig config = GravityLogic.cfg();
        if (!config.getPhysicalEnabled().booleanValue()) {
            return 0.0;
        }
        double pGravity = GravityLogic.getPenalizationGravity(player);
        if (pGravity <= 0.0) {
            return 0.0;
        }
        return Math.min(config.getMaxExtraFall(), pGravity * config.getExtraFallPerGravity());
    }

    public static void tick(ServerPlayer player) {
        GeneralServerConfig.GravityConfig config = GravityLogic.cfg();
        double pGravity = GravityLogic.getPenalizationGravity((Player)player);
        AttributeInstance movementSpeed = player.m_21051_(Attributes.f_22279_);
        AttributeInstance attackSpeed = player.m_21051_(Attributes.f_22283_);
        if (movementSpeed == null || attackSpeed == null) {
            return;
        }
        movementSpeed.m_22120_(GRAVITY_SPEED_UUID);
        attackSpeed.m_22120_(GRAVITY_ATTACK_SPEED_UUID);
        double weightPenalty = GravityLogic.getWeightPenaltyFactor((Player)player);
        double movePenalty = 0.0;
        double attackPenalty = 0.0;
        if (pGravity > 0.0) {
            if (pGravity >= config.getHardStopThreshold()) {
                movePenalty = config.getMaxMovementPenalty();
                attackPenalty = config.getMaxAttackPenalty();
            } else {
                movePenalty = Math.min(config.getMaxMovementPenalty(), GravityLogic.getGeneralPenaltyFactor(pGravity));
                attackPenalty = Math.min(config.getMaxAttackPenalty(), Math.sqrt(pGravity / 100.0));
            }
        }
        movePenalty = Math.min(config.getMaxMovementPenalty(), movePenalty + weightPenalty);
        attackPenalty = Math.min(config.getMaxAttackPenalty(), attackPenalty + weightPenalty);
        if (movePenalty > 0.0) {
            movementSpeed.m_22118_(new AttributeModifier(GRAVITY_SPEED_UUID, "Gravity movement penalty", -movePenalty, AttributeModifier.Operation.MULTIPLY_TOTAL));
        }
        if (attackPenalty > 0.0) {
            attackSpeed.m_22118_(new AttributeModifier(GRAVITY_ATTACK_SPEED_UUID, "Gravity attack speed penalty", -attackPenalty, AttributeModifier.Operation.MULTIPLY_TOTAL));
        }
        GravityLogic.applyStatReduction(player, config);
    }

    private static void applyStatReduction(ServerPlayer player, GeneralServerConfig.GravityConfig config) {
        StatsProvider.get(StatsCapability.INSTANCE, (Entity)player).ifPresent(data -> {
            String[] stats = config.getAffectedStats();
            double reduction = GravityLogic.getStatReduction((Player)player);
            if (reduction <= 0.0) {
                for (String stat : stats) {
                    data.getBonusStats().removeBonusSplit(stat, "Gravity");
                }
                return;
            }
            double multiplier = 1.0 - reduction;
            for (String stat : stats) {
                data.getBonusStats().addBonusSplit(stat, "Gravity", "*", multiplier, false);
            }
        });
    }

    public static void clearNpcGravityCache(UUID playerId) {
        NPC_GRAVITY_CACHE.remove(playerId);
        NPC_GRAVITY_TICK.remove(playerId);
        NPC_GRAVITY_DIM.remove(playerId);
    }

    public static double getConsumptionMultiplier(Player player) {
        double pGravity = GravityLogic.getPenalizationGravity(player);
        if (pGravity <= 0.0) {
            return 1.0;
        }
        return 1.0 + pGravity * GravityLogic.cfg().getConsumptionPerGravity();
    }
}

