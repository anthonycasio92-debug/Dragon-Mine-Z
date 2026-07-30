/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  net.minecraft.core.Holder
 *  net.minecraft.core.Holder$Reference
 *  net.minecraft.core.registries.Registries
 *  net.minecraft.network.chat.Component
 *  net.minecraft.resources.ResourceKey
 *  net.minecraft.resources.ResourceLocation
 *  net.minecraft.world.damagesource.DamageSource
 *  net.minecraft.world.damagesource.DamageType
 *  net.minecraft.world.entity.Entity
 *  net.minecraft.world.entity.player.Player
 *  net.minecraft.world.level.Level
 */
package com.dragonminez.common.init;

import com.dragonminez.common.init.DMZDamageSource;
import com.dragonminez.common.init.entities.ki.AbstractKiProjectile;
import com.dragonminez.common.init.entities.ki.OzaruFistEntity;
import com.dragonminez.common.init.entities.ki.SPDragonFistEntity;
import com.dragonminez.common.stats.StatsCapability;
import com.dragonminez.common.stats.StatsProvider;
import com.dragonminez.common.stats.techniques.KiAttackData;
import com.dragonminez.common.stats.techniques.PredefinedTechniques;
import com.dragonminez.common.stats.techniques.TechniqueData;
import java.util.Locale;
import net.minecraft.core.Holder;
import net.minecraft.core.registries.Registries;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceKey;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.damagesource.DamageType;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;

public class MainDamageTypes {
    public static final ResourceKey<DamageType> KIBLAST = ResourceKey.m_135785_((ResourceKey)Registries.f_268580_, (ResourceLocation)ResourceLocation.fromNamespaceAndPath((String)"dragonminez", (String)"kiblast"));
    public static final ResourceKey<DamageType> STRIKE_ATTACK = ResourceKey.m_135785_((ResourceKey)Registries.f_268580_, (ResourceLocation)ResourceLocation.fromNamespaceAndPath((String)"dragonminez", (String)"strike_attack"));

    public static DamageSource kiblast(Level level, Entity projectile, Entity owner) {
        Holder.Reference holder = level.m_9598_().m_175515_(Registries.f_268580_).m_246971_(KIBLAST);
        String messageId = MainDamageTypes.resolveKiMessageId(projectile);
        boolean randomVariant = messageId.startsWith("kiblast.");
        Component techniqueName = randomVariant || messageId.equals("soul_punisher") ? MainDamageTypes.resolveKiName(projectile, owner) : null;
        return new DMZDamageSource((Holder<DamageType>)holder, projectile, owner, messageId, randomVariant, techniqueName);
    }

    private static String resolveKiMessageId(Entity projectile) {
        if (projectile instanceof OzaruFistEntity) {
            return "strike_attack.oozaru_fist";
        }
        if (projectile instanceof SPDragonFistEntity) {
            return "strike_attack.dragon_fist";
        }
        if (projectile instanceof AbstractKiProjectile) {
            AbstractKiProjectile proj = (AbstractKiProjectile)projectile;
            if ("soul_punisher".equals(proj.getTechniqueId())) {
                return "soul_punisher";
            }
            AbstractKiProjectile.KiType type = proj.getKiType();
            return "kiblast." + (type != null ? type.name().toLowerCase(Locale.ROOT) : "small_ball");
        }
        return "kiblast.small_ball";
    }

    private static Component resolveKiName(Entity projectile, Entity owner) {
        KiAttackData data;
        String techId;
        if (projectile instanceof AbstractKiProjectile) {
            AbstractKiProjectile proj = (AbstractKiProjectile)projectile;
            v0 = proj.getTechniqueId();
        } else {
            v0 = techId = null;
        }
        if (techId == null || techId.isEmpty()) {
            return Component.m_237115_((String)"death.attack.dmz.ki_generic");
        }
        if (PredefinedTechniques.isPredefinedTechniqueId(techId) && (data = PredefinedTechniques.REGISTRY.get(techId)) != null && data.getName() != null && !data.getName().isEmpty()) {
            return Component.m_237115_((String)data.getName());
        }
        Component custom = MainDamageTypes.resolveCustomName(owner, techId);
        return custom != null ? custom : Component.m_237115_((String)"death.attack.dmz.ki_generic");
    }

    private static Component resolveCustomName(Entity owner, String techId) {
        if (!(owner instanceof Player)) {
            return null;
        }
        Player player = (Player)owner;
        Component[] result = new Component[]{null};
        StatsProvider.get(StatsCapability.INSTANCE, (Entity)player).ifPresent(stats -> {
            TechniqueData tech = stats.getTechniques().getUnlockedTechniques().get(techId);
            if (tech != null && tech.getName() != null && !tech.getName().isEmpty()) {
                result[0] = Component.m_237113_((String)tech.getName());
            }
        });
        return result[0];
    }

    public static DamageSource strikeAttack(Level level, Entity attacker, String strikeId) {
        Holder.Reference holder = level.m_9598_().m_175515_(Registries.f_268580_).m_246971_(STRIKE_ATTACK);
        String id = strikeId != null && PredefinedTechniques.STRIKE_IDS.contains(strikeId) ? strikeId : "generic";
        return new DMZDamageSource((Holder<DamageType>)holder, attacker, attacker, "strike_attack." + id, false, null);
    }

    public static boolean isKiblastDamage(DamageSource source) {
        return source.m_269150_().m_203565_(KIBLAST);
    }

    public static boolean isStrikeAttackDamage(DamageSource source) {
        return source.m_269150_().m_203565_(STRIKE_ATTACK);
    }

    public static void register() {
    }
}

