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
| `kubejs/server_scripts/apotheosis_balance.js` | Gem/affix nerfs (life steal, healing received, overheal ~1-5%) |
| `kubejs/server_scripts/lifesteal_cap.js` | Live hard caps: LS/OH 5%, Healing Received +5% |
| `kubejs/server_scripts/apotheosis_spawner_disable.js` | Disable spawner upgrades; vanillaize; comparator redstone |
| `kubejs/server_scripts/remove_silk_touch.js` | Strip Silk Touch (keep item) |
| `kubejs/server_scripts/capsule_disable.js` | Capsule disable |

### startup_scripts/ (**full server restart** required)
| File | Purpose |
|------|---------|
| `kubejs/startup_scripts/healing_received_cap_hook.js` | Heal + Overheal combat backups |
| `kubejs/startup_scripts/apotheosis_spawner_chunk_hook.js` | Spawner chunk-load vanillaize queue |

### data/ (apply with `/reload` or restart)
- `kubejs/data/apotheosis/affixes/sword/attribute/vampiric.json`
- `kubejs/data/apotheosis/affixes/armor/attribute/spiritual.json`
- `kubejs/data/apotheosis/affixes/heavy_weapon/attribute/berserking.json`
- `kubejs/data/apotheosis/gems/core/guardian.json`
- `kubejs/data/apotheosis/gems/twilight/forest.json`

### Apply order
1. Copy all `kubejs/` files above  
2. **Full restart** (startup scripts)  
3. `/reload` (datapack gem/affix JSON)  
4. Relog - expect chat: `Healing caps: Received +X% | Overheal Y% | Life Steal Z%`

### Log lines that mean it worked
- `[Heal Cap] LivingHealEvent backup registered`
- `[Heal Cap] LivingHurtEvent backup registered`
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
- `EndDragon-Forge-Trigger.js` → Global Forge Scripts
- `EndDragon-Alias.yml` → CMI

## Other systems in this pack
- `SprintJump.js`, `flight suppression.js`
- `DMZ RACE LOCK.js`, `Prestige NPC.js`, `DMZ Class Permission.js`
- `AndrioidConversion.js`, `bioevolution.json`, `character.json`
- `ShadowDummyLimiter.js`, `ShadowDummyForgeProtect.js`
- `Fabled Sync.js` (combined Prestige Sync + Faction Sync + Value Cleaner — do **not** also load `Prestige Sync Fabled.js`)
- Fabled bonus persist fixes, Disable End Portals
- `Aliases-Kill-TP-Chat.yml` (optional; also covered by Aliases-Rival `tpmsg`)
