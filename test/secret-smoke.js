import assert from 'node:assert/strict';
const api=(process.argv[2]||'http://127.0.0.1:3000').replace(/\/$/,'');
const users=[];let code,heartbeat;const seen=new Set();
async function req(action,data={},u){const response=await fetch(api+'/api/'+action,{method:'POST',headers:{'Content-Type':'application/json',...(u?{Authorization:'Bearer '+u.session.token}:{})},body:JSON.stringify({code,...data}),signal:AbortSignal.timeout(25000)});const s=await response.json();if(!response.ok)throw Object.assign(new Error(action+': '+s.error),{status:response.status});return s;}
const args=s=>({matchId:s.matchId,round:s.round,step:s.step});
const states=()=>Promise.all(users.map(u=>req('state',{},u)));
const ready=()=>Promise.all(users.map(u=>req('ready',{ready:true},u)));
try{
 const h=await req('create',{name:'Проверка 1',device:'smoke-secret-'+crypto.randomUUID(),mode:'spy',rounds:3,spySeconds:600});users.push(h);code=h.code;
 users.push(...await Promise.all([2,3].map(i=>req('join',{name:'Проверка '+i,device:'smoke-secret-'+crypto.randomUUID()}))));
 heartbeat=setInterval(()=>{Promise.allSettled(users.map(u=>req('state',{},u)));},15000);
 await ready();let s=await req('start',{},h);
 for(let r=1;r<=3;r++){
  const all=await states(),spy=all.findIndex(x=>x.role==='spy'),loc=all.find(x=>x.role==='local').location;
  assert(all.filter(x=>x.role==='local').every(x=>x.location===loc));assert(!('location' in all[spy]));assert(!seen.has(loc));seen.add(loc);
  if(r<=2){const pool=await import('../spy-bank.js');const l=pool.SPY_LOCATIONS.find(l=>r===1?l.name===loc:l.name!==loc);s=await req('spy-guess',{...args(s),locationId:l.id},users[spy]);assert.equal(s.winningTeam,r===1?'spy':'local');}
  else {s=await req('secret-next',args(s),h);await Promise.all(users.map((u,i)=>req('spy-ballot',{...args(s),targets:i===spy?[]:[users[spy].me]},u)));s=await req('state',{},h);assert.equal(s.winningTeam,'local');}
  assert.equal(s.phase,'spy-results');assert(s.roster.every(x=>x.role));s=await req('secret-next',args(s),h);
 }
 assert.equal(s.phase,'finished');s=await req('lobby',{},h);assert.equal(s.code,code);assert.equal(s.players.length,3);
 users.push(...await Promise.all([4,5].map(i=>req('join',{name:'Проверка '+i,device:'smoke-secret-'+crypto.randomUUID()}))));
 await req('settings',{mode:'mafia',mafiaNight:120,mafiaDay:300},h);await ready();s=await req('start',{},h);
 const all=await states(),mafia=all.findIndex(x=>x.role==='mafia'),doctor=all.findIndex(x=>x.role==='doctor'),detective=all.findIndex(x=>x.role==='detective'),victim=all.findIndex(x=>x.role==='citizen');
 assert.equal(all.filter(x=>x.role==='mafia').length,1);
 await req('mafia-chat',{...args(s),text:'Проверяем тайный чат',messageId:crypto.randomUUID()},users[mafia]);
 assert(!JSON.stringify(await req('state',{},users[victim])).includes('Проверяем тайный чат'));
 await Promise.all(users.map((u,i)=>req('mafia-act',{...args(s),target:i===mafia||i===doctor?users[victim].me:i===detective?users[mafia].me:'skip'},u)));
 s=await req('state',{},h);assert.equal(s.phase,'mafia-day');assert(s.roster.every(x=>x.alive));assert(!('chat' in s));assert.equal((await req('state',{},users[detective])).checks[0].mafia,true);
 s=await req('secret-next',args(s),h);await Promise.all(users.map((u,i)=>req('mafia-ballot',{...args(s),target:i===mafia?'skip':users[mafia].me},u)));
 s=await req('state',{},h);assert.equal(s.phase,'finished');assert.equal(s.winningTeam,'town');assert(s.roster.every(x=>x.role));const match=s.matchId;
 s=await req('rematch',{},h);assert.equal(s.phase,'mafia-night');assert.notEqual(s.matchId,match);assert(s.roster.every(x=>x.alive));
 console.log(JSON.stringify({ok:true,api,spyRounds:3,uniqueLocations:seen.size,mafiaPlayers:5,doctorSave:true,privateChat:true,detectiveCheck:true,cityVictory:true,rematch:true,sameRoom:true}));
}finally{clearInterval(heartbeat);await Promise.allSettled(users.map(u=>req('leave',{},u)));}
