import {SPY_CATEGORIES,SPY_LOCATIONS,spyPool} from './spy-bank.js';
export const ROLE_NAMES={spy:'Шпион',local:'Местный',mafia:'Мафия',citizen:'Мирный житель',doctor:'Доктор',detective:'Комиссар'};
export function createSecretGames({fail,shuffle,people,active,online,id,exposure,histories}){
 const enabled=r=>['spy','mafia'].includes(r.settings.mode);
 const minPlayers=mode=>mode==='mafia'?5:3;
 const alive=r=>people(r).filter(p=>!p.left&&r.secret.alive.includes(p.id));
 function settings(data,prev){
  const s={spyCategory:'all',spyDifficulty:'mixed',spyCount:1,spySeconds:300,mafiaDoctor:true,mafiaDetective:true,mafiaReveal:false,mafiaNight:60,mafiaDay:120,...prev};
  for(const k of ['spyCategory','spyDifficulty','spyCount','spySeconds','mafiaDoctor','mafiaDetective','mafiaReveal','mafiaNight','mafiaDay'])if(data[k]!==undefined)s[k]=data[k];
  if(s.spyCategory!=='all'&&!SPY_CATEGORIES.some(c=>c.id===s.spyCategory))fail('Выберите доступную тему.');
  if(!['classic','unusual','mixed'].includes(s.spyDifficulty))fail('Выберите доступную сложность.');
  if(![1,2].includes(s.spyCount)||![180,300,420,600].includes(s.spySeconds))fail('Проверьте настройки Шпиона.');
  if(['mafiaDoctor','mafiaDetective','mafiaReveal'].some(k=>typeof s[k]!=='boolean')||![45,60,90,120].includes(s.mafiaNight)||![60,120,180,300].includes(s.mafiaDay))fail('Проверьте настройки Мафии.');
  return s;
 }
 function phase(r,name,t,seconds){r.phase=name;r.secret.step++;r.deadline=seconds?t+seconds*1000:null;}
 function start(r,t){
  if(r.settings.mode==='spy'){
   const pool=spyPool(r.settings),history=new Map();
   for(const p of people(r))for(const h of histories.all(p.device))if(h.image.startsWith('spy:'))history.set(h.image.slice(4),Math.max(history.get(h.image.slice(4))||0,h.seen));
   r.spyDeck=shuffle(pool.map(l=>l.id)).sort((a,b)=>(history.get(a)||0)-(history.get(b)||0));
   startSpyRound(r,t);
  }else{
   const ps=shuffle(people(r)),count=Math.floor(ps.length/4),roles=[...Array(count).fill('mafia'),...(r.settings.mafiaDoctor?['doctor']:[]),...(r.settings.mafiaDetective?['detective']:[])];
   while(roles.length<ps.length)roles.push('citizen');
   r.secret={roles:Object.fromEntries(ps.map((p,i)=>[p.id,roles[i]])),alive:ps.map(p=>p.id),step:0,day:0,actions:{},checks:{},lastHeal:null,log:[],chat:[],winner:null};
   mafiaNight(r,t);
  }
 }
 function startSpyRound(r,t){
  r.round++;const ps=shuffle(people(r).filter(p=>!p.left)),location=r.spyDeck.shift();
  if(!location)fail('В наборе закончились локации. Выберите больше тем.',409);
  const l=SPY_LOCATIONS.find(l=>l.id===location),category=SPY_CATEGORIES.find(c=>c.id===l.category);
  const step=(r.secret?.step||0);
  r.secret={step,roles:Object.fromEntries(ps.map((p,i)=>[p.id,i<r.settings.spyCount?'spy':'local'])),jobs:Object.fromEntries(ps.map((p,i)=>[p.id,category.roles[i%category.roles.length]])),location,alive:ps.map(p=>p.id),votes:{},turns:shuffle(ps.map(p=>p.id)),turn:0,winner:null};
  for(const p of ps)exposure.run(p.device,'spy:'+location,t);
  phase(r,'spy-discuss',t,r.settings.spySeconds);
 }
 function leaderboard(r){return people(r).map(p=>({id:p.id,name:p.name,score:p.score,left:p.left})).sort((a,b)=>b.score-a.score);}
 function finishSpy(r,t,winner,reason){
  r.secret.winner=winner;r.secret.reason=reason;
  r.winners=winner?people(r).filter(p=>r.secret.roles[p.id]===winner&&!p.left).map(p=>p.id):[];
  for(const p of r.players)if(r.winners.includes(p.id))p.score++;
  phase(r,'spy-results',t,null);
 }
 function finishMafia(r,t,winner,reason){
  r.secret.winner=winner;r.secret.reason=reason;
  r.winners=winner?people(r).filter(p=>(r.secret.roles[p.id]==='mafia'?'mafia':'town')===winner&&!p.left).map(p=>p.id):[];
  for(const p of r.players)if(r.winners.includes(p.id))p.score++;
  phase(r,'finished',t,null);
 }
 function checkMafiaWin(r,t){
  const ps=alive(r),mafia=ps.filter(p=>r.secret.roles[p.id]==='mafia').length,town=ps.length-mafia;
  if(!ps.length){finishMafia(r,t,null,'Все игроки вышли.');return true;}
  if(!mafia){finishMafia(r,t,'town','В городе больше нет мафии.');return true;}
  if(mafia>=town){finishMafia(r,t,'mafia','Мафии стало не меньше, чем остальных жителей.');return true;}
  return false;
 }
 function log(r,text){r.secret.log.push({day:r.secret.day,text});}
 function death(r,p,cause){r.secret.alive=r.secret.alive.filter(x=>x!==p.id);log(r,p.name+' '+cause+(r.settings.mafiaReveal?' Роль: '+ROLE_NAMES[r.secret.roles[p.id]]+'.':''));}
 function mafiaNight(r,t){
  r.round++;r.secret.day++;r.secret.actions={};r.secret.votes={};r.secret.chat=[];phase(r,'mafia-night',t,r.settings.mafiaNight);
 }
 function plurality(values,majority=false,total=0){
  const counts={};for(const v of values)if(v&&v!=='skip')counts[v]=(counts[v]||0)+1;
  const ranked=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  return ranked.length&&(ranked.length===1||ranked[0][1]>ranked[1][1])&&(!majority||ranked[0][1]>total/2)?ranked[0][0]:null;
 }
 function resolveNight(r,t){
  const s=r.secret,ps=alive(r),m=ps.filter(p=>s.roles[p.id]==='mafia');
  const victim=plurality(m.map(p=>s.actions[p.id]?.target)),doctor=ps.find(p=>s.roles[p.id]==='doctor'),heal=doctor?s.actions[doctor.id]?.target:null;
  s.lastHeal=heal==='skip'?null:heal;
  for(const p of ps.filter(p=>s.roles[p.id]==='detective')){const target=s.actions[p.id]?.target;if(target&&target!=='skip')(s.checks[p.id]??=[]).push({day:s.day,target,mafia:s.roles[target]==='mafia'});}
  const killed=ps.find(p=>p.id===victim);
  if(killed&&victim!==heal)death(r,killed,'выбывает после ночи.');
  else log(r,'Этой ночью никто не погиб.');
  if(!checkMafiaWin(r,t))phase(r,'mafia-day',t,r.settings.mafiaDay);
 }
 function resolveMafiaVote(r,t){
  const ps=alive(r),target=plurality(ps.map(p=>r.secret.votes[p.id]),true,ps.length);
  const counts={};for(const p of ps){const v=r.secret.votes[p.id];if(v)counts[v]=(counts[v]||0)+1;}
  r.secret.ballot={counts,target};
  if(target){death(r,ps.find(p=>p.id===target),'изгнан голосованием.');}else log(r,'Большинства нет. Никого не изгнали.');
  if(!checkMafiaWin(r,t)){if(r.secret.day>=20)finishMafia(r,t,null,'20 дней без победителя — ничья.');else phase(r,'mafia-verdict',t,15);}
 }
 function advance(r,t){
  if(!enabled(r)||!r.secret||['lobby','finished','spy-results'].includes(r.phase))return;
  const ps=alive(r),s=r.secret;
  if(r.settings.mode==='spy'){
   if(ps.length<3){finishSpy(r,t,null,'Осталось меньше трёх игроков — раунд отменён.');return;}
   if(!ps.some(p=>s.roles[p.id]==='spy')){finishSpy(r,t,'local','Все шпионы покинули раунд.');return;}
   if(r.phase==='spy-discuss'&&t>=r.deadline){s.votes={};phase(r,'spy-vote',t,60);}
   if(r.phase==='spy-vote'&&(t>=r.deadline||ps.every(p=>s.votes[p.id]))){
    s.counts={};for(const p of ps)for(const target of s.votes[p.id]||[])if(ps.some(q=>q.id===target))s.counts[target]=(s.counts[target]||0)+1;
    s.accused=Object.keys(s.counts).filter(k=>s.counts[k]>ps.length/2);
    const caught=ps.filter(p=>s.roles[p.id]==='spy').every(p=>s.accused.includes(p.id));
    finishSpy(r,t,caught?'local':'spy',caught?'Всех шпионов нашли большинством голосов.':'Шпионы избежали общего подозрения.');
   }
  }else{
   for(const p of people(r))if(p.left&&s.alive.includes(p.id))death(r,p,'покинул партию.');
   if(checkMafiaWin(r,t))return;
   if(r.phase==='mafia-night'&&(t>=r.deadline||alive(r).every(p=>s.actions[p.id])))resolveNight(r,t);
   else if(r.phase==='mafia-day'&&t>=r.deadline){s.votes={};phase(r,'mafia-vote',t,60);}
   else if(r.phase==='mafia-vote'&&(t>=r.deadline||alive(r).every(p=>s.votes[p.id])))resolveMafiaVote(r,t);
   else if(r.phase==='mafia-verdict'&&t>=r.deadline)mafiaNight(r,t);
  }
 }
 function view(r,p,t){
  const s=r.secret,mode=r.settings.mode,v={};
  if(r.phase==='lobby')return {locationCount:spyPool(r.settings).length,mafiaCount:Math.floor(active(r).length/4)};
  if(!s)return v;
  const role=s.roles[p.id],living=alive(r),revealed=['finished','spy-results'].includes(r.phase);
  v.step=s.step;v.role=role;v.roleName=ROLE_NAMES[role];v.alive=living.some(q=>q.id===p.id);
  v.roster=people(r).map(q=>({id:q.id,name:q.name,alive:living.some(x=>x.id===q.id),left:q.left,...(revealed?{role:s.roles[q.id],roleName:ROLE_NAMES[s.roles[q.id]]}:{})}));
  if(mode==='spy'){
   if(role==='local'||revealed){v.location=SPY_LOCATIONS.find(l=>l.id===s.location).name;v.job=s.jobs[p.id];}
   v.questioner=s.turns.filter(x=>living.some(p=>p.id===x))[s.turn%Math.max(1,living.length)];v.turn=s.turn;
   if(r.phase==='spy-vote'){v.myTargets=s.votes[p.id]||[];v.submitted=!!s.votes[p.id];v.done=living.filter(p=>s.votes[p.id]).length;v.total=living.length;v.maxTargets=Math.min(r.settings.spyCount,living.filter(q=>s.roles[q.id]==='spy').length);}
   if(revealed){v.counts=s.counts||{};v.accused=s.accused||[];v.guess=s.guess?SPY_LOCATIONS.find(l=>l.id===s.guess).name:null;}
  }else{
   v.day=s.day;v.log=s.log.slice(-40);v.checks=(s.checks[p.id]||[]).map(c=>({...c,name:r.players.find(q=>q.id===c.target)?.name||'Игрок'}));
   if(r.phase==='mafia-night'){
    v.submitted=!!s.actions[p.id];v.myTarget=s.actions[p.id]?.target??null;v.done=living.filter(q=>s.actions[q.id]).length;v.total=living.length;
    v.targets=living.filter(q=>role==='mafia'?s.roles[q.id]!=='mafia':role==='doctor'?q.id!==s.lastHeal:role==='detective'?q.id!==p.id:false).map(q=>({id:q.id,name:q.name}));
    if(role==='mafia'){v.allies=living.filter(q=>s.roles[q.id]==='mafia').map(q=>({id:q.id,name:q.name,target:s.actions[q.id]?.target||null}));v.chat=s.chat;}
   }
   if(r.phase==='mafia-vote'){v.myTarget=s.votes[p.id]||null;v.submitted=!!s.votes[p.id];v.done=living.filter(q=>s.votes[q.id]).length;v.total=living.length;}
   if(r.phase==='mafia-verdict'||revealed)v.ballot=s.ballot||null;
  }
  if(revealed){v.winningTeam=s.winner;v.reason=s.reason;v.winners=r.winners;v.leaderboard=leaderboard(r);}
  return v;
 }
 function action(r,p,name,data,t,host){
  if(!enabled(r))fail('Это действие недоступно в выбранной игре.',409);
  const s=r.secret;
  if(!s)fail('Партия ещё не началась.',409);
  if(data.matchId!==r.matchId||data.round!==r.round||data.step!==s.step)fail('Этот этап уже закончился.',409);
  const requirePhase=phaseName=>{if(r.phase!==phaseName)fail('Этот этап уже закончился.',409);};
  const live=()=>{if(!alive(r).some(q=>q.id===p.id))fail('Вы наблюдаете и не можете действовать.',403);};
  const once=(map,value)=>{if(map[p.id]){if(JSON.stringify(map[p.id])===JSON.stringify(value))return;fail('Действие уже принято. Изменить его нельзя.',409);}map[p.id]=value;};
  if(name==='secret-next'){
   host();
   if(r.phase==='spy-discuss'){s.votes={};phase(r,'spy-vote',t,60);}
   else if(r.phase==='spy-results'){
    if(r.round>=r.settings.rounds||alive(r).length<(r.settings.spyCount===2?6:3)){phase(r,'finished',t,null);}else startSpyRound(r,t);
   }else if(r.phase==='mafia-day'){s.votes={};phase(r,'mafia-vote',t,60);}
   else if(r.phase==='mafia-verdict')mafiaNight(r,t);else fail('Продолжение сейчас недоступно.',409);
  }else if(name==='spy-turn'){
   requirePhase('spy-discuss');live();const turns=s.turns.filter(x=>alive(r).some(q=>q.id===x));
   if(p.id!==turns[s.turn%turns.length]&&p.id!==r.hostId)fail('Сейчас очередь другого игрока.',403);
   if(data.turn!==s.turn)fail('Очередь уже поменялась.',409);s.turn++;
  }else if(name==='spy-guess'){
   requirePhase('spy-discuss');live();if(s.roles[p.id]!=='spy')fail('Локацию угадывает только шпион.',403);
   if(!spyPool(r.settings).some(l=>l.id===data.locationId))fail('Выберите локацию из набора.');
   s.guess=data.locationId;finishSpy(r,t,data.locationId===s.location?'spy':'local',data.locationId===s.location?'Шпион угадал локацию.':'Шпион назвал неверную локацию.');
  }else if(name==='spy-ballot'){
   requirePhase('spy-vote');live();const max=Math.min(r.settings.spyCount,alive(r).filter(q=>s.roles[q.id]==='spy').length),targets=data.targets;
   if(!Array.isArray(targets)||targets.length>max||new Set(targets).size!==targets.length||targets.some(x=>x===p.id||!alive(r).some(q=>q.id===x)))fail('Выберите других игроков или воздержитесь.');
   once(s.votes,[...targets].sort());
  }else if(name==='mafia-act'){
   requirePhase('mafia-night');live();const role=s.roles[p.id],target=data.target;
   if(!['mafia','doctor','detective','citizen'].includes(role))fail('Недоступная роль.',403);
   if(role==='citizen'&&target!=='skip')fail('Мирный житель ночью отдыхает.',403);
   if(target!=='skip'){
    const q=alive(r).find(q=>q.id===target);if(!q)fail('Игрок уже выбыл.');
    if(role==='mafia'&&s.roles[q.id]==='mafia')fail('Мафия не может выбрать своего союзника.');
    if(role==='detective'&&q.id===p.id)fail('Нельзя проверять себя.');
    if(role==='doctor'&&q.id===s.lastHeal)fail('Нельзя лечить одного игрока две ночи подряд.');
   }
   once(s.actions,{target});
  }else if(name==='mafia-ballot'){
   requirePhase('mafia-vote');live();if(data.target!=='skip'&&(data.target===p.id||!alive(r).some(q=>q.id===data.target)))fail('Выберите другого живого игрока.');once(s.votes,data.target);
  }else if(name==='mafia-chat'){
   requirePhase('mafia-night');live();if(s.roles[p.id]!=='mafia')fail('Чат доступен только мафии.',403);
   if(typeof data.text!=='string'||!data.text.trim()||Array.from(data.text.trim()).length>120)fail('Сообщение — от 1 до 120 символов.');
   if(s.chat.some(c=>c.id===data.messageId&&c.playerId===p.id))return;
   if(typeof data.messageId!=='string'||!/^[\w-]{8,80}$/.test(data.messageId))fail('Некорректное сообщение.');
   const last=[...s.chat].reverse().find(c=>c.playerId===p.id);if(last&&t-last.at<2000)fail('Подождите пару секунд.',429);
   s.chat.push({id:data.messageId,playerId:p.id,name:p.name,text:data.text.trim(),at:t});s.chat=s.chat.slice(-30);
  }else fail('Неизвестное действие.',404);
 }
 return {enabled,minPlayers,settings,start,advance,view,action};
}
