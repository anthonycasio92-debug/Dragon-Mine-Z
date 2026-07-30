/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  lombok.Generated
 *  org.bukkit.GameMode
 *  org.bukkit.Material
 *  org.bukkit.entity.HumanEntity
 *  org.bukkit.entity.Player
 *  org.bukkit.event.entity.PlayerDeathEvent
 *  org.bukkit.inventory.ItemStack
 */
package studio.magemonkey.fabled.api.player;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import lombok.Generated;
import org.bukkit.GameMode;
import org.bukkit.Material;
import org.bukkit.entity.HumanEntity;
import org.bukkit.entity.Player;
import org.bukkit.event.entity.PlayerDeathEvent;
import org.bukkit.inventory.ItemStack;
import studio.magemonkey.fabled.Fabled;
import studio.magemonkey.fabled.api.player.PlayerData;
import studio.magemonkey.fabled.api.player.PlayerSkill;
import studio.magemonkey.fabled.cast.CastMode;

public class PlayerSkillBar {
    private static final String UNASSIGNED = "e";
    private final Map<Integer, String> slots = new HashMap<Integer, String>();
    private final Set<Integer> reserved = new HashSet<Integer>();
    private final PlayerData player;
    private boolean enabled = true;
    private boolean setup = false;

    public PlayerSkillBar(PlayerData player) {
        if (Fabled.getSettings().getCastMode().equals((Object)CastMode.COMBAT)) {
            this.reserve(Fabled.getSettings().getCastSlot());
        }
        this.player = player;
        for (int i = 1; i <= 9; ++i) {
            if (!Fabled.getSettings().getDefaultBarLayout()[i - 1] || this.reserved.contains(i - 1)) continue;
            this.slots.put(i, UNASSIGNED);
        }
    }

    public void reserve(int slot) {
        this.reserved.add(slot);
        this.slots.remove(slot);
    }

    public PlayerData getPlayerData() {
        return this.player;
    }

    public Player getPlayer() {
        return this.player.getPlayer();
    }

    public int getFirstWeaponSlot() {
        for (int i = 0; i < 9; ++i) {
            if (!this.isWeaponSlot(i)) continue;
            return i;
        }
        return -1;
    }

    public int getItemsInSkillSlots() {
        int count = 0;
        Player p = this.player.getPlayer();
        if (p == null) {
            return -1;
        }
        for (int slot : this.slots.keySet()) {
            if (slot <= 0 || slot >= 10 || p.getInventory().getItem(slot - 1) == null) continue;
            ++count;
        }
        return count;
    }

    public int countOpenSlots() {
        int count = 0;
        Player p = this.player.getPlayer();
        if (p == null) {
            return -1;
        }
        ItemStack[] items = p.getInventory().getContents();
        for (int i = 0; i < items.length; ++i) {
            if (items[i] != null && items[i].getType() != Material.AIR || this.slots.containsKey(i + 1) || this.reserved.contains(i)) continue;
            ++count;
        }
        return count;
    }

    public void toggleEnabled() {
        if (this.enabled) {
            this.clear(this.player.getPlayer());
            this.enabled = false;
        } else {
            this.enabled = true;
            this.setup((HumanEntity)this.player.getPlayer());
        }
    }

    public void toggleSlot(int slot) {
        if (!this.isEnabled() || Fabled.getSettings().getLockedSlots()[slot] || this.reserved.contains(slot)) {
            return;
        }
        if (!(this.slots.containsKey(++slot) || this.slots.size() != 8 - this.reserved.size() && this.countOpenSlots() != 0)) {
            return;
        }
        Player p = this.player.getPlayer();
        if (p == null || p.getItemOnCursor() != null && p.getItemOnCursor().getType() != Material.AIR) {
            return;
        }
        this.clear(p);
        if (this.slots.containsKey(slot)) {
            this.slots.remove(slot);
        } else {
            this.slots.put(slot, UNASSIGNED);
        }
        this.setup((HumanEntity)p);
    }

    public void apply(int slot) {
        if (this.getPlayer() == null || this.getPlayer().getGameMode() == GameMode.CREATIVE || !this.isEnabled() || this.isWeaponSlot(slot)) {
            return;
        }
        PlayerSkill skill = this.player.getSkill(this.slots.get(slot + 1));
        if (skill != null) {
            this.player.cast(skill);
        }
    }

    public void clear(Player player) {
        if (player == null || !this.setup) {
            return;
        }
        for (int i = 0; i < 9; ++i) {
            if (this.isWeaponSlot(i)) continue;
            player.getInventory().setItem(i, null);
        }
        player.updateInventory();
        this.setup = false;
    }

    public void clear(PlayerDeathEvent event) {
        if (event == null || !this.setup) {
            return;
        }
        for (int i = 0; i < 9; ++i) {
            if (this.isWeaponSlot(i)) continue;
            event.getDrops().remove(event.getEntity().getInventory().getItem(i));
            event.getEntity().getInventory().setItem(i, null);
        }
        this.setup = false;
    }

    public void reset() {
        for (int i = 0; i < 9; ++i) {
            if (this.isWeaponSlot(i)) continue;
            this.slots.put(i + 1, UNASSIGNED);
        }
        this.update((HumanEntity)this.getPlayer());
    }

    public void setup(HumanEntity player) {
        if (player == null || !this.enabled || player.getGameMode() == GameMode.CREATIVE || this.setup) {
            return;
        }
        if (this.countOpenSlots() < this.getItemsInSkillSlots()) {
            this.enabled = false;
            return;
        }
        if (!this.isWeaponSlot(player.getInventory().getHeldItemSlot())) {
            int slot = this.getFirstWeaponSlot();
            if (slot == -1) {
                this.toggleSlot(0);
                slot = 0;
            }
            player.getInventory().setHeldItemSlot(slot);
        }
        for (int i = 0; i < 9; ++i) {
            if (this.isWeaponSlot(i)) continue;
            ItemStack item = player.getInventory().getItem(i);
            player.getInventory().setItem(i, Fabled.getSettings().getUnassigned());
            if (item == null) continue;
            player.getInventory().addItem(new ItemStack[]{item});
        }
        this.setup = true;
        this.update(player);
    }

    public void unlock(PlayerSkill skill) {
        for (int i = 1; i <= 9; ++i) {
            if (!this.slots.containsKey(i) || !this.slots.get(i).equals(UNASSIGNED)) continue;
            this.slots.put(i, skill.getData().getName());
            this.update((HumanEntity)this.player.getPlayer());
            return;
        }
    }

    public void assign(PlayerSkill skill, int slot) {
        if (this.isWeaponSlot(slot)) {
            return;
        }
        for (Map.Entry<Integer, String> entry : this.slots.entrySet()) {
            if (!entry.getValue().equals(skill.getData().getName())) continue;
            this.slots.put(entry.getKey(), UNASSIGNED);
            break;
        }
        this.slots.put(slot + 1, skill.getData().getName());
        this.update((HumanEntity)this.player.getPlayer());
    }

    public void update(HumanEntity player) {
        if (!this.setup) {
            this.setup(player);
            return;
        }
        for (int i = 1; i <= 9; ++i) {
            int index = i - 1;
            if (this.isWeaponSlot(index)) continue;
            PlayerSkill skill = this.player.getSkill(this.slots.get(i));
            if (skill == null || !skill.isUnlocked()) {
                this.slots.put(i, UNASSIGNED);
                if (!this.enabled || player == null || player.getGameMode() == GameMode.CREATIVE) continue;
                player.getInventory().clear(index);
                player.getInventory().setItem(index, Fabled.getSettings().getUnassigned());
                continue;
            }
            if (!this.isEnabled() || player == null) continue;
            player.getInventory().setItem(index, skill.getData().getIndicator(skill, true));
        }
    }

    public void updateCooldowns() {
        Player player = this.getPlayer();
        if (!this.setup || !this.enabled || player == null) {
            return;
        }
        for (int i = 0; i < 9; ++i) {
            PlayerSkill skill;
            if (this.isWeaponSlot(i)) continue;
            ItemStack item = player.getInventory().getItem(i);
            if (item == null) {
                this.update((HumanEntity)player);
                item = player.getInventory().getItem(i);
            }
            if ((skill = this.player.getSkill(this.slots.get(i + 1))) == null || !skill.isUnlocked()) continue;
            int amount = Math.max(1, skill.getCooldownLeft());
            if (item.getAmount() == amount) continue;
            item.setAmount(amount);
            player.getInventory().clear(i);
            player.getInventory().setItem(i, item);
        }
    }

    public boolean isWeaponSlot(int slot) {
        return !this.slots.containsKey(slot + 1);
    }

    public Map<Integer, String> getData() {
        return this.slots;
    }

    public void applySettings() {
        boolean[] layout = Fabled.getSettings().getDefaultBarLayout();
        boolean[] locked = Fabled.getSettings().getLockedSlots();
        for (int i = 1; i <= 9; ++i) {
            if (!locked[i - 1]) continue;
            if (layout[i - 1]) {
                if (this.slots.containsKey(i)) continue;
                this.slots.put(i, UNASSIGNED);
                continue;
            }
            this.slots.remove(i);
        }
    }

    @Generated
    public boolean isEnabled() {
        return this.enabled;
    }

    @Generated
    public boolean isSetup() {
        return this.setup;
    }
}

