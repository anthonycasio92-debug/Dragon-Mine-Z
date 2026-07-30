/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  net.minecraft.server.MinecraftServer
 *  net.minecraft.server.level.ServerPlayer
 *  net.minecraft.world.entity.Entity
 *  net.minecraft.world.entity.player.Player
 *  net.minecraftforge.common.capabilities.Capability
 *  net.minecraftforge.common.capabilities.CapabilityManager
 *  net.minecraftforge.common.capabilities.CapabilityToken
 *  net.minecraftforge.common.capabilities.ICapabilityProvider
 *  net.minecraftforge.common.capabilities.RegisterCapabilitiesEvent
 *  net.minecraftforge.event.AttachCapabilitiesEvent
 *  net.minecraftforge.event.TickEvent$Phase
 *  net.minecraftforge.event.TickEvent$PlayerTickEvent
 *  net.minecraftforge.event.entity.player.PlayerEvent$Clone
 *  net.minecraftforge.event.entity.player.PlayerEvent$PlayerChangedDimensionEvent
 *  net.minecraftforge.event.entity.player.PlayerEvent$PlayerLoggedInEvent
 *  net.minecraftforge.event.entity.player.PlayerEvent$PlayerRespawnEvent
 *  net.minecraftforge.eventbus.api.SubscribeEvent
 *  net.minecraftforge.fml.common.Mod$EventBusSubscriber
 */
package com.dragonminez.common.stats;

import com.dragonminez.Env;
import com.dragonminez.LogUtil;
import com.dragonminez.common.config.ConfigManager;
import com.dragonminez.common.network.NetworkHandler;
import com.dragonminez.common.network.S2C.ResourceSyncS2C;
import com.dragonminez.common.network.S2C.StatsSyncS2C;
import com.dragonminez.common.network.S2C.SyncQuestRegistryS2C;
import com.dragonminez.common.network.S2C.SyncServerConfigS2C;
import com.dragonminez.common.quest.PlayerQuestData;
import com.dragonminez.common.quest.QuestRegistry;
import com.dragonminez.common.stats.StatsData;
import com.dragonminez.common.stats.StatsProvider;
import com.dragonminez.common.util.TransformationsHelper;
import com.dragonminez.server.events.players.TickHandler;
import com.dragonminez.server.world.structure.helper.QuestStructureHints;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.player.Player;
import net.minecraftforge.common.capabilities.Capability;
import net.minecraftforge.common.capabilities.CapabilityManager;
import net.minecraftforge.common.capabilities.CapabilityToken;
import net.minecraftforge.common.capabilities.ICapabilityProvider;
import net.minecraftforge.common.capabilities.RegisterCapabilitiesEvent;
import net.minecraftforge.event.AttachCapabilitiesEvent;
import net.minecraftforge.event.TickEvent;
import net.minecraftforge.event.entity.player.PlayerEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;

@Mod.EventBusSubscriber(modid="dragonminez")
public class StatsCapability {
    public static final Capability<StatsData> INSTANCE = CapabilityManager.get((CapabilityToken)new CapabilityToken<StatsData>(){});
    private static StatsData CLIENT_CACHE;

    public static void clearClientCache() {
        CLIENT_CACHE = null;
    }

    @SubscribeEvent
    public static void onRegisterCapabilities(RegisterCapabilitiesEvent event) {
        event.register(StatsData.class);
    }

    @SubscribeEvent
    public static void onAttachCapabilities(AttachCapabilitiesEvent<Entity> event) {
        Player player;
        Object object = event.getObject();
        if (object instanceof Player && !(player = (Player)object).getCapability(INSTANCE).isPresent()) {
            event.addCapability(StatsProvider.ID, (ICapabilityProvider)new StatsProvider(player));
        }
    }

    @SubscribeEvent
    public static void onPlayerClone(PlayerEvent.Clone event) {
        Player player = event.getEntity();
        Player original = event.getOriginal();
        original.reviveCaps();
        TickHandler.registerForceKillGrace(player.m_20148_());
        StatsProvider.get(INSTANCE, (Entity)player).ifPresent(newData -> StatsProvider.get(INSTANCE, (Entity)original).ifPresent(oldData -> {
            newData.copyFrom((StatsData)oldData);
            if (player.m_9236_().f_46443_) {
                if (oldData.getStatus().isHasCreatedCharacter()) {
                    CLIENT_CACHE = oldData;
                } else if (CLIENT_CACHE != null) {
                    newData.copyFrom(CLIENT_CACHE);
                }
            }
        }));
        original.invalidateCaps();
    }

    @SubscribeEvent
    public static void onPlayerLogin(PlayerEvent.PlayerLoggedInEvent event) {
        Player player = event.getEntity();
        if (player instanceof ServerPlayer) {
            ServerPlayer serverPlayer = (ServerPlayer)player;
            List<String> availableConfigs = ConfigManager.getAvailableConfigFiles();
            boolean resetBatch = true;
            for (String file : availableConfigs) {
                String jsonPayload;
                if (file.equals("general-user") || (jsonPayload = ConfigManager.getSpecificConfigJson(file)) == null || jsonPayload.isBlank()) continue;
                NetworkHandler.sendToPlayer(new SyncServerConfigS2C(file, jsonPayload, resetBatch), serverPlayer);
                resetBatch = false;
            }
            NetworkHandler.sendToPlayer(new SyncQuestRegistryS2C(QuestRegistry.getAllSagas(), QuestRegistry.getAllQuests()), serverPlayer);
            MinecraftServer server = serverPlayer.m_20194_();
            if (server != null && !QuestStructureHints.isResolved()) {
                UUID playerId = serverPlayer.m_20148_();
                QuestStructureHints.ensureResolvedAsync(server).thenRun(() -> server.execute(() -> {
                    ServerPlayer online = server.m_6846_().m_11259_(playerId);
                    if (online != null) {
                        NetworkHandler.sendToPlayer(new SyncQuestRegistryS2C(QuestRegistry.getAllSagas(), QuestRegistry.getAllQuests()), online);
                    }
                }));
            }
            StatsProvider.get(INSTANCE, (Entity)serverPlayer).ifPresent(data -> {
                StatsCapability.markCurrentDimensionVisited(serverPlayer, data);
                PlayerQuestData questData = data.getPlayerQuestData();
                if (questData.isSagaLocked("saiyan_saga")) {
                    questData.setSagaUnlocked("saiyan_saga", true);
                }
                TransformationsHelper.ensureSelectedFormDefault(data);
                TransformationsHelper.ensureSelectedStackFormDefault(data);
                data.getStatus().setStrikeLocked(false);
                data.getStatus().setStunEffect(false);
                data.getStatus().setKnockedDown(false);
                data.getCooldowns().removeCooldown("KnockdownDuration");
                Map<String, String> repairedSkills = data.getSkills().repairSkillNames();
                if (!repairedSkills.isEmpty()) {
                    repairedSkills.forEach((oldName, newName) -> LogUtil.info(Env.SERVER, "Repaired skill for {}: '{}' -> '{}'", serverPlayer.m_36316_().getName(), oldName, newName));
                }
                data.getSkills().setSkillActive("kisense", false);
                NetworkHandler.sendToTrackingEntityAndSelf(new StatsSyncS2C(serverPlayer), (Entity)serverPlayer);
            });
        }
        event.getEntity().m_6210_();
    }

    @SubscribeEvent
    public static void onPlayerTick(TickEvent.PlayerTickEvent event) {
        if (event.phase == TickEvent.Phase.END && !event.player.m_9236_().f_46443_) {
            StatsProvider.get(INSTANCE, (Entity)event.player).ifPresent(StatsData::tick);
        }
    }

    @SubscribeEvent
    public static void onPlayerRespawn(PlayerEvent.PlayerRespawnEvent event) {
        Player player = event.getEntity();
        if (player instanceof ServerPlayer) {
            ServerPlayer serverPlayer = (ServerPlayer)player;
            StatsProvider.get(INSTANCE, (Entity)serverPlayer).ifPresent(data -> {
                data.getResources().setCurrentEnergy(data.getMaxEnergy());
                data.getResources().setCurrentStamina(data.getMaxStamina());
                data.getStatus().setStrikeLocked(false);
                data.getStatus().setStunEffect(false);
                data.getStatus().setKnockedDown(false);
                data.getCooldowns().removeCooldown("KnockdownDuration");
                NetworkHandler.sendToTrackingEntityAndSelf(new ResourceSyncS2C(serverPlayer), (Entity)serverPlayer);
            });
        }
    }

    @SubscribeEvent
    public static void onPlayerChangedDimension(PlayerEvent.PlayerChangedDimensionEvent event) {
        Player player = event.getEntity();
        if (player instanceof ServerPlayer) {
            ServerPlayer serverPlayer = (ServerPlayer)player;
            StatsProvider.get(INSTANCE, (Entity)serverPlayer).ifPresent(data -> {
                StatsCapability.markCurrentDimensionVisited(serverPlayer, data);
                data.getSkills().setSkillActive("kisense", false);
                data.getStatus().setStrikeLocked(false);
                data.getStatus().setStunEffect(false);
                data.getStatus().setKnockedDown(false);
                data.getCooldowns().removeCooldown("KnockdownDuration");
                NetworkHandler.sendToTrackingEntityAndSelf(new StatsSyncS2C(serverPlayer), (Entity)serverPlayer);
            });
        }
    }

    private static void markCurrentDimensionVisited(ServerPlayer player, StatsData data) {
        data.getStatus().markVisitedDimension(player.m_284548_().m_46472_().m_135782_().toString());
    }
}

