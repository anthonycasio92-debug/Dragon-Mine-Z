/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  org.bukkit.OfflinePlayer
 *  org.bukkit.entity.LivingEntity
 *  org.bukkit.entity.Player
 *  studio.magemonkey.codex.registry.provider.AttributeProvider
 */
package studio.magemonkey.fabled.api;

import org.bukkit.OfflinePlayer;
import org.bukkit.entity.LivingEntity;
import org.bukkit.entity.Player;
import studio.magemonkey.codex.registry.provider.AttributeProvider;
import studio.magemonkey.fabled.Fabled;
import studio.magemonkey.fabled.api.player.PlayerData;

public class FabledAttributeProvider
implements AttributeProvider {
    public double scaleAttribute(String name, LivingEntity entity, double value) {
        if (!(entity instanceof Player)) {
            return value;
        }
        Player player = (Player)entity;
        PlayerData data = Fabled.getData((OfflinePlayer)player);
        if (data == null) {
            return value;
        }
        return data.scaleStat(name, value);
    }
}

