/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  net.minecraft.resources.ResourceLocation
 *  net.minecraft.world.InteractionHand
 *  net.minecraft.world.effect.MobEffect
 *  net.minecraft.world.effect.MobEffectInstance
 *  net.minecraft.world.entity.Entity
 *  net.minecraft.world.entity.EquipmentSlot
 *  net.minecraft.world.entity.LivingEntity
 *  net.minecraft.world.entity.ai.attributes.Attributes
 *  net.minecraft.world.item.ItemStack
 *  net.minecraftforge.registries.ForgeRegistries
 */
package noppes.npcs.api.wrapper;

import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.item.ItemStack;
import net.minecraftforge.registries.ForgeRegistries;
import noppes.npcs.api.CustomNPCsException;
import noppes.npcs.api.NpcAPI;
import noppes.npcs.api.entity.IEntity;
import noppes.npcs.api.entity.IEntityLiving;
import noppes.npcs.api.entity.data.IMark;
import noppes.npcs.api.item.IItemStack;
import noppes.npcs.api.wrapper.EntityWrapper;
import noppes.npcs.controllers.data.MarkData;
import noppes.npcs.mixin.EntityLivingIMixin;

public class EntityLivingBaseWrapper<T extends LivingEntity>
extends EntityWrapper<T>
implements IEntityLiving {
    public EntityLivingBaseWrapper(T entity) {
        super(entity);
    }

    @Override
    public float getHealth() {
        return ((LivingEntity)this.entity).m_21223_();
    }

    @Override
    public void setHealth(float health) {
        ((LivingEntity)this.entity).m_21153_(health);
    }

    @Override
    public float getMaxHealth() {
        return ((LivingEntity)this.entity).m_21233_();
    }

    @Override
    public void setMaxHealth(float health) {
        if (health < 0.0f) {
            return;
        }
        ((LivingEntity)this.entity).m_21051_(Attributes.f_22276_).m_22100_((double)health);
    }

    @Override
    public boolean isAttacking() {
        return ((LivingEntity)this.entity).m_21188_() != null;
    }

    @Override
    public void setAttackTarget(IEntityLiving living) {
        if (living == null) {
            ((LivingEntity)this.entity).m_6703_(null);
        } else {
            ((LivingEntity)this.entity).m_6703_(living.getMCEntity());
        }
    }

    @Override
    public IEntityLiving getAttackTarget() {
        return (IEntityLiving)NpcAPI.Instance().getIEntity((Entity)((LivingEntity)this.entity).m_21188_());
    }

    @Override
    public IEntityLiving getLastAttacked() {
        return (IEntityLiving)NpcAPI.Instance().getIEntity((Entity)((LivingEntity)this.entity).m_21214_());
    }

    @Override
    public int getLastAttackedTime() {
        return ((LivingEntity)this.entity).m_21215_();
    }

    @Override
    public boolean canSeeEntity(IEntity entity) {
        return ((LivingEntity)this.entity).m_142582_(entity.getMCEntity());
    }

    @Override
    public void swingMainhand() {
        ((LivingEntity)this.entity).m_6674_(InteractionHand.MAIN_HAND);
    }

    @Override
    public void swingOffhand() {
        ((LivingEntity)this.entity).m_6674_(InteractionHand.OFF_HAND);
    }

    @Override
    public void addPotionEffect(String effect, int duration, int strength, boolean hideParticles) {
        MobEffect p = (MobEffect)ForgeRegistries.MOB_EFFECTS.getValue(new ResourceLocation(effect));
        this.addPotionEffect(p, duration, strength, hideParticles);
    }

    @Override
    public void addPotionEffect(int effect, int duration, int strength, boolean hideParticles) {
        MobEffect p = MobEffect.m_19453_((int)effect);
        this.addPotionEffect(p, duration, strength, hideParticles);
    }

    public void addPotionEffect(MobEffect p, int duration, int strength, boolean hideParticles) {
        if (p == null) {
            return;
        }
        if (strength < 0) {
            strength = 0;
        } else if (strength > 255) {
            strength = 255;
        }
        if (duration < 0) {
            duration = 0;
        } else if (duration > 1000000) {
            duration = 1000000;
        }
        if (!p.m_8093_()) {
            duration *= 20;
        }
        if (duration == 0) {
            ((LivingEntity)this.entity).m_21195_(p);
        } else {
            ((LivingEntity)this.entity).m_7292_(new MobEffectInstance(p, duration, strength, false, hideParticles));
        }
    }

    @Override
    public void clearPotionEffects() {
        ((LivingEntity)this.entity).m_21219_();
    }

    @Override
    public int getPotionEffect(int effect) {
        MobEffectInstance pf = ((LivingEntity)this.entity).m_21124_(MobEffect.m_19453_((int)effect));
        if (pf == null) {
            return -1;
        }
        return pf.m_19564_();
    }

    @Override
    public IItemStack getMainhandItem() {
        return NpcAPI.Instance().getIItemStack(((LivingEntity)this.entity).m_21205_());
    }

    @Override
    public void setMainhandItem(IItemStack item) {
        ((LivingEntity)this.entity).m_21008_(InteractionHand.MAIN_HAND, item == null ? ItemStack.f_41583_ : item.getMCItemStack());
    }

    @Override
    public IItemStack getOffhandItem() {
        return NpcAPI.Instance().getIItemStack(((LivingEntity)this.entity).m_21206_());
    }

    @Override
    public void setOffhandItem(IItemStack item) {
        ((LivingEntity)this.entity).m_21008_(InteractionHand.OFF_HAND, item == null ? ItemStack.f_41583_ : item.getMCItemStack());
    }

    @Override
    public IItemStack getArmor(int slot) {
        if (slot < 0 || slot > 3) {
            throw new CustomNPCsException("Wrong slot id:" + slot, new Object[0]);
        }
        return NpcAPI.Instance().getIItemStack(((LivingEntity)this.entity).m_6844_(this.getSlot(slot)));
    }

    @Override
    public void setArmor(int slot, IItemStack item) {
        if (slot < 0 || slot > 3) {
            throw new CustomNPCsException("Wrong slot id:" + slot, new Object[0]);
        }
        ((LivingEntity)this.entity).m_8061_(this.getSlot(slot), item == null ? ItemStack.f_41583_ : item.getMCItemStack());
    }

    private EquipmentSlot getSlot(int slot) {
        if (slot == 3) {
            return EquipmentSlot.HEAD;
        }
        if (slot == 2) {
            return EquipmentSlot.CHEST;
        }
        if (slot == 1) {
            return EquipmentSlot.LEGS;
        }
        if (slot == 0) {
            return EquipmentSlot.FEET;
        }
        return null;
    }

    @Override
    public float getRotation() {
        return ((LivingEntity)this.entity).f_20883_;
    }

    @Override
    public void setRotation(float rotation) {
        ((LivingEntity)this.entity).f_20883_ = rotation;
    }

    @Override
    public int getType() {
        return 5;
    }

    @Override
    public boolean typeOf(int type) {
        return type == 5 ? true : super.typeOf(type);
    }

    @Override
    public boolean isChild() {
        return ((LivingEntity)this.entity).m_6162_();
    }

    @Override
    public IMark addMark(int type) {
        MarkData data = MarkData.get((LivingEntity)this.entity);
        return data.addMark(type);
    }

    @Override
    public void removeMark(IMark mark) {
        MarkData data = MarkData.get((LivingEntity)this.entity);
        data.marks.remove(mark);
        data.syncClients();
    }

    @Override
    public IMark[] getMarks() {
        MarkData data = MarkData.get((LivingEntity)this.entity);
        return data.marks.toArray(new IMark[data.marks.size()]);
    }

    @Override
    public float getMoveForward() {
        return ((LivingEntity)this.entity).f_20902_;
    }

    @Override
    public void setMoveForward(float move) {
        ((LivingEntity)this.entity).f_20902_ = move;
    }

    @Override
    public float getMoveStrafing() {
        return ((LivingEntity)this.entity).f_20900_;
    }

    @Override
    public void setMoveStrafing(float move) {
        ((LivingEntity)this.entity).f_20900_ = move;
    }

    @Override
    public float getMoveVertical() {
        return ((LivingEntity)this.entity).f_20901_;
    }

    @Override
    public void setMoveVertical(float move) {
        ((LivingEntity)this.entity).f_20901_ = move;
    }

    @Override
    public boolean isJumping() {
        return ((EntityLivingIMixin)this.entity).jumping();
    }

    @Override
    public boolean isMoving() {
        return this.getMotionX() > 0.0 || this.getMotionY() > 0.0 || this.getMotionZ() > 0.0;
    }

    @Override
    public float getSpeed() {
        return ((LivingEntity)this.entity).m_6113_();
    }
}

