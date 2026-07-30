/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  net.minecraft.core.particles.ParticleOptions
 *  net.minecraft.core.particles.ParticleTypes
 *  net.minecraft.server.level.ServerLevel
 *  net.minecraft.server.level.ServerPlayer
 *  net.minecraft.sounds.SoundEvent
 *  net.minecraft.sounds.SoundSource
 *  net.minecraft.world.entity.Entity
 *  net.minecraft.world.entity.LivingEntity
 *  net.minecraft.world.level.Level
 *  net.minecraft.world.phys.Vec3
 *  net.minecraftforge.event.TickEvent$LevelTickEvent
 *  net.minecraftforge.event.TickEvent$Phase
 *  net.minecraftforge.event.entity.living.LivingAttackEvent
 *  net.minecraftforge.eventbus.api.EventPriority
 *  net.minecraftforge.eventbus.api.SubscribeEvent
 *  net.minecraftforge.fml.common.Mod$EventBusSubscriber
 *  net.minecraftforge.fml.common.Mod$EventBusSubscriber$Bus
 *  net.minecraftforge.registries.RegistryObject
 */
package com.dragonminez.common.combat.clash;

import com.dragonminez.common.combat.clash.BeamClash;
import com.dragonminez.common.combat.clash.ClashParticipant;
import com.dragonminez.common.init.MainSounds;
import com.dragonminez.common.init.entities.ki.AbstractKiProjectile;
import com.dragonminez.common.network.NetworkHandler;
import com.dragonminez.common.network.S2C.BeamClashStateS2C;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import net.minecraft.core.particles.ParticleOptions;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;
import net.minecraftforge.event.TickEvent;
import net.minecraftforge.event.entity.living.LivingAttackEvent;
import net.minecraftforge.eventbus.api.EventPriority;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.registries.RegistryObject;

@Mod.EventBusSubscriber(modid="dragonminez", bus=Mod.EventBusSubscriber.Bus.FORGE)
public class BeamClashManager {
    private static final double OPPOSITION_DOT = -0.3;
    private static final double CLASH_RADIUS_FACTOR = 1.0;
    private static final double CLASH_RADIUS_PAD = 1.5;
    private static final double MINOR_BREAK_FACTOR = 0.7;
    private static final double MINOR_BREAK_PAD = 0.6;
    private static final List<BeamClash> ACTIVE_CLASHES = new ArrayList<BeamClash>();
    private static final Set<UUID> CLASHING_OWNERS = new HashSet<UUID>();
    private static final RegistryObject<SoundEvent>[] PUNCH_SOUNDS = new RegistryObject[]{MainSounds.GOLPE1, MainSounds.GOLPE2, MainSounds.GOLPE3, MainSounds.GOLPE4, MainSounds.GOLPE5, MainSounds.GOLPE6};

    @SubscribeEvent
    public static void onLevelTick(TickEvent.LevelTickEvent event) {
        if (event.phase != TickEvent.Phase.END) {
            return;
        }
        Level level = event.level;
        if (!(level instanceof ServerLevel)) {
            return;
        }
        ServerLevel level2 = (ServerLevel)level;
        BeamClashManager.advanceActiveClashes();
        ArrayList<AbstractKiProjectile> majors = new ArrayList<AbstractKiProjectile>();
        ArrayList<AbstractKiProjectile> minors = new ArrayList<AbstractKiProjectile>();
        for (Entity entity : level2.m_8583_()) {
            AbstractKiProjectile ki;
            if (!(entity instanceof AbstractKiProjectile) || (ki = (AbstractKiProjectile)entity).m_213877_() || !(ki.m_19749_() instanceof LivingEntity)) continue;
            AbstractKiProjectile.ClashRole role = ki.getClashRole();
            if (role == AbstractKiProjectile.ClashRole.MAJOR && ki.isClashableBeam() && !ki.isClashLocked()) {
                majors.add(ki);
                continue;
            }
            if (role != AbstractKiProjectile.ClashRole.MINOR) continue;
            minors.add(ki);
        }
        BeamClashManager.detectNewClashes(majors);
        BeamClashManager.breakMinorAttacks(level2, majors, minors);
        BeamClashManager.rebuildClashingOwners();
        BeamClashManager.syncParticipants();
    }

    private static void advanceActiveClashes() {
        ACTIVE_CLASHES.removeIf(clash -> {
            BeamClash.Result result = clash.tick();
            switch (result) {
                case A_WINS: 
                case B_WINS: {
                    BeamClashManager.notifyEnded(clash);
                    clash.resolve(result);
                    return true;
                }
                case DISSOLVED: {
                    BeamClashManager.notifyEnded(clash);
                    clash.dissolve();
                    return true;
                }
            }
            return false;
        });
    }

    private static void detectNewClashes(List<AbstractKiProjectile> majors) {
        block0: for (int i = 0; i < majors.size(); ++i) {
            Entity entity;
            AbstractKiProjectile beamA = majors.get(i);
            if (beamA.isClashLocked() || !((entity = beamA.m_19749_()) instanceof LivingEntity)) continue;
            LivingEntity ownerA = (LivingEntity)entity;
            for (int j = i + 1; j < majors.size(); ++j) {
                LivingEntity ownerB;
                Entity entity2;
                AbstractKiProjectile beamB = majors.get(j);
                if (beamB.isClashLocked() || !((entity2 = beamB.m_19749_()) instanceof LivingEntity) || ownerA == (ownerB = (LivingEntity)entity2) || !BeamClashManager.beamsClash(beamA, beamB)) continue;
                BeamClash clash = new BeamClash(new ClashParticipant(beamA, ownerA), new ClashParticipant(beamB, ownerB));
                beamA.setClashLock(beamA.getClashBeamLength(), ownerB.m_20148_());
                beamB.setClashLock(beamB.getClashBeamLength(), ownerA.m_20148_());
                ACTIVE_CLASHES.add(clash);
                continue block0;
            }
        }
    }

    private static boolean beamsClash(AbstractKiProjectile beamA, AbstractKiProjectile beamB) {
        Vec3 dirB;
        Vec3 dirA = Vec3.m_82498_((float)beamA.getClashPitch(), (float)beamA.getClashYaw());
        if (dirA.m_82526_(dirB = Vec3.m_82498_((float)beamB.getClashPitch(), (float)beamB.getClashYaw())) > -0.3) {
            return false;
        }
        Vec3 a0 = beamA.m_20182_();
        Vec3 a1 = a0.m_82549_(dirA.m_82490_((double)Math.max(0.1f, beamA.getClashBeamLength())));
        Vec3 b0 = beamB.m_20182_();
        Vec3 b1 = b0.m_82549_(dirB.m_82490_((double)Math.max(0.1f, beamB.getClashBeamLength())));
        double threshold = (double)(beamA.getSize() + beamB.getSize()) * 1.0 + 1.5;
        return BeamClashManager.segmentDistanceSq(a0, a1, b0, b1) <= threshold * threshold;
    }

    private static void breakMinorAttacks(ServerLevel level, List<AbstractKiProjectile> majors, List<AbstractKiProjectile> minors) {
        if (minors.isEmpty()) {
            return;
        }
        for (AbstractKiProjectile major : majors) {
            Entity entity = major.m_19749_();
            if (!(entity instanceof LivingEntity)) continue;
            LivingEntity majorOwner = (LivingEntity)entity;
            Vec3 dir = Vec3.m_82498_((float)major.getClashPitch(), (float)major.getClashYaw());
            Vec3 a0 = major.m_20182_();
            Vec3 a1 = a0.m_82549_(dir.m_82490_((double)Math.max(0.1f, major.getClashBeamLength())));
            for (AbstractKiProjectile minor : minors) {
                if (minor.m_213877_() || minor.m_19749_() == majorOwner) continue;
                double threshold = (double)(major.getSize() + minor.getSize()) * 0.7 + 0.6;
                if (!(BeamClashManager.pointSegmentDistanceSq(minor.m_20182_(), a0, a1) <= threshold * threshold)) continue;
                BeamClashManager.shatterMinor(level, minor);
            }
        }
    }

    private static void shatterMinor(ServerLevel level, AbstractKiProjectile minor) {
        Vec3 p = minor.m_20182_();
        level.m_8767_((ParticleOptions)ParticleTypes.f_123759_, p.f_82479_, p.f_82480_, p.f_82481_, 6, 0.2, 0.2, 0.2, 0.02);
        level.m_6263_(null, p.f_82479_, p.f_82480_, p.f_82481_, (SoundEvent)MainSounds.KI_EXPLOSION_IMPACT.get(), SoundSource.PLAYERS, 0.6f, 1.3f);
        minor.m_146870_();
    }

    private static double segmentDistanceSq(Vec3 p1, Vec3 q1, Vec3 p2, Vec3 q2) {
        double t;
        double s;
        Vec3 d1 = q1.m_82546_(p1);
        Vec3 d2 = q2.m_82546_(p2);
        Vec3 r = p1.m_82546_(p2);
        double a = d1.m_82526_(d1);
        double e = d2.m_82526_(d2);
        double f = d2.m_82526_(r);
        double EPS = 1.0E-9;
        if (a <= 1.0E-9 && e <= 1.0E-9) {
            return r.m_82526_(r);
        }
        if (a <= 1.0E-9) {
            s = 0.0;
            t = BeamClashManager.clamp01(f / e);
        } else {
            double c = d1.m_82526_(r);
            if (e <= 1.0E-9) {
                t = 0.0;
                s = BeamClashManager.clamp01(-c / a);
            } else {
                double b;
                double denom = a * e - (b = d1.m_82526_(d2)) * b;
                s = denom > 1.0E-9 ? BeamClashManager.clamp01((b * f - c * e) / denom) : 0.0;
                t = (b * s + f) / e;
                if (t < 0.0) {
                    t = 0.0;
                    s = BeamClashManager.clamp01(-c / a);
                } else if (t > 1.0) {
                    t = 1.0;
                    s = BeamClashManager.clamp01((b - c) / a);
                }
            }
        }
        Vec3 c1 = p1.m_82549_(d1.m_82490_(s));
        Vec3 c2 = p2.m_82549_(d2.m_82490_(t));
        Vec3 diff = c1.m_82546_(c2);
        return diff.m_82526_(diff);
    }

    private static double pointSegmentDistanceSq(Vec3 p, Vec3 s0, Vec3 s1) {
        Vec3 d = s1.m_82546_(s0);
        double len2 = d.m_82526_(d);
        if (len2 <= 1.0E-9) {
            return p.m_82546_(s0).m_82556_();
        }
        double t = BeamClashManager.clamp01(p.m_82546_(s0).m_82526_(d) / len2);
        Vec3 proj = s0.m_82549_(d.m_82490_(t));
        return p.m_82546_(proj).m_82556_();
    }

    private static double clamp01(double v) {
        return v < 0.0 ? 0.0 : Math.min(v, 1.0);
    }

    private static void rebuildClashingOwners() {
        CLASHING_OWNERS.clear();
        for (BeamClash clash : ACTIVE_CLASHES) {
            CLASHING_OWNERS.add(clash.a().owner().m_20148_());
            CLASHING_OWNERS.add(clash.b().owner().m_20148_());
        }
    }

    private static void syncParticipants() {
        for (BeamClash clash : ACTIVE_CLASHES) {
            BeamClashManager.sendState(clash, clash.a());
            BeamClashManager.sendState(clash, clash.b());
        }
    }

    private static void sendState(BeamClash clash, ClashParticipant participant) {
        LivingEntity livingEntity = participant.owner();
        if (!(livingEntity instanceof ServerPlayer)) {
            return;
        }
        ServerPlayer player = (ServerPlayer)livingEntity;
        float advantage = clash.advantageFor((LivingEntity)player);
        ClashParticipant opponent = participant == clash.a() ? clash.b() : clash.a();
        NetworkHandler.sendToPlayer(new BeamClashStateS2C(true, participant.meterPhase(), 0.78f, 0.96f, advantage, participant.beam().getColorBorder(), opponent.owner().m_19879_()), player);
    }

    private static void notifyEnded(BeamClash clash) {
        BeamClashManager.notifyEnded(clash.a());
        BeamClashManager.notifyEnded(clash.b());
    }

    private static void notifyEnded(ClashParticipant participant) {
        LivingEntity livingEntity = participant.owner();
        if (livingEntity instanceof ServerPlayer) {
            ServerPlayer player = (ServerPlayer)livingEntity;
            NetworkHandler.sendToPlayer(BeamClashStateS2C.inactive(), player);
        }
    }

    public static boolean isClashing(UUID ownerId) {
        return CLASHING_OWNERS.contains(ownerId);
    }

    public static void handlePlayerPress(ServerPlayer player) {
        for (BeamClash clash : ACTIVE_CLASHES) {
            ClashParticipant participant = clash.participantFor(player.m_20148_());
            if (participant == null) continue;
            participant.registerPlayerPress();
            BeamClashManager.playPunchSound(player);
            return;
        }
    }

    private static void playPunchSound(ServerPlayer player) {
        SoundEvent sound = (SoundEvent)PUNCH_SOUNDS[player.m_217043_().m_188503_(PUNCH_SOUNDS.length)].get();
        float pitch = 0.9f + player.m_217043_().m_188501_() * 0.2f;
        player.m_9236_().m_6263_(null, player.m_20185_(), player.m_20186_(), player.m_20189_(), sound, SoundSource.PLAYERS, 1.0f, pitch);
    }

    @SubscribeEvent(priority=EventPriority.HIGHEST)
    public static void onClashingHurt(LivingAttackEvent event) {
        LivingEntity victim = event.getEntity();
        if (victim.m_9236_().f_46443_) {
            return;
        }
        if (BeamClashManager.isClashing(victim.m_20148_())) {
            event.setCanceled(true);
        }
    }
}

