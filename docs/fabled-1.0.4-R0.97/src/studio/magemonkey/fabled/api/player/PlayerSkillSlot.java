/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  org.bukkit.OfflinePlayer
 *  org.bukkit.entity.Player
 */
package studio.magemonkey.fabled.api.player;

import java.util.ArrayList;
import org.bukkit.OfflinePlayer;
import org.bukkit.entity.Player;
import studio.magemonkey.fabled.Fabled;
import studio.magemonkey.fabled.api.player.PlayerData;
import studio.magemonkey.fabled.api.player.PlayerSkill;
import studio.magemonkey.fabled.gui.tool.GUITool;

public class PlayerSkillSlot {
    private final ArrayList<PlayerSkill> skills = new ArrayList();
    private int index = 0;
    private PlayerData player;
    private boolean hovering = false;

    public void init(PlayerData data) {
        this.player = data;
        this.index = 0;
        this.skills.clear();
        for (PlayerSkill skill : data.getSkills()) {
            if (!skill.getData().canCast() || !skill.isUnlocked()) continue;
            this.skills.add(skill);
        }
        this.setHovering(this.player.getPlayer().getInventory().getHeldItemSlot() == Fabled.getSettings().getCastSlot());
    }

    public void unlock(PlayerSkill skill) {
        if (skill.isUnlocked() && skill.getData().canCast()) {
            this.skills.add(skill);
        }
    }

    public void updateItem(Player player) {
        if (player != null) {
            PlayerData playerData = Fabled.getData((OfflinePlayer)player);
            if (this.skills.isEmpty()) {
                player.getInventory().setItem(Fabled.getSettings().getCastSlot(), GUITool.markCastItem(Fabled.getSettings().getCastItem()));
                playerData.setOnPreviewStop(null);
            } else {
                PlayerSkill playerSkill = this.skills.get(this.index);
                if (this.hovering) {
                    playerSkill.startPreview();
                }
                player.getInventory().setItem(Fabled.getSettings().getCastSlot(), GUITool.markCastItem(playerSkill.getData().getIndicator(this.skills.get(this.index), true)));
            }
        }
    }

    public void activate() {
        if (!this.skills.isEmpty()) {
            this.player.cast(this.skills.get(this.index));
        }
    }

    public void next() {
        if (!this.skills.isEmpty()) {
            this.index = (this.index + 1) % this.skills.size();
            this.updateItem(this.player.getPlayer());
        }
    }

    public void prev() {
        if (!this.skills.isEmpty()) {
            this.index = (this.index + this.skills.size() - 1) % this.skills.size();
            this.updateItem(this.player.getPlayer());
        }
    }

    public void setHovering(boolean hovering) {
        this.hovering = true;
        if (hovering && !this.skills.isEmpty()) {
            this.skills.get(this.index).startPreview();
        } else {
            this.player.setOnPreviewStop(null);
        }
    }
}

