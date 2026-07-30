/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  net.minecraftforge.eventbus.api.Event
 */
package noppes.npcs.api.event;

import net.minecraftforge.eventbus.api.Event;
import noppes.npcs.api.NpcAPI;

public class CustomNPCsEvent
extends Event {
    public final NpcAPI API = NpcAPI.Instance();
}

