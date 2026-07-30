/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  net.minecraft.network.FriendlyByteBuf
 *  net.minecraft.server.level.ServerPlayer
 *  net.minecraft.world.entity.Entity
 *  net.minecraftforge.network.NetworkEvent$Context
 */
package com.dragonminez.common.network.C2S;

import com.dragonminez.common.config.ConfigManager;
import com.dragonminez.common.network.NetworkHandler;
import com.dragonminez.common.network.S2C.StatsSyncS2C;
import com.dragonminez.common.stats.StatsCapability;
import com.dragonminez.common.stats.StatsProvider;
import com.dragonminez.common.stats.skills.Skill;
import java.util.function.Supplier;
import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.Entity;
import net.minecraftforge.network.NetworkEvent;

public class FlightModeC2S {
    public FlightModeC2S() {
    }

    public FlightModeC2S(FriendlyByteBuf buf) {
    }

    public static void encode(FlightModeC2S msg, FriendlyByteBuf buf) {
    }

    public static FlightModeC2S decode(FriendlyByteBuf buf) {
        return new FlightModeC2S(buf);
    }

    public static void handle(FlightModeC2S msg, Supplier<NetworkEvent.Context> ctx) {
        ctx.get().enqueueWork(() -> {
            ServerPlayer player = ((NetworkEvent.Context)ctx.get()).getSender();
            if (player == null) {
                return;
            }
            StatsProvider.get(StatsCapability.INSTANCE, (Entity)player).ifPresent(data -> {
                int targetMode;
                if (!data.getStatus().isHasCreatedCharacter()) {
                    return;
                }
                if (data.getStatus().isStunned()) {
                    return;
                }
                Skill flySkill = data.getSkills().getSkill("fly");
                Skill kiControlSkill = data.getSkills().getSkill("kicontrol");
                if (flySkill == null || kiControlSkill == null || flySkill.getLevel() <= 0 || kiControlSkill.getLevel() <= 0) {
                    return;
                }
                int currentMode = data.getStatus().getFlightMode();
                int n = targetMode = currentMode == 1 ? 0 : 1;
                if (targetMode == 0 && data.getCooldowns().hasCooldown("CombatFlyLock")) {
                    return;
                }
                boolean wasActive = flySkill.isActive();
                if (!wasActive) {
                    int flyLevel = flySkill.getLevel();
                    double energyCostPercent = Math.max(0.01, 0.04 - (double)flyLevel * 0.003);
                    int energyCost = (int)Math.ceil((double)ConfigManager.getCombatConfig().getBaselineFormDrain().intValue() * energyCostPercent);
                    if (data.getResources().getCurrentEnergy() < (float)energyCost) {
                        return;
                    }
                    flySkill.setActive(true);
                    player.m_150110_().f_35936_ = true;
                    player.m_150110_().f_35935_ = false;
                    player.m_6885_();
                }
                data.getStatus().setFlightMode(targetMode);
                NetworkHandler.sendToTrackingEntityAndSelf(new StatsSyncS2C(player), (Entity)player);
            });
        });
        ctx.get().setPacketHandled(true);
    }
}

