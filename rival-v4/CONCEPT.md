# Original Rival System Concept — Implementation Map

> *"Every player should eventually have one or two rivals that everyone on the server recognizes."*

This is not another PvP system. It recreates Goku vs Vegeta — history, not assignment.

## Philosophy

| Idea | Status |
|---|---|
| A rival is history with one person | Done |
| Not guilds / factions / everyone | Done |
| Up to **two** Mutual rivals that matter | Done |
| Mutual unlocks the real Rival System | Done |

## Rival States

| Status | Meaning | Limit | Status |
|---|---|---|---|
| **Unknown** | You silently rivaled them (they are not told) | Unlimited | Done |
| **Declared** | Both silently rivaled each other | Unlimited | Done |
| **Mutual** | Both accepted Mutual | **Max 2** | Done |
| **Nemesis** | Your greatest mutual rival | **Only 1** (auto) | Done |

Progression: `Unknown → Declared → Mutual → Nemesis`

- `/rival <player>` = silent Unknown (hidden from target)
- If both silently rival each other → **Declared** (not Mutual yet)
- Mutual via `/rival request` + accept, or both `/rival accept` when already Declared
- Target of a silent rival does not see the rivalry at all

- 3rd Mutual **demotes the oldest** Mutual automatically (both sides → Declared).
- Nemesis is chosen from Mutual history (battles, wins, losses, age) — not an RP threshold.

## Rival History (per link)

| Field | Status |
|---|---|
| First met | Done (`firstMetAt`) |
| First battle | Done (`firstBattleAt`) |
| Wins / Losses / Draws | Done |
| Current streak / Best streak | Done (per-link) |
| Damage dealt / received | Done |
| Total time fought | Done (`timeFoughtMs`) |
| Last battle | Done |
| Current Rival Points | Done |

## Rival Instinct (Mutual+)

| Sense | Status | API |
|---|---|---|
| Nearby | Done | distance + RP tier range |
| Arrive | Done | enter-range pulse |
| Charge Ki | Done | `Status.isChargingKi` / `isActionCharging` |
| Stronger / weaker | Done | released BP compare |
| Transformations | Done | `isAuraActive` + `StatsData.getFormMultiplier` |
| Fusion | Done | `Status.isFused` / `getFusionName` |

Scales with link RP. Mutual (and Nemesis) only.

## Official Rival Battles

Challenge → Accept → Countdown → Official Battle (1–10 min) → Winner → History → RP

| Rule | Status |
|---|---|
| Official battles update rivalry history | Done |
| **Only official battles award RP** (Mutual) | Done |
| Winner more TP, loser more RP | Done |
| Close battles / long rivalries bonus RP | Done |
| Combat log: hits, damage, ki, combo, duration, W/L | Done |

## Proving Grounds

*"This is where legends were broken... and reborn."*

| Rule | Status |
|---|---|
| Losing an official rival battle marks the battlefield | Done |
| Named by biome/landmark (not raw coords) | Done |
| Fighting there: +TP, +RP, underdog aura (all stats), challenge bonus | Done |
| Claim tiers: I Claimed / II Dominant / III Legendary | Done |
| Reclaim by beating the champion **on** those grounds | Done |
| Server announcement on reclaim | Done |
| History: battles, wins, damage, longest fight, strongest hit, champion | Done |
| Shown on `/rival list` for Mutual / Nemesis | Done |
| Dynamic enter / challenge / reclaim / loss messages | Done |

## Training Points (TP)

TP rewards stay active (separate from RP history):

| Source | Status |
|---|---|
| Presence near rivals (tick) | Done |
| Kills near rivals | Done |
| Surpass rival power | Done |
| Underdog engage / win | Done |
| Anti-gank witness / hit | Done |
| Official challenge win/lose/draw | Done |
| Fusion kill TP split (mutual) | Done |
| Level-scaled via `StatsData.getLevel()` | Done (burst for big awards, softer drip for presence) |

## Rival Points

RP = history, not power.

| Earns RP | Status |
|---|---|
| Winning official battles | Done |
| Losing / battling (loser more RP) | Done |
| Close battles | Done |
| Long rivalries | Done |

| Unlocks | Status |
|---|---|
| Better sensing | Done |
| Titles / leaderboards | Done |
| Records / journal | Done |
| Raw combat stat bonuses | **Disabled** (by design) |

## Hall of Legends (`/rival hof`)

| Category | Status |
|---|---|
| Greatest Rivals | Done |
| Longest Rivalry | Done |
| Most Battles | Done |
| Best Win Streak | Done |
| Most Legendary Match | Done |

NPC Rival Master prints the command guide; HoL is `/rival hof`.

## Commands (CMI CustomAlias)

```text
/rival <player>                         # silent rival -> Unknown (hidden from them)
/rival request|invite <player>          # propose Mutual
/rival declare|accept|decline|remove <player>
/rival list | stats [player] | top [cat]
/rival title | journal | season | quests | achievements | hof
/challenge <player> [1-10]
/challenge rival <player> [1-10]
/challenge accept | decline | cancel
/spectaterival <player>
```

Primary aliases: `rival` -> trigger 200, `challenge` -> trigger 210.
One-word shortcuts inject the same subcommand words. `ExactMatch: false` when args are typed.

## Install

- `Rival System.js` — Global Player
- `Rival Command Handler.js` — script-slot (CMI triggers)
- `CustomAlias.yml` — CMI
- `RivalNPC_v4.js` — optional chat NPC

APIs verified against CustomNPCs GBPort + DragonMineZ 2.1.3 jars — see `VERIFIED_API.md`.
