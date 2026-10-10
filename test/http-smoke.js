import assert from 'node:assert/strict';
const base=process.argv[2]||'http://127.0.0.1:3017',users=[];let code;
async function api(action,body={},user){
 const response=await fetch(base+'/api/'+action,{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://kittler777.github.io',...(user?{Authorization:'Bearer '+user.session.token}:{})},body:JSON.stringify({code,...body}),signal:AbortSignal.timeout(30000)});const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.error),{status:response.status});assert.equal(response.headers.get('Access-Control-Allow-Origin'),'https://kittler777.github.io');return data;
}
try{
 const health=await(await fetch(base+'/health')).json();assert.equal(health.game,'caption-memes');assert.equal(health.images,100);
 const stamp=crypto.randomUUID();users.push(await api('create',{name:'QA Аня',device:stamp+'-a',rounds:3,captionSeconds:120}));code=users[0].code;
 for(const [i,name]of ['QA Боря','QA Вика'].entries())users.push(await api('join',{name,device:stamp+'-'+i}));
 await Promise.all(users.map(u=>api('ready',{ready:true},u)));
 let s=await api('start',{},users[0]);const seen=new Set();
 for(let round=1;round<=3;round++){
  const args={round:s.round,matchId:s.matchId};
  const privateStates=await Promise.all(users.map(u=>api('state',{},u)));
  for(const privateState of privateStates){assert(privateState.image);assert(!seen.has(privateState.image.id));seen.add(privateState.image.id);}
  await Promise.all(users.map((u,i)=>api('caption',{...args,caption:['Когда выходной оказался понедельником','Проверил холодильник второй раз: вдруг появилось','Я после слов «ещё один раунд»'][i]+' #'+i},u)));
  s=await api('state',{},users[0]);assert.equal(s.phase,'vote');assert(s.cards.every(c=>!('author' in c)&&!('votes' in c)));
  await assert.rejects(api('vote',{...args,cardId:s.cards.find(c=>c.own).id},users[0]),e=>e.status===400);
  await Promise.all(users.map((u,i)=>api('vote',{...args,cardId:s.cards.find(c=>c.caption.endsWith('#'+((i+1)%3))).id},u)));
  s=await api('state',{},users[0]);assert.equal(s.phase,'results');assert(s.leaderboard.every(p=>p.score===round));s=await api('next',{round:s.round,matchId:s.matchId},users[0]);
 }
 assert.equal(s.phase,'finished');assert.equal(seen.size,9);s=await api('replay',{},users[0]);assert.equal(s.phase,'lobby');console.log(JSON.stringify({ok:true,rounds:3,players:3,uniquePictures:9,anonymity:true,selfVoteBlocked:true,final:true,replay:true}));
}finally{for(const u of users)try{await api('leave',{},u);}catch{}}
