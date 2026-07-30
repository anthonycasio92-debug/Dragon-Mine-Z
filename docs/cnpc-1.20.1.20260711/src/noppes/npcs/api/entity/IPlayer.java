/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  net.minecraft.server.level.ServerPlayer
 */
package noppes.npcs.api.entity;

import net.minecraft.server.level.ServerPlayer;
import noppes.npcs.api.IContainer;
import noppes.npcs.api.IPlayerSkin;
import noppes.npcs.api.IScreenSize;
import noppes.npcs.api.ITimers;
import noppes.npcs.api.block.IBlock;
import noppes.npcs.api.entity.IEntityLiving;
import noppes.npcs.api.entity.data.IPlayerMail;
import noppes.npcs.api.gui.ICustomGui;
import noppes.npcs.api.handler.data.IQuest;
import noppes.npcs.api.item.IItemStack;
import noppes.npcs.api.overlay.IOverlay;

public interface IPlayer<T extends ServerPlayer>
extends IEntityLiving<T> {
    public String getDisplayName();

    public boolean hasFinishedQuest(int var1);

    public boolean hasActiveQuest(int var1);

    public void startQuest(int var1);

    public int factionStatus(int var1);

    public void finishQuest(int var1);

    public void stopQuest(int var1);

    public void removeQuest(int var1);

    public boolean hasReadDialog(int var1);

    public void showDialog(int var1, String var2);

    public void showSoundSelectionGUI();

    public void removeDialog(int var1);

    public void addDialog(int var1);

    public void addFactionPoints(int var1, int var2);

    public int getFactionPoints(int var1);

    public void message(String var1);

    public int getGamemode();

    public void setGamemode(int var1);

    public int inventoryItemCount(IItemStack var1);

    public int inventoryItemCount(String var1);

    public IContainer getInventory();

    public IItemStack getInventoryHeldItem();

    public boolean removeItem(IItemStack var1, int var2);

    public boolean removeItem(String var1, int var2);

    public void removeAllItems(IItemStack var1);

    public boolean giveItem(IItemStack var1);

    public boolean giveItem(String var1, int var2);

    public void setSpawnpoint(int var1, int var2, int var3);

    public void resetSpawnpoint();

    public boolean hasAdvancement(String var1);

    public int getExpLevel();

    public void setExpLevel(int var1);

    public boolean hasPermission(String var1);

    public Object getPixelmonData();

    public ITimers getTimers();

    public void closeGui();

    @Override
    public T getMCEntity();

    public IBlock getSpawnPoint();

    public void setSpawnPoint(IBlock var1);

    public int getHunger();

    public void setHunger(int var1);

    public void kick(String var1);

    public void sendNotification(String var1, String var2, int var3);

    public void sendMail(IPlayerMail var1);

    public void clearData();

    public IQuest[] getActiveQuests();

    public IQuest[] getFinishedQuests();

    public void updatePlayerInventory();

    public void playSound(String var1, float var2, float var3);

    public void playMusic(String var1, boolean var2, boolean var3);

    public IContainer getOpenContainer();

    public boolean canQuestBeAccepted(int var1);

    public void showCustomGui(ICustomGui var1);

    public ICustomGui getCustomGui();

    public void trigger(int var1, Object ... var2);

    public void showOverlay(IOverlay var1);

    public void hideOverlay(int var1);

    public void hideAllOverlays();

    public IPlayerSkin getSkin();

    public IScreenSize getScreenSize();
}

