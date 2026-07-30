/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  org.bukkit.entity.LivingEntity
 */
package studio.magemonkey.fabled.api.skills;

import org.bukkit.entity.LivingEntity;

public interface SkillShot {
    public boolean cast(LivingEntity var1, int var2, boolean var3);

    public boolean cast(LivingEntity var1, int var2);
}

