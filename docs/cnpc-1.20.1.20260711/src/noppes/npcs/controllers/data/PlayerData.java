/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  net.minecraft.core.BlockPos
 *  net.minecraft.core.Direction
 *  net.minecraft.nbt.CompoundTag
 *  net.minecraft.nbt.Tag
 *  net.minecraft.resources.ResourceLocation
 *  net.minecraft.world.entity.Entity
 *  net.minecraft.world.entity.player.Player
 *  net.minecraft.world.item.ItemStack
 *  net.minecraft.world.level.Level
 *  net.minecraftforge.common.capabilities.Capability
 *  net.minecraftforge.common.capabilities.CapabilityManager
 *  net.minecraftforge.common.capabilities.CapabilityToken
 *  net.minecraftforge.common.capabilities.ICapabilityProvider
 *  net.minecraftforge.common.util.LazyOptional
 *  net.minecraftforge.event.AttachCapabilitiesEvent
 */
package noppes.npcs.controllers.data;

import java.io.File;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.Tag;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraftforge.common.capabilities.Capability;
import net.minecraftforge.common.capabilities.CapabilityManager;
import net.minecraftforge.common.capabilities.CapabilityToken;
import net.minecraftforge.common.capabilities.ICapabilityProvider;
import net.minecraftforge.common.util.LazyOptional;
import net.minecraftforge.event.AttachCapabilitiesEvent;
import noppes.npcs.CustomEntities;
import noppes.npcs.CustomNpcs;
import noppes.npcs.api.wrapper.ScreenSize;
import noppes.npcs.controllers.data.PlayerBankData;
import noppes.npcs.controllers.data.PlayerDialogData;
import noppes.npcs.controllers.data.PlayerFactionData;
import noppes.npcs.controllers.data.PlayerItemGiverData;
import noppes.npcs.controllers.data.PlayerMailData;
import noppes.npcs.controllers.data.PlayerQuestData;
import noppes.npcs.controllers.data.PlayerScriptData;
import noppes.npcs.controllers.data.PlayerSkinData;
import noppes.npcs.controllers.data.PlayerTransportData;
import noppes.npcs.entity.EntityCustomNpc;
import noppes.npcs.entity.EntityNPCInterface;
import noppes.npcs.entity.data.DataTimers;
import noppes.npcs.roles.RoleCompanion;
import noppes.npcs.shared.common.util.LogWriter;
import noppes.npcs.util.CustomNPCsScheduler;
import noppes.npcs.util.NBTJsonUtil;

public class PlayerData
implements ICapabilityProvider {
    public static Capability<PlayerData> PLAYERDATA_CAPABILITY = CapabilityManager.get((CapabilityToken)new CapabilityToken<PlayerData>(){});
    public BlockPos scriptBlockPos = BlockPos.f_121853_;
    private LazyOptional<PlayerData> instance = LazyOptional.of(() -> this);
    public PlayerDialogData dialogData = new PlayerDialogData();
    public PlayerBankData bankData = new PlayerBankData();
    public PlayerQuestData questData = new PlayerQuestData();
    public PlayerTransportData transportData = new PlayerTransportData();
    public PlayerFactionData factionData = new PlayerFactionData();
    public PlayerItemGiverData itemgiverData = new PlayerItemGiverData();
    public PlayerMailData mailData = new PlayerMailData();
    public PlayerSkinData skinData = new PlayerSkinData();
    public PlayerScriptData scriptData;
    public CompoundTag scriptStoreddata = new CompoundTag();
    public DataTimers timers = new DataTimers(this);
    public EntityNPCInterface editingNpc;
    public CompoundTag cloned;
    public Player player;
    public String playername = "";
    public String uuid = "";
    private EntityNPCInterface activeCompanion = null;
    public int companionID = 0;
    public int playerLevel = 0;
    public boolean updateClient = false;
    public int dialogId = -1;
    public ItemStack prevHeldItem = ItemStack.f_41583_;
    public Entity mounted;
    public ScreenSize screenSize = new ScreenSize(-1, -1);
    private static final ResourceLocation key = new ResourceLocation("customnpcs", "playerdata");
    private static PlayerData backup = new PlayerData();

    public void setNBT(CompoundTag data) {
        this.dialogData.loadNBTData(data);
        this.bankData.loadNBTData(data);
        this.questData.loadNBTData(data);
        this.transportData.loadNBTData(data);
        this.factionData.loadNBTData(data);
        this.itemgiverData.loadNBTData(data);
        this.mailData.loadNBTData(data);
        this.skinData.loadNBTData(data);
        this.timers.load(data);
        if (this.player != null) {
            this.playername = this.player.m_7755_().getString();
            this.uuid = this.player.m_20148_().toString();
        } else {
            this.playername = data.m_128461_("PlayerName");
            this.uuid = data.m_128461_("UUID");
        }
        this.companionID = data.m_128451_("PlayerCompanionId");
        if (data.m_128441_("PlayerCompanion") && !this.hasCompanion() && this.player != null) {
            EntityCustomNpc npc = new EntityCustomNpc(CustomEntities.entityCustomNpc, this.player.m_9236_());
            npc.m_7378_(data.m_128469_("PlayerCompanion"));
            npc.m_6034_(this.player.m_20185_(), this.player.m_20186_(), this.player.m_20189_());
            if (npc.role.getType() == 6) {
                ((RoleCompanion)npc.role).setSitting(false);
                this.player.m_9236_().m_7967_((Entity)npc);
                this.setCompanion(npc);
            }
        }
        this.scriptStoreddata = data.m_128469_("ScriptStoreddata");
    }

    public CompoundTag getSyncNBT() {
        CompoundTag compound = new CompoundTag();
        this.dialogData.saveNBTData(compound);
        this.questData.saveNBTData(compound);
        this.factionData.saveNBTData(compound);
        return compound;
    }

    public CompoundTag getNBT() {
        CompoundTag nbt;
        if (this.player != null) {
            this.playername = this.player.m_7755_().getString();
            this.uuid = this.player.m_20148_().toString();
        }
        CompoundTag compound = new CompoundTag();
        this.dialogData.saveNBTData(compound);
        this.bankData.saveNBTData(compound);
        this.questData.saveNBTData(compound);
        this.transportData.saveNBTData(compound);
        this.factionData.saveNBTData(compound);
        this.itemgiverData.saveNBTData(compound);
        this.mailData.saveNBTData(compound);
        this.skinData.saveNBTData(compound);
        this.timers.save(compound);
        compound.m_128359_("PlayerName", this.playername);
        compound.m_128359_("UUID", this.uuid);
        compound.m_128405_("PlayerCompanionId", this.companionID);
        compound.m_128365_("ScriptStoreddata", (Tag)this.scriptStoreddata);
        if (this.hasCompanion() && this.activeCompanion.m_20086_(nbt = new CompoundTag())) {
            compound.m_128365_("PlayerCompanion", (Tag)nbt);
        }
        return compound;
    }

    public boolean hasCompanion() {
        return this.activeCompanion != null && !this.activeCompanion.m_213877_();
    }

    public void setCompanion(EntityNPCInterface npc) {
        if (npc != null && npc.role.getType() != 6) {
            return;
        }
        ++this.companionID;
        this.activeCompanion = npc;
        if (npc != null) {
            ((RoleCompanion)npc.role).companionID = this.companionID;
        }
        this.save(false);
    }

    public void updateCompanion(Level level) {
        if (!this.hasCompanion() || level == this.activeCompanion.m_9236_()) {
            return;
        }
        RoleCompanion role = (RoleCompanion)this.activeCompanion.role;
        role.owner = this.player;
        if (!role.isFollowing()) {
            return;
        }
        CompoundTag nbt = new CompoundTag();
        this.activeCompanion.m_20086_(nbt);
        this.activeCompanion.m_146870_();
        EntityCustomNpc npc = new EntityCustomNpc(CustomEntities.entityCustomNpc, level);
        npc.m_7378_(nbt);
        npc.m_6034_(this.player.m_20185_(), this.player.m_20186_(), this.player.m_20189_());
        this.setCompanion(npc);
        ((RoleCompanion)npc.role).setSitting(false);
        level.m_7967_((Entity)npc);
    }

    public <T> LazyOptional<T> getCapability(Capability<T> capability, Direction facing) {
        if (capability == PLAYERDATA_CAPABILITY) {
            return this.instance.cast();
        }
        return LazyOptional.empty();
    }

    public static void register(AttachCapabilitiesEvent<Entity> event) {
        if (event.getObject() instanceof Player) {
            event.addCapability(key, (ICapabilityProvider)new PlayerData());
        }
    }

    public synchronized void save(boolean update) {
        CompoundTag compound = this.getNBT();
        String filename = this.uuid + ".json";
        CustomNPCsScheduler.runTack(() -> {
            try {
                File saveDir = CustomNpcs.getLevelSaveDirectory("playerdata");
                File file = new File(saveDir, filename + "_new");
                File file1 = new File(saveDir, filename);
                NBTJsonUtil.SaveFile(file, compound);
                if (file1.exists()) {
                    file1.delete();
                }
                file.renameTo(file1);
            }
            catch (Exception e) {
                LogWriter.except(e);
            }
        });
        if (update) {
            this.updateClient = true;
        }
    }

    public static CompoundTag loadPlayerData(String player) {
        File saveDir = CustomNpcs.getLevelSaveDirectory("playerdata");
        Object filename = player;
        if (((String)filename).isEmpty()) {
            filename = "noplayername";
        }
        filename = (String)filename + ".json";
        File file = null;
        try {
            file = new File(saveDir, (String)filename);
            if (file.exists()) {
                return NBTJsonUtil.LoadFile(file);
            }
        }
        catch (Exception e) {
            LogWriter.error("Error loading: " + file.getAbsolutePath(), e);
        }
        return new CompoundTag();
    }

    public static PlayerData get(Player player) {
        if (player.m_9236_().f_46443_) {
            return CustomNpcs.proxy.getPlayerData(player);
        }
        PlayerData data = (PlayerData)player.getCapability(PLAYERDATA_CAPABILITY, null).orElse((Object)backup);
        if (data.player == null) {
            data.player = player;
            data.playerLevel = player.f_36078_;
            data.scriptData = new PlayerScriptData(player);
            CompoundTag compound = PlayerData.loadPlayerData(player.m_20148_().toString());
            data.setNBT(compound);
        }
        return data;
    }

    public ScreenSize getScreenSize() {
        return this.screenSize;
    }

    public void setScreenSize(ScreenSize size) {
        this.screenSize = size;
    }
}

