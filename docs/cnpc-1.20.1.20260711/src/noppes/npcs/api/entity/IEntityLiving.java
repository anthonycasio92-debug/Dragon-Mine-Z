/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  net.minecraft.world.entity.LivingEntity
 */
package noppes.npcs.api.entity;

import net.minecraft.world.entity.LivingEntity;
import noppes.npcs.api.entity.IEntity;
import noppes.npcs.api.entity.data.IMark;
import noppes.npcs.api.item.IItemStack;

public interface IEntityLiving<T extends LivingEntity>
extends IEntity<T> {
    public float getHealth();

    public void setHealth(float var1);

    public float getMaxHealth();

    public void setMaxHealth(float var1);

    public boolean isAttacking();

    public void setAttackTarget(IEntityLiving var1);

    public IEntityLiving getAttackTarget();

    public IEntityLiving getLastAttacked();

    public int getLastAttackedTime();

    public boolean canSeeEntity(IEntity var1);

    public void swingMainhand();

    public void swingOffhand();

    public IItemStack getMainhandItem();

    public void setMainhandItem(IItemStack var1);

    public IItemStack getOffhandItem();

    public void setOffhandItem(IItemStack var1);

    public IItemStack getArmor(int var1);

    public void setArmor(int var1, IItemStack var2);

    public void addPotionEffect(int var1, int var2, int var3, boolean var4);

    public void addPotionEffect(String var1, int var2, int var3, boolean var4);

    public void clearPotionEffects();

    public int getPotionEffect(int var1);

    public IMark addMark(int var1);

    public void removeMark(IMark var1);

    public IMark[] getMarks();

    public boolean isChild();

    @Override
    public T getMCEntity();

    public float getMoveForward();

    public void setMoveForward(float var1);

    public float getMoveStrafing();

    public void setMoveStrafing(float var1);

    public float getMoveVertical();

    public void setMoveVertical(float var1);

    public boolean isJumping();

    public boolean isMoving();

    public float getSpeed();
}

