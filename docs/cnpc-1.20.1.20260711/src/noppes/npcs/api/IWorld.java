/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  net.minecraft.core.BlockPos
 *  net.minecraft.server.level.ServerLevel
 */
package noppes.npcs.api;

import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import noppes.npcs.api.IDimension;
import noppes.npcs.api.INbt;
import noppes.npcs.api.IPos;
import noppes.npcs.api.IScoreboard;
import noppes.npcs.api.block.IBlock;
import noppes.npcs.api.entity.IEntity;
import noppes.npcs.api.entity.IPlayer;
import noppes.npcs.api.entity.data.IData;
import noppes.npcs.api.item.IItemStack;

public interface IWorld {
    public IEntity[] getNearbyEntities(int var1, int var2, int var3, int var4, int var5);

    public IEntity[] getNearbyEntities(IPos var1, int var2, int var3);

    public IEntity getClosestEntity(int var1, int var2, int var3, int var4, int var5);

    public IEntity getClosestEntity(IPos var1, int var2, int var3);

    public IEntity[] getAllEntities(int var1);

    public long getTime();

    public void setTime(long var1);

    public long getTotalTime();

    public IBlock getBlock(int var1, int var2, int var3);

    public IBlock getBlock(IPos var1);

    public void setBlock(int var1, int var2, int var3, String var4, int var5);

    public IBlock setBlock(IPos var1, String var2);

    public void removeBlock(int var1, int var2, int var3);

    public void removeBlock(IPos var1);

    public float getLightValue(int var1, int var2, int var3);

    public IPlayer getPlayer(String var1);

    public boolean isDay();

    public boolean isRaining();

    public IDimension getDimension();

    public void setRaining(boolean var1);

    public void thunderStrike(double var1, double var3, double var5);

    public void playSoundAt(IPos var1, String var2, float var3, float var4);

    public void spawnParticle(String var1, double var2, double var4, double var6, double var8, double var10, double var12, double var14, int var16);

    public void broadcast(String var1);

    public IScoreboard getScoreboard();

    public IData getTempdata();

    public IData getStoreddata();

    public IItemStack createItem(String var1, int var2);

    public IItemStack createItemFromNbt(INbt var1);

    public void explode(double var1, double var3, double var5, float var7, boolean var8, boolean var9);

    public IPlayer[] getAllPlayers();

    public String getBiomeName(int var1, int var2);

    public void spawnEntity(IEntity var1);

    @Deprecated
    public IEntity spawnClone(double var1, double var3, double var5, int var7, String var8);

    @Deprecated
    public IEntity getClone(int var1, String var2);

    public int getRedstonePower(int var1, int var2, int var3);

    public ServerLevel getMCLevel();

    public BlockPos getMCBlockPos(int var1, int var2, int var3);

    public IEntity getEntity(String var1);

    public IEntity createEntityFromNBT(INbt var1);

    public IEntity createEntity(String var1);

    public IBlock getSpawnPoint();

    public void setSpawnPoint(IBlock var1);

    public String getName();

    public void trigger(int var1, Object ... var2);
}

