/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  net.minecraft.nbt.CompoundTag
 *  net.minecraft.network.FriendlyByteBuf
 *  net.minecraft.server.level.ServerPlayer
 *  net.minecraft.world.entity.Entity
 *  net.minecraftforge.api.distmarker.Dist
 *  net.minecraftforge.fml.DistExecutor
 *  net.minecraftforge.network.NetworkEvent$Context
 */
package com.dragonminez.common.network.S2C;

import com.dragonminez.common.network.ClientPacketHandler;
import com.dragonminez.common.stats.StatsCapability;
import com.dragonminez.common.stats.StatsProvider;
import java.util.function.Supplier;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.Entity;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.fml.DistExecutor;
import net.minecraftforge.network.NetworkEvent;

public class StatsSyncS2C {
    private final int playerId;
    private final CompoundTag nbt;

    public StatsSyncS2C(ServerPlayer player) {
        this.playerId = player.m_19879_();
        this.nbt = new CompoundTag();
        StatsProvider.get(StatsCapability.INSTANCE, (Entity)player).ifPresent(data -> this.nbt.m_128391_(data.save()));
    }

    public StatsSyncS2C(int playerId, CompoundTag nbt) {
        this.playerId = playerId;
        this.nbt = nbt;
    }

    public static void encode(StatsSyncS2C msg, FriendlyByteBuf buf) {
        buf.writeInt(msg.playerId);
        buf.m_130079_(msg.nbt);
    }

    public static StatsSyncS2C decode(FriendlyByteBuf buf) {
        return new StatsSyncS2C(buf.readInt(), buf.m_130260_());
    }

    public static void handle(StatsSyncS2C msg, Supplier<NetworkEvent.Context> ctx) {
        ctx.get().enqueueWork(() -> DistExecutor.unsafeRunWhenOn((Dist)Dist.CLIENT, () -> () -> ClientPacketHandler.handleStatsSyncPacket(msg.playerId, msg.nbt)));
        ctx.get().setPacketHandled(true);
    }
}

