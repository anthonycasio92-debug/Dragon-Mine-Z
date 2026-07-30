/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  net.minecraft.core.BlockPos
 *  net.minecraft.nbt.CompoundTag
 *  net.minecraft.resources.ResourceLocation
 *  net.minecraft.server.level.ServerLevel
 *  net.minecraft.world.Container
 *  net.minecraft.world.damagesource.DamageSource
 *  net.minecraft.world.entity.Entity
 *  net.minecraft.world.inventory.AbstractContainerMenu
 *  net.minecraft.world.item.ItemStack
 *  net.minecraft.world.level.Level
 *  net.minecraft.world.level.dimension.DimensionType
 *  net.minecraftforge.common.util.FakePlayer
 *  net.minecraftforge.eventbus.api.BusBuilder
 *  net.minecraftforge.eventbus.api.IEventBus
 *  net.minecraftforge.server.permission.PermissionAPI
 *  net.minecraftforge.server.permission.nodes.PermissionNode
 */
package noppes.npcs.api.wrapper;

import java.io.File;
import java.util.ArrayList;
import java.util.Map;
import net.minecraft.core.BlockPos;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.Container;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.inventory.AbstractContainerMenu;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.dimension.DimensionType;
import net.minecraftforge.common.util.FakePlayer;
import net.minecraftforge.eventbus.api.BusBuilder;
import net.minecraftforge.eventbus.api.IEventBus;
import net.minecraftforge.server.permission.PermissionAPI;
import net.minecraftforge.server.permission.nodes.PermissionNode;
import nikedemos.markovnames.generators.MarkovGenerator;
import noppes.npcs.CustomEntities;
import noppes.npcs.CustomNpcs;
import noppes.npcs.NoppesUtilServer;
import noppes.npcs.api.CustomNPCsException;
import noppes.npcs.api.IContainer;
import noppes.npcs.api.IDamageSource;
import noppes.npcs.api.INbt;
import noppes.npcs.api.IPos;
import noppes.npcs.api.IWorld;
import noppes.npcs.api.NpcAPI;
import noppes.npcs.api.block.IBlock;
import noppes.npcs.api.entity.ICustomNpc;
import noppes.npcs.api.entity.IEntity;
import noppes.npcs.api.entity.IPlayer;
import noppes.npcs.api.entity.data.IPlayerMail;
import noppes.npcs.api.gui.ICustomGui;
import noppes.npcs.api.handler.ICloneHandler;
import noppes.npcs.api.handler.IDialogHandler;
import noppes.npcs.api.handler.IFactionHandler;
import noppes.npcs.api.handler.IQuestHandler;
import noppes.npcs.api.handler.IRecipeHandler;
import noppes.npcs.api.item.IItemStack;
import noppes.npcs.api.overlay.IOverlay;
import noppes.npcs.api.wrapper.BlockPosWrapper;
import noppes.npcs.api.wrapper.BlockWrapper;
import noppes.npcs.api.wrapper.ContainerWrapper;
import noppes.npcs.api.wrapper.DamageSourceWrapper;
import noppes.npcs.api.wrapper.ItemStackWrapper;
import noppes.npcs.api.wrapper.NBTWrapper;
import noppes.npcs.api.wrapper.OverlayWrapper;
import noppes.npcs.api.wrapper.WorldWrapper;
import noppes.npcs.api.wrapper.WrapperEntityData;
import noppes.npcs.api.wrapper.gui.CustomGuiWrapper;
import noppes.npcs.containers.ContainerNpcInterface;
import noppes.npcs.controllers.DialogController;
import noppes.npcs.controllers.FactionController;
import noppes.npcs.controllers.QuestController;
import noppes.npcs.controllers.RecipeController;
import noppes.npcs.controllers.ServerCloneController;
import noppes.npcs.controllers.data.PlayerData;
import noppes.npcs.controllers.data.PlayerMail;
import noppes.npcs.entity.EntityCustomNpc;
import noppes.npcs.entity.EntityNPCInterface;
import noppes.npcs.mixin.EntityIMixin;
import noppes.npcs.shared.common.util.LRUHashMap;
import noppes.npcs.util.NBTJsonUtil;

public class WrapperNpcAPI
extends NpcAPI {
    private static final Map<DimensionType, WorldWrapper> worldCache = new LRUHashMap<DimensionType, WorldWrapper>(10);
    public static final IEventBus EVENT_BUS = BusBuilder.builder().build();
    private static NpcAPI instance = null;

    public static void clearCache() {
        worldCache.clear();
        BlockWrapper.clearCache();
    }

    @Override
    public IEntity getIEntity(Entity entity) {
        if (entity == null || entity.m_9236_().f_46443_) {
            return null;
        }
        if (entity instanceof EntityNPCInterface) {
            return ((EntityNPCInterface)entity).wrappedNPC;
        }
        return WrapperEntityData.get(entity);
    }

    @Override
    public ICustomNpc createNPC(Level level) {
        if (level.f_46443_) {
            return null;
        }
        EntityCustomNpc npc = new EntityCustomNpc(CustomEntities.entityCustomNpc, level);
        return npc.wrappedNPC;
    }

    public void registerPermissionNode(String permission, int defaultType) {
        throw new CustomNPCsException("registerPermissionNode is nolonger supported", new Object[0]);
    }

    @Override
    public boolean hasPermissionNode(String permission) {
        for (PermissionNode node : PermissionAPI.getRegisteredNodes()) {
            if (!node.getNodeName().equals(permission)) continue;
            return true;
        }
        return false;
    }

    @Override
    public ICustomNpc spawnNPC(Level level, int x, int y, int z) {
        if (level.f_46443_) {
            return null;
        }
        EntityCustomNpc npc = new EntityCustomNpc(CustomEntities.entityCustomNpc, level);
        npc.m_19890_((double)x + 0.5, y, (double)z + 0.5, 0.0f, 0.0f);
        npc.ais.setStartPos(x, y, z);
        npc.m_21153_(npc.m_21233_());
        level.m_7967_((Entity)npc);
        return npc.wrappedNPC;
    }

    public static NpcAPI Instance() {
        if (instance == null) {
            instance = new WrapperNpcAPI();
        }
        return instance;
    }

    @Override
    public IEventBus events() {
        return EVENT_BUS;
    }

    @Override
    public IBlock getIBlock(Level level, BlockPos pos) {
        return BlockWrapper.createNew(level, pos, level.m_8055_(pos));
    }

    @Override
    public IItemStack getIItemStack(ItemStack itemstack) {
        if (itemstack == null || itemstack.m_41619_()) {
            return ItemStackWrapper.AIR;
        }
        return (IItemStack)itemstack.getCapability(ItemStackWrapper.ITEMSCRIPTEDDATA_CAPABILITY, null).orElse((Object)ItemStackWrapper.AIR);
    }

    @Override
    public IWorld getIWorld(ServerLevel level) {
        WorldWrapper w = worldCache.get(level.m_6042_());
        if (w != null) {
            w.level = level;
            return w;
        }
        w = WorldWrapper.createNew(level);
        worldCache.put(level.m_6042_(), w);
        return w;
    }

    @Override
    public IWorld getIWorld(DimensionType dimension) {
        for (ServerLevel level : CustomNpcs.Server.m_129785_()) {
            if (level.m_6042_() != dimension) continue;
            return this.getIWorld(level);
        }
        throw new CustomNPCsException("Unknown dimension: " + dimension, new Object[0]);
    }

    @Override
    public IWorld getIWorld(String dimension) {
        ResourceLocation loc = new ResourceLocation(dimension);
        for (ServerLevel level : CustomNpcs.Server.m_129785_()) {
            if (!level.m_46472_().m_135782_().equals((Object)loc)) continue;
            return this.getIWorld(level);
        }
        throw new CustomNPCsException("Unknown dimension: " + loc, new Object[0]);
    }

    @Override
    public IContainer getIContainer(AbstractContainerMenu inventory) {
        return new ContainerWrapper(inventory);
    }

    @Override
    public IContainer getIContainer(Container container) {
        if (container instanceof ContainerNpcInterface) {
            return ContainerNpcInterface.getOrCreateIContainer((ContainerNpcInterface)container);
        }
        return new ContainerWrapper(container);
    }

    @Override
    public IFactionHandler getFactions() {
        this.checkLevel();
        return FactionController.instance;
    }

    private void checkLevel() {
        if (CustomNpcs.Server == null || CustomNpcs.Server.m_129918_()) {
            throw new CustomNPCsException("No world is loaded right now", new Object[0]);
        }
    }

    @Override
    public IRecipeHandler getRecipes() {
        this.checkLevel();
        return RecipeController.instance;
    }

    @Override
    public IQuestHandler getQuests() {
        this.checkLevel();
        return QuestController.instance;
    }

    @Override
    public IWorld[] getIWorlds() {
        this.checkLevel();
        ArrayList<IWorld> list = new ArrayList<IWorld>();
        for (ServerLevel level : CustomNpcs.Server.m_129785_()) {
            list.add(this.getIWorld(level));
        }
        return list.toArray(new IWorld[list.size()]);
    }

    @Override
    public IPos getIPos(double x, double y, double z) {
        return new BlockPosWrapper(new BlockPos((int)x, (int)y, (int)z));
    }

    @Override
    public File getGlobalDir() {
        return CustomNpcs.Dir;
    }

    @Override
    public File getLevelDir() {
        return CustomNpcs.getLevelSaveDirectory();
    }

    @Override
    public INbt getINbt(CompoundTag compound) {
        if (compound == null) {
            return new NBTWrapper(new CompoundTag());
        }
        return new NBTWrapper(compound);
    }

    @Override
    public INbt stringToNbt(String str) {
        if (str == null || str.isEmpty()) {
            throw new CustomNPCsException("Cant cast empty string to nbt", new Object[0]);
        }
        try {
            return this.getINbt(NBTJsonUtil.Convert(str));
        }
        catch (NBTJsonUtil.JsonException e) {
            throw new CustomNPCsException(e, "Failed converting " + str, new Object[0]);
        }
    }

    @Override
    public IDamageSource getIDamageSource(DamageSource damagesource) {
        return new DamageSourceWrapper(damagesource);
    }

    @Override
    public IDialogHandler getDialogs() {
        return DialogController.instance;
    }

    @Override
    public ICloneHandler getClones() {
        return ServerCloneController.Instance;
    }

    @Override
    public String executeCommand(IWorld level, String command) {
        FakePlayer player = EntityNPCInterface.CommandPlayer;
        ((EntityIMixin)player).setLevel((Level)level.getMCLevel());
        player.m_6034_(0.0, 0.0, 0.0);
        return NoppesUtilServer.runCommand((Level)level.getMCLevel(), BlockPos.f_121853_, "API", command, null, (Entity)player);
    }

    @Override
    public INbt getRawPlayerData(String uuid) {
        return this.getINbt(PlayerData.loadPlayerData(uuid));
    }

    @Override
    public IPlayerMail createMail(String sender, String subject) {
        PlayerMail mail = new PlayerMail();
        mail.sender = sender;
        mail.subject = subject;
        return mail;
    }

    @Override
    public ICustomGui createCustomGui(int id, int width, int height, boolean pauseGame, IPlayer player) {
        return new CustomGuiWrapper(player, id, width, height, pauseGame);
    }

    @Override
    public IOverlay createOverlay(int id) {
        return new OverlayWrapper(id);
    }

    @Override
    public String getRandomName(int dictionary, int gender) {
        return MarkovGenerator.fetch(dictionary, gender);
    }
}

