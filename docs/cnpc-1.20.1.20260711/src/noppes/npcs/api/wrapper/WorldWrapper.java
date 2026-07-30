/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  com.google.common.collect.Lists
 *  net.minecraft.core.BlockPos
 *  net.minecraft.core.Vec3i
 *  net.minecraft.core.particles.ParticleOptions
 *  net.minecraft.core.particles.ParticleType
 *  net.minecraft.nbt.CompoundTag
 *  net.minecraft.nbt.NumericTag
 *  net.minecraft.nbt.Tag
 *  net.minecraft.network.chat.Component
 *  net.minecraft.network.chat.MutableComponent
 *  net.minecraft.resources.ResourceKey
 *  net.minecraft.resources.ResourceLocation
 *  net.minecraft.server.level.ServerChunkCache
 *  net.minecraft.server.level.ServerLevel
 *  net.minecraft.util.Mth
 *  net.minecraft.world.entity.Entity
 *  net.minecraft.world.entity.EntitySelector
 *  net.minecraft.world.entity.EntityType
 *  net.minecraft.world.entity.LightningBolt
 *  net.minecraft.world.entity.LivingEntity
 *  net.minecraft.world.entity.animal.Animal
 *  net.minecraft.world.entity.item.ItemEntity
 *  net.minecraft.world.entity.monster.Monster
 *  net.minecraft.world.entity.npc.Villager
 *  net.minecraft.world.entity.player.Player
 *  net.minecraft.world.entity.projectile.AbstractArrow
 *  net.minecraft.world.entity.projectile.ThrowableProjectile
 *  net.minecraft.world.item.Item
 *  net.minecraft.world.item.ItemStack
 *  net.minecraft.world.level.ItemLike
 *  net.minecraft.world.level.Level
 *  net.minecraft.world.level.Level$ExplosionInteraction
 *  net.minecraft.world.level.block.Block
 *  net.minecraft.world.level.storage.ServerLevelData
 *  net.minecraft.world.phys.AABB
 *  net.minecraftforge.registries.ForgeRegistries
 */
package noppes.npcs.api.wrapper;

import com.google.common.collect.Lists;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Predicate;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Vec3i;
import net.minecraft.core.particles.ParticleOptions;
import net.minecraft.core.particles.ParticleType;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.NumericTag;
import net.minecraft.nbt.Tag;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.resources.ResourceKey;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerChunkCache;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntitySelector;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LightningBolt;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.animal.Animal;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.monster.Monster;
import net.minecraft.world.entity.npc.Villager;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.entity.projectile.AbstractArrow;
import net.minecraft.world.entity.projectile.ThrowableProjectile;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.ItemLike;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.storage.ServerLevelData;
import net.minecraft.world.phys.AABB;
import net.minecraftforge.registries.ForgeRegistries;
import noppes.npcs.EventHooks;
import noppes.npcs.api.CustomNPCsException;
import noppes.npcs.api.IDimension;
import noppes.npcs.api.INbt;
import noppes.npcs.api.IPos;
import noppes.npcs.api.IScoreboard;
import noppes.npcs.api.IWorld;
import noppes.npcs.api.NpcAPI;
import noppes.npcs.api.block.IBlock;
import noppes.npcs.api.entity.IEntity;
import noppes.npcs.api.entity.IPlayer;
import noppes.npcs.api.entity.data.IData;
import noppes.npcs.api.item.IItemStack;
import noppes.npcs.api.wrapper.BlockPosWrapper;
import noppes.npcs.api.wrapper.DimensionWrapper;
import noppes.npcs.api.wrapper.ScoreboardWrapper;
import noppes.npcs.controllers.PixelmonHelper;
import noppes.npcs.controllers.ScriptController;
import noppes.npcs.entity.EntityNPCInterface;
import noppes.npcs.entity.EntityProjectile;
import noppes.npcs.packets.Packets;
import noppes.npcs.packets.client.PacketPlaySound;

public class WorldWrapper
implements IWorld {
    public static Map<String, Object> tempData = new HashMap<String, Object>();
    public ServerLevel level;
    public IDimension dimension;
    private IData tempdata = new IData(){

        @Override
        public void put(String key, Object value) {
            tempData.put(key, value);
        }

        @Override
        public Object get(String key) {
            return tempData.get(key);
        }

        @Override
        public void remove(String key) {
            tempData.remove(key);
        }

        @Override
        public boolean has(String key) {
            return tempData.containsKey(key);
        }

        @Override
        public void clear() {
            tempData.clear();
        }

        @Override
        public String[] getKeys() {
            return tempData.keySet().toArray(new String[tempData.size()]);
        }
    };
    private IData storeddata = new IData(){

        @Override
        public void put(String key, Object value) {
            CompoundTag compound = ScriptController.Instance.compound;
            if (value instanceof Number) {
                compound.m_128347_(key, ((Number)value).doubleValue());
            } else if (value instanceof String) {
                compound.m_128359_(key, (String)value);
            }
            ScriptController.Instance.shouldSave = true;
        }

        @Override
        public Object get(String key) {
            CompoundTag compound = ScriptController.Instance.compound;
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
            ScriptController.Instance.compound.m_128473_(key);
            ScriptController.Instance.shouldSave = true;
        }

        @Override
        public boolean has(String key) {
            return ScriptController.Instance.compound.m_128441_(key);
        }

        @Override
        public void clear() {
            ScriptController.Instance.compound = new CompoundTag();
            ScriptController.Instance.shouldSave = true;
        }

        @Override
        public String[] getKeys() {
            return ScriptController.Instance.compound.m_128431_().toArray(new String[ScriptController.Instance.compound.m_128431_().size()]);
        }
    };

    private WorldWrapper(Level level) {
        this.level = (ServerLevel)level;
        this.dimension = new DimensionWrapper(level.m_46472_().m_135782_(), level.m_6042_());
    }

    @Override
    public ServerLevel getMCLevel() {
        return this.level;
    }

    @Override
    public IEntity[] getNearbyEntities(int x, int y, int z, int range, int type) {
        return this.getNearbyEntities(new BlockPosWrapper(new BlockPos(x, y, z)), range, type);
    }

    @Override
    public IEntity[] getNearbyEntities(IPos pos, int range, int type) {
        AABB bb = new AABB(0.0, 0.0, 0.0, 1.0, 1.0, 1.0).m_82338_(pos.getMCBlockPos()).m_82377_((double)range, (double)range, (double)range);
        List entities = this.level.m_45976_(this.getClassForType(type), bb);
        ArrayList<IEntity> list = new ArrayList<IEntity>();
        for (Entity living : entities) {
            list.add(NpcAPI.Instance().getIEntity(living));
        }
        return list.toArray(new IEntity[list.size()]);
    }

    @Override
    public IEntity[] getAllEntities(int type) {
        List<Entity> entities = this.getEntities(this.getClassForType(type), EntitySelector.f_20406_);
        ArrayList<IEntity> list = new ArrayList<IEntity>();
        for (Entity living : entities) {
            list.add(NpcAPI.Instance().getIEntity(living));
        }
        return list.toArray(new IEntity[list.size()]);
    }

    public List<Entity> getEntities(Class<?> entityTypeIn, Predicate<? super Entity> predicateIn) {
        ArrayList list = Lists.newArrayList();
        ServerChunkCache serverchunkprovider = this.level.m_7726_();
        for (Entity entity : this.level.m_142646_().m_142273_()) {
            if (!entityTypeIn.isAssignableFrom(entity.getClass()) || !serverchunkprovider.m_5563_(Mth.m_14107_((double)entity.m_20185_()) >> 4, Mth.m_14107_((double)entity.m_20189_()) >> 4) || !predicateIn.test((Entity)entity)) continue;
            list.add(entity);
        }
        return list;
    }

    @Override
    public IEntity getClosestEntity(int x, int y, int z, int range, int type) {
        return this.getClosestEntity(new BlockPosWrapper(new BlockPos(x, y, z)), range, type);
    }

    @Override
    public IEntity getClosestEntity(IPos pos, int range, int type) {
        AABB bb = new AABB(0.0, 0.0, 0.0, 1.0, 1.0, 1.0).m_82338_(pos.getMCBlockPos()).m_82377_((double)range, (double)range, (double)range);
        List entities = this.level.m_45976_(this.getClassForType(type), bb);
        double distance = range * range * range;
        Entity entity = null;
        for (Entity e : entities) {
            double r = pos.getMCBlockPos().m_123331_((Vec3i)e.m_20183_());
            if (entity == null) {
                distance = r;
                entity = e;
                continue;
            }
            if (!(r < distance)) continue;
            distance = r;
            entity = e;
        }
        return NpcAPI.Instance().getIEntity(entity);
    }

    @Override
    public IEntity getEntity(String uuid) {
        try {
            UUID id = UUID.fromString(uuid);
            Entity e = this.level.m_8791_(id);
            if (e == null) {
                e = this.level.m_46003_(id);
            }
            if (e == null) {
                return null;
            }
            return NpcAPI.Instance().getIEntity(e);
        }
        catch (Exception e) {
            throw new CustomNPCsException("Given uuid was invalid " + uuid, new Object[0]);
        }
    }

    @Override
    public IEntity createEntityFromNBT(INbt nbt) {
        Entity entity = EntityType.m_20642_((CompoundTag)nbt.getMCNBT(), (Level)this.level).orElse(null);
        if (entity == null) {
            throw new CustomNPCsException("Failed to create an entity from given NBT", new Object[0]);
        }
        return NpcAPI.Instance().getIEntity(entity);
    }

    @Override
    public IEntity createEntity(String id) {
        ResourceLocation resource = new ResourceLocation(id);
        EntityType type = (EntityType)ForgeRegistries.ENTITY_TYPES.getValue(resource);
        Entity entity = type.m_20615_((Level)this.level);
        if (entity == null) {
            throw new CustomNPCsException("Failed to create an entity from given id: " + id, new Object[0]);
        }
        entity.m_6034_(0.0, 1.0, 0.0);
        return NpcAPI.Instance().getIEntity(entity);
    }

    @Override
    public IPlayer getPlayer(String name) {
        for (Player entityplayer : this.level.m_6907_()) {
            if (!name.equals(entityplayer.m_7755_().getString())) continue;
            return (IPlayer)NpcAPI.Instance().getIEntity((Entity)entityplayer);
        }
        return null;
    }

    private Class getClassForType(int type) {
        if (type == -1) {
            return Entity.class;
        }
        if (type == 5) {
            return LivingEntity.class;
        }
        if (type == 1) {
            return Player.class;
        }
        if (type == 4) {
            return Animal.class;
        }
        if (type == 3) {
            return Monster.class;
        }
        if (type == 2) {
            return EntityNPCInterface.class;
        }
        if (type == 6) {
            return ItemEntity.class;
        }
        if (type == 7) {
            return EntityProjectile.class;
        }
        if (type == 11) {
            return ThrowableProjectile.class;
        }
        if (type == 10) {
            return AbstractArrow.class;
        }
        if (type == 8) {
            return PixelmonHelper.getPixelmonClass();
        }
        if (type == 9) {
            return Villager.class;
        }
        return Entity.class;
    }

    @Override
    public long getTime() {
        return this.level.m_46468_();
    }

    @Override
    public void setTime(long time) {
        this.level.m_8615_(time);
    }

    @Override
    public long getTotalTime() {
        return this.level.m_46467_();
    }

    @Override
    public IBlock getBlock(int x, int y, int z) {
        return NpcAPI.Instance().getIBlock((Level)this.level, new BlockPos(x, y, z));
    }

    @Override
    public IBlock getBlock(IPos pos) {
        return NpcAPI.Instance().getIBlock((Level)this.level, pos.getMCBlockPos());
    }

    public boolean isChunkLoaded(int x, int z) {
        return this.level.m_7726_().m_5563_(x >> 4, z >> 4);
    }

    @Override
    public void setBlock(int x, int y, int z, String name, int meta) {
        this.setBlock(NpcAPI.Instance().getIPos(x, y, z), name);
    }

    @Override
    public IBlock setBlock(IPos pos, String name) {
        Block block = (Block)ForgeRegistries.BLOCKS.getValue(new ResourceLocation(name));
        if (block == null) {
            throw new CustomNPCsException("There is no such block: %s", name);
        }
        this.level.m_7731_(pos.getMCBlockPos(), block.m_49966_(), 2);
        return NpcAPI.Instance().getIBlock((Level)this.level, pos.getMCBlockPos());
    }

    @Override
    public void removeBlock(int x, int y, int z) {
        this.level.m_7471_(new BlockPos(x, y, z), false);
    }

    @Override
    public void removeBlock(IPos pos) {
        this.level.m_7471_(pos.getMCBlockPos(), false);
    }

    @Override
    public float getLightValue(int x, int y, int z) {
        return (float)this.level.m_7146_(new BlockPos(x, y, z)) / 16.0f;
    }

    @Override
    public IBlock getSpawnPoint() {
        BlockPos pos = this.level.m_220360_();
        if (pos == null) {
            pos = this.level.m_220360_();
        }
        return NpcAPI.Instance().getIBlock((Level)this.level, pos);
    }

    @Override
    public void setSpawnPoint(IBlock block) {
        ServerLevelData info = (ServerLevelData)this.level.m_6106_();
        info.m_7250_(new BlockPos(block.getX(), block.getY(), block.getZ()), 0.0f);
    }

    @Override
    public boolean isDay() {
        return this.level.m_46468_() % 24000L < 12000L;
    }

    @Override
    public boolean isRaining() {
        return this.level.m_6106_().m_6533_();
    }

    @Override
    public void setRaining(boolean bo) {
        ServerLevelData data = (ServerLevelData)this.level.m_6106_();
        if (bo) {
            data.m_5565_(true);
            data.m_6399_(120000000);
        } else {
            data.m_5565_(false);
            data.m_6399_(0);
        }
    }

    @Override
    public void thunderStrike(double x, double y, double z) {
        LightningBolt bolt = (LightningBolt)EntityType.f_20465_.m_20615_((Level)this.level);
        bolt.m_6027_(x, y, z);
        bolt.m_20874_(false);
        this.level.m_7967_((Entity)bolt);
    }

    @Override
    public void spawnParticle(String particle, double x, double y, double z, double dx, double dy, double dz, double speed, int count) {
        ParticleType type = (ParticleType)ForgeRegistries.PARTICLE_TYPES.getValue(new ResourceLocation(particle));
        if (type == null) {
            throw new CustomNPCsException("Unknown particle type: " + particle, new Object[0]);
        }
        this.level.m_8767_((ParticleOptions)type, x, y, z, count, dx, dy, dz, speed);
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
    public IItemStack createItem(String name, int size) {
        Item item = (Item)ForgeRegistries.ITEMS.getValue(new ResourceLocation(name));
        if (item == null) {
            throw new CustomNPCsException("Unknown item id: " + name, new Object[0]);
        }
        return NpcAPI.Instance().getIItemStack(new ItemStack((ItemLike)item, size));
    }

    @Override
    public IItemStack createItemFromNbt(INbt nbt) {
        ItemStack item = ItemStack.m_41712_((CompoundTag)nbt.getMCNBT());
        if (item.m_41619_()) {
            throw new CustomNPCsException("Failed to create an item from given NBT", new Object[0]);
        }
        return NpcAPI.Instance().getIItemStack(item);
    }

    @Override
    public void explode(double x, double y, double z, float range, boolean fire, boolean grief) {
        this.level.m_255391_(null, x, y, z, range, fire, grief ? Level.ExplosionInteraction.TNT : Level.ExplosionInteraction.NONE);
    }

    @Override
    public IPlayer[] getAllPlayers() {
        List list = this.level.m_7654_().m_6846_().m_11314_();
        IPlayer[] arr = new IPlayer[list.size()];
        for (int i = 0; i < list.size(); ++i) {
            arr[i] = (IPlayer)NpcAPI.Instance().getIEntity((Entity)list.get(i));
        }
        return arr;
    }

    @Override
    public String getBiomeName(int x, int z) {
        try {
            return ((ResourceKey)this.level.m_204166_(new BlockPos(x, 0, z)).m_203543_().get()).m_135782_().toString();
        }
        catch (Exception e) {
            return "";
        }
    }

    @Override
    public IEntity spawnClone(double x, double y, double z, int tab, String name) {
        return NpcAPI.Instance().getClones().spawn(x, y, z, tab, name, this);
    }

    @Override
    public void spawnEntity(IEntity entity) {
        if (entity == null) {
            throw new CustomNPCsException("Entity given was null", new Object[0]);
        }
        Object e = entity.getMCEntity();
        if (this.level.m_8791_(e.m_20148_()) != null) {
            throw new CustomNPCsException("Entity with this UUID already exists", new Object[0]);
        }
        e.m_6034_(e.m_20185_(), e.m_20186_(), e.m_20189_());
        this.level.m_7967_(e);
    }

    @Override
    public IEntity getClone(int tab, String name) {
        return NpcAPI.Instance().getClones().get(tab, name, this);
    }

    @Override
    public IScoreboard getScoreboard() {
        return new ScoreboardWrapper(this.level.m_7654_());
    }

    @Override
    public void broadcast(String message) {
        MutableComponent text = Component.m_237113_((String)message);
        for (Player p : this.level.m_8795_(e -> true)) {
            p.m_213846_((Component)text);
        }
    }

    @Override
    public int getRedstonePower(int x, int y, int z) {
        return this.level.m_277173_(new BlockPos(x, y, z));
    }

    @Deprecated
    public static WorldWrapper createNew(ServerLevel level) {
        return new WorldWrapper((Level)level);
    }

    @Override
    public IDimension getDimension() {
        return new DimensionWrapper(this.level.m_46472_().m_135782_(), this.level.m_6042_());
    }

    @Override
    public String getName() {
        return ((ServerLevelData)this.level.m_6106_()).m_5462_();
    }

    @Override
    public BlockPos getMCBlockPos(int x, int y, int z) {
        return new BlockPos(x, y, z);
    }

    @Override
    public void playSoundAt(IPos pos, String sound, float volume, float pitch) {
        BlockPos bp = pos.getMCBlockPos();
        Packets.sendNearby((Level)this.level, bp, 16, new PacketPlaySound(sound, bp, volume, pitch));
    }

    @Override
    public void trigger(int id, Object ... arguments) {
        EventHooks.onScriptTriggerEvent(ScriptController.Instance.forgeScripts, id, this, BlockPosWrapper.ZERO, null, arguments);
    }
}

