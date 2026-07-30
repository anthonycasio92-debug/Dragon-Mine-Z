/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  com.google.common.collect.ImmutableList
 *  net.minecraft.core.Holder
 *  net.minecraft.core.Holder$Reference
 *  net.minecraft.core.registries.Registries
 *  net.minecraft.locale.Language
 *  net.minecraft.nbt.CompoundTag
 *  net.minecraft.nbt.NumericTag
 *  net.minecraft.nbt.Tag
 *  net.minecraft.network.chat.Component
 *  net.minecraft.network.protocol.Packet
 *  net.minecraft.network.protocol.game.ClientboundAnimatePacket
 *  net.minecraft.resources.ResourceLocation
 *  net.minecraft.server.level.ServerLevel
 *  net.minecraft.tags.BlockTags
 *  net.minecraft.util.Mth
 *  net.minecraft.world.damagesource.DamageSource
 *  net.minecraft.world.entity.Entity
 *  net.minecraft.world.entity.EntityType
 *  net.minecraft.world.entity.player.Player
 *  net.minecraft.world.level.ClipContext
 *  net.minecraft.world.level.ClipContext$Block
 *  net.minecraft.world.level.ClipContext$Fluid
 *  net.minecraft.world.phys.AABB
 *  net.minecraft.world.phys.BlockHitResult
 *  net.minecraft.world.phys.HitResult$Type
 *  net.minecraft.world.phys.Vec3
 */
package noppes.npcs.api.wrapper;

import com.google.common.collect.ImmutableList;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import net.minecraft.core.Holder;
import net.minecraft.core.registries.Registries;
import net.minecraft.locale.Language;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.NumericTag;
import net.minecraft.nbt.Tag;
import net.minecraft.network.chat.Component;
import net.minecraft.network.protocol.Packet;
import net.minecraft.network.protocol.game.ClientboundAnimatePacket;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.tags.BlockTags;
import net.minecraft.util.Mth;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.ClipContext;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;
import noppes.npcs.NpcDamageSource;
import noppes.npcs.api.CustomNPCsException;
import noppes.npcs.api.INbt;
import noppes.npcs.api.IPos;
import noppes.npcs.api.IRayTrace;
import noppes.npcs.api.IWorld;
import noppes.npcs.api.NpcAPI;
import noppes.npcs.api.entity.IEntity;
import noppes.npcs.api.entity.IEntityItem;
import noppes.npcs.api.entity.IPlayer;
import noppes.npcs.api.entity.data.IData;
import noppes.npcs.api.item.IItemStack;
import noppes.npcs.api.wrapper.BlockPosWrapper;
import noppes.npcs.api.wrapper.RayTraceWrapper;
import noppes.npcs.controllers.ServerCloneController;
import noppes.npcs.mixin.EntityIMixin;

public class EntityWrapper<T extends Entity>
implements IEntity {
    protected T entity;
    private Map<String, Object> tempData = new HashMap<String, Object>();
    private IWorld levelWrapper;
    private final IData tempdata = new IData(){

        @Override
        public void put(String key, Object value) {
            EntityWrapper.this.tempData.put(key, value);
        }

        @Override
        public Object get(String key) {
            return EntityWrapper.this.tempData.get(key);
        }

        @Override
        public void remove(String key) {
            EntityWrapper.this.tempData.remove(key);
        }

        @Override
        public boolean has(String key) {
            return EntityWrapper.this.tempData.containsKey(key);
        }

        @Override
        public void clear() {
            EntityWrapper.this.tempData.clear();
        }

        @Override
        public String[] getKeys() {
            return EntityWrapper.this.tempData.keySet().toArray(new String[EntityWrapper.this.tempData.size()]);
        }
    };
    private final IData storeddata = new IData(){

        @Override
        public void put(String key, Object value) {
            CompoundTag compound = this.getStoredCompound();
            if (value instanceof Number) {
                compound.m_128347_(key, ((Number)value).doubleValue());
            } else if (value instanceof String) {
                compound.m_128359_(key, (String)value);
            }
            this.saveStoredCompound(compound);
        }

        @Override
        public Object get(String key) {
            CompoundTag compound = this.getStoredCompound();
            if (!compound.m_128441_(key)) {
                return null;
            }
            Tag base = compound.m_128423_(key);
            if (base instanceof NumericTag) {
                return ((NumericTag)base).m_7061_();
            }
            return base.m_7916_();
        }

        @Override
        public void remove(String key) {
            CompoundTag compound = this.getStoredCompound();
            compound.m_128473_(key);
            this.saveStoredCompound(compound);
        }

        @Override
        public boolean has(String key) {
            return this.getStoredCompound().m_128441_(key);
        }

        @Override
        public void clear() {
            EntityWrapper.this.entity.getPersistentData().m_128473_("CNPCStoredData");
        }

        private CompoundTag getStoredCompound() {
            CompoundTag compound = EntityWrapper.this.entity.getPersistentData().m_128469_("CNPCStoredData");
            if (compound == null) {
                compound = new CompoundTag();
                EntityWrapper.this.entity.getPersistentData().m_128365_("CNPCStoredData", (Tag)compound);
            }
            return compound;
        }

        private void saveStoredCompound(CompoundTag compound) {
            EntityWrapper.this.entity.getPersistentData().m_128365_("CNPCStoredData", (Tag)compound);
        }

        @Override
        public String[] getKeys() {
            CompoundTag compound = this.getStoredCompound();
            return compound.m_128431_().toArray(new String[compound.m_128431_().size()]);
        }
    };

    public EntityWrapper(T entity) {
        this.entity = entity;
        this.levelWrapper = NpcAPI.Instance().getIWorld((ServerLevel)entity.m_9236_());
    }

    @Override
    public double getX() {
        return this.entity.m_20185_();
    }

    @Override
    public void setX(double x) {
        this.entity.m_6034_(x, this.entity.m_20186_(), this.entity.m_20189_());
    }

    @Override
    public double getY() {
        return this.entity.m_20186_();
    }

    @Override
    public void setY(double y) {
        this.entity.m_6034_(this.entity.m_20185_(), y, this.entity.m_20189_());
    }

    @Override
    public double getZ() {
        return this.entity.m_20189_();
    }

    @Override
    public void setZ(double z) {
        this.entity.m_6034_(this.entity.m_20185_(), this.entity.m_20186_(), z);
    }

    @Override
    public int getBlockX() {
        return Mth.m_14107_((double)this.entity.m_20185_());
    }

    @Override
    public int getBlockY() {
        return Mth.m_14107_((double)this.entity.m_20186_());
    }

    @Override
    public int getBlockZ() {
        return Mth.m_14107_((double)this.entity.m_20189_());
    }

    @Override
    public String getEntityName() {
        String s = this.entity.m_6095_().m_20675_();
        return Language.m_128107_().m_6834_(s);
    }

    @Override
    public String getName() {
        return this.entity.m_7755_().getString();
    }

    @Override
    public void setName(String name) {
        this.entity.m_6593_((Component)Component.m_237113_((String)name));
    }

    @Override
    public boolean hasCustomName() {
        return this.entity.m_8077_();
    }

    @Override
    public void setPosition(double x, double y, double z) {
        this.entity.m_6034_(x, y, z);
    }

    @Override
    public IWorld getWorld() {
        if (this.entity.m_9236_() != this.levelWrapper.getMCLevel()) {
            this.levelWrapper = NpcAPI.Instance().getIWorld((ServerLevel)this.entity.m_9236_());
        }
        return this.levelWrapper;
    }

    @Override
    public boolean isAlive() {
        return this.entity.m_6084_();
    }

    @Override
    public IData getTempdata() {
        return this.tempdata;
    }

    @Override
    public IData getStoreddata() {
        return this.storeddata;
    }

    @Override
    public long getAge() {
        return ((Entity)this.entity).f_19797_;
    }

    @Override
    public void damage(float amount) {
        if (this.getType() == 1 && (((IPlayer)((Object)this)).getGamemode() == 1 || ((IPlayer)((Object)this)).getGamemode() == 3)) {
            return;
        }
        this.entity.m_6469_(this.entity.m_269291_().m_287172_(), amount);
    }

    @Override
    public void damage(float damage, IEntity source) {
        if (source.getMCEntity() instanceof Player) {
            this.entity.m_6469_(this.entity.m_269291_().m_269075_((Player)source.getMCEntity()), damage);
        } else {
            Holder.Reference damageTypeHolder = this.entity.m_9236_().m_9598_().m_175515_(Registries.f_268580_).m_246971_(NpcDamageSource.NPC);
            this.entity.m_6469_(new DamageSource((Holder)damageTypeHolder, source.getMCEntity()), damage);
        }
    }

    @Override
    public void despawn() {
        this.entity.m_146870_();
    }

    @Override
    public void spawn() {
        if (this.levelWrapper.getMCLevel().m_8791_(this.entity.m_20148_()) != null) {
            throw new CustomNPCsException("Entity is already spawned", new Object[0]);
        }
        ((EntityIMixin)this.entity).removal(null);
        this.levelWrapper.getMCLevel().m_7967_(this.entity);
    }

    @Override
    public void kill() {
        this.entity.m_6074_();
    }

    @Override
    public boolean inWater() {
        return this.entity.m_20069_();
    }

    @Override
    public boolean inLava() {
        return this.entity.m_20077_();
    }

    @Override
    public boolean inFire() {
        return this.entity.m_9236_().m_45556_(this.entity.m_20191_()).anyMatch(state -> state.m_204336_(BlockTags.f_13076_));
    }

    @Override
    public boolean isBurning() {
        return this.entity.m_6060_();
    }

    @Override
    public void setBurning(int ticks) {
        this.entity.m_7311_(ticks);
    }

    @Override
    public void extinguish() {
        this.entity.m_20095_();
    }

    @Override
    public String getTypeName() {
        return this.entity.m_20078_();
    }

    @Override
    public IEntityItem dropItem(IItemStack item) {
        return (IEntityItem)NpcAPI.Instance().getIEntity((Entity)this.entity.m_5552_(item.getMCItemStack(), 0.0f));
    }

    @Override
    public IEntity[] getRiders() {
        List list = this.entity.m_20197_();
        IEntity[] riders = new IEntity[list.size()];
        for (int i = 0; i < list.size(); ++i) {
            riders[i] = NpcAPI.Instance().getIEntity((Entity)list.get(i));
        }
        return riders;
    }

    @Override
    public IRayTrace rayTraceBlock(double distance, boolean stopOnLiquid, boolean ignoreBlockWithoutBoundingBox) {
        Vec3 vec3d = this.entity.m_20299_(1.0f);
        Vec3 vec3d1 = this.entity.m_20252_(1.0f);
        Vec3 vec3d2 = vec3d.m_82520_(vec3d1.f_82479_ * distance, vec3d1.f_82480_ * distance, vec3d1.f_82481_ * distance);
        BlockHitResult result = this.entity.m_9236_().m_45547_(new ClipContext(vec3d, vec3d2, ClipContext.Block.OUTLINE, stopOnLiquid ? ClipContext.Fluid.ANY : ClipContext.Fluid.NONE, this.entity));
        if (result.m_6662_() == HitResult.Type.MISS) {
            return null;
        }
        BlockHitResult br = result;
        return new RayTraceWrapper(NpcAPI.Instance().getIBlock(this.entity.m_9236_(), br.m_82425_()), br.m_82434_().m_122411_());
    }

    @Override
    public IEntity[] rayTraceEntities(double distance, boolean stopOnLiquid, boolean ignoreBlockWithoutBoundingBox) {
        Vec3 vec3d = this.entity.m_20299_(1.0f);
        Vec3 vec3d1 = this.entity.m_20252_(1.0f);
        Vec3 vec3d2 = vec3d.m_82520_(vec3d1.f_82479_ * distance, vec3d1.f_82480_ * distance, vec3d1.f_82481_ * distance);
        BlockHitResult result = this.entity.m_9236_().m_45547_(new ClipContext(vec3d, vec3d2, ClipContext.Block.COLLIDER, stopOnLiquid ? ClipContext.Fluid.ANY : ClipContext.Fluid.NONE, this.entity));
        if (result.m_6662_() != HitResult.Type.MISS) {
            vec3d2 = result.m_82450_();
        }
        return this.findEntityOnPath(distance, vec3d, vec3d2);
    }

    private IEntity[] findEntityOnPath(double distance, Vec3 vec3d, Vec3 vec3d1) {
        List list = this.entity.m_9236_().m_45933_(this.entity, this.entity.m_20191_().m_82400_(distance));
        ArrayList<IEntity> result = new ArrayList<IEntity>();
        for (Entity entity1 : list) {
            AABB axisalignedbb;
            Optional optional;
            if (entity1 == this.entity || !(optional = (axisalignedbb = entity1.m_20191_().m_82400_((double)entity1.m_6143_())).m_82371_(vec3d, vec3d1)).isPresent()) continue;
            result.add(NpcAPI.Instance().getIEntity(entity1));
        }
        result.sort((o1, o2) -> {
            double d2;
            double d1 = this.entity.m_20280_(o1.getMCEntity());
            if (d1 == (d2 = this.entity.m_20280_(o2.getMCEntity()))) {
                return 0;
            }
            return d1 > d2 ? 1 : -1;
        });
        return result.toArray(new IEntity[result.size()]);
    }

    @Override
    public IEntity[] getAllRiders() {
        ImmutableList list = ImmutableList.copyOf((Iterable)this.entity.m_146897_());
        IEntity[] riders = new IEntity[list.size()];
        for (int i = 0; i < list.size(); ++i) {
            riders[i] = NpcAPI.Instance().getIEntity((Entity)list.get(i));
        }
        return riders;
    }

    @Override
    public void addRider(IEntity entity) {
        if (entity != null) {
            entity.getMCEntity().m_7998_(this.entity, true);
        }
    }

    @Override
    public void clearRiders() {
        this.entity.m_20153_();
    }

    @Override
    public IEntity getMount() {
        return NpcAPI.Instance().getIEntity(this.entity.m_20202_());
    }

    @Override
    public void setMount(IEntity entity) {
        if (entity == null) {
            this.entity.m_8127_();
        } else {
            this.entity.m_7998_(entity.getMCEntity(), true);
        }
    }

    @Override
    public void setRotation(float rotation) {
        this.entity.m_146922_(rotation);
    }

    @Override
    public float getRotation() {
        return this.entity.m_146908_();
    }

    @Override
    public void setPitch(float rotation) {
        this.entity.m_146926_(rotation);
    }

    @Override
    public float getPitch() {
        return this.entity.m_146909_();
    }

    @Override
    public void knockback(int power, float direction) {
        float v = direction * (float)Math.PI / 180.0f;
        this.entity.m_5997_((double)(-Mth.m_14031_((float)v) * (float)power), 0.1 + (double)((float)power * 0.04f), (double)(Mth.m_14089_((float)v) * (float)power));
        this.entity.m_20256_(this.entity.m_20184_().m_82542_(0.6, 1.0, 0.6));
        ((Entity)this.entity).f_19864_ = true;
    }

    @Override
    public boolean isSneaking() {
        return this.entity.m_6047_();
    }

    @Override
    public boolean isSprinting() {
        return this.entity.m_20142_();
    }

    @Override
    public T getMCEntity() {
        return this.entity;
    }

    @Override
    public int getType() {
        return 0;
    }

    @Override
    public boolean typeOf(int type) {
        return type == this.getType();
    }

    @Override
    public String getUUID() {
        return this.entity.m_20148_().toString();
    }

    @Override
    public String generateNewUUID() {
        UUID id = UUID.randomUUID();
        this.entity.m_20084_(id);
        return id.toString();
    }

    @Override
    public INbt getNbt() {
        return NpcAPI.Instance().getINbt(this.entity.getPersistentData());
    }

    @Override
    public void storeAsClone(int tab, String name) {
        CompoundTag compound = new CompoundTag();
        if (!this.entity.m_20086_(compound)) {
            throw new CustomNPCsException("Cannot store dead entities", new Object[0]);
        }
        ServerCloneController.Instance.addClone(compound, name, tab);
    }

    @Override
    public INbt getEntityNbt() {
        CompoundTag compound = new CompoundTag();
        this.entity.m_20240_(compound);
        ResourceLocation resourcelocation = EntityType.m_20613_((EntityType)this.entity.m_6095_());
        if (this.getType() == 1) {
            resourcelocation = new ResourceLocation("player");
        }
        if (resourcelocation != null) {
            compound.m_128359_("id", resourcelocation.toString());
        }
        return NpcAPI.Instance().getINbt(compound);
    }

    @Override
    public void setEntityNbt(INbt nbt) {
        this.entity.m_20258_(nbt.getMCNBT());
    }

    @Override
    public void playAnimation(int type) {
        this.levelWrapper.getMCLevel().m_7726_().m_8394_(this.entity, (Packet)new ClientboundAnimatePacket(this.entity, type));
    }

    @Override
    public float getHeight() {
        return this.entity.m_20206_();
    }

    @Override
    public float getEyeHeight() {
        return this.entity.m_20192_();
    }

    @Override
    public float getWidth() {
        return this.entity.m_20205_();
    }

    @Override
    public IPos getPos() {
        return new BlockPosWrapper(this.entity.m_20183_());
    }

    @Override
    public void setPos(IPos pos) {
        this.entity.m_6034_((double)((float)pos.getX() + 0.5f), (double)pos.getY(), (double)((float)pos.getZ() + 0.5f));
    }

    @Override
    public String[] getTags() {
        return this.entity.m_19880_().toArray(new String[this.entity.m_19880_().size()]);
    }

    @Override
    public void addTag(String tag) {
        this.entity.m_20049_(tag);
    }

    @Override
    public boolean hasTag(String tag) {
        return this.entity.m_19880_().contains(tag);
    }

    @Override
    public void removeTag(String tag) {
        this.entity.m_20137_(tag);
    }

    @Override
    public double getMotionX() {
        return this.entity.m_20184_().f_82479_;
    }

    @Override
    public double getMotionY() {
        return this.entity.m_20184_().f_82480_;
    }

    @Override
    public double getMotionZ() {
        return this.entity.m_20184_().f_82481_;
    }

    @Override
    public void setMotionX(double motion) {
        Vec3 mo = this.entity.m_20184_();
        if (mo.f_82479_ == motion) {
            return;
        }
        this.entity.m_20334_(motion, mo.f_82480_, mo.f_82481_);
        ((Entity)this.entity).f_19864_ = true;
    }

    @Override
    public void setMotionY(double motion) {
        Vec3 mo = this.entity.m_20184_();
        if (mo.f_82480_ == motion) {
            return;
        }
        this.entity.m_20334_(mo.f_82479_, motion, mo.f_82481_);
        ((Entity)this.entity).f_19864_ = true;
    }

    @Override
    public void setMotionZ(double motion) {
        Vec3 mo = this.entity.m_20184_();
        if (mo.f_82481_ == motion) {
            return;
        }
        this.entity.m_20334_(mo.f_82479_, mo.f_82480_, motion);
        ((Entity)this.entity).f_19864_ = true;
    }
}

