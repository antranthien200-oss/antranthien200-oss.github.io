import { Room } from "colyseus";
import { schema,t } from "@colyseus/schema";
import { BUILDING_LAYOUT,CAR_SPAWNS,CHARACTER_HP,CHARACTER_IDS,DOMAIN_BY_CHARACTER,MAX_PLAYERS,PROP_SPAWNS,TRAIN_TRACK_Y,WORLD_HEIGHT,WORLD_WIDTH,combatProfile,counterSettings,domainSettings,findAvailableSpawn,grabSettings,isBlockedByBuilding,normalizePlayerUpdate,rayHitsRect,sanitizePlayerName } from "../rules.js";
const PlayerCombatState=schema({lastActionKind:t.string().default(""),lastActionAt:t.number().default(0),counterKind:t.string().default(""),counterWindow:t.number().default(0),grabbedBy:t.string().default(""),activeGrabTarget:t.string().default(""),grabKind:t.string().default(""),grabRemaining:t.number().default(0),grabDuration:t.number().default(0),grabTick:t.number().default(0),grabTickInterval:t.number().default(0),grabTickDamage:t.number().default(0),grabFinishDamage:t.number().default(0),grabKnockback:t.number().default(0)},"PlayerCombatState");
const PlayerState=schema({name:t.string().default("Player"),character:t.string().default("vessel"),accessoryHead:t.string().default("none"),accessoryFace:t.string().default("none"),accessoryNeck:t.string().default("none"),accessoryAura:t.string().default("none"),x:t.number().default(1250),y:t.number().default(765),vx:t.number().default(0),vy:t.number().default(0),moveX:t.number().default(0),moveY:t.number().default(0),moveScale:t.number().default(1),aimX:t.number().default(1250),aimY:t.number().default(765),face:t.number().default(0),walk:t.number().default(0),jump:t.number().default(0),block:t.boolean().default(false),attackAnim:t.number().default(0),attackType:t.string().default(""),motionName:t.string().default(""),motionProgress:t.number().default(0),motionDuration:t.number().default(1),motionStartedAt:t.number().default(0),hp:t.number().default(100),maxHp:t.number().default(100),meter:t.number().default(0),stun:t.number().default(0),invuln:t.number().default(0),dead:t.boolean().default(false),respawnTimer:t.number().default(0),awakened:t.boolean().default(false),awakeMode:t.string().default(""),awakeFuel:t.number().default(0),awakeFuelDrainRate:t.number().default(0),jackpot:t.boolean().default(false),consecutiveJackpots:t.number().default(0),domainStunGuaranteed:t.boolean().default(false),connected:t.boolean().default(true),vehicleId:t.string().default(""),trashCanId:t.string().default(""),domainType:t.string().default(""),domainTimer:t.number().default(0),domainWindupStart:t.number().default(0),domainRequestType:t.string().default(""),domainRadius:t.number().default(0),domainX:t.number().default(0),domainY:t.number().default(0),domainWindup:t.number().default(0),domainDuration:t.number().default(0),domainCastAt:t.number().default(0),domainClashId:t.string().default(""),sukunaFireCast:t.number().default(0),tenDogActive:t.boolean().default(false),tenDogCharges:t.number().default(0),tenDogTimer:t.number().default(0),tenGardenTimer:t.number().default(0),soulMode:t.number().default(0),convergenceOrbs:t.number().default(0),tenBase:t.boolean().default(false),shadowTimer:t.number().default(0),rikaSummoned:t.boolean().default(false),rikaMode:t.boolean().default(false),reserveBallWindow:t.number().default(0),yutaCopyIndex:t.number().default(0),combat:PlayerCombatState},"PlayerState");
for(const field of ["lastActionKind","lastActionAt","counterKind","counterWindow","grabbedBy","activeGrabTarget","grabKind","grabRemaining","grabDuration","grabTick","grabTickInterval","grabTickDamage","grabFinishDamage","grabKnockback"]){
 Object.defineProperty(PlayerState.prototype,field,{configurable:true,enumerable:false,get(){return this.combat[field]},set(value){this.combat[field]=value}});
}
const BuildingState=schema({stage:t.number().default(0),collapsed:t.boolean().default(false),respawnTimer:t.number().default(0)},"BuildingState");
const CarState=schema({x:t.number().default(0),y:t.number().default(0),angle:t.number().default(0),vx:t.number().default(0),vy:t.number().default(0),speed:t.number().default(0),occupiedBy:t.string().default(""),destroyed:t.boolean().default(false),respawnTimer:t.number().default(0)},"CarState");
const PropState=schema({hp:t.number().default(3),alive:t.boolean().default(true),respawnTimer:t.number().default(0)},"PropState");
const WorldState=schema({buildings:t.map(BuildingState),cars:t.map(CarState),props:t.map(PropState),worldSeconds:t.number().default(0),trainX:t.number().default(-9999),trainWarning:t.boolean().default(false)},"WorldState");
const CityState=schema({players:t.map(PlayerState),world:WorldState},"CityState");
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const pointSegmentDistance=(point,a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy||1,t=clamp(((point.x-a.x)*dx+(point.y-a.y)*dy)/length,0,1);return Math.hypot(point.x-(a.x+dx*t),point.y-(a.y+dy*t))};
const CLASHABLE_DOMAINS=new Set(["void","shrine","hakari","soul","yuta","trash"]);
export class CityRoom extends Room{
 maxClients=MAX_PLAYERS;autoDispose=false;patchRate=1000/30;maxMessagesPerSecond=180;
 onCreate(){
  this.maxClients=MAX_PLAYERS;
  const initial=new CityState();initial.world=new WorldState();this.setState(initial);
  this.lastUpdateAt=new Map();this.lastActivityAt=new Map();this.lastCarControlAt=new Map();this.lastHitAt=new Map();this.lastPropHitAt=new Map();this.lastActionAt=new Map();this.lastBuildingAt=new Map();this.projectiles=new Map();this.fireZones=new Map();this.domainClashes=new Map();this.projectileBatchAt=0;this.domainTickAt=0;
  BUILDING_LAYOUT.forEach((b,id)=>this.state.world.buildings.set(String(id),new BuildingState()));
  CAR_SPAWNS.forEach(spawn=>{const c=new CarState();c.x=spawn.x;c.y=spawn.y;this.state.world.cars.set(String(spawn.id),c)});
  PROP_SPAWNS.forEach(p=>this.state.world.props.set(String(p.id),new PropState()));
  this.onMessage("player:update",(c,p)=>this.updatePlayer(c,p));this.onMessage("player:activity",c=>{if(this.state.players.has(c.sessionId))this.lastActivityAt.set(c.sessionId,Date.now())});this.onMessage("player:reset",c=>this.resetCharacter(c));this.onMessage("combat:hit",(c,p)=>this.combatHit(c,p));this.onMessage("combat:action",(c,p)=>this.combatAction(c,p));this.onMessage("combat:projectile",(c,p)=>this.spawnProjectile(c,p));this.onMessage("combat:projectile-modify",(c,p)=>this.modifyProjectile(c,p));this.onMessage("combat:projectile-detonate",(c,p)=>this.detonateProjectile(c,p));this.onMessage("domain:clash-hit",(c,p)=>this.domainClashHit(c,p));this.onMessage("combat:awaken",c=>this.awakenPlayer(c));this.onMessage("world:building-hit",(c,p)=>this.hitBuilding(c,p));this.onMessage("world:prop-hit",(c,p)=>this.hitProp(c,p));this.onMessage("car:enter",(c,p)=>this.enterCar(c,p));this.onMessage("car:exit",c=>this.exitCar(c));this.onMessage("car:control",(c,p)=>this.driveCar(c,p));
  this.onMessage("network:ping",(client,payload={})=>{const sentAt=Number(payload.sentAt);if(Number.isFinite(sentAt))client.send("network:pong",{sentAt})});
  this.setSimulationInterval(ms=>this.tick(ms/1000),1000/30);
 }
 onJoin(client,options={}){
  if(this.state.players.size>=MAX_PLAYERS){client.leave(4003,"SERVER_FULL");return}
  const others=[];this.state.players.forEach(p=>others.push(p));
  const spawn=findAvailableSpawn(others),character=CHARACTER_IDS.includes(options.character)?options.character:"vessel",hp=CHARACTER_HP[character]||100,p=new PlayerState(),name=sanitizePlayerName(options.name,"Player");
  p.name=name==="Player"?"Player-"+client.sessionId.slice(0,4).toUpperCase():name;p.character=character;p.x=spawn.x;p.y=spawn.y;p.hp=hp;p.maxHp=hp;this.state.players.set(client.sessionId,p);this.lastUpdateAt.set(client.sessionId,Date.now());this.lastActivityAt.set(client.sessionId,Date.now());this.broadcast("server:player-count",{count:this.state.players.size,capacity:MAX_PLAYERS});console.log("[city] joined",p.name,this.state.players.size+"/16")}
 async onDrop(client){
  const p=this.state.players.get(client.sessionId);
  if(p)p.connected=false;
  try{
   await this.allowReconnection(client,25);
   const reconnected=this.state.players.get(client.sessionId);
   if(reconnected)reconnected.connected=true;
  }catch(error){
   // Expired reconnect reservations are cleaned up by onLeave().
   console.log("[city] reconnect window expired",client.sessionId);
  }
 }
 onReconnect(client){const p=this.state.players.get(client.sessionId);if(p){p.connected=true;this.lastActivityAt.set(client.sessionId,Date.now())}console.log("[city] reconnected",p?.name||client.sessionId)}
 onLeave(client){
  const sessionId=client.sessionId,p=this.state.players.get(sessionId);
  if(p?.vehicleId){const c=this.state.world.cars.get(p.vehicleId);if(c&&c.occupiedBy===sessionId){c.occupiedBy="";c.speed=0;c.vx=0;c.vy=0}}if(p?.grabbedBy){const owner=this.state.players.get(p.grabbedBy);if(owner)owner.activeGrabTarget=""}if(p?.activeGrabTarget){const target=this.state.players.get(p.activeGrabTarget);if(target){target.grabbedBy="";target.grabKind="";target.grabRemaining=0;target.stun=Math.max(target.stun,.25)}}
  this.state.players.delete(sessionId);this.lastUpdateAt.delete(sessionId);this.lastActivityAt.delete(sessionId);this.lastCarControlAt.delete(sessionId);this.lastActionAt.delete(sessionId);
  for(const [zoneId,zone] of this.fireZones)if(zone.ownerId===sessionId){this.fireZones.delete(zoneId);this.broadcast("combat:fire-zone-end",{sessionId,id:zoneId})}
  for(const [key,projectile] of this.projectiles)if(projectile.ownerId===sessionId){this.projectiles.delete(key);this.broadcast("combat:projectile-end",{sessionId,id:projectile.clientId})}
  for(const [id,clash] of this.domainClashes)if(clash.participants.includes(sessionId)){
   const remaining=clash.participants.filter(x=>x!==sessionId&&this.state.players.has(x));
   let winner=null,best=-1,tie=false;
   for(const participant of remaining){const score=clash.scores.get(participant)||0;if(score>best){best=score;winner=participant;tie=false}else if(score===best)tie=true}
   this.finishDomainClash(clash,tie?null:winner,"DISCONNECT");
  }
  for(const map of [this.lastHitAt,this.lastBuildingAt,this.lastPropHitAt]){
   for(const key of map.keys())if(key.startsWith(sessionId+":")||key.includes(":"+sessionId+":"))map.delete(key);
  }
  this.broadcast("server:player-count",{count:this.state.players.size,capacity:MAX_PLAYERS});
  console.log("[city] left",p?.name||sessionId,this.state.players.size+"/16");
 }
 resetCharacter(client){
  const id=client.sessionId,p=this.state.players.get(id);if(!p)return;
  const now=Date.now();
  const others=[];for(const [otherId,other] of this.state.players)if(otherId!==id)others.push(other);
  const spawn=findAvailableSpawn(others);
  if(p.grabbedBy){const owner=this.state.players.get(p.grabbedBy);if(owner)owner.activeGrabTarget="";}
  if(p.activeGrabTarget){const target=this.state.players.get(p.activeGrabTarget);if(target){target.grabbedBy="";target.grabKind="";target.grabRemaining=0;target.stun=Math.max(target.stun,.25)}}
  const clash=p.domainClashId?this.domainClashes.get(p.domainClashId):null;
  if(clash)this.finishDomainClash(clash,null,"RESET");
  if(p.vehicleId){const car=this.state.world.cars.get(p.vehicleId);if(car&&car.occupiedBy===id){car.occupiedBy="";car.speed=0;car.vx=0;car.vy=0}}
  for(const [projectileId,projectile] of this.projectiles)if(projectile.ownerId===id){this.projectiles.delete(projectileId);this.broadcast("combat:projectile-end",{sessionId:id,id:projectile.clientId})}
  for(const [zoneId,zone] of this.fireZones)if(zone.ownerId===id){this.fireZones.delete(zoneId);this.broadcast("combat:fire-zone-end",{sessionId:id,id:zoneId})}
  p.x=spawn.x;p.y=spawn.y;p.vx=0;p.vy=0;p.moveX=0;p.moveY=0;p.moveScale=1;p.aimX=spawn.x;p.aimY=spawn.y;
  p.face=0;p.walk=0;p.jump=0;p.block=false;p.attackAnim=0;p.attackType="";
  p.motionName="";p.motionProgress=0;p.motionDuration=1;p.motionStartedAt=0;p.lastActionKind="";p.lastActionAt=0;
  p.hp=p.maxHp=CHARACTER_HP[p.character]||100;p.meter=0;p.stun=0;p.invuln=1.2;p.dead=false;p.respawnTimer=0;
  p.awakened=false;p.awakeMode="";p.awakeFuel=0;p.awakeFuelDrainRate=0;p.jackpot=false;p.consecutiveJackpots=0;p.domainStunGuaranteed=false;
  p.vehicleId="";p.trashCanId="";
  p.domainType="";p.domainTimer=0;p.domainWindupStart=0;p.domainRequestType="";p.domainRadius=0;p.domainX=spawn.x;p.domainY=spawn.y;p.domainWindup=0;p.domainDuration=0;p.domainCastAt=0;p.domainClashId="";
  p.counterKind="";p.counterWindow=0;p.sukunaFireCast=0;
  p.tenDogActive=false;p.tenDogCharges=0;p.tenDogTimer=0;p.tenGardenTimer=0;p.soulMode=0;p.convergenceOrbs=0;p.tenBase=false;p.shadowTimer=0;
  p.rikaSummoned=false;p.rikaMode=false;p.reserveBallWindow=0;p.yutaCopyIndex=0;
  p.grabbedBy="";p.activeGrabTarget="";p.grabKind="";p.grabRemaining=0;p.grabDuration=0;p.grabTick=0;p.grabTickInterval=0;p.grabTickDamage=0;p.grabFinishDamage=0;p.grabKnockback=0;
  this.lastActionAt.delete(id);this.lastCarControlAt.delete(id);this.lastUpdateAt.set(id,now);
  client.send("player:reset",{character:p.character,x:p.x,y:p.y,invuln:p.invuln});
 }
 updatePlayer(client,payload){
  const id=client.sessionId,p=this.state.players.get(id);if(!p||!payload||typeof payload!=="object")return;
  const cleanAccessory=value=>typeof value==="string"&&/^[a-z0-9-]{1,48}$/.test(value)?value:"none";
  p.accessoryHead=cleanAccessory(payload.accessoryHead);p.accessoryFace=cleanAccessory(payload.accessoryFace);p.accessoryNeck=cleanAccessory(payload.accessoryNeck);p.accessoryAura=cleanAccessory(payload.accessoryAura);
  p.trashCanId=typeof payload.trashCanId==="string"&&/^[0-4]$/.test(payload.trashCanId)?payload.trashCanId:"";
  p.sukunaFireCast=clamp(Number(payload.sukunaFireCast)||0,0,5);p.tenDogActive=payload.tenDogActive===true;p.tenDogCharges=clamp(Number(payload.tenDogCharges)||0,0,3);p.tenDogTimer=clamp(Number(payload.tenDogTimer)||0,0,30);p.tenGardenTimer=clamp(Number(payload.tenGardenTimer)||0,0,999);p.soulMode=clamp(Number(payload.soulMode)||0,0,2);p.convergenceOrbs=clamp(Number(payload.convergenceOrbs)||0,0,4);p.tenBase=payload.tenBase===true;p.shadowTimer=clamp(Number(payload.shadowTimer)||0,0,30);p.rikaSummoned=payload.rikaSummoned===true;p.rikaMode=payload.rikaMode===true;p.reserveBallWindow=clamp(Number(payload.reserveBallWindow)||0,0,3);p.yutaCopyIndex=clamp(Number(payload.yutaCopyIndex)||0,0,10);
  if(p.dead)return;
  const now=Date.now(),prev=this.lastUpdateAt.get(id)||now-33,n=normalizePlayerUpdate(payload,p,now-prev);if(!n)return;
  this.lastUpdateAt.set(id,now);
  const previousMotion=p.motionName;
  if(!p.awakened&&!p.domainType)p.meter=Math.max(p.meter,clamp(Number(payload.meter)||0,0,100));
  if(p.awakened){
   if(payload.awakened===false)this.endAwakening(p);
   else{
    p.awakeFuelDrainRate=clamp(Number(payload.awakeFuelDrainRate)||p.awakeFuelDrainRate,0,3);
    const clientFuel=Number(payload.awakeFuel);
    if(Number.isFinite(clientFuel))p.awakeFuel=Math.min(p.awakeFuel,clamp(clientFuel,0,100));
    if(p.character==="restless"&&payload.jackpot===true&&!p.jackpot){
     p.jackpot=true;p.awakeMode="jackpot";p.awakeFuel=clamp(Number(payload.awakeFuel)||100,0,100);
     p.awakeFuelDrainRate=clamp(Number(payload.awakeFuelDrainRate)||1,0,3);
    }
    if(p.awakeFuel<=0)this.endAwakening(p);
   }
  }
  p.face=n.face;p.walk=n.walk;p.jump=n.jump;p.block=n.block;p.vx=n.vx;p.vy=n.vy;p.attackAnim=n.attackAnim;p.attackType=n.attackType;
  p.motionName=n.motionName;p.motionProgress=n.motionProgress;p.motionDuration=n.motionDuration;
  if(previousMotion!==n.motionName)p.motionStartedAt=now;
  p.moveX=n.moveX;p.moveY=n.moveY;p.moveScale=n.moveScale;p.aimX=n.aimX;p.aimY=n.aimY;
  if(p.grabbedBy||p.activeGrabTarget){p.moveX=0;p.moveY=0;return}
  if(p.stun>0){p.moveX=0;p.moveY=0}
  if(p.vehicleId){
   const c=this.state.world.cars.get(p.vehicleId);
   if(!c||c.destroyed||c.occupiedBy!==id)p.vehicleId="";
   else{p.x=c.x;p.y=c.y;p.vx=c.vx;p.vy=c.vy}
  }else{
   // Multiplayer positions are client-driven; no speed/teleport anti-cheat rejection.
   let x=clamp(n.x,45,WORLD_WIDTH-45),y=clamp(n.y,45,WORLD_HEIGHT-45);
   const fullScreenTypes=["void","shrine","soul","hakari","yuta","trash"];
   const fullScreenDomain=Array.from(this.state.players.values()).some(q=>!q.dead&&fullScreenTypes.includes(q.domainType)&&(q.domainTimer>0||q.domainWindup>0||q.domainClashId));
   if(!fullScreenDomain){
    for(let index=0;index<BUILDING_LAYOUT.length;index++){
     const building=BUILDING_LAYOUT[index],state=this.state.world.buildings.get(String(index));
     if(!state||state.collapsed)continue;
     const px=clamp(x,building.x,building.x+building.w),py=clamp(y,building.y,building.y+building.h),dx=x-px,dy=y-py;
     if(dx*dx+dy*dy<28*28){const length=Math.hypot(dx,dy)||1;x=px+dx/length*29;y=py+dy/length*29}
    }
   }
   p.x=x;p.y=y;
  }
  const requested=String(payload.domainType||""),settings=domainSettings(p.character,requested);
  if(!requested){
   p.domainRequestType="";
   if(p.domainType&&!p.domainClashId){p.domainType="";p.domainTimer=0;p.domainWindup=0;p.domainWindupStart=0;p.domainDuration=0;p.domainRadius=0;p.domainCastAt=0}
  }else if(requested!==p.domainRequestType&&!p.domainType&&settings&&(p.awakened||p.meter>=100)&&!p.domainClashId&&p.stun<=0){
   p.domainRequestType=requested;
   if(!p.awakened)p.meter=0;
   p.domainType=requested;p.domainWindup=Math.max(.2,Math.min(3,Number(payload.domainWindup)||1.25));p.domainWindupStart=p.domainWindup;
   p.domainDuration=settings.duration;p.domainTimer=0;p.domainRadius=settings.radius;p.domainX=p.x;p.domainY=p.y;p.domainCastAt=now;
   this.broadcast("domain:cast",{sessionId:id,domainType:requested,startedAt:now,windup:p.domainWindup,duration:p.domainDuration,x:p.x,y:p.y});
   this.tryStartDomainClash(id,p,now);
  }
 }
combatAction(client,payload={}){
  const id=client.sessionId,p=this.state.players.get(id),kind=String(payload.kind||"");
  if(!p||p.dead||p.vehicleId||(p.stun>0&&kind!=="dash")||p.grabbedBy||p.activeGrabTarget)return;
  if(!["m1","dash","special","awaken","domain02","1","2","3","4"].includes(kind))return;
  if(kind==="domain02"&&(p.character!=="honored"||(p.awakened===false&&p.meter<100)))return;
  const counter=counterSettings(p.character,kind,p.awakened);
  const modeToggle=kind==="awaken"&&p.awakened&&(p.character==="yuta"||p.character==="ten");
  const cooldown=kind==="domain02"?24:modeToggle?.08:(counter?.cooldown??(kind==="m1"?.06:kind==="dash"?1.05:kind==="awaken"?1:kind==="special"?.4:.42));
  const now=Date.now(),times=this.lastActionAt.get(id)||new Map();
  if(now-(times.get(kind)||0)<cooldown*1000)return;
  if(kind==="dash"&&p.stun>0){p.stun=0;p.invuln=Math.max(p.invuln,.24)}
  const requestedFace=Number(payload.face);if(Number.isFinite(requestedFace))p.face=clamp(requestedFace,-Math.PI,Math.PI);
  if(kind==="awaken"&&!modeToggle){if(p.awakened||p.meter<100)return;this.awakenPlayer(client)}
  if(kind==="domain02"){
   if(!p.awakened)p.meter=0;
   p.domainType="void02";p.domainRequestType="void02";p.domainTimer=.22;p.domainWindup=0;p.domainWindupStart=0;p.domainDuration=.22;p.domainRadius=0;p.domainX=p.x;p.domainY=p.y;p.domainCastAt=now;
   let target=this.state.players.get(String(payload.targetId||""));
   if(!target||target===p||target.dead){
    target=null;let best=Infinity;
    for(const [otherId,other] of this.state.players){if(otherId===id||other.dead)continue;const d=Math.hypot(other.x-p.aimX,other.y-p.aimY);if(d<best){best=d;target=other}}
   }
   if(target){target.stun=Math.max(target.stun,7);target.invuln=0}
  }
  times.set(kind,now);this.lastActionAt.set(id,times);p.lastActionKind=kind;p.lastActionAt=now;
  if(counter){p.counterKind=counter.kind;p.counterWindow=counter.window}
  this.broadcast("combat:action",{sessionId:id,kind,character:p.character,awakened:p.awakened,serverTime:now,face:p.face});
 }
 tryStartDomainClash(sessionId,player,now=Date.now()){
  if(!player||!CLASHABLE_DOMAINS.has(player.domainType)||player.domainClashId)return false;
  const castAt=Number(player.domainCastAt)||now;
  if(now-castAt>2700)return false;
  for(const clash of this.domainClashes.values()){
   if(!clash.participants.some(id=>{
    const other=this.state.players.get(id);
    return other&&!other.dead&&CLASHABLE_DOMAINS.has(other.domainType)&&Math.abs(castAt-(Number(other.domainCastAt)||0))<=2700&&distance(player,other)<=Math.max(160,(player.domainRadius||600)+(other.domainRadius||600));
   }))continue;
   clash.participants.push(sessionId);clash.scores.set(sessionId,0);player.domainClashId=clash.id;
   player.domainWindup=0;player.domainTimer=0;
   this.broadcast("domain:clash:start",{id:clash.id,participants:clash.participants,time:clash.time,serverTime:now});
   this.broadcast("domain:clash:score",{id:clash.id,participants:clash.participants,scores:Object.fromEntries(clash.scores),time:clash.time,serverTime:now});
   return true;
  }
  for(const [otherId,other] of this.state.players){
   if(otherId===sessionId||other.dead||!CLASHABLE_DOMAINS.has(other.domainType)||other.domainClashId)continue;
   const otherCast=Number(other.domainCastAt)||0;
   if(!otherCast||Math.abs(castAt-otherCast)>2700)continue;
   if(distance(player,other)>Math.max(160,(player.domainRadius||600)+(other.domainRadius||600)))continue;
   const id=[sessionId,otherId].sort().join("|");
   const clash={id,participants:[sessionId,otherId],time:15,maxTime:15,scores:new Map([[sessionId,0],[otherId,0]]),lastHitAt:new Map(),lastBroadcast:now};
   this.domainClashes.set(id,clash);player.domainClashId=id;other.domainClashId=id;
   player.domainWindup=0;other.domainWindup=0;player.domainTimer=0;other.domainTimer=0;
   this.broadcast("domain:clash:start",{id,participants:clash.participants,time:clash.time,serverTime:now});
   return true;
  }
  return false;
 }
 domainClashHit(client,payload={}){
  const id=client.sessionId,player=this.state.players.get(id),targetId=String(payload.targetId||""),target=this.state.players.get(targetId);
  const clash=player?.domainClashId?this.domainClashes.get(player.domainClashId):null;
  if(!clash||!target||!clash.participants.includes(targetId)||player.dead||target.dead||player.stun>0||target.grabbedBy)return;
  const now=Date.now(),requestedFace=Number(payload.face);
  if(Number.isFinite(requestedFace))player.face=clamp(requestedFace,-Math.PI,Math.PI);
  // Do not reject clash hits using packet timing, range, or client-facing estimates.
  clash.scores.set(id,Math.min(100,(clash.scores.get(id)||0)+6.25));
  this.broadcast("combat:action",{sessionId:id,kind:"m1",character:player.character,awakened:player.awakened,serverTime:now,face:player.face,domainClashId:clash.id});
  this.broadcast("domain:clash:score",{id,participants:clash.participants,scores:Object.fromEntries(clash.scores),time:clash.time,serverTime:now});
  if((clash.scores.get(id)||0)>=100)this.finishDomainClash(clash,id,"SCORE");
 }
finishDomainClash(clash,winnerId=null,reason="TIME"){
  if(!clash||!this.domainClashes.has(clash.id))return;
  const now=Date.now();
  for(const sessionId of clash.participants){
   const p=this.state.players.get(sessionId);if(!p)continue;
   p.domainClashId="";
   if(winnerId&&sessionId===winnerId){
    p.domainWindup=0;p.domainTimer=Math.max(2,p.domainDuration||8);p.domainCastAt=now;
   }else{
    if(winnerId&&!p.awakened)p.meter=Math.max(p.meter,75);
    p.domainType="";p.domainWindup=0;p.domainTimer=0;p.domainDuration=0;p.domainRadius=0;p.domainCastAt=0;
   }
  }
  this.domainClashes.delete(clash.id);
  this.broadcast("domain:clash:end",{id:clash.id,participants:clash.participants,winnerId,reason,scores:Object.fromEntries(clash.scores),serverTime:now});
 }
 tickDomainClashes(dt,now){
  for(const clash of this.domainClashes.values()){
   const alive=clash.participants.filter(id=>{const p=this.state.players.get(id);return p&&!p.dead});
   if(alive.length===1){this.finishDomainClash(clash,alive[0],"KNOCKOUT");continue}
   if(alive.length===0){this.finishDomainClash(clash,null,"KNOCKOUT");continue}
   clash.time=Math.max(0,clash.time-dt);
   if(now-clash.lastBroadcast>=250){
    clash.lastBroadcast=now;this.broadcast("domain:clash:score",{id:clash.id,participants:clash.participants,scores:Object.fromEntries(clash.scores),time:clash.time,serverTime:now});
   }
   if(clash.time<=0){
    let winner=null,best=-1,tie=false;
    for(const [id,score] of clash.scores){if(score>best){best=score;winner=id;tie=false}else if(score===best)tie=true}
    this.finishDomainClash(clash,tie?null:winner,"TIME");
   }
  }
 }
 spawnProjectile(client,payload={}){
  const clientId=String(payload?.id||"").replace(/[^a-zA-Z0-9_-]/g,"").slice(0,32);
  const reject=()=>{if(clientId)client.send("combat:projectile-reject",{id:clientId})};
  const ownerId=client.sessionId,owner=this.state.players.get(ownerId);
  if(!owner||owner.dead||owner.stun>0||owner.vehicleId||!payload||typeof payload!=="object"){reject();return}
  const move=String(payload.move||"").slice(0,48),kind=String(payload.kind||"projectile").slice(0,32);
  const profile=combatProfile(owner.character,move,owner.awakened);
  const x=Number(payload.x),y=Number(payload.y),vx=Number(payload.vx),vy=Number(payload.vy);
  const golden=payload.golden===true&&kind==="trashCan"&&owner.character==="trashman"&&owner.domainType==="trash"&&owner.domainTimer>0&&move==="trashManFlyingCan";
  const domainBound=payload.domainBound===true&&golden;
  const rideVariant=payload.rideVariant===true&&kind==="tenNue"&&owner.character==="ten"&&move==="megumiNue";
  if(![x,y,vx,vy].every(Number.isFinite)||!clientId){reject();return}
  const id=ownerId+":"+clientId;if(this.projectiles.has(id)){reject();return}
  // No move-slot, projectile-speed, spawn-distance, or per-skill anti-cheat rejection.
  const aimX=clamp(Number(payload.aimX)||owner.aimX||owner.x,45,WORLD_WIDTH-45),aimY=clamp(Number(payload.aimY)||owner.aimY||owner.y,45,WORLD_HEIGHT-45);
  let targetId=String(payload.targetId||"");
  if(!this.state.players.has(targetId)||targetId===ownerId||this.state.players.get(targetId)?.dead){
   targetId="";let best=Infinity;
   for(const [otherId,other] of this.state.players){if(otherId===ownerId||other.dead)continue;const d=Math.hypot(other.x-aimX,other.y-aimY);if(d<best){best=d;targetId=otherId}}
  }
  const projectile={id,clientId,ownerId,move,x:clamp(x,35,WORLD_WIDTH-35),y:clamp(y,35,WORLD_HEIGHT-35),vx,vy,speed:Math.hypot(vx,vy),r:clamp(Number(payload.r)||18,5,38),life:clamp(Number(payload.life)||1.2,.08,5),travelled:0,attachDoors:false,maxDistance:Math.min(profile.range,clamp(Number(payload.maxDistance)||profile.range,100,profile.range)),profile,damage:clamp(Number(payload.damage)||profile.damage,0,250),hitStun:Number.isFinite(Number(payload.hitStun))?clamp(Number(payload.hitStun),0,8):profile.stun,knockbackScale:Number.isFinite(Number(payload.knockbackScale))?clamp(Number(payload.knockbackScale),0,5):1,knockback:Number.isFinite(Number(payload.knockback))?clamp(Number(payload.knockback),0,60):0,unblockable:payload.unblockable===true,ignoreInvuln:payload.ignoreInvuln===true,damageType:/^(melee|bullet|projectile|explosion|domain)$/.test(String(payload.damageType||""))?String(payload.damageType):"projectile",blockedDamage:Number.isFinite(Number(payload.blockedDamage))?clamp(Number(payload.blockedDamage),0,250):clamp(Number(payload.damage)||profile.damage,0,250)*.12,kind,color:/^#[0-9a-f]{6}$/i.test(String(payload.color||""))?String(payload.color):"#b8e8ff",aimX,aimY,targetId,nextTickAt:Date.now()+200,detonate:false,golden,domainBound,rideVariant,bounceCount:0};
  if(rideVariant){owner.moveX=0;owner.moveY=0;owner.vx=0;owner.vy=0}
  this.projectiles.set(id,projectile);
  this.broadcast("combat:projectile",{sessionId:ownerId,id:clientId,x:projectile.x,y:projectile.y,vx,vy,r:projectile.r,life:projectile.life,maxDistance:projectile.maxDistance,kind:projectile.kind,color:projectile.color,move,golden,domainBound,rideVariant});
 }
modifyProjectile(client,payload={}){
  const id=String(payload.id||"").replace(/[^a-zA-Z0-9_-]/g,"").slice(0,32),projectile=this.projectiles.get(client.sessionId+":"+id);
  if(!projectile||projectile.ownerId!==client.sessionId||projectile.kind!=="ball")return;
  projectile.attachDoors=payload.attachDoors===true;
 }
 detonateProjectile(client,payload={}){
  const key=client.sessionId+":"+String(payload.id||"").replace(/[^a-zA-Z0-9_-]/g,"").slice(0,32),projectile=this.projectiles.get(key);
  if(projectile&&projectile.ownerId===client.sessionId&&projectile.kind==="bloodBomb")projectile.detonate=true;
 }
 applyProjectileDamage(owner,target,damage,stun,push,angle,unblockable=false,ignoreInvuln=false,incomingType="projectile",blockedDamage=null){
  if(!owner||!target||target.dead)return false;
  if(!ignoreInvuln&&target.invuln>0)return false;
  if(this.resolveCounter(owner,target,incomingType))return false;
  if(target.tenDogActive){target.tenDogActive=false;target.tenDogCharges=0;target.tenDogTimer=0;}
  if(target.tenGardenTimer>0)target.tenGardenTimer=0;
  const fireArmor=Number(target.sukunaFireCast)>0;
  const jackpotProtected=this.consumeJackpotFuel(target,damage);
  const incoming=Math.atan2(owner.y-target.y,owner.x-target.x),guard=Math.atan2(Math.sin(incoming-target.face),Math.cos(incoming-target.face));
  const blocked=!unblockable&&target.block&&Math.abs(guard)<=1.18;
  if(blocked){
   const chip=Number.isFinite(Number(blockedDamage))?clamp(Number(blockedDamage),0,250):damage*.12;if(!jackpotProtected)target.hp=Math.max(0,target.hp-chip);
   if(!target.awakened)target.meter=clamp(target.meter+damage*.12,0,100);
   target.stun=Math.max(target.stun,.0);target.invuln=.08;
  }else{
   if(!jackpotProtected)target.hp=Math.max(0,target.hp-damage);if(!fireArmor)target.stun=Math.max(target.stun,stun);target.invuln=.12;
   if(!fireArmor&&push>0){target.vx=clamp((Number(target.vx)||0)+Math.cos(angle)*push,-60,60);target.vy=clamp((Number(target.vy)||0)+Math.sin(angle)*push,-60,60)}
   if(!target.awakened)target.meter=clamp(target.meter+damage*.42,0,100);
   if(!owner.awakened)owner.meter=clamp(owner.meter+damage*.58,0,100);
  }
  if(target.hp<=0)this.killPlayer(target);
  return true;
 }
 createFireZone(owner,x,y,angle,now=Date.now()){
  if(!owner||owner.dead)return null;
  const id=owner.sessionId+":"+now+":"+Math.random().toString(36).slice(2,7);
  const zone={id,ownerId:owner.sessionId,x:clamp(x,55,WORLD_WIDTH-55),y:clamp(y,55,WORLD_HEIGHT-55),radius:270,life:5.8,nextTickAt:now+360,angle,seed:Math.random()*Math.PI*2};
  this.fireZones.set(id,zone);
  this.broadcast("combat:fire-zone",{sessionId:owner.sessionId,id,x:zone.x,y:zone.y,radius:zone.radius,life:zone.life,angle,seed:zone.seed,serverTime:now});
  for(const [targetId,target] of this.state.players){
   if(targetId===owner.sessionId||target.dead||distance(target,zone)>zone.radius)continue;
   const a=Math.atan2(target.y-zone.y,target.x-zone.x);
   this.applyProjectileDamage(owner,target,18,.32,0,a,true,true,"explosion");
  }
  return zone;
 }
 tickFireZones(dt,now=Date.now()){
  for(const [id,zone] of this.fireZones){
   const owner=this.state.players.get(zone.ownerId);
   if(!owner||owner.dead){this.fireZones.delete(id);this.broadcast("combat:fire-zone-end",{sessionId:zone.ownerId,id});continue}
   zone.life=Math.max(0,zone.life-dt);
   if(now>=zone.nextTickAt&&zone.life>0){
    zone.nextTickAt=now+360;
    for(const [targetId,target] of this.state.players){
     if(targetId===zone.ownerId||target.dead||distance(target,zone)>zone.radius)continue;
     const a=Math.atan2(target.y-zone.y,target.x-zone.x);
     this.applyProjectileDamage(owner,target,7.5,0,0,a,true,true,"explosion");
    }
   }
   if(zone.life<=0){this.fireZones.delete(id);this.broadcast("combat:fire-zone-end",{sessionId:zone.ownerId,id})}
  }
 }
 tickProjectiles(dt,now=Date.now()){
  const end=(p,event="combat:projectile-end",extra={})=>{
   this.projectiles.delete(p.id);
   this.broadcast(event,{sessionId:p.ownerId,id:p.clientId,x:p.x,y:p.y,...extra});
  };
  const hurt=(owner,target,damage,stun,push,angle,unblockable=false,ignoreInvuln=false,incomingType="projectile",blockedDamage=null)=>this.applyProjectileDamage(owner,target,damage,stun,push,angle,unblockable,ignoreInvuln,incomingType,blockedDamage);
  for(const [id,p] of this.projectiles){
   const owner=this.state.players.get(p.ownerId);
   if(!owner||owner.dead){end(p);continue}
   const from={x:p.x,y:p.y};
   let target=this.state.players.get(p.targetId);
   if(!target||target.dead||target===owner){
    target=null;let best=Infinity;
    for(const [targetId,candidate] of this.state.players){if(targetId===p.ownerId||candidate.dead)continue;const d=Math.hypot(candidate.x-p.aimX,candidate.y-p.aimY);if(d<best){best=d;target=candidate;p.targetId=targetId}}
   }
   if(p.kind==="blueMax"){
    const dx=owner.aimX-p.x,dy=owner.aimY-p.y,len=Math.hypot(dx,dy)||1,step=Math.min(len,520*dt);
    p.x+=dx/len*step;p.y+=dy/len*step;p.travelled+=step;p.life-=dt;
    let near=null,gap=150;
    for(const [targetId,candidate] of this.state.players){if(targetId===p.ownerId||candidate.dead)continue;const d=Math.hypot(candidate.x-p.x,candidate.y-p.y);if(d<gap){gap=d;near=candidate;p.targetId=targetId}}
    if(near){
     const angle=Math.atan2(p.y-near.y,p.x-near.x),pull=clamp((150-gap)*.035,.8,3.2);
     near.vx+=Math.cos(angle)*pull;near.vy+=Math.sin(angle)*pull;
     if(gap<105&&now>=p.nextTickAt){p.nextTickAt=now+200;hurt(owner,near,p.damage,p.hitStun,p.knockback||p.speed*p.knockbackScale,angle,p.unblockable,p.ignoreInvuln,p.damageType,p.blockedDamage)}
    }
   }else if(p.kind==="redmax"||p.kind==="hollow"||p.kind==="tenNue"){
    if(target){
     const dx=target.x-p.x,dy=target.y-p.y,len=Math.hypot(dx,dy)||1,speed=p.speed||Math.hypot(p.vx,p.vy)||17,turn=clamp(dt*(p.kind==="hollow"?1.35:p.kind==="tenNue"?2.8:2.1),0,1);
     p.vx+=(dx/len*speed-p.vx)*turn;p.vy+=(dy/len*speed-p.vy)*turn;
    }
    const sx=p.vx*60*dt,sy=p.vy*60*dt;p.x+=sx;p.y+=sy;p.travelled+=Math.hypot(sx,sy);p.life-=dt;
    if(p.rideVariant){
     if(owner.stun>.04){p.rideVariant=false;owner.vx=p.vx*.35;owner.vy=p.vy*.35}
     else{owner.moveX=0;owner.moveY=0;owner.x=clamp(p.x-Math.cos(Math.atan2(p.vy,p.vx))*30,45,WORLD_WIDTH-45);owner.y=clamp(p.y-Math.sin(Math.atan2(p.vy,p.vx))*30,45,WORLD_HEIGHT-45);owner.jump=Math.max(owner.jump,.55);owner.vx=0;owner.vy=0}
    }
   }else if(p.kind==="bloodBomb"){
    const aimX=Number(owner.aimX)||p.aimX,aimY=Number(owner.aimY)||p.aimY;
    const dx=aimX-p.x,dy=aimY-p.y,len=Math.hypot(dx,dy)||1,step=Math.min(len,220*dt);
    p.x+=dx/len*step;p.y+=dy/len*step;p.travelled+=step;p.life-=dt;
    if(p.detonate||p.life<=0){
     for(const [targetId,candidate] of this.state.players){
      if(targetId===p.ownerId||candidate.dead||distance(candidate,p)>165)continue;
      const angle=Math.atan2(candidate.y-p.y,candidate.x-p.x);
      hurt(owner,candidate,p.damage,p.hitStun,p.knockback||p.speed*p.knockbackScale,angle,p.unblockable,p.ignoreInvuln,p.damageType,p.blockedDamage);
     }
     end(p,"combat:projectile-explode");continue;
    }
   }else{
    const sx=p.vx*60*dt,sy=p.vy*60*dt;p.x+=sx;p.y+=sy;p.travelled+=Math.hypot(sx,sy);p.life-=dt;
   }
   p.vx*=Math.pow(.993,dt*60);p.vy*=Math.pow(.993,dt*60);
   if(p.kind==="ball"){
    if(p.x<12||p.x>WORLD_WIDTH-12){p.vx*=-1;p.x=clamp(p.x,12,WORLD_WIDTH-12);p.life-=.25}
    if(p.y<12||p.y>WORLD_HEIGHT-12){p.vy*=-1;p.y=clamp(p.y,12,WORLD_HEIGHT-12);p.life-=.25}
   }
   if(p.domainBound){
    if(owner.domainType!=="trash"||owner.domainTimer<=0){end(p);continue}
    const dx=p.x-owner.domainX,dy=p.y-owner.domainY,d=Math.hypot(dx,dy)||1,limit=Math.max(80,(owner.domainRadius||430)-p.r);
    if(d>limit){
     const nx=dx/d,ny=dy/d,dot=p.vx*nx+p.vy*ny;
     p.vx-=2*dot*nx;p.vy-=2*dot*ny;p.x=owner.domainX+nx*(limit-3);p.y=owner.domainY+ny*(limit-3);p.bounceCount++;
    }
   }
   const activeBuildings=BUILDING_LAYOUT.filter((building,index)=>!this.state.world.buildings.get(String(index))?.collapsed);
   if(p.kind!=="sukunaFireArrow"&&isBlockedByBuilding(p,activeBuildings,Math.max(7,p.r*.65))){end(p);continue}
   if(p.kind==="sukunaFireArrow"){
    let hitTarget=null,hitTargetId="";
    for(const [targetId,candidate] of this.state.players){
     if(targetId===p.ownerId||candidate.dead||candidate.vehicleId)continue;
     if(pointSegmentDistance(candidate,from,p)<=p.r+23){hitTarget=candidate;hitTargetId=targetId;break}
    }
    if(hitTarget||p.life<=0||p.travelled>=p.maxDistance){
     const x=hitTarget?hitTarget.x:p.x,y=hitTarget?hitTarget.y:p.y;
     this.createFireZone(owner,x,y,Math.atan2(p.vy,p.vx),now);
     end(p,"combat:projectile-impact",{targetId:hitTargetId});
     continue;
    }
   }else if(p.kind!=="blueMax"&&p.kind!=="bloodBomb"){
    let hitTarget=null,hitId="";
    for(const [targetId,candidate] of this.state.players){
     if(targetId===p.ownerId||candidate.dead||candidate.vehicleId||candidate.invuln>0)continue;
     if(pointSegmentDistance(candidate,from,p)<=p.r+23){hitTarget=candidate;hitId=targetId;break}
    }
    if(hitTarget){
     const angle=Math.atan2(p.y-from.y,p.x-from.x);
     if(p.kind==="bloodBombProjectile"){
      let hitAny=false;
      for(const [candidateId,candidate] of this.state.players){
       if(candidateId===p.ownerId||candidate.dead||candidate.vehicleId||candidate.invuln>0||distance(candidate,p)>120+23)continue;
       const blastAngle=Math.atan2(candidate.y-p.y,candidate.x-p.x);
       hurt(owner,candidate,p.damage,p.hitStun,p.knockback||9,blastAngle,p.unblockable,p.ignoreInvuln,p.damageType,p.blockedDamage);
       hitAny=true;
      }
      if(!hitAny)hurt(owner,hitTarget,p.damage,p.hitStun,p.knockback||9,angle,p.unblockable,p.ignoreInvuln,p.damageType,p.blockedDamage);
     }else{
      hurt(owner,hitTarget,p.damage*(p.kind==="redmax"?clamp(1-p.travelled/(p.maxDistance||900)*.75,.25,1):1),p.hitStun,p.knockback||p.speed*p.knockbackScale,angle,p.unblockable,p.ignoreInvuln,p.damageType,p.blockedDamage);
      if(p.kind==="ball"&&p.attachDoors){
       this.applyProjectileDamage(owner,hitTarget,3,.45,0,angle,false,true,"melee",.36);
       hitTarget.vy-=3;
       this.broadcast("combat:door-trap",{sessionId:p.ownerId,x:hitTarget.x,y:hitTarget.y,life:1.25});
      }
     }
     end(p,"combat:projectile-hit",{targetId:hitId});continue;
    }
   }
   if(p.life<=0||p.travelled>=p.maxDistance||p.x<20||p.y<20||p.x>WORLD_WIDTH-20||p.y>WORLD_HEIGHT-20){end(p);continue}
  }
  if(now-this.projectileBatchAt>=33){
   this.projectileBatchAt=now;
   const live=Array.from(this.projectiles.values(),p=>({sessionId:p.ownerId,id:p.clientId,x:p.x,y:p.y,vx:p.vx,vy:p.vy,life:p.life,travelled:p.travelled,maxDistance:p.maxDistance,kind:p.kind,golden:p.golden,domainBound:p.domainBound,rideVariant:p.rideVariant,serverTime:now}));
   if(live.length)this.broadcast("combat:projectile-state",{projectiles:live,serverTime:now});
  }
 }
 endAwakening(p){
  if(!p)return;
  const hadJackpot=!!p.jackpot;
  p.awakened=false;p.awakeMode="";p.awakeFuel=0;p.awakeFuelDrainRate=0;p.jackpot=false;
  p.domainStunGuaranteed=false;p.domainType="";p.domainTimer=0;p.domainWindup=0;p.domainWindupStart=0;p.domainDuration=0;p.domainRadius=0;p.domainCastAt=0;
  if(hadJackpot){p.meter=Math.min(100,40+(p.consecutiveJackpots||0)*25);p.consecutiveJackpots=(p.consecutiveJackpots||0)+1}
  else if(p.character==="restless")p.consecutiveJackpots=0;
 }
 consumeJackpotFuel(target,amount){
  if(!target||!target.jackpot)return false;
  target.awakeFuel=Math.max(0,(target.awakeFuel||0)-Math.max(0,Number(amount)||0)/3.33);
  if(target.awakeFuel<=0)this.endAwakening(target);
  return !!target.jackpot;
 }
 awakenPlayer(client){
  const p=this.state.players.get(client.sessionId);if(!p||p.dead||p.awakened||p.meter<100)return;
  p.awakened=true;p.meter=0;p.awakeFuel=100;p.jackpot=false;p.awakeFuelDrainRate=100/(p.character==="restless"?121.25:60);
  p.awakeMode=({honored:"sixeyes",vessel:"king",restless:"gamble",ten:"insanity",perfection:"essence",todo:"memories",yuta:"trueLove",trashman:"trashstorm",choso:"brother"})[p.character]||"";
  p.hp=Math.min(p.maxHp,p.hp+(p.character==="vessel"?45:p.character==="honored"||p.character==="yuta"?25:15));
  if(p.character==="restless"){
   p.domainType="hakari";p.domainRequestType="hakari";p.domainWindup=1.25;p.domainWindupStart=1.25;p.domainDuration=120;p.domainTimer=0;p.domainRadius=Math.hypot(WORLD_WIDTH,WORLD_HEIGHT);p.domainX=p.x;p.domainY=p.y;
   p.domainStunGuaranteed=Array.from(this.state.players.values()).some(q=>q!==p&&!q.dead&&distance(p,q)<600);
  }
 }
 resolveCounter(attacker,defender,incomingType="melee",attackerId="",defenderId=""){
  const kind=defender.counterKind;
  if(!kind||defender.counterWindow<=0)return false;
  const incomingAngle=Math.atan2(attacker.y-defender.y,attacker.x-defender.x),facing=Math.atan2(Math.sin(incomingAngle-defender.face),Math.cos(incomingAngle-defender.face));
  if(Math.abs(facing)>1.18)return false;
  const projectile=["bullet","projectile"].includes(incomingType),dx=attacker.x-defender.x,dy=attacker.y-defender.y,d=Math.hypot(dx,dy)||1,nx=dx/d,ny=dy/d;
  const hurt=(target,amount,stun,push)=>{if(!this.consumeJackpotFuel(target,amount))target.hp=Math.max(0,target.hp-amount);target.stun=Math.max(target.stun,stun);target.invuln=Math.max(target.invuln,.12);target.vx=clamp((Number(target.vx)||0)+nx*push,-60,60);target.vy=clamp((Number(target.vy)||0)+ny*push,-60,60);if(target.hp<=0)this.killPlayer(target)};
  defender.counterKind="";defender.counterWindow=0;
  if(kind==="sukunaCleaveCounter"&&(projectile||incomingType==="domain"||d>220))return false;
  if(kind==="yutaOutburst"){defender.invuln=Math.max(defender.invuln,.5);if(!projectile){attacker.stun=Math.max(attacker.stun,.48);attacker.vx=clamp((Number(attacker.vx)||0)-nx*11,-60,60);attacker.vy=clamp((Number(attacker.vy)||0)-ny*11,-60,60)}return true}
  if(kind==="trashSwap"){defender.invuln=Math.max(defender.invuln,.48);defender.x=clamp(attacker.x+nx*68,45,WORLD_WIDTH-45);defender.y=clamp(attacker.y+ny*68,45,WORLD_HEIGHT-45);hurt(attacker,8,.72,12);return true}
  if(kind==="sukunaCleaveCounter"){
   if(projectile||incomingType==="domain"||d>220||!attackerId||!defenderId||attacker.grabbedBy)return false;
   defender.invuln=Math.max(defender.invuln,1.15);const gap=Math.max(0,d-68),step=Math.min(gap,110);
   defender.x=clamp(defender.x+nx*step,45,WORLD_WIDTH-45);defender.y=clamp(defender.y+ny*step,45,WORLD_HEIGHT-45);
   attacker.grabbedBy=defenderId;attacker.grabKind="sukunaFlurry";attacker.grabRemaining=1;attacker.grabDuration=1;attacker.grabTick=.095;attacker.grabTickInterval=.095;attacker.grabTickDamage=1.6;attacker.grabFinishDamage=8;attacker.grabKnockback=18;attacker.motionName="captured_sukunaFlurry";attacker.motionProgress=0;attacker.motionDuration=1;attacker.attackAnim=1;attacker.attackType="grab";attacker.block=false;attacker.invuln=0;attacker.stun=1.2;
   defender.activeGrabTarget=attackerId;defender.grabKind="sukunaFlurry";defender.motionName="sukunaFlurry";defender.motionProgress=0;defender.motionDuration=1;defender.attackAnim=1;defender.attackType="grab";return true;
  }
  if(kind==="door"){if(incomingType!=="melee")return projectile;hurt(attacker,5,.5,7);return true}
  if(kind==="manji"){defender.invuln=Math.max(defender.invuln,.72);hurt(attacker,8.5,.68,10);return true}
  if(kind==="todoDream"){defender.invuln=Math.max(defender.invuln,.45);hurt(attacker,13,.8,12);return true}
  if(kind==="todoBrothers"){defender.invuln=Math.max(defender.invuln,.6);hurt(attacker,28,1,17);return true}
  if(kind==="bloodSupernova"){defender.invuln=Math.max(defender.invuln,.5);defender.convergenceOrbs=clamp((Number(defender.convergenceOrbs)||0)+1,0,4);hurt(attacker,14,.8,13);return true}
  return false;
 }
 combatHit(client,payload={}){
  const a=this.state.players.get(client.sessionId),id=String(payload.targetId||""),target=this.state.players.get(id);
  if(!a||!target||a===target||a.dead||target.dead||a.stun>0||a.activeGrabTarget||target.grabbedBy)return;
  const move=String(payload.move||"").slice(0,48),profile=combatProfile(a.character,move,a.awakened);
  const incomingType=String(payload.damageType||"melee").slice(0,24);
  const amountValue=Number(payload.amount),amount=Number.isFinite(amountValue)?clamp(amountValue,0,250):profile.damage;
  const stunValue=Number(payload.stun),stun=Number.isFinite(stunValue)?clamp(stunValue,0,8):profile.stun;
  const invulnValue=Number(payload.invuln),invuln=Number.isFinite(invulnValue)?clamp(invulnValue,0,5):.12;
  const kxValue=Number(payload.kx),kyValue=Number(payload.ky);
  const kx=Number.isFinite(kxValue)?clamp(kxValue,-60,60):0,ky=Number.isFinite(kyValue)?clamp(kyValue,-60,60):0;
  const ignoreInvuln=payload.ignoreInvuln===true,unblockable=payload.unblockable===true;
  const blockAllSides=payload.blockAllSides===true,blockedValue=Number(payload.blockedDamage);
  const blockedDamage=Number.isFinite(blockedValue)?clamp(blockedValue,0,250):amount*.12;
  if(this.resolveCounter(a,target,incomingType,client.sessionId,id))return;
  if(target.invuln>0&&!ignoreInvuln)return;
  if(target.tenDogActive){target.tenDogActive=false;target.tenDogCharges=0;target.tenDogTimer=0;}
  if(target.tenGardenTimer>0)target.tenGardenTimer=0;
  const fireArmor=Number(target.sukunaFireCast)>0;
  const grab=grabSettings(a.character,move);
  if(grab){
   if(target.vehicleId)return;
   const grabDuration=Number.isFinite(Number(payload.grabDuration))?clamp(Number(payload.grabDuration),.1,3):grab.duration;
   const grabTickInterval=Number.isFinite(Number(payload.grabTickInterval))?clamp(Number(payload.grabTickInterval),.04,1):grab.kind==="sukunaFlurry"?.095:grab.kind==="sukunaCleave"?.14:grab.kind==="yujiDrag"?.25:grab.kind==="toadPull"?.22:grab.tickInterval;
   const grabTickDamage=Number.isFinite(Number(payload.grabTickDamage))?clamp(Number(payload.grabTickDamage),0,20):grab.tickDamage;
   const grabFinishDamage=Number.isFinite(Number(payload.grabFinishDamage))?clamp(Number(payload.grabFinishDamage),0,60):grab.finishDamage;
   const grabKnockback=Number.isFinite(Number(payload.grabKnockback))?clamp(Number(payload.grabKnockback),0,40):grab.knockback;
   target.grabbedBy=client.sessionId;target.grabKind=grab.kind;target.grabRemaining=grabDuration;target.grabDuration=grabDuration;target.grabTick=grabTickInterval;target.grabTickInterval=grabTickInterval;target.grabTickDamage=grabTickDamage;target.grabFinishDamage=grabFinishDamage;target.grabKnockback=grabKnockback;
   target.motionName="captured_"+grab.kind;target.motionProgress=0;target.attackAnim=grab.duration;target.attackType="grab";target.block=false;target.invuln=0;target.stun=grab.duration+.2;a.activeGrabTarget=id;a.grabKind=grab.kind;return;
  }
  const jackpotProtected=this.consumeJackpotFuel(target,amount);
  const incoming=Math.atan2(a.y-target.y,a.x-target.x),guard=Math.atan2(Math.sin(incoming-target.face),Math.cos(incoming-target.face));
  const frontGuard=target.block&&Math.abs(guard)<=1.18;
  if((frontGuard||blockAllSides)&&!unblockable){
   if(!jackpotProtected)target.hp=Math.max(0,target.hp-blockedDamage);
   if(!target.awakened)target.meter=clamp(target.meter+amount*.12,0,100);
   target.invuln=.08;
   if(target.hp<=0)this.killPlayer(target);
   return;
  }
  if(!jackpotProtected)target.hp=Math.max(0,target.hp-amount);
  if(!fireArmor)target.stun=Math.max(target.stun,stun);
  target.invuln=invuln;
  if(!fireArmor){target.vx=clamp((Number(target.vx)||0)+kx,-60,60);target.vy=clamp((Number(target.vy)||0)+ky,-60,60)}
  if(!target.awakened)target.meter=clamp(target.meter+amount*.42,0,100);
  if(!a.awakened)a.meter=clamp(a.meter+amount*.58,0,100);
  if(target.hp<=0)this.killPlayer(target);
 }
killPlayer(p){
  if(p.dead)return;
  if(p.grabbedBy){const owner=this.state.players.get(p.grabbedBy);if(owner)owner.activeGrabTarget=""}
  if(p.activeGrabTarget){const target=this.state.players.get(p.activeGrabTarget);if(target){target.grabbedBy="";target.grabKind="";target.grabRemaining=0;target.stun=Math.max(target.stun,.3)}}
  p.grabbedBy="";p.activeGrabTarget="";p.grabKind="";p.grabRemaining=0;p.counterKind="";p.counterWindow=0;
  p.hp=0;p.dead=true;p.respawnTimer=2.5;p.stun=0;p.invuln=0;p.block=false;p.domainType="";p.domainTimer=0;p.domainWindup=0;p.domainRadius=0;
  if(p.vehicleId){const c=this.state.world.cars.get(p.vehicleId);if(c){c.destroyed=true;c.occupiedBy="";c.speed=0;c.vx=0;c.vy=0;c.respawnTimer=15}p.vehicleId=""}
 }
 hitBuilding(client,payload={}){
  const p=this.state.players.get(client.sessionId),id=Number(payload.buildingId),move=String(payload.move||p?.motionName||"").slice(0,48);
  if(!p||p.dead||p.vehicleId||!Number.isInteger(id)||id<0||id>=BUILDING_LAYOUT.length)return;
  const b=BUILDING_LAYOUT[id],state=this.state.world.buildings.get(String(id));
  if(!state||state.collapsed||!rayHitsRect(p,p.face,b,1100))return;
  const key=client.sessionId+":"+id,now=Date.now();
  if(now-(this.lastBuildingAt.get(key)||0)<350)return;
  this.lastBuildingAt.set(key,now);
  state.stage=Math.min(3,state.stage+1);
  if(state.stage>=3){state.collapsed=true;state.respawnTimer=25}
 }
 hitProp(client,payload={}){
  const p=this.state.players.get(client.sessionId),id=Number(payload.propId),state=this.state.world.props.get(String(id)),source=PROP_SPAWNS.find(x=>x.id===id);
  if(!p||p.dead||p.vehicleId||!state||!state.alive||!source)return;
  const now=Date.now(),recentDash=p.lastActionKind==="dash"&&now-(p.lastActionAt||0)<=500;
  const center={x:source.x+source.w/2,y:source.y+source.h/2};
  const dx=center.x-p.x,dy=center.y-p.y,angle=Math.atan2(dy,dx),faceDelta=Math.atan2(Math.sin(angle-p.face),Math.cos(angle-p.face));
  const inDashPath=recentDash&&rayHitsRect(p,p.face,source,260);
  if(!inDashPath&&(p.attackAnim<=0||Math.hypot(dx,dy)>58||Math.abs(faceDelta)>1.2))return;
  const key=client.sessionId+":"+id;
  if(now-(this.lastPropHitAt.get(key)||0)<240)return;
  this.lastPropHitAt.set(key,now);state.hp=Math.max(0,state.hp-1);
  if(state.hp<=0){state.alive=false;state.respawnTimer=15}
 }
 enterCar(client,payload={}){const p=this.state.players.get(client.sessionId),id=String(payload.carId??""),c=this.state.world.cars.get(id);if(!p||p.dead||p.vehicleId||!c||c.destroyed||c.occupiedBy||distance(p,c)>110)return;c.occupiedBy=client.sessionId;c.speed=0;c.vx=0;c.vy=0;p.vehicleId=id;p.x=c.x;p.y=c.y;p.block=false;p.attackAnim=0;p.motionName=""}
 exitCar(client){const p=this.state.players.get(client.sessionId);if(!p||!p.vehicleId)return;const c=this.state.world.cars.get(p.vehicleId);if(c&&c.occupiedBy===client.sessionId){c.occupiedBy="";c.speed=0;c.vx=0;c.vy=0;p.x=clamp(c.x+Math.cos(c.angle)*35,45,WORLD_WIDTH-45);p.y=clamp(c.y+Math.sin(c.angle)*35,45,WORLD_HEIGHT-45)}p.vehicleId=""}
 driveCar(client,payload={}){
  const p=this.state.players.get(client.sessionId);
  if(!p||p.dead||!p.vehicleId)return;
  const c=this.state.world.cars.get(p.vehicleId);
  if(!c||c.destroyed||c.occupiedBy!==client.sessionId)return;
  const now=Date.now(),prev=this.lastCarControlAt.get(client.sessionId)||now-50,dt=clamp((now-prev)/1000,.02,.12);
  this.lastCarControlAt.set(client.sessionId,now);
  const steer=clamp(Number(payload.steer)||0,-1,1),throttle=clamp(Number(payload.throttle)||0,-1,1);
  const drift=payload.drift===true&&Math.abs(c.speed)>80&&Math.abs(steer)>.05;
  if(throttle>0){if(c.speed<0)c.speed=Math.min(0,c.speed+620*dt);else c.speed=Math.min(680,c.speed+340*dt)}
  else if(throttle<0){if(c.speed>0)c.speed=Math.max(0,c.speed-560*dt);else c.speed=Math.max(-210,c.speed-230*dt)}
  else c.speed*=Math.exp(-.34*dt);
  if(Math.abs(steer)>.01&&Math.abs(c.speed)>10)c.angle+=steer*(.75+Math.min(1,Math.abs(c.speed)/320)*1.15)*dt*(c.speed>=0?1:-1);
  if(drift)c.speed=Math.min(680,c.speed+78*dt);
  const hx=Math.sin(c.angle),hy=-Math.cos(c.angle),grip=drift?1.25:8.5,blend=clamp(grip*dt,0,1);
  c.vx+=(hx*c.speed-c.vx)*blend;c.vy+=(hy*c.speed-c.vy)*blend;
  const oldX=c.x,oldY=c.y,nextX=clamp(c.x+c.vx*dt,38,WORLD_WIDTH-38),nextY=clamp(c.y+c.vy*dt,38,WORLD_HEIGHT-38);
  const box={x:nextX-38,y:nextY-21,w:76,h:42},impactSpeed=Math.abs(c.speed);
  let hitBuilding=false;
  for(let index=0;index<BUILDING_LAYOUT.length;index++){
   const b=BUILDING_LAYOUT[index],state=this.state.world.buildings.get(String(index));
   if(!state||state.collapsed)continue;
   const px=clamp(nextX,b.x,b.x+b.w),py=clamp(nextY,b.y,b.y+b.h),dx=nextX-px,dy=nextY-py;
   if(dx*dx+dy*dy>=38*38)continue;
   if(impactSpeed>=135){
    const key="car:"+p.vehicleId+":"+index,lastHit=this.lastBuildingAt.get(key)||0;
    if(now-lastHit>=720){
     this.lastBuildingAt.set(key,now);
     const stages=impactSpeed>=370?3:impactSpeed>=245?2:1;
     state.stage=Math.min(3,state.stage+stages);
     if(state.stage>=3){state.collapsed=true;state.respawnTimer=25;}
    }
   }
   if(!state.collapsed){hitBuilding=true;break}
  }
  if(impactSpeed>=95){
   for(const source of PROP_SPAWNS){
    const state=this.state.world.props.get(String(source.id));
    if(!state||!state.alive||box.x>=source.x+source.w||box.x+box.w<=source.x||box.y>=source.y+source.h||box.y+box.h<=source.y)continue;
    const key="car:"+p.vehicleId+":"+source.id,lastHit=this.lastPropHitAt.get(key)||0;
    if(now-lastHit>=350){this.lastPropHitAt.set(key,now);state.hp=0;state.alive=false;state.respawnTimer=15}
   }
  }
  const hitCar=Array.from(this.state.world.cars.entries()).some(([otherId,other])=>otherId!==p.vehicleId&&!other.destroyed&&Math.hypot(nextX-other.x,nextY-other.y)<43);
  if(hitBuilding){c.x=oldX;c.y=oldY;c.speed*=-.32;c.vx*=-.24;c.vy*=-.24}
  else if(hitCar){c.x=oldX;c.y=oldY;c.speed*=.25;c.vx*=.15;c.vy*=.15}
  else{c.x=nextX;c.y=nextY}
  p.x=c.x;p.y=c.y;p.face=Math.atan2(hy,hx);
  if(impactSpeed>95){
   const speedRatio=clamp((impactSpeed-95)/(680-95),0,1),hitDamage=Math.round(10+22*speedRatio),push=5+speedRatio*7,angle=Math.atan2(hy,hx);
   for(const [id,target] of this.state.players){
    if(id===client.sessionId||target.dead||target.vehicleId||distance(c,target)>52)continue;
    const key="car:"+p.vehicleId+":"+id;
    if(now-(this.lastHitAt.get(key)||0)<680)continue;
    this.lastHitAt.set(key,now);
    if(this.resolveCounter(p,target,"vehicle"))continue;
    if(!this.consumeJackpotFuel(target,hitDamage))target.hp=Math.max(0,target.hp-hitDamage);
    target.stun=Math.max(target.stun,.5+speedRatio*.45);target.invuln=.12;
    target.vx=clamp((Number(target.vx)||0)+hx*push,-60,60);
    target.vy=clamp((Number(target.vy)||0)+hy*push,-60,60);
    if(!target.awakened)target.meter=clamp(target.meter+hitDamage*.42,0,100);
    if(!p.awakened)p.meter=clamp(p.meter+hitDamage*.58,0,100);
    if(target.hp<=0)this.killPlayer(target);
   }
  }
 }

 tick(dt){const w=this.state.world;w.worldSeconds+=dt;const since=w.worldSeconds-18;if(since<0){w.trainWarning=false;w.trainX=-9999}else{const cycle=since%62,elapsed=cycle-2.2;w.trainWarning=cycle<9.5;w.trainX=elapsed>=0&&elapsed<6.3?-80+elapsed*620:-9999}const now=Date.now();for(const [playerId,lastActive] of this.lastActivityAt){const inactivePlayer=this.state.players.get(playerId);if(!inactivePlayer){this.lastActivityAt.delete(playerId);continue}if(!inactivePlayer.connected||now-lastActive<300000)continue;const inactiveClient=this.clients.find(c=>c.sessionId===playerId);if(inactiveClient){this.lastActivityAt.set(playerId,now);inactiveClient.leave(4008,"AFK_TIMEOUT")}}for(const [id,building] of this.state.world.buildings){if(building.collapsed){building.respawnTimer=Math.max(0,building.respawnTimer-dt);if(building.respawnTimer===0){building.stage=0;building.collapsed=false}}}for(const prop of this.state.world.props.values()){if(!prop.alive){prop.respawnTimer=Math.max(0,prop.respawnTimer-dt);if(prop.respawnTimer===0){prop.alive=true;prop.hp=3}}}for(const [id,car] of this.state.world.cars){if(car.destroyed){car.respawnTimer=Math.max(0,car.respawnTimer-dt);if(car.respawnTimer===0){const spawn=CAR_SPAWNS.find(x=>String(x.id)===id);if(spawn){car.x=spawn.x;car.y=spawn.y;car.angle=0;car.vx=0;car.vy=0;car.speed=0;car.destroyed=false;car.occupiedBy=""}}}}for(const [id,p] of this.state.players){p.stun=Math.max(0,p.stun-dt);p.invuln=Math.max(0,p.invuln-dt);p.counterWindow=Math.max(0,p.counterWindow-dt);if(p.counterWindow===0)p.counterKind="";p.attackAnim=Math.max(0,p.attackAnim-dt);if(p.jackpot&&!p.dead&&!p.domainClashId)p.hp=Math.min(p.maxHp,p.hp+4*dt);if(p.domainWindup>0){if(p.stun>0){p.domainType="";p.domainWindup=0;p.domainTimer=0;p.domainDuration=0;p.domainRadius=0;p.domainStunGuaranteed=false}else{p.domainWindup=Math.max(0,p.domainWindup-dt);if(p.domainWindup===0){p.domainTimer=p.domainDuration||0;if(p.character==="restless"&&p.domainType==="hakari"&&p.domainStunGuaranteed){let nearest=null,best=Infinity;for(const [otherId,other] of this.state.players){if(otherId===id||other.dead)continue;const d=distance(p,other);if(d<best){best=d;nearest=other}}if(nearest&&best<600){nearest.stun=Math.max(nearest.stun,.7);nearest.invuln=0}p.domainStunGuaranteed=false}}}}if(p.domainTimer>0){p.domainTimer=Math.max(0,p.domainTimer-dt);if(p.domainTimer===0){p.domainType="";p.domainWindupStart=0;p.domainRadius=0;p.domainCastAt=0;p.domainStunGuaranteed=false}}if(p.dead){p.respawnTimer=Math.max(0,p.respawnTimer-dt);if(p.respawnTimer===0){const others=[];this.state.players.forEach(q=>{if(q!==p&&!q.dead)others.push(q)});const spawn=findAvailableSpawn(others);p.x=spawn.x;p.y=spawn.y;p.hp=p.maxHp;p.dead=false;p.invuln=1.25;p.stun=0;p.awakened=false;p.awakeMode="";p.awakeFuel=0;p.awakeFuelDrainRate=0;p.jackpot=false;p.domainStunGuaranteed=false;p.block=false;p.domainType="";p.domainTimer=0;p.domainRadius=0}}if(!p.dead&&p.attackAnim>0){for(const src of PROP_SPAWNS){const prop=w.props.get(String(src.id));if(!prop||!prop.alive)continue;const center={x:src.x+src.w/2,y:src.y+src.h/2},dx=center.x-p.x,dy=center.y-p.y,a=Math.atan2(dy,dx),faceDelta=Math.atan2(Math.sin(a-p.face),Math.cos(a-p.face));if(Math.hypot(dx,dy)>58||Math.abs(faceDelta)>1.2)continue;const key=id+":"+src.id;if(now-(this.lastPropHitAt.get(key)||0)<300)continue;this.lastPropHitAt.set(key,now);prop.hp=Math.max(0,prop.hp-1);if(prop.hp<=0){prop.alive=false;prop.respawnTimer=15}}}}for(const [targetId,target] of this.state.players){
  if(!target.grabbedBy)continue;
  const owner=this.state.players.get(target.grabbedBy);
  if(!owner||owner.dead||owner.activeGrabTarget!==targetId){if(owner)owner.activeGrabTarget="";target.grabbedBy="";target.grabKind="";target.grabRemaining=0;target.stun=Math.max(target.stun,.24);continue}
  const angle=owner.face,fx=Math.cos(angle),fy=Math.sin(angle);
  if(["yujiDrag","gojoFaceGrater","bloodEdge","sukunaCleave"].includes(target.grabKind)){
   const gap=target.grabKind==="gojoFaceGrater"?Math.max(0,distance(owner,target)-56):target.grabKind==="sukunaCleave"?Math.max(0,distance(owner,target)-54):Infinity;
   const speed=target.grabKind==="gojoFaceGrater"?760:target.grabKind==="sukunaCleave"?440:target.grabKind==="yujiDrag"?188:35;
   const step=Number.isFinite(gap)?Math.min(gap,speed*dt):speed*dt;
   const nx=clamp(owner.x+fx*step,45,WORLD_WIDTH-45),ny=clamp(owner.y+fy*step,45,WORLD_HEIGHT-45);
   if(!isBlockedByBuilding({x:nx,y:ny},BUILDING_LAYOUT.filter((b,index)=>!this.state.world.buildings.get(String(index))?.collapsed),29)){owner.x=nx;owner.y=ny}
  }
  const progress=target.grabDuration>0?1-target.grabRemaining/target.grabDuration:1;
  if(target.grabKind==="todoThrow"){const spin=progress*Math.PI*3.2;target.x=clamp(owner.x+Math.cos(angle+spin)*48,45,WORLD_WIDTH-45);target.y=clamp(owner.y+Math.sin(angle+spin)*34,45,WORLD_HEIGHT-45)}
  else if(target.grabKind==="toadPull"){target.x=clamp(owner.x+fx*50,45,WORLD_WIDTH-45);target.y=clamp(owner.y+fy*50,45,WORLD_HEIGHT-45)}
  else{const offset=target.grabKind==="yujiDrag"?46:target.grabKind==="gojoFaceGrater"?48:target.grabKind==="sukunaCleave"?47:target.grabKind==="mahitoTransfigure"?43:target.grabKind==="bloodEdge"?42:52;target.x=clamp(owner.x+fx*offset,45,WORLD_WIDTH-45);target.y=clamp(owner.y+fy*offset,45,WORLD_HEIGHT-45)}
  target.face=angle+Math.PI;target.block=false;target.stun=Math.max(target.stun,.08);
  target.grabRemaining=Math.max(0,target.grabRemaining-dt);target.grabTick=Math.max(0,target.grabTick-dt);target.motionName="captured_"+target.grabKind;target.motionProgress=progress;
  if(target.grabTick===0&&target.grabRemaining>0){target.grabTick=target.grabTickInterval||.2;if(!this.consumeJackpotFuel(target,target.grabTickDamage))target.hp=Math.max(0,target.hp-target.grabTickDamage);target.meter=clamp(target.meter+target.grabTickDamage*.25,0,100);owner.meter=clamp(owner.meter+target.grabTickDamage*.35,0,100)}
  if(target.hp<=0){this.killPlayer(target);continue}
  if(target.grabRemaining<=0){
   const finish=target.grabKind==="sukunaCleave"?Math.max(10,target.hp*.4):target.grabFinishDamage,push=target.grabKnockback;target.grabbedBy="";target.grabKind="";owner.activeGrabTarget="";owner.grabKind="";
   target.hp=Math.max(0,target.hp-finish);target.stun=Math.max(target.stun,.82);target.invuln=Math.max(target.invuln,.16);
   target.x=clamp(target.x+fx*push,45,WORLD_WIDTH-45);target.y=clamp(target.y+fy*push,45,WORLD_HEIGHT-45);
   target.motionName="grabRelease";target.motionProgress=1;target.attackAnim=0;target.grabDuration=0;target.grabTick=0;target.grabTickInterval=0;target.grabTickDamage=0;target.grabFinishDamage=0;target.grabKnockback=0;
   if(target.hp<=0)this.killPlayer(target);
  }
 }
this.tickProjectiles(dt,now);this.tickFireZones(dt,now);this.tickDomainClashes(dt,now);if(w.trainX!==-9999){const centers=[w.trainX-380,w.trainX-190,w.trainX];for(const p of this.state.players.values()){if(p.dead||Math.abs(p.y-TRAIN_TRACK_Y)>(p.vehicleId?100:54)||!centers.some(x=>Math.abs(p.x-x)<=(p.vehicleId?130:110)))continue;this.killPlayer(p)}for(const c of w.cars.values()){if(c.destroyed||Math.abs(c.y-TRAIN_TRACK_Y)>90)continue;if(centers.some(x=>Math.abs(c.x-x)<130)){c.destroyed=true;c.occupiedBy="";c.speed=0;c.vx=0;c.vy=0;c.respawnTimer=15}}}if(now-this.domainTickAt>=350){this.domainTickAt=now;const players=Array.from(this.state.players.entries());for(const [oid,o] of players){if(o.dead||o.domainType!=="void"||o.domainTimer<=0)continue;const r=clamp(o.domainRadius||Math.hypot(WORLD_WIDTH,WORLD_HEIGHT),120,Math.hypot(WORLD_WIDTH,WORLD_HEIGHT));for(const [tid,t] of players){if(tid===oid||t.dead||o.domainClashId||distance(o,t)>r)continue;t.stun=Math.max(t.stun,.42);t.invuln=0}}}}
}
