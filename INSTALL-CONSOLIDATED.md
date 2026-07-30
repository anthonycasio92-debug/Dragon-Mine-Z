# Consolidated Scripts Pack (v4.7.6 / Sparring v3.2.1)

One branch with the latest good version of each system so installing one PR
does not wipe features from another.

## Rival (Global Player + Command Handler)
- `Rival System.js` **v4.7.6** → CustomNPCs Global Player  
  Events: `init`, `login`, `tick`, `damaged`, `damagedEntity`, `kill`, `died`, `logout`, `trigger`
- `Rival Command Handler.js` **v4.7.5** → player script-slot (with SkillCheck / Sparring Handler)
- `Aliases-Rival.yml` → CMI CustomAlias (`asFakeOp!`) → `/cmi reload`

Path: silent `/rival` → Unknown; both silent → Declared; `/rival declare` → Pending;  
both declare/accept → Mutual; Mutual + 3 death/KO → Nemesis.  
Nearby TP capped at 2 + recent mob kill. TP scale 60%.  
Sparring deaths do not advance Nemesis. `/rival tpmsg` toggles kill TP chat.  
Battle report shows once (no DM+broadcast double).

## Sparring
- `Sparring Tp System.js` **v3.2.1** → Global Player
  - Global spar TP **+50%**
  - **Mentor Bond**: one mentor + one apprentice, mutual accept, 7-day change cooldown;
    mentor gets 15% of apprentice spar TP; apprentice gets +18% while sparring with mentor
  - **Friendly Fist**: knockdown during a spar fully heals the partner
  - **Ki charge hold**: charging a ki attack keeps the spar timer alive (no mid-charge end)
  - Ki HP-queue scoring; disabled during Rival challenges
- `Sparring Command Handler.js` **v3.1.0** → script-slot (optional; skips mentor cmds for Global)
- `Aliases-Sparring.yml` → CMI (`/spar` only)

## End
- `End Dimension Strength.js` **v2.10.3** → Global Player (own tab)
- `EndDragon-Forge-Trigger.js` → Global Forge Scripts
- `EndDragon-Alias.yml` → CMI

## Other systems in this pack
- `SprintJump.js`, `flight suppression.js`
- `DMZ RACE LOCK.js`, `Prestige NPC.js`, `DMZ Class Permission.js`
- `AndrioidConversion.js`, `bioevolution.json`, `character.json`
- `ShadowDummyLimiter.js`, `ShadowDummyForgeProtect.js`
- `Fabled Sync.js` (combined Prestige Sync + Faction Sync + Value Cleaner — do **not** also load `Prestige Sync Fabled.js`)
- Fabled bonus persist fixes, Apotheosis spawner disable, Disable End Portals
- `Aliases-Kill-TP-Chat.yml` (optional; also covered by Aliases-Rival `tpmsg`)

## Do not mix older rival/sparring branches on top of this pack
Use this branch as the install set. Older open PRs are superseded here.
