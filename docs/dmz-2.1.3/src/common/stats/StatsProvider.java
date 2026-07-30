/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  net.minecraft.core.Direction
 *  net.minecraft.nbt.CompoundTag
 *  net.minecraft.resources.ResourceLocation
 *  net.minecraft.world.entity.Entity
 *  net.minecraft.world.entity.player.Player
 *  net.minecraftforge.common.capabilities.Capability
 *  net.minecraftforge.common.capabilities.ICapabilityProvider
 *  net.minecraftforge.common.util.INBTSerializable
 *  net.minecraftforge.common.util.LazyOptional
 *  org.jetbrains.annotations.NotNull
 *  org.jetbrains.annotations.Nullable
 */
package com.dragonminez.common.stats;

import com.dragonminez.common.stats.StatsCapability;
import com.dragonminez.common.stats.StatsData;
import net.minecraft.core.Direction;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.player.Player;
import net.minecraftforge.common.capabilities.Capability;
import net.minecraftforge.common.capabilities.ICapabilityProvider;
import net.minecraftforge.common.util.INBTSerializable;
import net.minecraftforge.common.util.LazyOptional;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

public class StatsProvider
implements ICapabilityProvider,
INBTSerializable<CompoundTag> {
    public static final ResourceLocation ID = ResourceLocation.parse((String)"dragonminez");
    private final StatsData data;
    private final LazyOptional<StatsData> optional;

    public StatsProvider(Player player) {
        this.data = new StatsData(player);
        this.optional = LazyOptional.of(() -> this.data);
    }

    @NotNull
    public <T> LazyOptional<T> getCapability(@NotNull Capability<T> cap, @Nullable Direction side) {
        if (cap == StatsCapability.INSTANCE) {
            return this.optional.cast();
        }
        return LazyOptional.empty();
    }

    @NotNull
    public static <T> LazyOptional<T> get(Capability<T> cap, Entity entity) {
        return entity.getCapability(cap);
    }

    void invalidate() {
        this.optional.invalidate();
    }

    public CompoundTag serializeNBT() {
        return this.data.save();
    }

    public void deserializeNBT(CompoundTag nbt) {
        try {
            this.data.load(nbt);
        }
        catch (ClassNotFoundException e) {
            throw new RuntimeException(e);
        }
    }
}

