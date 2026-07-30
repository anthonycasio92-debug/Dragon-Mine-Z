/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  net.minecraft.world.entity.Mob
 */
package noppes.npcs.api.entity;

import net.minecraft.world.entity.Mob;
import noppes.npcs.api.ITimers;
import noppes.npcs.api.entity.IEntityLiving;
import noppes.npcs.api.entity.IMob;
import noppes.npcs.api.entity.IPlayer;
import noppes.npcs.api.entity.IProjectile;
import noppes.npcs.api.entity.data.INPCAdvanced;
import noppes.npcs.api.entity.data.INPCAi;
import noppes.npcs.api.entity.data.INPCDisplay;
import noppes.npcs.api.entity.data.INPCInventory;
import noppes.npcs.api.entity.data.INPCJob;
import noppes.npcs.api.entity.data.INPCRole;
import noppes.npcs.api.entity.data.INPCStats;
import noppes.npcs.api.handler.data.IDialog;
import noppes.npcs.api.handler.data.IFaction;
import noppes.npcs.api.item.IItemStack;

public interface ICustomNpc<T extends Mob>
extends IMob<T> {
    public INPCDisplay getDisplay();

    public INPCInventory getInventory();

    public INPCStats getStats();

    public INPCAi getAi();

    public INPCAdvanced getAdvanced();

    public IFaction getFaction();

    public void setFaction(int var1);

    public INPCRole getRole();

    public INPCJob getJob();

    public ITimers getTimers();

    public int getHomeX();

    public int getHomeY();

    public int getHomeZ();

    public IEntityLiving getOwner();

    public void setHome(int var1, int var2, int var3);

    public void reset();

    public void say(String var1);

    public void sayTo(IPlayer var1, String var2);

    public IProjectile shootItem(IEntityLiving var1, IItemStack var2, int var3);

    public IProjectile shootItem(double var1, double var3, double var5, IItemStack var7, int var8);

    public void giveItem(IPlayer var1, IItemStack var2);

    public void setDialog(int var1, IDialog var2);

    public IDialog getDialog(int var1);

    public void updateClient();

    public String executeCommand(String var1);

    public void trigger(int var1, Object ... var2);
}

