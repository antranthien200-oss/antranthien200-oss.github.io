import { Room } from "colyseus";
import { schema,t } from "@colyseus/schema";
import { BUILDING_LAYOUT,CAR_SPAWNS,CHARACTER_HP,CHARACTER_IDS,DOMAIN_BY_CHARACTER,MAX_PLAYERS,PROP_SPAWNS,TRAIN_TRACK_Y,WORLD_HEIGHT,WORLD_WIDTH,combatProfile,counterSettings,domainSettings,findAvailableSpawn,grabSettings,isBlockedByBuilding,normalizePlayerUpdate,rayHitsRect,sanitizePlayerName } from "../rules.js";
const PlayerState=schema({name:t.string().default("Player"),character:t.string().default("vessel"),x:t.number().default(1250),y:t.number().default(765),vx:t.number().default(0),vy:t.number().default(0),moveX:t.number().default(0),moveY:t.number().default(0),moveScale:t.number().default(1),aimX:t.number().default(1250),aimY:t.number().default(765),face:t.number().default(0),walk:t.number().default(0),jump:t.number().default(0),block:t.boolean().default(false),attackAnim:t.number().default(0),attackType:t.string().default(""),motionName:t.string().default(""),motionProgress:t.number().default(0),motionDuration:t.number().default(1),motionStartedAt:t.number().default(0),lastActionKind:t.string().default(""),lastActionAt:t.number().default(0),hp:t.number().default(100),maxHp:t.number().default(100),meter:t.number().default(0),stun:t.number().default(0),invuln:t.number().default(0),dead:t.boolean().default(false),respawnTimer:t.number().default(0),awakened:t.boolean().default(false),connected:t.boolean().default(true),vehicleId:t.string().default(""),domainType:t.string().default(""),domainTimer:t.number().default(0),domainRadius:t.number().default(0),domainX:t.number().default(0),domainY:t.number().default(0),domainWindup:t.number().default(0),domainDuration:t.number().default(0),domainCastAt:t.number().default(0),domainClashId:t.string().default(""),counterKind:t.string().default(""),counterWindow:t.number().default(0),grabbedBy:t.string().default(""),activeGrabTarget:t.string().default(""),grabKind:t.string().default(""),grabRemaining:t.number().default(0),grabDuration:t.number().default(0),grabTick:t.number().default(0),grabTickDamage:t.number().default(0),grabFinishDamage:t.number().default(0),grabKnockback:t.number().default(0)},"PlayerState");
const BuildingState=schema({stage:t.number().default(0),collapsed:t.boolean().default(false)},"BuildingState");
const CarState=schema({x:t.number().default(0),y:t.number().default(0),angle:t.number().default(0),vx:t.number().default(0),vy:t.number().default(0),speed:t.number().default(0),occupiedBy:t.string().default(""),destroyed:t.boolean().default(false),respawnTimer:t.number().default(0)},"CarState");
const PropState=schema({hp:t.number().default(3),alive:t.boolean().default(true),respawnTimer:t.number().default(0)},"PropState");
const WorldState=schema({buildings:t.map(BuildingState),cars:t.map(CarState),props:t.map(PropState),worldSeconds:t.number().default(0),trainX:t.number().default(-9999),trainWarning:t.boolean().default(false)},"WorldState");
const CityState=schema({players:t.map(PlayerState),world:WorldState},"CityState");
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const pointSegmentDistance=(point,a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy||1,t=clamp(((point.x-a.x)*dx+(point.y-a.y)*dy)/length,0,1);return Math.hypot(point.x-(a.x+dx*t),point.y-(a.y+dy*t))};
const CLASHABLE_DOMAINS=new Set(["void","shrine","hakari","soul","yuta","trash"]);
export class CityRoom extends Room{
 maxClients=MAX_PLAYERS;autoDispose=false;patchRate=33;maxMessagesPerSecond=90;
 onCreate(){
  this.maxClients=MAX_PLAYERS;
  const initial=new CityState();initial.world=new WorldState();this.setState(initial);
  this.lastUpdateAt=new Map();this.lastCarControlAt=new Map();this.lastHitAt=new Map();this.lastPropHitAt=new Map();this.lastActionAt=new Map();this.lastBuildingAt=new Map();this.projectiles=new Map();this.fireZones=new Map();this.domainClashes=new Map();this.projectileBatchAt=0;this.domainTickAt=0;
  BUILDING_LAYOUT.forEach((b,id)=>this.state.world.buildings.set(String(id),new BuildingState()));
  CAR_SPAWNS.forEach(spawn=>{const c=new CarState();c.x=spawn.x;c.y=spawn.y;this.state.world.cars.set(String(spawn.id),c)});
  PROP_SPAWNS.forEach(p=>this.state.world.props.set(String(p.id),new PropState()));
  this.onMessage("player:update",(c,p)=>this.updatePlayer(c,p));this.onMessage("combat:hit",(c,p)=>this.combatHit(c,p));this.onMessage("combat:action",(c,p)=>this.combatAction(c,p));this.onMessage("combat:projectile",(c,p)=>this.spawnProjectile(c,p));this.onMessage("combat:projectile-detonate",(c,p)=>this.detonateProjectile(c,p));this.onMessage("domain:clash-hit",(c,p)=>this.domainClashHit(c,p));this.onMessage("combat:awaken",c=>this.awakenPlayer(c));this.onMessage("world:building-hit",(c,p)=>this.hitBuilding(c,p));this.onMessage("world:prop-hit",(c,p)=>this.hitProp(c,p));this.onMessage("car:enter",(c,p)=>this.enterCar(c,p));this.onMessage("car:exit",c=>this.exitCar(c));this.onMessage("car:control",(c,p)=>this.driveCar(c,p));
  this.setSimulationInterval(ms=>this.tick(ms/1000),33);
 }
 onJoin(client,options={}){
  if(this.state.players.size>=MAX_PLAYERS){client.leave(4003,"SERVER_FULL");return}
  const others=[];this.state.players.forEach(p=>others.push(p));
  const spawn=findAvailableSpawn(others),character=CHARACTER_IDS.includes(options.character)?options.character:"vessel",hp=CHARACTER_HP[character]||100,p=new PlayerState(),name=sanitizePlayerName(options.name,"Player");
  p.name=name==="Player"?"Player-"+client.sessionId.slice(0,4).toUpperCase():name;p.character=character;p.x=spawn.x;p.y=spawn.y;p.hp=hp;p.maxHp=hp;this.state.players.set(client.sessionId,p);this.lastUpdateAt.set(client.sessionId,Date.now());this.broadcast("server:player-count",{count:this.state.players.size,capacity:MAX_PLAYERS});console.log("[city] joined",p.name,this.state.players.size+"/16")}
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
 onReconnect(client){const p=this.state.players.get(client.sessionId);if(p)p.connected=true;console.log("[city] reconnected",p?.name||client.sessionId)}
 onLeave(client){
  const sessionId=client.sessionId,p=this.state.players.get(sessionId);
  if(p?.vehicleId){const c=this.state.world.cars.get(p.vehicleId);if(c&&c.occupiedBy===sessionId){c.occupiedBy="";c.speed=0;c.vx=0;c.vy=0}}if(p?.grabbedBy){const owner=this.state.players.get(p.grabbedBy);if(owner)owner.activeGrabTarget=""}if(p?.activeGrabTarget){const target=this.state.players.get(p.activeGrabTarget);if(target){target.grabbedBy="";target.grabKind="";target.grabRemaining=0;target.stun=Math.max(target.stun,.25)}}
  this.state.players.delete(sessionId);this.lastUpdateAt.delete(sessionId);this.lastCarControlAt.delete(sessionId);this.lastActionAt.delete(sessionId);
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
 updatePlayer(client,payload){
  const id=client.sessionId,p=this.state.players.get(id);if(!p||p.dead||!payload||typeof payload!=="object")return;
  const now=Date.now(),prev=this.lastUpdateAt.get(id)||now-33,n=normalizePlayerUpdate(payload,p,now-prev);if(!n)return;
  this.lastUpdateAt.set(id,now);
  const previousMotion=p.motionName;
  p.face=n.face;p.walk=n.walk;p.jump=n.jump;p.block=n.block;p.attackAnim=n.attackAnim;p.attackType=n.attackType;
  p.motionName=n.motionName;p.motionProgress=n.motionProgress;p.motionDuration=n.motionDuration;
  if(previousMotion!==n.motionName)p.motionStartedAt=now;
  p.moveX=n.moveX;p.moveY=n.moveY;p.moveScale=n.moveScale;p.aimX=n.aimX;p.aimY=n.aimY;
  if(p.stun>0||p.grabbedBy||p.activeGrabTarget){p.moveX=0;p.moveY=0;return}
  if(p.vehicleId){
   const c=this.state.world.cars.get(p.vehicleId);
   if(!c||c.destroyed||c.occupiedBy!==id)p.vehicleId="";
   else{p.x=c.x;p.y=c.y;p.vx=c.vx;p.vy=c.vy}
  }else{
   // Multiplayer positions are client-driven; no speed/teleport anti-cheat rejection.
   p.x=n.x;p.y=n.y;
  }
  const requested=String(payload.domainType||""),settings=domainSettings(p.character,requested);
  if(requested&&!p.domainType&&settings&&(p.awakened||p.meter>=100)&&!p.domainClashId){
   if(!p.awakened)p.meter=0;
   p.domainType=requested;p.domainWindup=Math.max(.2,Math.min(3,Number(payload.domainWindup)||1.25));
   p.domainDuration=settings.duration;p.domainTimer=0;p.domainRadius=settings.radius;p.domainX=p.x;p.domainY=p.y;p.domainCastAt=now;
   this.broadcast("domain:cast",{sessionId:id,domainType:requested,startedAt:now,windup:p.domainWindup,duration:p.domainDuration,x:p.x,y:p.y});
   this.tryStartDomainClash(id,p,now);
  }else if(!requested&&p.domainType&&!p.domainClashId){
   p.domainType="";p.domainTimer=0;p.domainWindup=0;p.domainDuration=0;p.domainRadius=0;p.domainCastAt=0;
  }
 }
combatAction(client,payload={}){
  const id=client.sessionId,p=this.state.players.get(id),kind=String(payload.kind||"");
  if(!p||p.dead||p.vehicleId||p.stun>0||p.grabbedBy||p.activeGrabTarget)return;
  if(!["m1","dash","special","awaken","1","2","3","4"].includes(kind))return;
  const counter=counterSettings(p.character,kind,p.awakened);
  const cooldown=counter?.cooldown??(kind==="m1"?.12:kind==="dash"?1.05:kind==="awaken"?1:kind==="special"?.4:.42);
  const now=Date.now(),times=this.lastActionAt.get(id)||new Map();
  if(now-(times.get(kind)||0)<cooldown*1000)return;
  const requestedFace=Number(payload.face);if(Number.isFinite(requestedFace))p.face=clamp(requestedFace,-Math.PI,Math.PI);
  if(kind==="awaken"){if(p.awakened||p.meter<100)return;this.awakenPlayer(client)}
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
  const projectile={id,clientId,ownerId,move,x:clamp(x,35,WORLD_WIDTH-35),y:clamp(y,35,WORLD_HEIGHT-35),vx,vy,speed:Math.hypot(vx,vy),r:clamp(Number(payload.r)||18,5,38),life:clamp(Number(payload.life)||1.2,.08,5),travelled:0,maxDistance:Math.min(profile.range,clamp(Number(payload.maxDistance)||profile.range,100,profile.range)),profile,kind,color:/^#[0-9a-f]{6}$/i.test(String(payload.color||""))?String(payload.color):"#b8e8ff",aimX,aimY,targetId,nextTickAt:Date.now()+200,detonate:false,golden,domainBound,rideVariant,bounceCount:0};
  if(rideVariant){owner.moveX=0;owner.moveY=0;owner.vx=0;owner.vy=0}
  this.projectiles.set(id,projectile);
  this.broadcast("combat:projectile",{sessionId:ownerId,id:clientId,x:projectile.x,y:projectile.y,vx,vy,r:projectile.r,life:projectile.life,maxDistance:projectile.maxDistance,kind:projectile.kind,color:projectile.color,move,golden,domainBound,rideVariant});
 }
detonateProjectile(client,payload={}){
  const key=client.sessionId+":"+String(payload.id||"").replace(/[^a-zA-Z0-9_-]/g,"").slice(0,32),projectile=this.projectiles.get(key);
  if(projectile&&projectile.ownerId===client.sessionId&&projectile.kind==="bloodBomb")projectile.detonate=true;
 }
 applyProjectileDamage(owner,target,damage,stun,push,angle,unblockable=false,ignoreInvuln=false){
  if(!owner||!target||target.dead)return false;
  if(!ignoreInvuln&&target.invuln>0)return false;
  if(this.resolveCounter(owner,target,"projectile"))return false;
  const incoming=Math.atan2(owner.y-target.y,owner.x-target.x),guard=Math.atan2(Math.sin(incoming-target.face),Math.cos(incoming-target.face));
  const blocked=!unblockable&&target.block&&Math.abs(guard)<=1.18,actual=blocked?damage*.12:damage;
  target.hp=Math.max(blocked?1:0,target.hp-actual);target.stun=Math.max(target.stun,blocked?.08:stun);
  target.invuln=blocked?.08:ignoreInvuln?.04:.12;
  if(!blocked&&push>0){target.x=clamp(target.x+Math.cos(angle)*push,45,WORLD_WIDTH-45);target.y=clamp(target.y+Math.sin(angle)*push,45,WORLD_HEIGHT-45)}
  target.meter=clamp(target.meter+actual*.28,0,100);owner.meter=clamp(owner.meter+actual*.5,0,100);
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
   this.applyProjectileDamage(owner,target,18,.32,0,a,true,true);
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
     this.applyProjectileDamage(owner,target,7.5,0,0,a,true,true);
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
  const hurt=(owner,target,damage,stun,push,angle,unblockable=false)=>this.applyProjectileDamage(owner,target,damage,stun,push,angle,unblockable,false);
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
     if(gap<105&&now>=p.nextTickAt){p.nextTickAt=now+200;hurt(owner,near,p.profile.damage,p.profile.stun,p.profile.knockback,angle)}
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
      hurt(owner,candidate,p.profile.damage,.6,p.profile.knockback,angle,true);
     }
     end(p,"combat:projectile-explode");continue;
    }
   }else{
    const sx=p.vx*60*dt,sy=p.vy*60*dt;p.x+=sx;p.y+=sy;p.travelled+=Math.hypot(sx,sy);p.life-=dt;
   }
   p.vx*=Math.pow(.993,dt*60);p.vy*=Math.pow(.993,dt*60);
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
     hurt(owner,hitTarget,p.profile.damage,p.profile.stun,p.profile.knockback,angle,p.kind==="fire"||p.kind==="hollow");
     end(p,"combat:projectile-hit",{targetId:hitId});continue;
    }
   }
   if(p.life<=0||p.travelled>=p.maxDistance||p.x<20||p.y<20||p.x>WORLD_WIDTH-20||p.y>WORLD_HEIGHT-20){end(p);continue}
  }
  if(now-this.projectileBatchAt>=100){
   this.projectileBatchAt=now;
   const live=Array.from(this.projectiles.values(),p=>({sessionId:p.ownerId,id:p.clientId,x:p.x,y:p.y,vx:p.vx,vy:p.vy,life:p.life,travelled:p.travelled,maxDistance:p.maxDistance,kind:p.kind,golden:p.golden,domainBound:p.domainBound,rideVariant:p.rideVariant,serverTime:now}));
   if(live.length)this.broadcast("combat:projectile-state",{projectiles:live,serverTime:now});
  }
 }
 awakenPlayer(client){const p=this.state.players.get(client.sessionId);if(!p||p.dead||p.awakened||p.meter<100)return;p.awakened=true;p.meter=0;p.hp=Math.min(p.maxHp,p.hp+(p.character==="vessel"?45:25));if(p.character==="restless"){p.domainType="hakari";p.domainWindup=1.25;p.domainDuration=120;p.domainTimer=0;p.domainRadius=1500;p.domainX=p.x;p.domainY=p.y}}
 resolveCounter(attacker,defender,incomingType="melee"){
  const kind=defender.counterKind;
  if(!kind||defender.counterWindow<=0)return false;
  const incomingAngle=Math.atan2(attacker.y-defender.y,attacker.x-defender.x),facing=Math.atan2(Math.sin(incomingAngle-defender.face),Math.cos(incomingAngle-defender.face));
  if(Math.abs(facing)>1.18)return false;
  const projectile=["bullet","projectile","explosion"].includes(incomingType),dx=attacker.x-defender.x,dy=attacker.y-defender.y,d=Math.hypot(dx,dy)||1,nx=dx/d,ny=dy/d;
  const hurt=(target,amount,stun,push)=>{target.hp=Math.max(0,target.hp-amount);target.stun=Math.max(target.stun,stun);target.invuln=Math.max(target.invuln,.12);target.x=clamp(target.x+nx*push,45,WORLD_WIDTH-45);target.y=clamp(target.y+ny*push,45,WORLD_HEIGHT-45);if(target.hp<=0)this.killPlayer(target)};
  if(kind==="sukunaCleaveCounter"&&(projectile||d>220))return false;
  defender.counterKind="";defender.counterWindow=0;
  if(kind==="yutaOutburst"){defender.invuln=Math.max(defender.invuln,.5);if(!projectile){attacker.stun=Math.max(attacker.stun,.48);attacker.x=clamp(attacker.x+nx*8,45,WORLD_WIDTH-45);attacker.y=clamp(attacker.y+ny*8,45,WORLD_HEIGHT-45)}return true}
  if(kind==="trashSwap"){if(projectile)return true;defender.invuln=Math.max(defender.invuln,.48);defender.x=clamp(attacker.x+nx*68,45,WORLD_WIDTH-45);defender.y=clamp(attacker.y+ny*68,45,WORLD_HEIGHT-45);hurt(attacker,8,.72,12);return true}
  if(kind==="sukunaCleaveCounter"){defender.invuln=Math.max(defender.invuln,1.15);hurt(attacker,Math.max(14,attacker.hp*.22),1,15);return true}
  if(kind==="door"){if(projectile)return true;hurt(attacker,5,.5,7);return true}
  if(kind==="manji"){defender.invuln=Math.max(defender.invuln,.72);hurt(attacker,8.5,.68,10);return true}
  if(kind==="todoDream"){defender.invuln=Math.max(defender.invuln,.45);hurt(attacker,13,.8,12);return true}
  if(kind==="todoBrothers"){defender.invuln=Math.max(defender.invuln,.6);hurt(attacker,28,1,17);return true}
  if(kind==="bloodSupernova"){defender.invuln=Math.max(defender.invuln,.5);hurt(attacker,14,.8,13);return true}
  return false;
 }
 combatHit(client,payload={}){
  const a=this.state.players.get(client.sessionId),id=String(payload.targetId||""),target=this.state.players.get(id);
  if(!a||!target||a===target||a.dead||target.dead||a.stun>0||a.activeGrabTarget||target.grabbedBy)return;
  const move=String(payload.move||"").slice(0,48);
  // Resolve damage from the character profile without requiring action authorization,
  // packet timing, server-side range estimates, or per-hit rate checks.
  const profile=combatProfile(a.character,move,a.awakened);
  if(this.resolveCounter(a,target,"melee"))return;
  if(target.invuln>0)return;
  const angle=Math.atan2(target.y-a.y,target.x-a.x),incoming=Math.atan2(a.y-target.y,a.x-target.x),guard=Math.atan2(Math.sin(incoming-target.face),Math.cos(incoming-target.face)),blocking=target.block&&Math.abs(guard)<=1.18,grab=grabSettings(a.character,move);
  if(blocking&&!(grab&&grab.kind==="megumiSerpent")){target.hp=Math.max(1,target.hp-profile.damage*.12);target.meter=clamp(target.meter+profile.damage*.12,0,100);target.invuln=.08;a.meter=clamp(a.meter+1,0,100);return}
  if(grab){
   if(target.vehicleId)return;
   target.grabbedBy=client.sessionId;target.grabKind=grab.kind;target.grabRemaining=grab.duration;target.grabDuration=grab.duration;target.grabTick=grab.tickInterval;target.grabTickDamage=grab.tickDamage;target.grabFinishDamage=grab.finishDamage;target.grabKnockback=grab.knockback;
   target.motionName="captured_"+grab.kind;target.motionProgress=0;target.attackAnim=grab.duration;target.attackType="grab";target.block=false;target.invuln=0;target.stun=grab.duration+.2;a.activeGrabTarget=id;a.grabKind=grab.kind;return;
  }
  target.hp=Math.max(0,target.hp-profile.damage);target.stun=Math.max(target.stun,profile.stun);target.invuln=.12;
  target.x=clamp(target.x+Math.cos(angle)*profile.knockback,45,WORLD_WIDTH-45);target.y=clamp(target.y+Math.sin(angle)*profile.knockback,45,WORLD_HEIGHT-45);
  target.meter=clamp(target.meter+profile.damage*.28,0,100);a.meter=clamp(a.meter+profile.damage*.5,0,100);
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
  if(state.stage>=3)state.collapsed=true;
 }
 hitProp(client,payload={}){const p=this.state.players.get(client.sessionId),id=Number(payload.propId),state=this.state.world.props.get(String(id)),source=PROP_SPAWNS.find(x=>x.id===id);if(!p||p.dead||p.vehicleId||!state||!state.alive||!source||p.attackAnim<=0)return;
  const center={x:source.x+source.w/2,y:source.y+source.h/2};
  const dx=center.x-p.x,dy=center.y-p.y,angle=Math.atan2(dy,dx),faceDelta=Math.atan2(Math.sin(angle-p.face),Math.cos(angle-p.face));
  if(Math.hypot(dx,dy)>58||Math.abs(faceDelta)>1.2)return;const key=client.sessionId+":"+id,now=Date.now();if(now-(this.lastPropHitAt.get(key)||0)<240)return;this.lastPropHitAt.set(key,now);state.hp=Math.max(0,state.hp-1);if(state.hp<=0){state.alive=false;state.respawnTimer=15}}
 enterCar(client,payload={}){const p=this.state.players.get(client.sessionId),id=String(payload.carId??""),c=this.state.world.cars.get(id);if(!p||p.dead||p.vehicleId||!c||c.destroyed||c.occupiedBy||distance(p,c)>110)return;c.occupiedBy=client.sessionId;c.speed=0;c.vx=0;c.vy=0;p.vehicleId=id;p.x=c.x;p.y=c.y;p.block=false;p.attackAnim=0;p.motionName=""}
 exitCar(client){const p=this.state.players.get(client.sessionId);if(!p||!p.vehicleId)return;const c=this.state.world.cars.get(p.vehicleId);if(c&&c.occupiedBy===client.sessionId){c.occupiedBy="";c.speed=0;c.vx=0;c.vy=0;p.x=clamp(c.x+Math.cos(c.angle)*35,45,WORLD_WIDTH-45);p.y=clamp(c.y+Math.sin(c.angle)*35,45,WORLD_HEIGHT-45)}p.vehicleId=""}
 driveCar(client,payload={}){const p=this.state.players.get(client.sessionId);if(!p||p.dead||!p.vehicleId)return;const c=this.state.world.cars.get(p.vehicleId);if(!c||c.destroyed||c.occupiedBy!==client.sessionId)return;const now=Date.now(),prev=this.lastCarControlAt.get(client.sessionId)||now-50;const dt=clamp((now-prev)/1000,.02,.12);this.lastCarControlAt.set(client.sessionId,now);const steer=clamp(Number(payload.steer)||0,-1,1),throttle=clamp(Number(payload.throttle)||0,-1,1),drift=payload.drift===true&&Math.abs(c.speed)>80&&Math.abs(steer)>.05;if(throttle>0){if(c.speed<0)c.speed=Math.min(0,c.speed+620*dt);else c.speed=Math.min(680,c.speed+340*dt)}else if(throttle<0){if(c.speed>0)c.speed=Math.max(0,c.speed-560*dt);else c.speed=Math.max(-210,c.speed-230*dt)}else c.speed*=Math.exp(-.34*dt);if(Math.abs(steer)>.01&&Math.abs(c.speed)>10)c.angle+=steer*(.75+Math.min(1,Math.abs(c.speed)/320)*1.15)*dt*(c.speed>=0?1:-1);if(drift)c.speed=Math.min(680,c.speed+78*dt);const hx=Math.sin(c.angle),hy=-Math.cos(c.angle),grip=drift?1.25:8.5,blend=clamp(grip*dt,0,1);c.vx+=(hx*c.speed-c.vx)*blend;c.vy+=(hy*c.speed-c.vy)*blend;const oldX=c.x,oldY=c.y,nextX=clamp(c.x+c.vx*dt,45,WORLD_WIDTH-45),nextY=clamp(c.y+c.vy*dt,45,WORLD_HEIGHT-45);const box={x:nextX-38,y:nextY-20,w:76,h:40};const hitBuilding=BUILDING_LAYOUT.some((b,index)=>{const state=this.state.world.buildings.get(String(index));return !state?.collapsed&&box.x<b.x+b.w&&box.x+box.w>b.x&&box.y<b.y+b.h&&box.y+box.h>b.y});const hitCar=Array.from(this.state.world.cars.entries()).some(([otherId,other])=>otherId!==p.vehicleId&&!other.destroyed&&Math.hypot(nextX-other.x,nextY-other.y)<68);if(hitBuilding||hitCar){c.x=oldX;c.y=oldY;c.speed*=-.28;c.vx*=-.25;c.vy*=-.25}else{c.x=nextX;c.y=nextY}p.x=c.x;p.y=c.y;p.face=Math.atan2(hy,hx);if(Math.abs(c.speed)>110){for(const [id,target] of this.state.players){if(id===client.sessionId||target.dead||target.vehicleId||distance(c,target)>54)continue;const key="car:"+p.vehicleId+":"+id;if(now-(this.lastHitAt.get(key)||0)<650)continue;this.lastHitAt.set(key,now);target.hp=Math.max(0,target.hp-18);target.stun=Math.max(target.stun,.7);target.invuln=.18;target.x=clamp(target.x+hx*12,45,WORLD_WIDTH-45);target.y=clamp(target.y+hy*12,45,WORLD_HEIGHT-45);if(target.hp<=0)this.killPlayer(target)}}}
 tick(dt){const w=this.state.world;w.worldSeconds+=dt;const since=w.worldSeconds-18;if(since<0){w.trainWarning=false;w.trainX=-9999}else{const cycle=since%62,elapsed=cycle-2.2;w.trainWarning=cycle<9.5;w.trainX=elapsed>=0&&elapsed<6.3?-80+elapsed*620:-9999}const now=Date.now();for(const prop of this.state.world.props.values()){if(!prop.alive){prop.respawnTimer=Math.max(0,prop.respawnTimer-dt);if(prop.respawnTimer===0){prop.alive=true;prop.hp=3}}}for(const [id,car] of this.state.world.cars){if(car.destroyed){car.respawnTimer=Math.max(0,car.respawnTimer-dt);if(car.respawnTimer===0){const spawn=CAR_SPAWNS.find(x=>String(x.id)===id);if(spawn){car.x=spawn.x;car.y=spawn.y;car.angle=0;car.vx=0;car.vy=0;car.speed=0;car.destroyed=false;car.occupiedBy=""}}}}for(const [id,p] of this.state.players){p.stun=Math.max(0,p.stun-dt);p.invuln=Math.max(0,p.invuln-dt);p.counterWindow=Math.max(0,p.counterWindow-dt);if(p.counterWindow===0)p.counterKind="";p.attackAnim=Math.max(0,p.attackAnim-dt);if(p.domainWindup>0){p.domainWindup=Math.max(0,p.domainWindup-dt);if(p.domainWindup===0)p.domainTimer=p.domainDuration||0}if(p.domainTimer>0){p.domainTimer=Math.max(0,p.domainTimer-dt);if(p.domainTimer===0){p.domainType="";p.domainRadius=0;p.domainCastAt=0}}if(p.dead){p.respawnTimer=Math.max(0,p.respawnTimer-dt);if(p.respawnTimer===0){const others=[];this.state.players.forEach(q=>{if(q!==p&&!q.dead)others.push(q)});const spawn=findAvailableSpawn(others);p.x=spawn.x;p.y=spawn.y;p.hp=p.maxHp;p.dead=false;p.invuln=1.25;p.stun=0;p.awakened=false;p.block=false;p.domainType="";p.domainTimer=0;p.domainRadius=0}}if(!p.dead&&p.attackAnim>0){for(const src of PROP_SPAWNS){const prop=w.props.get(String(src.id));if(!prop||!prop.alive)continue;const center={x:src.x+src.w/2,y:src.y+src.h/2},dx=center.x-p.x,dy=center.y-p.y,a=Math.atan2(dy,dx),faceDelta=Math.atan2(Math.sin(a-p.face),Math.cos(a-p.face));if(Math.hypot(dx,dy)>58||Math.abs(faceDelta)>1.2)continue;const key=id+":"+src.id;if(now-(this.lastPropHitAt.get(key)||0)<300)continue;this.lastPropHitAt.set(key,now);prop.hp=Math.max(0,prop.hp-1);if(prop.hp<=0){prop.alive=false;prop.respawnTimer=15}}}}for(const [targetId,target] of this.state.players){
  if(!target.grabbedBy)continue;
  const owner=this.state.players.get(target.grabbedBy);
  if(!owner||owner.dead||owner.activeGrabTarget!==targetId){if(owner)owner.activeGrabTarget="";target.grabbedBy="";target.grabKind="";target.grabRemaining=0;target.stun=Math.max(target.stun,.24);continue}
  const angle=owner.face,fx=Math.cos(angle),fy=Math.sin(angle);
  if(["yujiDrag","gojoFaceGrater","bloodEdge"].includes(target.grabKind)){
   const speed=target.grabKind==="gojoFaceGrater"?320:target.grabKind==="yujiDrag"?188:35;
   const nx=clamp(owner.x+fx*speed*dt,45,WORLD_WIDTH-45),ny=clamp(owner.y+fy*speed*dt,45,WORLD_HEIGHT-45);
   if(!isBlockedByBuilding({x:nx,y:ny},BUILDING_LAYOUT.filter((b,index)=>!this.state.world.buildings.get(String(index))?.collapsed),29)){owner.x=nx;owner.y=ny}
  }
  const progress=target.grabDuration>0?1-target.grabRemaining/target.grabDuration:1;
  if(target.grabKind==="todoThrow"){const spin=progress*Math.PI*3.2;target.x=clamp(owner.x+Math.cos(angle+spin)*48,45,WORLD_WIDTH-45);target.y=clamp(owner.y+Math.sin(angle+spin)*34,45,WORLD_HEIGHT-45)}
  else if(target.grabKind==="toadPull"){target.x=clamp(owner.x+fx*50,45,WORLD_WIDTH-45);target.y=clamp(owner.y+fy*50,45,WORLD_HEIGHT-45)}
  else{target.x=clamp(owner.x+fx*52,45,WORLD_WIDTH-45);target.y=clamp(owner.y+fy*52,45,WORLD_HEIGHT-45)}
  target.face=angle+Math.PI;target.block=false;target.stun=Math.max(target.stun,.08);
  target.grabRemaining=Math.max(0,target.grabRemaining-dt);target.grabTick=Math.max(0,target.grabTick-dt);target.motionName="captured_"+target.grabKind;target.motionProgress=progress;
  if(target.grabTick===0&&target.grabRemaining>0){target.grabTick=target.grabKind==="sukunaFlurry"?.095:.2;target.hp=Math.max(0,target.hp-target.grabTickDamage);target.meter=clamp(target.meter+target.grabTickDamage*.25,0,100);owner.meter=clamp(owner.meter+target.grabTickDamage*.35,0,100)}
  if(target.hp<=0){this.killPlayer(target);continue}
  if(target.grabRemaining<=0){
   const finish=target.grabFinishDamage,push=target.grabKnockback;target.grabbedBy="";target.grabKind="";owner.activeGrabTarget="";owner.grabKind="";
   target.hp=Math.max(0,target.hp-finish);target.stun=Math.max(target.stun,.82);target.invuln=Math.max(target.invuln,.16);
   target.x=clamp(target.x+fx*push,45,WORLD_WIDTH-45);target.y=clamp(target.y+fy*push,45,WORLD_HEIGHT-45);
   target.motionName="grabRelease";target.motionProgress=1;target.attackAnim=0;target.grabDuration=0;target.grabTickDamage=0;target.grabFinishDamage=0;target.grabKnockback=0;
   if(target.hp<=0)this.killPlayer(target);
  }
 }
this.tickProjectiles(dt,now);this.tickFireZones(dt,now);this.tickDomainClashes(dt,now);if(w.trainX!==-9999){const centers=[w.trainX-380,w.trainX-190,w.trainX];for(const p of this.state.players.values()){if(p.dead||Math.abs(p.y-TRAIN_TRACK_Y)>(p.vehicleId?100:54)||!centers.some(x=>Math.abs(p.x-x)<=(p.vehicleId?130:110)))continue;this.killPlayer(p)}for(const c of w.cars.values()){if(c.destroyed||Math.abs(c.y-TRAIN_TRACK_Y)>90)continue;if(centers.some(x=>Math.abs(c.x-x)<130)){c.destroyed=true;c.occupiedBy="";c.speed=0;c.vx=0;c.vy=0;c.respawnTimer=15}}}if(now-this.domainTickAt>=600){this.domainTickAt=now;const players=Array.from(this.state.players.entries());for(const [oid,o] of players){if(o.dead||!o.domainType||o.domainTimer<=0)continue;const r=clamp(o.domainRadius||700,120,1600);for(const [tid,t] of players){if(tid===oid||t.dead||o.domainClashId||distance(o,t)>r||t.invuln>0)continue;const damage=o.domainType==="void"?4:o.domainType==="shrine"?5:3;t.hp=Math.max(0,t.hp-damage);t.stun=Math.max(t.stun,o.domainType==="void"?.7:.18);t.invuln=.25;if(t.hp<=0)this.killPlayer(t)}}}}
}
