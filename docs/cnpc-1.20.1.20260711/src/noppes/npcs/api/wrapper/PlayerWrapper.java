/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  net.minecraft.advancements.Advancement
 *  net.minecraft.advancements.AdvancementProgress
 *  net.minecraft.core.BlockPos
 *  net.minecraft.nbt.CompoundTag
 *  net.minecraft.nbt.NumericTag
 *  net.minecraft.nbt.Tag
 *  net.minecraft.network.chat.Component
 *  net.minecraft.network.chat.MutableComponent
 *  net.minecraft.network.protocol.Packet
 *  net.minecraft.network.protocol.game.ClientboundContainerSetSlotPacket
 *  net.minecraft.resources.ResourceKey
 *  net.minecraft.resources.ResourceLocation
 *  net.minecraft.server.level.ServerPlayer
 *  net.minecraft.sounds.SoundEvents
 *  net.minecraft.world.Container
 *  net.minecraft.world.entity.LivingEntity
 *  net.minecraft.world.entity.player.Player
 *  net.minecraft.world.item.Item
 *  net.minecraft.world.item.ItemStack
 *  net.minecraft.world.level.GameType
 *  net.minecraft.world.level.ItemLike
 *  net.minecraft.world.level.Level
 *  net.minecraftforge.registries.ForgeRegistries
 *  net.minecraftforge.server.permission.PermissionAPI
 *  net.minecraftforge.server.permission.nodes.PermissionNode
 */
package noppes.npcs.api.wrapper;

import java.util.ArrayList;
import net.minecraft.advancements.Advancement;
import net.minecraft.advancements.AdvancementProgress;
import net.minecraft.core.BlockPos;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.NumericTag;
import net.minecraft.nbt.Tag;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.network.protocol.Packet;
import net.minecraft.network.protocol.game.ClientboundContainerSetSlotPacket;
import net.minecraft.resources.ResourceKey;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.Container;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.ItemLike;
import net.minecraft.world.level.Level;
import net.minecraftforge.registries.ForgeRegistries;
import net.minecraftforge.server.permission.PermissionAPI;
import net.minecraftforge.server.permission.nodes.PermissionNode;
import noppes.npcs.CustomNpcsPermissions;
import noppes.npcs.EventHooks;
import noppes.npcs.NoppesUtilServer;
import noppes.npcs.api.CustomNPCsException;
import noppes.npcs.api.IContainer;
import noppes.npcs.api.IPlayerSkin;
import noppes.npcs.api.IPos;
import noppes.npcs.api.IScreenSize;
import noppes.npcs.api.ITimers;
import noppes.npcs.api.NpcAPI;
import noppes.npcs.api.block.IBlock;
import noppes.npcs.api.entity.IPlayer;
import noppes.npcs.api.entity.data.IData;
import noppes.npcs.api.entity.data.IPixelmonPlayerData;
import noppes.npcs.api.entity.data.IPlayerMail;
import noppes.npcs.api.gui.ICustomGui;
import noppes.npcs.api.handler.data.IQuest;
import noppes.npcs.api.item.IItemStack;
import noppes.npcs.api.overlay.IOverlay;
import noppes.npcs.api.wrapper.ContainerWrapper;
import noppes.npcs.api.wrapper.EntityLivingBaseWrapper;
import noppes.npcs.api.wrapper.gui.CustomGuiWrapper;
import noppes.npcs.client.EntityUtil;
import noppes.npcs.constants.EnumGuiType;
import noppes.npcs.containers.ContainerCustomGui;
import noppes.npcs.controllers.DialogController;
import noppes.npcs.controllers.FactionController;
import noppes.npcs.controllers.PixelmonHelper;
import noppes.npcs.controllers.PlayerQuestController;
import noppes.npcs.controllers.QuestController;
import noppes.npcs.controllers.data.Dialog;
import noppes.npcs.controllers.data.DialogOption;
import noppes.npcs.controllers.data.Faction;
import noppes.npcs.controllers.data.PlayerData;
import noppes.npcs.controllers.data.PlayerDialogData;
import noppes.npcs.controllers.data.PlayerMail;
import noppes.npcs.controllers.data.PlayerQuestData;
import noppes.npcs.controllers.data.Quest;
import noppes.npcs.controllers.data.QuestData;
import noppes.npcs.entity.EntityDialogNpc;
import noppes.npcs.packets.Packets;
import noppes.npcs.packets.client.PacketAchievement;
import noppes.npcs.packets.client.PacketChat;
import noppes.npcs.packets.client.PacketGuiClose;
import noppes.npcs.packets.client.PacketHideAllOverlays;
import noppes.npcs.packets.client.PacketOverlayHide;
import noppes.npcs.packets.client.PacketOverlayShow;
import noppes.npcs.packets.client.PacketPlayMusic;
import noppes.npcs.packets.client.PacketPlaySound;
import noppes.npcs.packets.client.PacketSoundGUIOpen;
import noppes.npcs.packets.server.SPacketDimensionTeleport;
import noppes.npcs.shared.client.util.NoppesStringUtils;
import noppes.npcs.util.ValueUtil;

public class PlayerWrapper<T extends ServerPlayer>
extends EntityLivingBaseWrapper<T>
implements IPlayer {
    private IContainer inventory;
    private Object pixelmonPartyStorage;
    private Object pixelmonPCStorage;
    private final IData storeddata = new IData(){

        @Override
        public void put(String key, Object value) {
            CompoundTag compound = this.getStoredCompound();
            if (value instanceof Number) {
                compound.m_128347_(key, ((Number)value).doubleValue());
            } else if (value instanceof String) {
                compound.m_128359_(key, (String)value);
            }
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
        }

        @Override
        public boolean has(String key) {
            return this.getStoredCompound().m_128441_(key);
        }

        @Override
        public void clear() {
            PlayerData data = PlayerData.get((Player)PlayerWrapper.this.entity);
            data.scriptStoreddata = new CompoundTag();
        }

        private CompoundTag getStoredCompound() {
            PlayerData data = PlayerData.get((Player)PlayerWrapper.this.entity);
            return data.scriptStoreddata;
        }

        @Override
        public String[] getKeys() {
            CompoundTag compound = this.getStoredCompound();
            return compound.m_128431_().toArray(new String[compound.m_128431_().size()]);
        }
    };
    private PlayerData data;

    public PlayerWrapper(T player) {
        super(player);
    }

    @Override
    public IData getStoreddata() {
        return this.storeddata;
    }

    @Override
    public String getName() {
        return ((ServerPlayer)this.entity).m_7755_().getString();
    }

    @Override
    public String getDisplayName() {
        return ((ServerPlayer)this.entity).m_5446_().getString();
    }

    @Override
    public int getHunger() {
        return ((ServerPlayer)this.entity).m_36324_().m_38702_();
    }

    @Override
    public void setHunger(int level) {
        ((ServerPlayer)this.entity).m_36324_().m_38705_(level);
    }

    @Override
    public boolean hasFinishedQuest(int id) {
        PlayerQuestData data = this.getData().questData;
        return data.finishedQuests.containsKey(id);
    }

    @Override
    public boolean hasActiveQuest(int id) {
        PlayerQuestData data = this.getData().questData;
        return data.activeQuests.containsKey(id);
    }

    @Override
    public IQuest[] getActiveQuests() {
        PlayerQuestData data = this.getData().questData;
        ArrayList<IQuest> quests = new ArrayList<IQuest>();
        for (int id : data.activeQuests.keySet()) {
            IQuest quest = QuestController.instance.quests.get(id);
            if (quest == null) continue;
            quests.add(quest);
        }
        return quests.toArray(new IQuest[quests.size()]);
    }

    @Override
    public IQuest[] getFinishedQuests() {
        PlayerQuestData data = this.getData().questData;
        ArrayList<IQuest> quests = new ArrayList<IQuest>();
        for (int id : data.finishedQuests.keySet()) {
            IQuest quest = QuestController.instance.quests.get(id);
            if (quest == null) continue;
            quests.add(quest);
        }
        return quests.toArray(new IQuest[quests.size()]);
    }

    @Override
    public void startQuest(int id) {
        Quest quest = QuestController.instance.quests.get(id);
        if (quest == null) {
            return;
        }
        QuestData questdata = new QuestData(quest);
        PlayerData data = this.getData();
        data.questData.activeQuests.put(id, questdata);
        Packets.send((ServerPlayer)this.entity, new PacketAchievement((Component)Component.m_237115_((String)"quest.newquest"), (Component)Component.m_237115_((String)quest.title), 2));
        MutableComponent text = Component.m_237115_((String)"quest.newquest").m_130946_(":").m_7220_((Component)Component.m_237115_((String)quest.title));
        Packets.send((ServerPlayer)this.entity, new PacketChat((Component)text));
        data.updateClient = true;
    }

    @Override
    public void sendNotification(String title, String msg, int type) {
        if (type < 0 || type > 3) {
            throw new CustomNPCsException("Wrong type value given " + type, new Object[0]);
        }
        Packets.send((ServerPlayer)this.entity, new PacketAchievement((Component)Component.m_237115_((String)title), (Component)Component.m_237115_((String)msg), type));
    }

    @Override
    public void finishQuest(int id) {
        Quest quest = QuestController.instance.quests.get(id);
        if (quest == null) {
            return;
        }
        PlayerData data = this.getData();
        data.questData.finishedQuests.put(id, System.currentTimeMillis());
        data.updateClient = true;
    }

    @Override
    public void stopQuest(int id) {
        Quest quest = QuestController.instance.quests.get(id);
        if (quest == null) {
            return;
        }
        PlayerData data = this.getData();
        data.questData.activeQuests.remove(id);
        data.updateClient = true;
    }

    @Override
    public void removeQuest(int id) {
        Quest quest = QuestController.instance.quests.get(id);
        if (quest == null) {
            return;
        }
        PlayerData data = this.getData();
        data.questData.activeQuests.remove(id);
        data.questData.finishedQuests.remove(id);
        data.updateClient = true;
    }

    @Override
    public boolean hasReadDialog(int id) {
        PlayerDialogData data = this.getData().dialogData;
        return data.dialogsRead.contains(id);
    }

    @Override
    public void showDialog(int id, String name) {
        Dialog dialog = DialogController.instance.dialogs.get(id);
        if (dialog == null) {
            throw new CustomNPCsException("Unknown Dialog id: " + id, new Object[0]);
        }
        if (!dialog.availability.isAvailable((Player)this.entity)) {
            return;
        }
        EntityDialogNpc npc = new EntityDialogNpc((Level)this.getWorld().getMCLevel());
        npc.display.setName(name);
        EntityUtil.Copy((LivingEntity)this.entity, (LivingEntity)npc);
        DialogOption option = new DialogOption();
        option.dialogId = id;
        option.title = dialog.title;
        npc.dialogs.put(0, option);
        NoppesUtilServer.openDialog((Player)this.entity, npc, dialog);
    }

    @Override
    public void addFactionPoints(int faction, int points) {
        PlayerData data = this.getData();
        data.factionData.increasePoints((Player)this.entity, faction, points);
        data.updateClient = true;
    }

    @Override
    public int getFactionPoints(int faction) {
        return this.getData().factionData.getFactionPoints((Player)this.entity, faction);
    }

    @Override
    public float getRotation() {
        return ((ServerPlayer)this.entity).m_146908_();
    }

    @Override
    public void setRotation(float rotation) {
        ((ServerPlayer)this.entity).m_146922_(rotation);
    }

    @Override
    public void message(String message) {
        ((ServerPlayer)this.entity).m_213846_((Component)Component.m_237115_((String)NoppesStringUtils.formatText(message, this.entity)));
    }

    @Override
    public int getGamemode() {
        return ((ServerPlayer)this.entity).f_8941_.m_9290_().m_46392_();
    }

    @Override
    public void setGamemode(int type) {
        ((ServerPlayer)this.entity).m_143403_(GameType.m_46393_((int)type));
    }

    @Override
    public int inventoryItemCount(IItemStack item) {
        int count = 0;
        for (int i = 0; i < ((ServerPlayer)this.entity).m_150109_().m_6643_(); ++i) {
            ItemStack is = ((ServerPlayer)this.entity).m_150109_().m_8020_(i);
            if (is == null || !this.isItemEqual(item.getMCItemStack(), is)) continue;
            count += is.m_41613_();
        }
        return count;
    }

    private boolean isItemEqual(ItemStack stack, ItemStack other) {
        if (other.m_41619_()) {
            return false;
        }
        return stack.m_41720_() == other.m_41720_();
    }

    @Override
    public int inventoryItemCount(String id) {
        Item item = (Item)ForgeRegistries.ITEMS.getValue(new ResourceLocation(id));
        if (item == null) {
            throw new CustomNPCsException("Unknown item id: " + id, new Object[0]);
        }
        return this.inventoryItemCount(NpcAPI.Instance().getIItemStack(new ItemStack((ItemLike)item, 1)));
    }

    @Override
    public IContainer getInventory() {
        if (this.inventory == null) {
            this.inventory = new ContainerWrapper((Container)((ServerPlayer)this.entity).m_150109_());
        }
        return this.inventory;
    }

    @Override
    public IItemStack getInventoryHeldItem() {
        return NpcAPI.Instance().getIItemStack(((ServerPlayer)this.entity).f_36096_.m_142621_());
    }

    @Override
    public boolean removeItem(IItemStack item, int amount) {
        int count = this.inventoryItemCount(item);
        if (amount > count) {
            return false;
        }
        if (count == amount) {
            this.removeAllItems(item);
        } else {
            for (int i = 0; i < ((ServerPlayer)this.entity).m_150109_().m_6643_(); ++i) {
                ItemStack is = ((ServerPlayer)this.entity).m_150109_().m_8020_(i);
                if (is == null || !this.isItemEqual(item.getMCItemStack(), is)) continue;
                if (amount >= is.m_41613_()) {
                    ((ServerPlayer)this.entity).m_150109_().m_6836_(i, ItemStack.f_41583_);
                    amount -= is.m_41613_();
                    continue;
                }
                is.m_41620_(amount);
                break;
            }
        }
        this.updatePlayerInventory();
        return true;
    }

    @Override
    public boolean removeItem(String id, int amount) {
        Item item = (Item)ForgeRegistries.ITEMS.getValue(new ResourceLocation(id));
        if (item == null) {
            throw new CustomNPCsException("Unknown item id: " + id, new Object[0]);
        }
        return this.removeItem(NpcAPI.Instance().getIItemStack(new ItemStack((ItemLike)item, 1)), amount);
    }

    @Override
    public boolean giveItem(IItemStack item) {
        ItemStack mcItem = item.getMCItemStack();
        if (mcItem.m_41619_()) {
            return false;
        }
        boolean bo = ((ServerPlayer)this.entity).m_150109_().m_36054_(mcItem.m_41777_());
        if (bo) {
            NoppesUtilServer.playSound((LivingEntity)this.entity, SoundEvents.f_12019_, 0.2f, ((((ServerPlayer)this.entity).m_217043_().m_188501_() - ((ServerPlayer)this.entity).m_217043_().m_188501_()) * 0.7f + 1.0f) * 2.0f);
            this.updatePlayerInventory();
        }
        return bo;
    }

    @Override
    public boolean giveItem(String id, int amount) {
        Item item = (Item)ForgeRegistries.ITEMS.getValue(new ResourceLocation(id));
        if (item == null) {
            return false;
        }
        ItemStack mcStack = new ItemStack((ItemLike)item);
        IItemStack itemStack = NpcAPI.Instance().getIItemStack(mcStack);
        itemStack.setStackSize(amount);
        return this.giveItem(itemStack);
    }

    @Override
    public void updatePlayerInventory() {
        ((ServerPlayer)this.entity).f_36095_.m_38946_();
        ((ServerPlayer)this.entity).f_8906_.m_9829_((Packet)new ClientboundContainerSetSlotPacket(-2, 0, ((ServerPlayer)this.entity).m_150109_().f_35977_, ((ServerPlayer)this.entity).m_150109_().m_8020_(((ServerPlayer)this.entity).m_150109_().f_35977_)));
        PlayerQuestData playerdata = this.getData().questData;
        playerdata.checkQuestCompletion((Player)this.entity, 0);
    }

    @Override
    public IBlock getSpawnPoint() {
        return NpcAPI.Instance().getIBlock(((ServerPlayer)this.entity).m_9236_(), ((ServerPlayer)this.entity).m_8961_());
    }

    @Override
    public void setSpawnPoint(IBlock block) {
        this.setSpawnpoint(block.getX(), block.getY(), block.getZ());
    }

    @Override
    public void setSpawnpoint(int x, int y, int z) {
        x = ValueUtil.CorrectInt(x, -30000000, 30000000);
        z = ValueUtil.CorrectInt(z, -30000000, 30000000);
        y = ValueUtil.CorrectInt(y, 0, 256);
        ((ServerPlayer)this.entity).m_9158_(this.getWorld().getMCLevel().m_46472_(), new BlockPos(x, y, z), 0.0f, true, false);
    }

    @Override
    public void resetSpawnpoint() {
        ((ServerPlayer)this.entity).m_9158_(this.getWorld().getMCLevel().m_46472_(), null, 0.0f, true, false);
    }

    @Override
    public void removeAllItems(IItemStack item) {
        for (int i = 0; i < ((ServerPlayer)this.entity).m_150109_().m_6643_(); ++i) {
            ItemStack is = ((ServerPlayer)this.entity).m_150109_().m_8020_(i);
            if (is == null || !ItemStack.m_41656_((ItemStack)is, (ItemStack)item.getMCItemStack())) continue;
            ((ServerPlayer)this.entity).m_150109_().m_6836_(i, ItemStack.f_41583_);
        }
    }

    @Override
    public boolean hasAdvancement(String achievement) {
        Advancement advancement = ((ServerPlayer)this.entity).m_20194_().m_129889_().m_136041_(new ResourceLocation(achievement));
        if (advancement == null) {
            throw new CustomNPCsException("Advancement doesnt exist", new Object[0]);
        }
        AdvancementProgress progress = ((ServerPlayer)this.entity).m_20194_().m_6846_().m_11296_((ServerPlayer)this.entity).m_135996_(advancement);
        return progress.m_8193_();
    }

    @Override
    public int getExpLevel() {
        return ((ServerPlayer)this.entity).f_36078_;
    }

    @Override
    public void setExpLevel(int level) {
        ((ServerPlayer)this.entity).m_6749_(level - ((ServerPlayer)this.entity).f_36078_);
    }

    @Override
    public void setPosition(double x, double y, double z) {
        SPacketDimensionTeleport.teleportPlayer((ServerPlayer)this.entity, x, y, z, (ResourceKey<Level>)((ServerPlayer)this.entity).m_9236_().m_46472_());
    }

    @Override
    public void setPos(IPos pos) {
        SPacketDimensionTeleport.teleportPlayer((ServerPlayer)this.entity, pos.getX(), pos.getY(), pos.getZ(), (ResourceKey<Level>)((ServerPlayer)this.entity).m_9236_().m_46472_());
    }

    @Override
    public int getType() {
        return 1;
    }

    @Override
    public boolean typeOf(int type) {
        return type == 1 ? true : super.typeOf(type);
    }

    @Override
    public boolean hasPermission(String permission) {
        for (PermissionNode node : PermissionAPI.getRegisteredNodes()) {
            if (!node.getNodeName().equals(permission)) continue;
            try {
                return CustomNpcsPermissions.hasPermission((ServerPlayer)this.entity, (PermissionNode<Boolean>)node);
            }
            catch (Throwable throwable) {
            }
        }
        return false;
    }

    @Override
    public IPixelmonPlayerData getPixelmonData() {
        if (!PixelmonHelper.Enabled) {
            throw new CustomNPCsException("Pixelmon isnt installed", new Object[0]);
        }
        return new IPixelmonPlayerData(){

            @Override
            public Object getParty() {
                if (PlayerWrapper.this.pixelmonPartyStorage == null) {
                    PlayerWrapper.this.pixelmonPartyStorage = PixelmonHelper.getParty((Player)PlayerWrapper.this.entity);
                }
                return PlayerWrapper.this.pixelmonPartyStorage;
            }

            @Override
            public Object getPC() {
                if (PlayerWrapper.this.pixelmonPCStorage == null) {
                    PlayerWrapper.this.pixelmonPCStorage = PixelmonHelper.getPc((Player)PlayerWrapper.this.entity);
                }
                return PlayerWrapper.this.pixelmonPCStorage;
            }
        };
    }

    private PlayerData getData() {
        if (this.data == null) {
            this.data = PlayerData.get((Player)this.entity);
        }
        return this.data;
    }

    @Override
    public ITimers getTimers() {
        return this.getData().timers;
    }

    @Override
    public void removeDialog(int id) {
        PlayerData data = this.getData();
        data.dialogData.dialogsRead.remove(id);
        data.updateClient = true;
    }

    @Override
    public void addDialog(int id) {
        PlayerData data = this.getData();
        data.dialogData.dialogsRead.add(id);
        data.updateClient = true;
    }

    @Override
    public void closeGui() {
        ((ServerPlayer)this.entity).m_6915_();
        Packets.send((ServerPlayer)this.entity, new PacketGuiClose(new CompoundTag()));
    }

    @Override
    public int factionStatus(int factionId) {
        Faction faction = FactionController.instance.getFaction(factionId);
        if (faction == null) {
            throw new CustomNPCsException("Unknown faction: " + factionId, new Object[0]);
        }
        return faction.playerStatus(this);
    }

    @Override
    public void kick(String message) {
        ((ServerPlayer)this.entity).f_8906_.m_9942_((Component)Component.m_237115_((String)message));
    }

    @Override
    public boolean canQuestBeAccepted(int questId) {
        return PlayerQuestController.canQuestBeAccepted((Player)this.entity, questId);
    }

    @Override
    public void showCustomGui(ICustomGui gui) {
        NoppesUtilServer.openContainerGui((ServerPlayer)this.getMCEntity(), EnumGuiType.CustomGui, buf -> buf.m_130079_(((CustomGuiWrapper)gui).toNBT()));
        ((ContainerCustomGui)((ServerPlayer)this.getMCEntity()).f_36096_).setGui((CustomGuiWrapper)gui, (Player)this.entity);
    }

    @Override
    public ICustomGui getCustomGui() {
        if (((ServerPlayer)this.entity).f_36096_ instanceof ContainerCustomGui) {
            return ((ContainerCustomGui)((ServerPlayer)this.entity).f_36096_).customGui;
        }
        return null;
    }

    @Override
    public void clearData() {
        PlayerData data = this.getData();
        data.setNBT(new CompoundTag());
        data.save(true);
    }

    @Override
    public IContainer getOpenContainer() {
        return NpcAPI.Instance().getIContainer(((ServerPlayer)this.entity).f_36096_);
    }

    @Override
    public void playSound(String sound, float volume, float pitch) {
        BlockPos pos = ((ServerPlayer)this.entity).m_20183_();
        Packets.send((ServerPlayer)this.entity, new PacketPlaySound(sound, pos, volume, pitch));
    }

    @Override
    public void playMusic(String sound, boolean background, boolean loops) {
        Packets.send((ServerPlayer)this.entity, new PacketPlayMusic(sound, !background, loops));
    }

    @Override
    public void sendMail(IPlayerMail mail) {
        PlayerData data = this.getData();
        data.mailData.playermail.add(((PlayerMail)mail).copy());
        data.save(false);
    }

    @Override
    public void trigger(int id, Object ... arguments) {
        EventHooks.onScriptTriggerEvent(PlayerData.get((Player)((Player)this.entity)).scriptData, id, this.getWorld(), this.getPos(), null, arguments);
    }

    @Override
    public void showOverlay(IOverlay overlay) {
        Packets.send((ServerPlayer)this.entity, new PacketOverlayShow(overlay.toNbt()));
    }

    @Override
    public void showSoundSelectionGUI() {
        Packets.send((ServerPlayer)this.entity, new PacketSoundGUIOpen());
    }

    @Override
    public void hideOverlay(int id) {
        Packets.send((ServerPlayer)this.entity, new PacketOverlayHide(id));
    }

    @Override
    public void hideAllOverlays() {
        Packets.send((ServerPlayer)this.entity, new PacketHideAllOverlays(true));
    }

    @Override
    public IPlayerSkin getSkin() {
        return PlayerData.get((Player)((Player)this.entity)).skinData;
    }

    @Override
    public IScreenSize getScreenSize() {
        PlayerData data = PlayerData.get((Player)this.entity);
        return data.getScreenSize();
    }
}

