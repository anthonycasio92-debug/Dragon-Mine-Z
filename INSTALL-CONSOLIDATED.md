# ALL LATEST SCRIPTS PACK (use this branch only)

**Branch:** `cursor/all-latest-scripts-dd5f`  
**PR:** install from this pack only.

Supersedes older open PRs: **#44**, **#45**, **#46**, **#47**, **#48**.  
Do not mix those branches on top of this one.

Versions: Rival **v4.7.7** / Sparring **v3.2.8** / End Strength **v2.11.0**

---

## KubeJS files (copy these onto the server)

### server_scripts/ (then `/kubejs reload server_scripts` or `/reload`)
| File | Purpose |
|------|---------|
| `kubejs/server_scripts/apotheosis_balance.js` | Apotheosis balance; **life steal removed**; heal received/overheal ~1-5% |
| `kubejs/server_scripts/lifesteal_cap.js` | Live hard caps: **Life Steal 0%**, OH 5%, Healing Received +5% |
| `kubejs/server_scripts/apotheosis_spawner_disable.js` | Disable spawner upgrades; vanillaize; comparator redstone |
| `kubejs/server_scripts/remove_silk_touch.js` | Strip Silk Touch (keep item) |
| `kubejs/server_scripts/capsule_disable.js` | Capsule disable |
| `kubejs/server_scripts/tinkers_necrotic_disable.js` | Removes Tinkers **Necrotic** life-steal modifier |
| `kubejs/server_scripts/dungeon_clone_ki_fix.js` | Dungeon clone ki/moves (**server only**; continuous spawns) |
| `kubejs/server_scripts/heartstop_disable.js` | Iron's Spells **Heartstop** recipe/effect strip |

### startup_scripts/ (**full server restart** required)
| File | Purpose |
|------|---------|
| `kubejs/startup_scripts/healing_received_cap_hook.js` | Heal + Overheal combat backups |
| `kubejs/startup_scripts/apotheosis_spawner_chunk_hook.js` | Spawner chunk-load vanillaize queue |
| `kubejs/startup_scripts/shadow_dummy_protect_hook.js` | Shadow dummy spawn protect (replaces CNPC forge script) |
| `kubejs/startup_scripts/heartstop_disable_hook.js` | Cancels casting **irons_spellbooks:heartstop** |

### data/ (apply with `/reload` or restart)
- `kubejs/data/apotheosis/affixes/sword/attribute/vampiric.json`
- `kubejs/data/apotheosis/affixes/armor/attribute/spiritual.json`
- `kubejs/data/apotheosis/affixes/heavy_weapon/attribute/berserking.json`
- `kubejs/data/apotheosis/gems/core/guardian.json`
- `kubejs/data/apotheosis/gems/twilight/forest.json`
- `kubejs/data/tconstruct/tinkering/modifiers/necrotic.json` — empty Necrotic (no life steal)
- `kubejs/data/tconstruct/tinkering/materials/traits/necrotic_bone.json` — no Necrotic trait on bone

### Apply order
1. Copy all `kubejs/` files above  
2. **Full restart** (startup scripts)  
3. `/reload` (datapack gem/affix JSON)  
4. Relog - expect chat: `Healing caps: Received +X% | Overheal Y% | Life Steal Z%`

### Log lines that mean it worked
- `[Heal Cap] LivingHealEvent backup registered`
- `[Heal Cap] LivingHurtEvent backup registered`
- `[Dungeon Clone Fix] server-only script loaded`
- `[Dungeon Clone Fix] OK ki=...` (first few fixed clones)
- `[ShadowDummy Protect] LivingHurt/Damage registered`
- `[Apotheosis Balance] highPriorityData running...`
- `[Heal Cap] Java AttributeModifier ready`

---

## Rival (Global Player + Command Handler)
- `Rival System.js` **v4.7.7** → CustomNPCs Global Player  
  Events: `init`, `login`, `tick`, `damaged`, `damagedEntity`, `kill`, `died`, `logout`, `trigger`
- `Rival Command Handler.js` **v4.7.6** → player script-slot (with SkillCheck / Sparring Handler)
- `Aliases-Rival.yml` → CMI CustomAlias (`asFakeOp!`) → `/cmi reload`

Path: silent `/rival` → Unknown; both silent → Declared; `/rival declare` → Pending;  
both declare/accept → Mutual; Mutual + 3 death/KO → Nemesis.  
Nearby TP capped at 2 + recent mob kill. TP scale 60%.  
Sparring deaths do not advance Nemesis. `/rival tpmsg` toggles kill TP chat.  
Battle report shows once (no DM+broadcast double).  
**Challenge cooldown:** 2 minutes between official challenges (both fighters, after battle ends).

## Sparring
- `Sparring Tp System.js` **v3.2.8** → Global Player
  - Global spar TP **+50%**
  - **Mentor Bond**: one mentor + one apprentice, mutual accept, 7-day change cooldown;
    mentor gets 15% of apprentice spar TP; apprentice gets +18% while sparring with mentor
  - **Admin:** `/spar mentor resetcd [player]` clears mentor+apprentice CDs (op / lvl 2 / `spar.mentor.admin`)
  - `/spar` help shows **Your Mentor Bond** at the top (Mentor / Apprentice / rates)
  - CMI bare `/spar` (`$1-`) shows help (not Unknown command)
  - Bond reconcile repairs one-sided links instead of wiping them
  - Hit activity: **melee 4.5s** / **ki 10s** before idle end (ki charge still held)
  - **Friendly Fist**: spar heal only on **knockdown / lethal ~1 HP** (not every FF hit)
  - **Ki charge hold**: charging a ki attack keeps the spar timer alive (no mid-charge end)
  - Audit fixes: third-party hits / fall damage no longer break or fake-score spars
  - Ki HP-queue scoring; disabled during Rival challenges
- `Sparring Command Handler.js` **v3.1.4** → script-slot (optional; full mentor cmds + bond on `/spar`)
- `Aliases-Sparring.yml` → CMI (`/spar` + mentor shortcuts + `/sparmentorcd`)

## End
- `End Dimension Strength.js` **v2.11.0** → Global Player (own tab)
  - Ender Dragon spawn + scaling only (End mob scaling disabled)
- `EndDragon-Alias.yml` → CMI (`asOp!` — do **not** need CNPC Forge for this)

## Stop CNPC forge NPE spam (required)
CustomNPCs GBPort spam `EntityEvent$Size` / `EntityConstructing` NPEs whenever
**Global Forge Scripts** are enabled. This is **not** the KubeJS dungeon script.

Proof from your logs: stack hits `noppes.npcs.ForgeEventHandler` while Create builds
`DeployerFakePlayer` (null GameProfile). That only runs if CNPC forge scripts are ON.

### Disable forge scripts (do all of these)
1. In-game: CustomNPCs → Global → **Forge Scripts**
   - Uncheck / disable **Script Enabled**
   - Delete every forge tab (dungeon / shadow / enddragon / empty tabs)
   - Save
2. On disk (server stopped): replace the world forge script file with this pack’s
   `forge_scripts.json` (`ScriptEnabled: 0b`, empty scripts).
   Typical path (name may vary):
   - `<world>/customnpcs/forge_scripts.json`
   - or `<world>/customnpcs/scripts/forge_scripts.json`
3. Restart the server
4. Keep `ShadowDummyLimiter.js` as Global **Player** (unchanged)
5. Keep End aliases on `asOp!` (`EndDragon-Alias.yml`)
6. Dungeon fix = KubeJS **server_scripts only** (below) — no CNPC forge

## Dungeons / Shadow dummy (KubeJS — not CNPC forge)
- `server_scripts/dungeon_clone_ki_fix.js` — **server script only**; ports working CNPC forge NBT path (`NpcAPI.getIEntity().getNbt()`) + spawned/retries/nearby scan  


- `startup_scripts/shadow_dummy_protect_hook.js` — shadow dummy protect (restart once)  
- Dungeon fix apply: copy file → `/kubejs reload server_scripts` (no restart)  
- Legacy CNPC forge `.js` files are deprecated fallbacks only

## Other systems in this pack
- `SprintJump.js`, `flight suppression.js`
- `DMZ RACE LOCK.js`, `Prestige NPC.js`, `DMZ Class Permission.js`
- `AndrioidConversion.js`, `bioevolution.json`, `character.json`
- `ShadowDummyLimiter.js` (Player tab; protect is KubeJS now)
- `Fabled Sync.js` (combined Prestige Sync + Faction Sync + Value Cleaner — do **not** also load `Prestige Sync Fabled.js`)
- Fabled bonus persist fixes, Disable End Portals
- `Aliases-Kill-TP-Chat.yml` (optional; also covered by Aliases-Rival `tpmsg`)
