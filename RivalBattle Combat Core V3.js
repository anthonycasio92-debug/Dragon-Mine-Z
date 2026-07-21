/*
==============================================================================
 DBZ LEGACY REBORN
 RivalBattle_Combat_Core_v3
 PART 1 / Combat Foundation

 Requires:
   RivalCore_v3
   RivalEvents_v3
   RivalBattle_Manager_v3

 Verified against:
   CustomNPCs 1.20.1.20260227

 This module ONLY establishes combat tracking.
 Rewards and reports come later.
==============================================================================
*/

var API = Java.type("noppes.npcs.api.NpcAPI");
var System = Java.type("java.lang.System");

var COLOR = String.fromCharCode(167);
var SESSION_KEY = "dlr.rivalry.v3.battle_manager";
var TEMP_PREFIX = "RBCombat_";

function now(){ return Number(System.currentTimeMillis()); }
function str(v){ return String(v); }
function uuid(player){ return str(player.getUUID()); }
function pname(player){ return str(player.getName()); }

/* --- Foundation helpers --- */

function world(player){
    try { return API.Instance().getIWorld("minecraft:overworld"); }
    catch(e){ return player.getWorld(); }
}

function loadSessions(player){
    var sd = world(player).getStoreddata();
    if(!sd.has(SESSION_KEY)) return null;
    try{
        return JSON.parse(str(sd.get(SESSION_KEY)));
    }catch(e){
        print("[CombatCore] Failed loading battle database.");
        return null;
    }
}

function saveSessions(player,data){
    world(player).getStoreddata().put(
        SESSION_KEY,
        JSON.stringify(data)
    );
}

function getPlayerSession(database,uuid){
    if(database==null || database.playerSessions==null) return null;
    var id = database.playerSessions[uuid];
    if(id==null || database.sessions==null) return null;
    return database.sessions[String(id)];
}

function isBattleRunning(session){
    return session!=null && session.state=="active";
}

/* --- Combat data --- */

function combat(player){
    var td = player.getTempdata();

    if(!td.has(TEMP_PREFIX+"combat")){
        td.put(TEMP_PREFIX+"combat",JSON.stringify({
            started:0,
            firstHit:0,
            lastHit:0,
            damageDone:0,
            damageTaken:0,
            hits:0,
            hitsTaken:0,
            biggestHit:0,
            biggestTaken:0,
            combo:0,
            longestCombo:0
        }));
    }

    return JSON.parse(str(td.get(TEMP_PREFIX+"combat")));
}

function saveCombat(player,data){
    player.getTempdata().put(
        TEMP_PREFIX+"combat",
        JSON.stringify(data)
    );
}

function startCombat(player){
    var c=combat(player);
    if(c.started==0) c.started=now();
    saveCombat(player,c);
}

function recordHit(attacker,victim,damage){

    var a=combat(attacker);

    if(a.firstHit==0) a.firstHit=now();
    a.lastHit=now();
    a.hits++;
    a.damageDone+=damage;

    if(damage>a.biggestHit)
        a.biggestHit=damage;

    a.combo++;

    if(a.combo>a.longestCombo)
        a.longestCombo=a.combo;

    saveCombat(attacker,a);

    var v=combat(victim);

    if(v.firstHit==0) v.firstHit=now();
    v.lastHit=now();
    v.hitsTaken++;
    v.damageTaken+=damage;

    if(damage>v.biggestTaken)
        v.biggestTaken=damage;

    v.combo=0;

    saveCombat(victim,v);
}

/* --- Verified event hook --- */

function damagedEntity(event){

    var attacker=event.player;
    var target=event.target;

    if(attacker==null || target==null)
        return;

    try{
        if(target.getType()!=1) return;
    }catch(e){
        return;
    }

    var db=loadSessions(attacker);
    if(db==null) return;

    var session=getPlayerSession(db,uuid(attacker));
    if(!isBattleRunning(session)) return;

    if(uuid(target)!=session.challengerUuid &&
       uuid(target)!=session.opponentUuid)
        return;

    startCombat(attacker);
    startCombat(target);

    recordHit(
        attacker,
        target,
        Number(event.damage)
    );
}

/* Remaining hooks added in Part 2:
   damaged(event)
   attack(event)
   killedEntity(event)
   cleanup
   winner detection
   synchronization
*/
/*
==============================================================================
 RivalBattle_Combat_Core_v3
 PART 2 / Defensive Tracking + Winner Detection
==============================================================================*/

/* --- Defensive Hook --- */

function damaged(event){

    var victim = event.player;
    if(victim==null) return;

    var db = loadSessions(victim);
    if(db==null) return;

    var session = getPlayerSession(db,uuid(victim));
    if(!isBattleRunning(session)) return;

    var attacker = null;

    try{
        attacker = event.source;
    }catch(e){}

    if(attacker==null) return;

    try{
        if(attacker.getType()!=1) return;
    }catch(e){
        return;
    }

    if(uuid(attacker)!=session.challengerUuid &&
       uuid(attacker)!=session.opponentUuid)
        return;

    startCombat(attacker);
    startCombat(victim);

    recordHit(
        attacker,
        victim,
        Number(event.damage)
    );
}

/* --- First Strike Helper --- */

function attack(event){

    var attacker = event.player;
    if(attacker==null) return;

    var c = combat(attacker);

    if(c.firstHit==0)
        c.firstHit = now();

    saveCombat(attacker,c);
}

/* --- Winner Detection --- */

function killedEntity(event){

    var killer = event.player;
    var victim = event.target;

    if(killer==null || victim==null) return;

    try{
        if(victim.getType()!=1) return;
    }catch(e){
        return;
    }

    var db = loadSessions(killer);
    if(db==null) return;

    var session = getPlayerSession(db,uuid(killer));
    if(!isBattleRunning(session)) return;

    session.state="ended";
    session.winnerUuid=uuid(killer);
    session.winnerName=pname(killer);
    session.loserUuid=uuid(victim);
    session.loserName=pname(victim);
    session.endReason="knockout";
    session.endedAt=now();

    delete db.playerSessions[uuid(killer)];
    delete db.playerSessions[uuid(victim)];

    saveSessions(killer,db);

    killer.message(COLOR+"6[Rival Battle] "+COLOR+"aVictory!");
    victim.message(COLOR+"6[Rival Battle] "+COLOR+"cDefeat!");
}

/* --- Cleanup Helpers --- */

function clearCombat(player){

    try{
        player.getTempdata().remove(TEMP_PREFIX+"combat");
    }catch(e){}
}

function finishCombat(player){

    var c = combat(player);

    var duration = 0;

    if(c.started>0)
        duration = Math.floor((now()-c.started)/1000);

    player.message(COLOR+"7Battle Duration: "+COLOR+"f"+duration+"s");

    clearCombat(player);
}

/*
Part 3 will add:

- timeout synchronization
- battle abandonment
- automatic cleanup
- interference API
- report export
- shared methods for Rewards_v3
*/
/*
==============================================================================
 RivalBattle_Combat_Core_v3
 PART 3 / Session Cleanup + Timeout + Export API
==============================================================================*/

var COMBAT_TIMEOUT = 30000;

/* -------------------------------------------------------
   Session timeout
------------------------------------------------------- */

function tick(event){

    var player = event.player;
    if(player==null) return;

    var db = loadSessions(player);
    if(db==null) return;

    var session = getPlayerSession(db,uuid(player));
    if(!isBattleRunning(session)) return;

    var c = combat(player);

    if(c.lastHit==0) return;

    if(now()-c.lastHit >= COMBAT_TIMEOUT){

        session.state="ended";
        session.endReason="timeout";
        session.endedAt=now();

        delete db.playerSessions[session.challengerUuid];
        delete db.playerSessions[session.opponentUuid];

        saveSessions(player,db);

        player.message(COLOR+"7Your rival battle has expired.");

        clearCombat(player);
    }
}

/* -------------------------------------------------------
   Disconnect cleanup
------------------------------------------------------- */

function logout(event){

    var player = event.player;
    if(player==null) return;

    var db = loadSessions(player);
    if(db==null) return;

    var session = getPlayerSession(db,uuid(player));
    if(session==null) return;

    session.state="ended";
    session.endReason="disconnect";
    session.endedAt=now();

    delete db.playerSessions[session.challengerUuid];
    delete db.playerSessions[session.opponentUuid];

    saveSessions(player,db);

    clearCombat(player);
}

/* -------------------------------------------------------
   Interference API
------------------------------------------------------- */

function isParticipant(session,id){

    if(session==null) return false;

    return id==session.challengerUuid ||
           id==session.opponentUuid;
}

function isInterfering(attacker,target){

    var db=loadSessions(attacker);

    if(db==null)
        return false;

    var session=getPlayerSession(db,uuid(attacker));

    if(session==null)
        return false;

    if(!isParticipant(session,uuid(target)))
        return true;

    return false;
}

/* -------------------------------------------------------
   Export API
------------------------------------------------------- */

function exportCombat(player){

    var c = combat(player);

    return {

        duration : now()-c.started,

        damageDone : c.damageDone,

        damageTaken : c.damageTaken,

        hits : c.hits,

        hitsTaken : c.hitsTaken,

        biggestHit : c.biggestHit,

        biggestTaken : c.biggestTaken,

        longestCombo : c.longestCombo

    };

}

/* -------------------------------------------------------
   Manual Debug Trigger
------------------------------------------------------- */

function trigger(event){

    if(event.id!=121)
        return;

    var p=event.player;

    var data=exportCombat(p);

    p.message(COLOR+"6====== Combat Export ======");

    p.message(COLOR+"eDamage Done: "+COLOR+"f"+data.damageDone);
    p.message(COLOR+"eDamage Taken: "+COLOR+"f"+data.damageTaken);
    p.message(COLOR+"eHits: "+COLOR+"f"+data.hits);
    p.message(COLOR+"eLongest Combo: "+COLOR+"f"+data.longestCombo);
    p.message(COLOR+"eDuration(ms): "+COLOR+"f"+data.duration);
}

/*
==============================================================================
 Combat_Core_v3 COMPLETE

 Next Module:
 RivalBattle_Combat_Tracking_v3

 Adds:
 - DPS
 - Average hit
 - Combo decay
 - Crit tracking
 - Ki damage
 - Melee damage
 - Healing
 - Statistics
==============================================================================