import assert from 'node:assert/strict';
const base=process.argv[2]||'http://127.0.0.1:3107',users=[];let code;
async function api(action,body={},user){
 const response=await fetch(base+'/api/'+action,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://kittler777.github.io',...(user?{Authorization:'Bearer '+user.session.token}:{})},body:JSON.stringify({code,...body}),signal:AbortSignal.timeout(30000)});
 const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.error),{status:response.status});return data;
}
try{
 const stamp=crypto.randomUUID();users.push(await api('create',{name:'Контекст Аня',device:stamp+'-a',mode:'context',rounds:3,captionSeconds:120}));code=users[0].code;
 for(const [i,name]of ['Контекст Боря','Контекст Вика'].entries())users.push(await api('join',{name,device:stamp+'-'+i}));
 const seen=new Set();let s;
 const ready=()=>Promise.all(users.map(u=>api('ready',{ready:true},u)));
 async function round(){
  const a=await Promise.all(users.map(u=>api('state',{},u))),args={round:a[0].round,matchId:a[0].matchId};assert(a.every(v=>v.phase==='answer'));assert.equal(new Set(a.map(v=>v.prompt)).size,3);
  for(const v of a){assert(!seen.has(v.prompt));seen.add(v.prompt);}
  const answers=['Тесно, но мне нравится #0','Немного страшно, зато бесплатно #1','Приятно, пока никто не видит #2'];
  await Promise.all(users.map((u,i)=>api('answer',{...args,caption:answers[i]},u)));
  const t=await Promise.all(users.map(u=>api('state',{},u)));assert.equal(new Set(t.map(v=>v.quote)).size,3);for(let i=0;i<3;i++){assert.equal(t[i].phase,'twist');assert.notEqual(t[i].quote,answers[i]);assert.equal(t[i].prompt,null);assert(!('quoteOwner' in t[i]));}
  await Promise.all(users.map((u,i)=>api('twist',{...args,caption:'Отзыв о жизни в холодильнике #'+i},u)));
  s=await api('state',{},users[0]);assert.equal(s.phase,'vote');assert(s.cards.every(c=>c.quote&&!('author' in c)&&!('quotedAuthor' in c)));
  await assert.rejects(api('vote',{...args,cardId:s.cards.find(c=>c.own).id},users[0]),e=>e.status===400);
  await Promise.all(users.map((u,i)=>api('vote',{...args,cardId:s.cards.find(c=>c.caption.endsWith('#'+((i+1)%3))).id},u)));
  s=await api('state',{},users[0]);assert.equal(s.phase,'results');assert(s.cards.every(c=>c.author&&c.quotedAuthor));s=await api('next',args,users[0]);
 }
 await ready();s=await api('start',{},users[0]);for(let i=0;i<3;i++)await round();assert.equal(s.phase,'finished');assert(s.leaderboard.every(p=>p.score===3));
 s=await api('rematch',{},users[0]);assert.equal(s.phase,'answer');seen.clear();
 for(let i=0;i<3;i++)await round();assert.equal(s.phase,'finished');
 s=await api('lobby',{},users[0]);assert.equal(s.code,code);assert.equal(s.players.length,3);assert(s.players.every(p=>!p.ready));
 await api('settings',{mode:'memes'},users[0]);await ready();s=await api('start',{},users[0]);assert.equal(s.phase,'caption');const states=await Promise.all(users.map(u=>api('state',{},u)));assert(states.every(v=>v.image.id===s.image.id));
 console.log(JSON.stringify({ok:true,players:3,contextRounds:6,privateQuestions:true,foreignQuotes:true,anonymousPosts:true,selfVoteBlocked:true,rematch:true,switchToMemes:true,sameRoom:true}));
}finally{await Promise.all(users.map(async u=>{try{await api('leave',{},u);}catch{}}));}
