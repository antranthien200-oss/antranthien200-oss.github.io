export const MAX_PLAYERS=16,WORLD_WIDTH=3300,WORLD_HEIGHT=2000,TRAIN_TRACK_Y=1810;
export const CHARACTER_IDS=Object.freeze(["honored","vessel","restless","ten","perfection","todo","choso","yuta","trashman"]);
export const CHARACTER_HP=Object.freeze({honored:100,vessel:85,restless:100,ten:85,perfection:100,todo:110,choso:100,yuta:90,trashman:105});
export const DOMAIN_BY_CHARACTER=Object.freeze({honored:["void","void02"],vessel:["shrine"],restless:["hakari"],perfection:["soul"],yuta:["yuta"],trashman:["trash"]});
export const BUILDING_LAYOUT=Object.freeze([
{x:95,y:50,w:365,h:215,name:"SHOP"},{x:590,y:55,w:365,h:215,name:"CAFE"},{x:115,y:315,w:365,h:190,name:"APARTMENTS"},{x:620,y:315,w:365,h:190,name:"BOOKSTORE"},{x:1535,y:50,w:410,h:215,name:"OFFICE"},{x:2220,y:45,w:505,h:215,name:"HOTEL"},{x:1555,y:315,w:410,h:190,name:"STATION"},{x:2250,y:315,w:505,h:190,name:"DEPOT"},{x:95,y:1020,w:365,h:210,name:"MARKET"},{x:610,y:1030,w:365,h:210,name:"STORE"},{x:130,y:1365,w:365,h:190,name:"GARAGE"},{x:625,y:1375,w:365,h:190,name:"CLINIC"},{x:2740,y:1035,w:330,h:390,name:"GYM"}]);
export const CAR_SPAWNS=Object.freeze(Array.from({length:11},(_,id)=>({id,x:1601+id*108,y:1635})));
export const PROP_SPAWNS=Object.freeze([{id:0,x:2785,y:1595,w:58,h:58},{id:1,x:2860,y:1595,w:58,h:58},{id:2,x:2935,y:1595,w:58,h:58},{id:3,x:3010,y:1595,w:58,h:58},{id:4,x:3085,y:1595,w:58,h:58}]);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),finite=(v,d)=>Number.isFinite(Number(v))?Number(v):d;
export function sanitizePlayerName(value,fallback="Player"){const n=String(value??"").replace(/[^a-zA-Z0-9 _-]/g,"").trim().slice(0,16);return n||fallback}
export function createSpawn(index=0){const slot=((Math.floor(index)%MAX_PLAYERS)+MAX_PLAYERS)%MAX_PLAYERS,a=-Math.PI/2+slot*Math.PI*2/MAX_PLAYERS,r=220;return{x:clamp(1250+Math.cos(a)*r,50,WORLD_WIDTH-50),y:clamp(765+Math.sin(a)*r,50,WORLD_HEIGHT-50)}}
export function findAvailableSpawn(players=[]){const occupied=Array.from(players||[]);let best=createSpawn(0),bestD=-1;for(let i=0;i<MAX_PLAYERS;i++){const p=createSpawn(i),d=occupied.length?Math.min(...occupied.map(q=>Math.hypot(finite(q.x,p.x)-p.x,finite(q.y,p.y)-p.y))):Infinity;if(d>bestD){bestD=d;best=p}if(d>=72)return p}return best}
export function normalizePlayerUpdate(input,current,elapsedMs=50,maxDistanceOverride=null){
 if(!input||typeof input!=="object"||Array.isArray(input))return null;
 const ox=finite(current.x,1250),oy=finite(current.y,765);
 let x=clamp(finite(input.x,ox),45,WORLD_WIDTH-45),y=clamp(finite(input.y,oy),45,WORLD_HEIGHT-45);
 // Multiplayer position updates are no longer distance-limited by anti-cheat.
 let moveX=clamp(finite(input.moveX,0),-1,1),moveY=clamp(finite(input.moveY,0),-1,1);
 const moveLength=Math.hypot(moveX,moveY);
 if(moveLength>1){moveX/=moveLength;moveY/=moveLength}
 const m=String(input.motionName??""),a=String(input.attackType??"");
 return{x,y,vx:clamp(finite(input.vx,finite(current.vx,0)),-60,60),vy:clamp(finite(input.vy,finite(current.vy,0)),-60,60),face:clamp(finite(input.face,finite(current.face,0)),-Math.PI,Math.PI),walk:clamp(finite(input.walk,0),0,2),jump:clamp(finite(input.jump,0),0,150),block:input.block===true,attackAnim:clamp(finite(input.attackAnim,0),0,5),attackType:/^[a-zA-Z0-9_ -]{0,32}$/.test(a)?a:"",motionName:/^[a-zA-Z0-9_]{1,48}$/.test(m)?m:"",motionProgress:clamp(finite(input.motionProgress,0),0,1),motionDuration:clamp(finite(input.motionDuration,1),.08,12),moveX,moveY,moveScale:clamp(finite(input.moveScale,1),1,1.5),aimX:clamp(finite(input.aimX,ox),45,WORLD_WIDTH-45),aimY:clamp(finite(input.aimY,oy),45,WORLD_HEIGHT-45)}
}
export function combatProfile(character,moveName,awakened=false){const m=String(moveName||"").slice(0,48);if(/trashCanThrow/i.test(m))return{damage:19,range:820,arc:Math.PI,stun:.78,knockback:14,cooldown:.5};if(/sukunaFireArrowCast/i.test(m))return{damage:18,range:980,arc:Math.PI,stun:.32,knockback:8,cooldown:.28};if(/gojoBlueMax/i.test(m))return{damage:2.2,range:1500,arc:Math.PI,stun:.1,knockback:1,cooldown:.2};if(/gojoRedMax/i.test(m))return{damage:30,range:900,arc:Math.PI,stun:.9,knockback:13,cooldown:.28};if(/gojoPurple/i.test(m))return{damage:70,range:920,arc:Math.PI,stun:.9,knockback:15,cooldown:.4};if(/megumiNue/i.test(m))return{damage:16,range:1000,arc:Math.PI,stun:.95,knockback:14,cooldown:.28};if(/chosoBombPlant/i.test(m))return{damage:12,range:1200,arc:Math.PI,stun:.6,knockback:9,cooldown:.4};if(/sukunaFireArrow/i.test(m))return{damage:18,range:980,arc:.9,stun:.32,knockback:8,cooldown:.28};if(/trashManFlyingCan/i.test(m))return{damage:28,range:4200,arc:Math.PI,stun:.78,knockback:14,cooldown:.5};if(/trashManThrow/i.test(m))return{damage:13,range:820,arc:Math.PI,stun:.78,knockback:14,cooldown:.3};if(/black.?flash/i.test(m))return{damage:20,range:230,arc:1.2,stun:.9,knockback:15,cooldown:.22};if(/^(m1_|yutaM1_)/i.test(m)){const fin=/_4$/.test(m);return{damage:fin?9:4.5,range:awakened?205:150,arc:1.35,stun:fin?.58:.22,knockback:fin?10:1.4,cooldown:.12}}if(/gojoPurple|hollow|piercing|bloodPlasma|piercingBlood|JacobLadder/i.test(m))return{damage:18,range:900,arc:.72,stun:.55,knockback:9,cooldown:.28};if(/gojoBlue|gojoRed|bloodRain|bloodPlasma|piercingBlood|trashManFlyingCan|trashManThrow|sukunaFireArrow|projectile/i.test(m))return{damage:12,range:700,arc:.9,stun:.38,knockback:7,cooldown:.22};if(/domain|shrine|void|hakari|soul/i.test(m))return{damage:8,range:950,arc:Math.PI,stun:.55,knockback:2,cooldown:.42};if(/drag|facegrater|cleave|toad|transfigure|serpent|edge|grab|crush|slam|rush|counter|flurry|throw|haymaker/i.test(m))return{damage:awakened?16:13,range:360,arc:1.35,stun:.68,knockback:11,cooldown:.24};return{damage:awakened?11:9,range:330,arc:1.15,stun:.42,knockback:7,cooldown:.2}}
export function grabSettings(character,moveName){
 const move=String(moveName||"");
 if(character==="vessel"&&/yujiCursedDrag/i.test(move))return{kind:"yujiDrag",duration:1.05,tickDamage:1.1,tickInterval:.25,finishDamage:12,knockback:16};
 if(character==="honored"&&/gojoFaceGrater/i.test(move))return{kind:"gojoFaceGrater",duration:.95,tickDamage:3.2,tickInterval:.22,finishDamage:13,knockback:13};
 if(character==="vessel"&&/sukunaCleave|sukunaFlurry/i.test(move)){const cleave=/sukunaCleave/i.test(move);return{kind:cleave?"sukunaCleave":"sukunaFlurry",duration:1,tickDamage:cleave?2.1:1.6,tickInterval:cleave?.14:.095,finishDamage:cleave?10:16,knockback:cleave?13:18};}
 if(character==="todo"&&/todoSwiftGrab/i.test(move))return{kind:"todoThrow",duration:.82,tickDamage:1.8,tickInterval:.22,finishDamage:12,knockback:13};
 if(character==="perfection"&&/mahitoTransfigure/i.test(move))return{kind:"mahitoTransfigure",duration:1.2,tickDamage:2,tickInterval:.22,finishDamage:14,knockback:12};
 if(character==="ten"&&/megumiToad|megumiSerpent/i.test(move))return{kind:/Serpent/i.test(move)?"megumiSerpent":"toadPull",duration:.9,tickDamage:0,tickInterval:.2,finishDamage:7,knockback:0};
 if(character==="choso"&&/chosoEdge/i.test(move))return{kind:"bloodEdge",duration:.82,tickDamage:1.9,tickInterval:.2,finishDamage:9,knockback:13};
 return null;
}
export function counterSettings(character,action,awakened=false){
 if(character==="yuta"&&action==="3")return{kind:"yutaOutburst",window:.25,cooldown:16};
 if(character==="trashman"&&action==="special")return{kind:"trashSwap",window:.42,cooldown:9.5};
 if(character==="vessel"&&action==="special"&&awakened)return{kind:"sukunaCleaveCounter",window:.65,cooldown:15};
 if(character==="restless"&&action==="special"&&!awakened)return{kind:"door",window:.6,cooldown:16};
 if(character==="vessel"&&action==="4"&&!awakened)return{kind:"manji",window:.6,cooldown:20};
 if(character==="todo"&&action==="3")return{kind:"todoDream",window:.7,cooldown:18};
 if(character==="todo"&&action==="4")return{kind:"todoBrothers",window:.85,cooldown:35};
 if(character==="choso"&&action==="3"&&!awakened)return{kind:"bloodSupernova",window:.62,cooldown:18};
 return null;
}
export function isBlockedByBuilding(position,buildings=BUILDING_LAYOUT,radius=29){
 for(const building of buildings){
  const px=clamp(position.x,building.x,building.x+building.w);
  const py=clamp(position.y,building.y,building.y+building.h);
  const dx=position.x-px,dy=position.y-py;
  if(dx*dx+dy*dy<radius*radius)return true;
 }
 return false;
}
export function rayHitsRect(origin,angle,rect,maxRange=1200){const dx=Math.cos(angle),dy=Math.sin(angle);let lo=0,hi=maxRange;if(Math.abs(dx)<1e-7){if(origin.x<rect.x||origin.x>rect.x+rect.w)return false}else{let a=(rect.x-origin.x)/dx,b=(rect.x+rect.w-origin.x)/dx;if(a>b)[a,b]=[b,a];lo=Math.max(lo,a);hi=Math.min(hi,b)}if(Math.abs(dy)<1e-7){if(origin.y<rect.y||origin.y>rect.y+rect.h)return false}else{let a=(rect.y-origin.y)/dy,b=(rect.y+rect.h-origin.y)/dy;if(a>b)[a,b]=[b,a];lo=Math.max(lo,a);hi=Math.min(hi,b)}return hi>=Math.max(lo,18)&&lo<=maxRange}

export function isMoveAllowed(character, moveName) {
 const move=String(moveName||"");
 if(/^(m1_[1-4]|yutaM1_[1-4])$/.test(move)||move==="dashGesture")return true;
 const allowed={
  honored:/^(gojo|limitless|hollow|infinite|void)/i,
  vessel:/^(yuji|sukuna|manji|black.?flash)/i,
  restless:/^hakari/i,
  ten:/^(megumi|mahoraga|nue|toad|rabbit|dog)/i,
  perfection:/^mahito/i,
  todo:/^todo/i,
  choso:/^choso/i,
  yuta:/^(yuta|rika)/i,
  trashman:/^trashMan/i
 };
 return !!allowed[character]&&allowed[character].test(move);
}
export function isMoveAuthorizedForAction(character,moveName,actionKind){
 const move=String(moveName||""),action=String(actionKind||"");
 if(action==="m1")return /^(m1_[1-4]|yutaM1_[1-4]|yutaDomainSwordRun)$/i.test(move);
 if(action==="special")return isMoveAllowed(character,move)&&!/^(m1_|yutaM1_)/i.test(move);
 const slots={
  honored:[["gojoBlue","gojoBlueMax"],["gojoRed","gojoRedMax"],["gojoRapid","gojoPurple"],["gojoTwofold","gojoVoid"]],
  vessel:[["yujiCursedDrag","sukunaFlurryWindup"],["yujiCrush","sukunaOpen","sukunaFireArrowCast"],["yujiDivergent","sukunaHeadCarryWindup"],["yujiManjiCounter","sukunaShrine"]],
  restless:[["hakariBall","hakariVolley"],["hakariDoors","hakariRushdown"],["hakariRough","hakariOverwhelming"],["hakariFever","hakariSurge"]],
  ten:[["megumiRabbit","megumiElephant"],["megumiNue","megumiSerpent"],["megumiToad","megumiSwarm"],["megumiDog","megumiMahoraga"]],
  perfection:[["mahitoStockpile","mahitoTransfigure"],["mahitoSoulFire","mahitoDisfigure"],["mahitoFocus","mahitoSpikes"],["mahitoRepel","mahitoDomain"]],
  todo:[["todoSwiftKick","todoIdol"],["todoBrute","todoClimax"],["todoPebble","todoDreams"],["todoElbow","todoBrothers"]],
  choso:[["chosoPiercing","chosoExorcism"],["chosoScale","chosoWingKing"],["chosoSupernova","chosoBloodRain"],["chosoEdge","chosoPlasma"]],
  yuta:[["yutaSevering","yutaElbowRush","rikaSmash","rikaDownslam"],["yutaSlash","yutaCopy","rikaLaunch","rikaSlam"],["yutaOutburst","yutaEnergyRipple","rikaThrow","yutaTrueLoveBeam"],["yutaSecondWind","yutaDomain","rikaHaymaker","rikaThrow"]],
  trashman:[["trashManThrow","trashManFlyingCan"],["trashManGarbagePunch","trashManStench"],["trashManBigCan","trashManEruption"],["trashManCanBarrage","trashManDomain"]]
 };
 const index=Number(action)-1;
 return Number.isInteger(index)&&index>=0&&index<4&&!!slots[character]&&slots[character][index].includes(move);
}
export function isProjectileMoveAllowed(character,moveName){
 const move=String(moveName||"").slice(0,48);
 if(/^trashCanThrow$/i.test(move))return true;
 if(!isMoveAllowed(character,move)||/domain|shrine|void|hakari|soul/i.test(move))return false;
 return combatProfile(character,move).range>=650;
}
export function isProjectileKindAllowed(character,moveName,kindName){
 const move=String(moveName||"").slice(0,48),kind=String(kindName||"");
 const allowed={
  trashCan:/^(trashCanThrow|trashManThrow|trashManFlyingCan)$/i,
  red:/^gojoRed$/i,
  blueMax:/^gojoBlueMax$/i,
  redmax:/^gojoRedMax$/i,
  hollow:/^gojoPurple$/i,
  tenNue:/^megumiNue$/i,
  bloodBomb:/^chosoBombPlant$/i,
  sukunaFireArrow:/^sukunaFireArrowCast$/i
 };
 if(kind==="trashCan"&&/^trashCanThrow$/i.test(move))return true;
 if(kind==="trashCan"&&!/^trashman$/i.test(character))return false;
 return !!allowed[kind]&&allowed[kind].test(move)&&isProjectileMoveAllowed(character,move);
}
export function domainSettings(character,domainType){
 if(!(DOMAIN_BY_CHARACTER[character]||[]).includes(domainType))return null;
 const fullMapRadius=Math.hypot(WORLD_WIDTH,WORLD_HEIGHT);
 if(domainType==="hakari")return{radius:fullMapRadius,duration:120};
 if(domainType==="void")return{radius:fullMapRadius,duration:14};
 if(domainType==="void02")return{radius:0,duration:.22};
 if(domainType==="shrine")return{radius:fullMapRadius,duration:18};
 if(domainType==="yuta")return{radius:fullMapRadius,duration:45};
 if(domainType==="soul")return{radius:fullMapRadius,duration:14};
 if(domainType==="trash")return{radius:fullMapRadius,duration:28};
 return null;
}
