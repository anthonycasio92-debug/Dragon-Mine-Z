/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  net.minecraft.world.entity.Entity
 */
package noppes.npcs.api.entity;

import net.minecraft.world.entity.Entity;
import noppes.npcs.api.INbt;
import noppes.npcs.api.IPos;
import noppes.npcs.api.IRayTrace;
import noppes.npcs.api.IWorld;
import noppes.npcs.api.entity.IEntityItem;
import noppes.npcs.api.entity.data.IData;
import noppes.npcs.api.item.IItemStack;

public interface IEntity<T extends Entity> {
    public double getX();

    public void setX(double var1);

    public double getY();

    public void setY(double var1);

    public double getZ();

    public void setZ(double var1);

    public int getBlockX();

    public int getBlockY();

    public int getBlockZ();

    public IPos getPos();

    public void setPos(IPos var1);

    public void setPosition(double var1, double var3, double var5);

    public void setRotation(float var1);

    public float getRotation();

    public float getHeight();

    public float getEyeHeight();

    public float getWidth();

    public void setPitch(float var1);

    public float getPitch();

    public IEntity getMount();

    public void setMount(IEntity var1);

    public IEntity[] getRiders();

    public IEntity[] getAllRiders();

    public void addRider(IEntity var1);

    public void clearRiders();

    public void knockback(int var1, float var2);

    public boolean isSneaking();

    public boolean isSprinting();

    public IEntityItem dropItem(IItemStack var1);

    public boolean inWater();

    public boolean inFire();

    public boolean inLava();

    public IData getTempdata();

    public IData getStoreddata();

    public INbt getNbt();

    public boolean isAlive();

    public long getAge();

    public void despawn();

    public void spawn();

    public void kill();

    public boolean isBurning();

    public void setBurning(int var1);

    public void extinguish();

    public IWorld getWorld();

    public String getTypeName();

    public int getType();

    public boolean typeOf(int var1);

    public T getMCEntity();

    public String getUUID();

    public String generateNewUUID();

    public void storeAsClone(int var1, String var2);

    public INbt getEntityNbt();

    public void setEntityNbt(INbt var1);

    public IRayTrace rayTraceBlock(double var1, boolean var3, boolean var4);

    public IEntity[] rayTraceEntities(double var1, boolean var3, boolean var4);

    public String[] getTags();

    public void addTag(String var1);

    public boolean hasTag(String var1);

    public void removeTag(String var1);

    public void playAnimation(int var1);

    public void damage(float var1);

    public void damage(float var1, IEntity var2);

    public double getMotionX();

    public double getMotionY();

    public double getMotionZ();

    public void setMotionX(double var1);

    public void setMotionY(double var1);

    public void setMotionZ(double var1);

    public String getName();

    public void setName(String var1);

    public boolean hasCustomName();

    public String getEntityName();
}

