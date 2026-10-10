import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createGame} from '../core.js';
import {createTransport} from '../transport.js';
import {MEMES} from '../memes.js';
function fixture(count=3,settings={}){
 const db=new DatabaseSync(':memory:');let time=1000000;let game=createGame(db,MEMES,{now:()=>time});
 const host=game('create',{name:'Игрок 1',device:'device-0001',rounds:3,...settings});const code=host.code,users=[host];
 for(let i=2;i<=count;i++)users.push(game('join',{code,name:'Игрок '+i,device:'device-'+String(i).padStart(4,'0')}));
 const call=(i,action,data={})=>game(action,{code,...data},users[i].session.token);
 const ready=()=>users.forEach((_,i)=>call(i,'ready',{ready:true}));
 const start=()=>{ready();return call(0,'start');};
 const args=s=>({round:s.round,matchId:s.matchId});
 const captions=(s,skips=[])=>{let latest;for(let i=0;i<count;i++)latest=call(i,'caption',{...args(s),caption:skips.includes(i)?'':'Шутка '+i});return latest;};
 const votes=(s,choose=(i,cards)=>cards.find(c=>!c.own))=>{let latest;for(let i=0;i<count;i++){const v=call(i,'state');if(v.phase==='vote'&&v.canVote){const target=choose(i,v.cards);if(target)latest=call(i,'vote',{...args(s),cardId:target.id});}}return latest||call(0,'state');};
 return {db,users,code,call,ready,start,args,captions,votes,advance:ms=>time+=ms,reopen:()=>game=createGame(db,MEMES,{now:()=>time}),raw:()=>JSON.parse(db.prepare('SELECT data FROM meme_rooms WHERE code=?').get(code).data)};
}
test('100 existing unique images with verified hashes and original sources',()=>{
 assert.equal(MEMES.length,100);assert.equal(new Set(MEMES.map(m=>m.id)).size,100);const hashes=[];
 for(const m of MEMES){const b=readFileSync(new URL('../'+m.path,import.meta.url));assert.equal(b[0],255);assert.equal(b[1],216);const hash=createHash('sha256').update(b).digest('hex');assert.equal(hash,m.sha256);hashes.push(hash);assert(m.width>150&&m.height>150);assert(m.source.startsWith('https://imgflip.com/'));}assert.equal(new Set(hashes).size,100);
});
test('names, devices, room codes, uniqueness and settings validation',()=>{
 const f=fixture();assert.match(f.code,/^\d{6}$/);assert.throws(()=>f.call(0,'join',{name:'Игрок 1',device:'device-extra'}),/занято/);assert.throws(()=>f.call(0,'join',{name:'',device:'device-extra'}),/Имя/);assert.throws(()=>f.call(0,'join',{name:'x'.repeat(21),device:'device-extra'}),/Имя/);assert.throws(()=>f.call(0,'join',{name:'Друг',device:'x'}),/устройство/);assert.throws(()=>f.call(0,'state',{code:'bad'}),/6 цифр/);assert.throws(()=>f.call(0,'settings',{rounds:0}),/раундов/);assert.throws(()=>f.call(0,'settings',{captionSeconds:1}),/время/);
});
test('12-player capacity allows all 10 rounds with one shared image per round',()=>{
 const f=fixture(12,{rounds:10});assert.throws(()=>f.call(0,'join',{name:'13',device:'device-0013'}),/заполнена/);const s=f.start();assert.equal(s.phase,'caption');assert.equal(s.maxRounds,10);assert.equal(f.raw().deck.length,99);
});
test('host rights, minimum 3, readiness resets after editing settings',()=>{
 const f=fixture(2);f.ready();assert.throws(()=>f.call(0,'start'),/3 игрока/);assert.throws(()=>f.call(1,'settings',{rounds:5}),e=>e.status===403);
 const g=fixture();assert.throws(()=>g.call(0,'start'),/готовности/);g.ready();g.call(0,'settings',{captionSeconds:90});assert(g.call(0,'state').players.every(p=>!p.ready));assert.throws(()=>g.call(1,'start'),e=>e.status===403);
});
test('same picture for everyone, private captions before voting; secrets stay private',()=>{
 const f=fixture(),s=f.start(),a=f.call(0,'state'),b=f.call(1,'state');assert.deepEqual(a.image,b.image);assert.deepEqual(a.image,f.call(2,'state').image);assert(!('cards' in a));assert(!('assignments' in a));f.call(0,'caption',{...f.args(s),caption:'Секретная подпись'});assert(!JSON.stringify(f.call(1,'state')).includes('Секретная подпись'));assert(!JSON.stringify(a).includes('token'));assert(!JSON.stringify(a).includes('device-'));
});
test('caption length, invalid input, skips and duplicate submission',()=>{
 const f=fixture(),s=f.start(),args=f.args(s);assert.throws(()=>f.call(0,'caption',{...args,caption:'я'.repeat(201)}),/200/);assert.throws(()=>f.call(0,'caption',{...args,caption:null}),/подпись/);f.call(0,'caption',{...args,caption:'Шутка'});assert.equal(f.call(0,'caption',{...args,caption:'Шутка'}).done,1);assert.throws(()=>f.call(0,'caption',{...args,caption:'Другая'}),/уже отправлена/);f.call(1,'caption',{...args,caption:''});const v=f.call(2,'caption',{...args,caption:'🙂'.repeat(200)});assert.equal(v.cards.length,2);
});
test('voting reveals no authors, owners, tokens, assignments or running totals',()=>{
 const f=fixture(),s=f.start();f.captions(s);const v=f.call(0,'state');assert.equal(v.phase,'vote');for(const c of v.cards){assert.deepEqual(Object.keys(c).sort(),['caption','id','image','own']);assert(!f.users.some(u=>u.me===c.id));}assert(!('votes' in v));assert(!('winners' in v));for(const key of ['author','token','owner','assignments'])assert(!JSON.stringify(v).includes(key));
});
test('self vote, missing card and changing a submitted vote are rejected',()=>{
 const f=fixture(),s=f.start(),v=f.captions(s),own=v.cards.find(c=>c.own),foreign=v.cards.find(c=>!c.own),other=v.cards.filter(c=>!c.own)[1];assert.throws(()=>f.call(2,'vote',{...f.args(s),cardId:own.id}),/свою/);assert.throws(()=>f.call(2,'vote',{...f.args(s),cardId:'missing'}),/недоступна/);f.call(2,'vote',{...f.args(s),cardId:foreign.id});assert(f.call(2,'vote',{...f.args(s),cardId:foreign.id}).voted);assert.throws(()=>f.call(2,'vote',{...f.args(s),cardId:other.id}),/уже отправлен/);
});
test('complete 3-round party, scores, final and replay',()=>{
 const f=fixture(4),seen=new Set();let s=f.start();
 for(let round=1;round<=3;round++){
  const images=Array.from({length:4},(_,i)=>f.call(i,'state').image.id);assert.equal(new Set(images).size,1);assert(!seen.has(images[0]));seen.add(images[0]);s=f.captions(s);assert(s.cards.every(c=>c.image.id===images[0]));
  s=f.votes(s,(i,cards)=>cards.find(c=>c.caption==='Шутка '+(i===0?1:0)));assert.equal(s.phase,'results');assert.deepEqual(s.winners,[f.users[0].me]);assert.equal(s.leaderboard.find(p=>p.id===f.users[0].me).score,round);assert(s.cards.every(c=>'author' in c&&'votes' in c));s=f.call(0,'next',f.args(s));
 }
 assert.equal(s.phase,'finished');assert.equal(seen.size,3);assert.throws(()=>f.call(0,'next',f.args(s)),/этап/);const lobby=f.call(0,'replay');assert.equal(lobby.phase,'lobby');assert(lobby.players.every(p=>p.score===0&&!p.ready));
});
test('ties award all leaders once, including repeated state polling',()=>{
 const f=fixture(),s=f.start();f.captions(s);let r=f.votes(s,(i,cards)=>cards.find(c=>c.caption==='Шутка '+((i+1)%3)));assert.equal(r.winners.length,3);assert.equal(r.resultReason,'tie');for(let i=0;i<10;i++)r=f.call(0,'state');assert(r.players.every(p=>p.score===1));
});
test('deadlines, partial submissions, no votes and one-card author cannot vote',()=>{
 const f=fixture(),s=f.start();f.call(0,'caption',{...f.args(s),caption:'Только одна'});f.advance(61000);let v=f.call(0,'state');assert.equal(v.phase,'vote');assert.equal(v.cards.length,1);assert.equal(v.canVote,false);assert(f.call(1,'state').canVote);f.advance(46000);v=f.call(0,'state');assert.equal(v.phase,'results');assert.equal(v.resultReason,'no-votes');assert(v.players.every(p=>p.score===0));
});
test('all skipped or no captions produce immediate results without points',()=>{
 const f=fixture(),s=f.start();let r=f.captions(s,[0,1,2]);assert.equal(r.phase,'results');assert.equal(r.resultReason,'no-captions');assert.equal(r.cards.length,0);const g=fixture();g.start();g.advance(60001);r=g.call(0,'state');assert.equal(r.resultReason,'no-captions');
});
test('players who skipped can vote; single caption can win',()=>{
 const f=fixture(),s=f.start(),v=f.captions(s,[1,2]);assert.equal(v.cards.length,1);f.call(1,'vote',{...f.args(s),cardId:v.cards[0].id});const r=f.call(2,'vote',{...f.args(s),cardId:v.cards[0].id});assert.equal(r.phase,'results');assert.deepEqual(r.winners,[f.users[0].me]);
});
test('stale round and stale match requests rejected',()=>{
 const f=fixture(),s=f.start();assert.throws(()=>f.call(0,'caption',{round:0,matchId:s.matchId,caption:'x'}),/раунд/);assert.throws(()=>f.call(0,'caption',{round:1,matchId:'old',caption:'x'}),/раунд/);f.captions(s);const r=f.votes(s);f.call(0,'next',f.args(r));assert.throws(()=>f.call(0,'caption',{...f.args(s),caption:'x'}),/раунд/);
});
test('late joins blocked; reconnect and server restart preserve state',()=>{
 const f=fixture(),s=f.start();f.call(0,'caption',{...f.args(s),caption:'Сохрани меня'});assert.throws(()=>f.call(0,'join',{name:'Опоздал',device:'device-late'}),/уже идёт/);f.reopen();const restored=f.call(0,'state');assert(restored.submitted);assert.equal(restored.myCaption,'Сохрани меня');assert.equal(restored.image.id,s.image.id);
});
test('host transfer after explicit leave and after 90 seconds inactivity',()=>{
 const f=fixture();f.call(0,'leave');assert.equal(f.call(1,'state').hostId,f.users[1].me);assert.throws(()=>f.call(0,'state'),e=>e.status===401);const g=fixture();g.advance(91000);const s=g.call(2,'state');assert.equal(s.hostId,g.users[2].me);assert.equal(s.players[0].online,false);
});
test('departed players do not block early stage transitions',()=>{
 const f=fixture(),s=f.start();f.call(2,'leave');f.call(0,'caption',{...f.args(s),caption:'А'});const v=f.call(1,'caption',{...f.args(s),caption:'Б'});assert.equal(v.phase,'vote');f.call(0,'vote',{...f.args(s),cardId:v.cards.find(c=>c.caption==='Б').id});const r=f.call(1,'vote',{...f.args(s),cardId:v.cards.find(c=>c.caption==='А').id});assert.equal(r.phase,'results');assert.equal(r.winners.length,2);
});
test('kick removes stale lobby member and invalidates their token',()=>{
 const f=fixture();f.call(0,'kick',{playerId:f.users[2].me});assert.equal(f.call(0,'state').players.length,2);assert.throws(()=>f.call(2,'state'),e=>e.status===401);assert.throws(()=>f.call(1,'kick',{playerId:f.users[0].me}),e=>e.status===403);
});
test('image history persists across new rooms for the same devices',()=>{
 const f=fixture();f.start();const first=Object.values(f.raw().assignments).map(a=>a.image);assert.equal(new Set(first).size,1);const history=f.db.prepare('SELECT device,image FROM meme_seen').all();assert.equal(history.length,3);assert(history.every(h=>h.image===first[0]));const game=createGame(f.db,MEMES);const a=game('create',{name:'Новая А',device:'device-0001',rounds:3}),b=game('join',{code:a.code,name:'Новая Б',device:'device-0002'}),c=game('join',{code:a.code,name:'Новая В',device:'device-0003'});for(const u of [a,b,c])game('ready',{code:a.code,ready:true},u.session.token);game('start',{code:a.code},a.session.token);const r=JSON.parse(f.db.prepare('SELECT data FROM meme_rooms WHERE code=?').get(a.code).data);assert(Object.values(r.assignments).every(x=>!first.includes(x.image)));
});
test('10 shared, unique round pictures for 12 players after exhausted history, with anonymous votes',()=>{
 const f=fixture(12,{rounds:10});for(let i=0;i<12;i++)for(const m of MEMES)f.db.prepare('INSERT INTO meme_seen(device,image,seen) VALUES(?,?,?)').run('device-'+String(i+1).padStart(4,'0'),m.id,1);
 let s=f.start();const seen=new Set();for(let n=0;n<10;n++){
  const images=Array.from({length:12},(_,i)=>f.call(i,'state').image.id);assert.equal(new Set(images).size,1);assert(!seen.has(images[0]));seen.add(images[0]);
  s=f.captions(s);assert(s.cards.every(c=>c.image.id===images[0]&&!('author' in c)));
  s=f.votes(s,(i,cards)=>cards.find(c=>c.caption==='Шутка '+((i+1)%12)));assert.equal(s.phase,'results');assert(s.players.every(p=>p.score===n+1));s=f.call(0,'next',f.args(s));
 }assert.equal(s.phase,'finished');assert.equal(seen.size,10);assert.equal(f.raw().deck.length,90);
 s=f.call(0,'replay');s=f.start();assert(!seen.has(s.image.id));assert.equal(f.call(11,'state').image.id,s.image.id);
});
test('transport: CORS, authorization, body limits, malformed JSON, health and assets',async()=>{
 const f=fixture(),handle=createTransport(createGame(f.db,MEMES,{now:()=>1000000}),{'index.html':{body:'<h1>Мемы</h1>',type:'text/html'},'assets/memes/x.jpg':{body:new Uint8Array([255,216]),type:'image/jpeg'}},'https://quiz-rooms-production-e463.up.railway.app');
 const req=(path,body,headers={})=>new Request('http://internal'+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)});
 assert.equal((await handle(req('/api/state',{code:f.code},{Origin:'https://evil.example'}))).status,403);assert.equal((await handle(req('/api/state',{code:f.code}))).status,401);
 const res=await handle(req('/api/state',{code:f.code},{Authorization:'Bearer '+f.users[0].session.token,Origin:'https://kittler777.github.io'}));assert.equal(res.status,200);assert.equal(res.headers.get('Access-Control-Allow-Origin'),'https://kittler777.github.io');
 assert.equal((await handle(req('/api/create','{'))).status,400);assert.equal((await handle(req('/api/create',[]))).status,400);assert.equal((await handle(req('/api/create','x'.repeat(9000)))).status,413);assert.equal((await(await handle(new Request('http://internal/health'))).json()).images,100);
 assert.equal((await handle(new Request('http://internal/'))).status,200);assert.equal((await handle(new Request('http://internal/assets/memes/x.jpg'))).status,200);assert.equal((await handle(new Request('http://internal/api/state',{method:'OPTIONS',headers:{Origin:'https://kittler777.github.io'}}))).status,204);
});
test('voting progress excludes a departed voter while preserving the valid vote',()=>{
 const f=fixture(4),s=f.start(),v=f.captions(s);f.call(3,'vote',{...f.args(s),cardId:v.cards.find(c=>!c.own).id});f.call(3,'leave');const current=f.call(0,'state');assert.equal(current.phase,'vote');assert.equal(current.done,0);assert.equal(current.total,3);assert.equal(Object.keys(f.raw().votes).length,1);
});
