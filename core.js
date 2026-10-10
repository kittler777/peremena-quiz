import { checkAnswer } from './answers.js';
export function createGame(db, questions, topics, { now = Date.now } = {}) {
 db.exec('CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, data TEXT NOT NULL, updated INTEGER NOT NULL)');
 const get=db.prepare('SELECT data FROM rooms WHERE code = ?');
 const save=db.prepare('INSERT OR REPLACE INTO rooms(code,data,updated) VALUES(?,?,?)');
 const cleanup=db.prepare('DELETE FROM rooms WHERE updated < ?');
 const fail=(message,status=400)=>{const e=new Error(message);e.status=status;throw e};
 const shuffle=arr=>{const a=[...arr];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
 const name=v=>{if(typeof v!=='string'||!v.trim()||v.trim().length>20)fail('Имя должно содержать от 1 до 20 символов');return v.trim()};
 const defaults={rounds:12,seconds:30,teamCount:2,topics:Object.keys(topics)};
 function settings(v){if(!v||![6,12,18,24].includes(v.rounds)||![20,30,45].includes(v.seconds)||![2,3,4].includes(v.teamCount)||!Array.isArray(v.topics)||!v.topics.length||v.topics.some(t=>!topics[t]))fail('Проверьте настройки игры');return {...v,topics:[...new Set(v.topics)]};}
 function begin(r){r.index++;if(r.index>=r.deck.length){r.phase='finished';return}r.phase='question';r.answers={};r.winner=null;r.deadline=now()+r.settings.seconds*1000;r.roundId=crypto.randomUUID();}
 function reveal(r){r.phase='reveal';r.nextAt=now()+6500;const q=r.deck[r.index];for(const [team,a]of Object.entries(r.answers)){a.points=a.correct?100:0;r.scores[team]+=a.points;}}
 function tick(r){if(r.phase==='question'&&now()>=r.deadline)reveal(r);if(r.phase==='reveal'&&now()>=r.nextAt)begin(r);if(r.players.length&&!r.players.some(p=>p.id===r.host&&now()-p.seen<90000)){const online=r.players.find(p=>now()-p.seen<90000);if(online)r.host=online.id;}}
 function publicState(r,p){const q=r.deck?.[r.index];return {code:r.code,host:r.host,me:p.id,serverTime:now(),phase:r.phase,players:r.players.map(({id,name,team,seen})=>({id,name,team,online:now()-seen<15000})),teams:r.teams.slice(0,r.settings.teamCount),activeTeams:r.activeTeams||[],settings:r.settings,scores:r.scores,round:r.index+1,total:r.deck?.length||r.settings.rounds,roundId:r.roundId,deadline:r.deadline,nextAt:r.nextAt,winner:r.winner,question:q?{topic:q.topic,text:q.text,...(r.phase!=='question'?{answer:q.options[q.correct]}:{})}:null,answers:Object.fromEntries(Object.entries(r.answers||{}).map(([t,a])=>[t,r.phase==='question'?{submitted:true,by:a.by}:a]))};}
 function write(r,p){save.run(r.code,JSON.stringify(r),now());return publicState(r,p);}
 return function handle(action,b={},token=''){
 cleanup.run(now()-24*3600000);
 if(action==='create'){
  if(db.prepare('SELECT COUNT(*) AS n FROM rooms').get().n>=1000)fail('Сервер заполнен. Попробуйте позже.',503);
  const p={id:crypto.randomUUID(),token:crypto.randomUUID(),name:name(b.name),team:null,seen:now()};
  let code;do{code=Array.from(crypto.getRandomValues(new Uint8Array(6)),n=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[n%32]).join('')}while(get.get(code));
  const r={code,host:p.id,players:[p],settings:defaults,teams:['Молнии','Кометы','Лисы','Совы'],scores:[0,0,0,0],phase:'lobby',index:-1,answers:{}};
  return {token:p.token,state:write(r,p)};
 }
 const code=String(b.code||'').trim().toUpperCase();const row=get.get(code);if(!row)fail('Комната не найдена. Проверьте код или создайте новую.',404);const r=JSON.parse(row.data);
 if(action==='join'){
  if(r.phase!=='lobby')fail('Игра уже идёт. Дождитесь новой партии.');if(r.players.length>=32)fail('В комнате уже 32 игрока');
  const p={id:crypto.randomUUID(),token:crypto.randomUUID(),name:name(b.name),team:null,seen:now()};r.players.push(p);return {token:p.token,state:write(r,p)};
 }
 const p=r.players.find(p=>p.token===token);if(!p)fail('Войдите в комнату заново.',401);p.seen=now();tick(r);
 const host=()=>{if(p.id!==r.host)fail('Это действие доступно только ведущему.',403)};
 const lobby=()=>{if(r.phase!=='lobby')fail('Изменения доступны до начала игры.')};
 if(action==='team'){lobby();if(!Number.isInteger(b.team)||b.team<0||b.team>=r.settings.teamCount)fail('Выберите существующую команду');p.team=b.team;}
 else if(action==='configure'){host();lobby();r.settings=settings(b.settings);for(const x of r.players)if(x.team>=r.settings.teamCount)x.team=null;}
 else if(action==='rename'){host();lobby();if(!Number.isInteger(b.team)||b.team<0||b.team>=r.settings.teamCount)fail('Команда не найдена');r.teams[b.team]=name(b.name);}
 else if(action==='start'){
  host();lobby();const online=r.players.filter(p=>now()-p.seen<90000);if(online.some(p=>p.team===null))fail('Все игроки должны выбрать команду');if(new Set(online.map(p=>p.team)).size<2)fail('Нужны игроки хотя бы в двух командах');
  const pools=r.settings.topics.map(t=>shuffle(questions.filter(q=>q.topic===t)));const deck=[];while(deck.length<r.settings.rounds&&pools.some(a=>a.length)){for(const pool of shuffle(pools)){if(pool.length&&deck.length<r.settings.rounds){const q=pool.pop();const order=shuffle([0,1,2,3]);deck.push({...q,options:order.map(i=>q.options[i]),correct:order.indexOf(q.correct)})}}}
  r.deck=deck;r.scores=[0,0,0,0];r.index=-1;r.activeTeams=[...new Set(online.map(p=>p.team))];begin(r);
 }
 else if(action==='answer'){
  if(r.phase!=='question'||b.roundId!==r.roundId)fail('Этот вопрос уже закрыт.');if(p.team===null||!r.activeTeams.includes(p.team))fail('Вы не участвуете в раунде');if(r.answers[p.team])fail('Ваша команда уже ответила.');if(typeof b.text!=='string'||!b.text.trim()||b.text.trim().length>100)fail('Напишите ответ: от 1 до 100 символов');
  const correct=checkAnswer(r.deck[r.index],b.text);r.answers[p.team]={text:b.text.trim(),by:p.name,correct,points:0};if(correct){r.winner=p.team;reveal(r)}else if(r.activeTeams.every(t=>r.answers[t]))reveal(r);
 }
 else if(action==='next'){host();if(r.phase!=='reveal'||b.roundId!==r.roundId)fail('Дождитесь итогов вопроса');begin(r);}
 else if(action==='replay'){host();if(r.phase!=='finished')fail('Сначала закончите партию');r.phase='lobby';r.deck=null;r.index=-1;r.answers={};r.scores=[0,0,0,0];}
 else if(action==='leave'){r.players=r.players.filter(x=>x.id!==p.id);if(p.id===r.host)r.host=r.players[0]?.id;if(!r.players.length){db.prepare('DELETE FROM rooms WHERE code = ?').run(code);return {left:true}}save.run(code,JSON.stringify(r),now());return {left:true};}
 else if(action!=='state')fail('Неизвестное действие',404);
 return {state:write(r,p)};
 };
}
