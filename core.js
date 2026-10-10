// The server owns every transition. Public state is built separately from stored state.
export function createGame(db, memes, options = {}) {
 const now = options.now || (() => Date.now());
 const id = () => crypto.randomUUID();
 const fail = (message, status=400) => {throw Object.assign(new Error(message), {status});};
 const shuffle = a => {a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor((options.random||Math.random)()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
 const imageMap = new Map(memes.map(m=>[m.id,m]));
 db.exec(`CREATE TABLE IF NOT EXISTS meme_rooms(code TEXT PRIMARY KEY, data TEXT NOT NULL, touched INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS meme_seen(device TEXT NOT NULL, image TEXT NOT NULL, seen INTEGER NOT NULL, PRIMARY KEY(device,image));
 CREATE INDEX IF NOT EXISTS meme_rooms_touched ON meme_rooms(touched);`);
 const read = db.prepare('SELECT data FROM meme_rooms WHERE code=?');
 const save = db.prepare('INSERT OR REPLACE INTO meme_rooms(code,data,touched) VALUES(?,?,?)');
 const exposure = db.prepare('INSERT OR REPLACE INTO meme_seen(device,image,seen) VALUES(?,?,?)');
 const histories = db.prepare('SELECT image,seen FROM meme_seen WHERE device=?');
 const active = r => r.players.filter(p=>!p.left);
 const online = (p,t) => !p.left && t-p.lastSeen<45000;
 const people = r => r.players.filter(p=>r.participants.includes(p.id));
 const safeImage = key => {const m=imageMap.get(key);return {id:m.id,path:m.path,width:m.width,height:m.height};};
 function player(name,device,t){
  if(typeof name!=='string')fail('Введите имя.');name=name.trim().replace(/\s+/g,' ');
  if(!name||Array.from(name).length>20)fail('Имя должно содержать от 1 до 20 символов.');
  if(typeof device!=='string'||!/^[-\w]{8,80}$/.test(device))fail('Не удалось распознать устройство. Обновите страницу.');
  return {id:id(),token:id()+id(),device,name,score:0,ready:false,lastSeen:t,left:false};
 }
 function settings(data, previous={rounds:5,captionSeconds:60}){
  const rounds=data.rounds??previous.rounds,captionSeconds=data.captionSeconds??previous.captionSeconds;
  if(!Number.isInteger(rounds)||rounds<3||rounds>10)fail('Выберите от 3 до 10 раундов.');
  if(![45,60,90,120].includes(captionSeconds))fail('Выберите доступное время на подпись.');
  return {rounds,captionSeconds};
 }
 function chooseDeck(r){
  const history=new Map();
  for(const p of people(r))for(const row of histories.all(p.device))history.set(row.image,Math.max(history.get(row.image)||0,row.seen));
  // Randomize equal priorities; unseen first, then least recently shown.
  return shuffle(memes.map(m=>m.id)).sort((a,b)=>(history.get(a)||0)-(history.get(b)||0));
 }
 function startRound(r,t){
  r.round++;r.phase='caption';r.deadline=t+r.settings.captionSeconds*1000;r.assignments={};r.entries=[];r.votes={};r.winners=[];r.resultReason='';
  const players=people(r).filter(p=>!p.left);
  const image=r.deck.shift();if(!image)fail('В банке закончились картинки. Вернитесь в лобби.',409);
  for(const p of players)r.assignments[p.id]={image,caption:null,submitted:false};
  // One shared picture per round; remember its exposure for every participant.
  for(const p of players)exposure.run(p.device,image,t);
 }
 function voting(r,t){
  r.entries=shuffle(Object.entries(r.assignments).filter(([,a])=>a.submitted&&a.caption).map(([owner,a])=>({id:id(),owner,image:a.image,caption:a.caption})));
  if(!r.entries.length){results(r,t);return;}
  r.phase='vote';r.deadline=t+45000;
 }
 function results(r,t){
  const counts=Object.fromEntries(r.entries.map(e=>[e.id,0]));for(const vote of Object.values(r.votes))if(vote in counts)counts[vote]++;
  r.entries.forEach(e=>e.votes=counts[e.id]);const max=Math.max(0,...Object.values(counts));
  r.winners=max>0?r.entries.filter(e=>e.votes===max).map(e=>e.owner):[];
  for(const p of r.players)if(r.winners.includes(p.id))p.score++;
  r.resultReason=!r.entries.length?'no-captions':!max?'no-votes':r.winners.length>1?'tie':'winner';
  r.phase='results';r.deadline=null;r.resultAt=t;
 }
 function eligibleVoters(r){return people(r).filter(p=>!p.left&&r.entries.some(e=>e.owner!==p.id));}
 function advance(r,t){
  const host=r.players.find(p=>p.id===r.hostId);
  if(!host||host.left||t-host.lastSeen>=90000){const next=active(r).find(p=>online(p,t));if(next)r.hostId=next.id;}
  if(r.phase==='caption'){
   const remaining=Object.entries(r.assignments).filter(([key])=>!r.players.find(p=>p.id===key)?.left);
   if(t>=r.deadline||remaining.every(([,a])=>a.submitted))voting(r,t);
  }
  if(r.phase==='vote'&&(t>=r.deadline||eligibleVoters(r).every(p=>r.votes[p.id])))results(r,t);
 }
 function view(r,p,t){
  const s={game:'caption-memes',code:r.code,phase:r.phase,round:r.round,matchId:r.matchId,settings:r.settings,hostId:r.hostId,me:p.id,revision:r.revision,serverTime:t,deadline:r.deadline,players:active(r).map(q=>({id:q.id,name:q.name,score:q.score,ready:q.ready,online:online(q,t)})),minPlayers:3,maxPlayers:12,maxRounds:Math.min(10,memes.length)};
  if(r.phase==='caption'){
   const a=r.assignments[p.id];s.image=a?safeImage(a.image):null;s.submitted=!!a?.submitted;s.myCaption=a?.caption??null;s.done=Object.values(r.assignments).filter(a=>a.submitted).length;s.total=Object.keys(r.assignments).length;
  }
  if(['vote','results','finished'].includes(r.phase)){
   s.cards=r.entries.map(e=>({id:e.id,image:safeImage(e.image),caption:e.caption,own:e.owner===p.id,...(r.phase!=='vote'?{author:r.players.find(q=>q.id===e.owner)?.name||'Участник',authorId:e.owner,votes:e.votes,winner:r.winners.includes(e.owner)}:{})}));
   s.voted=!!r.votes[p.id];s.myVote=r.votes[p.id]||null;s.canVote=r.phase==='vote'&&eligibleVoters(r).some(q=>q.id===p.id)&&!s.voted;s.done=eligibleVoters(r).filter(q=>r.votes[q.id]).length;s.total=eligibleVoters(r).length;
  }
  if(['results','finished'].includes(r.phase)){s.winners=r.winners;s.resultReason=r.resultReason;s.leaderboard=people(r).map(q=>({id:q.id,name:q.name,score:q.score,left:q.left})).sort((a,b)=>b.score-a.score);}
  return s;
 }
 return function game(action,data={},token=''){
  const t=now();db.exec('BEGIN IMMEDIATE');
  try{
   let r,p,newSession=false;
   if(action==='create'){
    p=player(data.name,data.device,t);let code;do{code=String(Math.floor(100000+Math.random()*900000));}while(read.get(code));
    r={code,phase:'lobby',created:t,touched:t,players:[p],hostId:p.id,settings:settings(data),round:0,participants:[],matchId:id(),revision:0};newSession=true;
   }else{
    if(typeof data.code!=='string'||!/^\d{6}$/.test(data.code.trim()))fail('Код комнаты — 6 цифр.');
    const row=read.get(data.code.trim());if(!row||t-JSON.parse(row.data).touched>86400000)fail('Комната не найдена или уже закрыта.',404);r=JSON.parse(row.data);
    if(action==='join'){
     if(r.phase!=='lobby')fail('Партия уже идёт. Дождитесь следующей или вернитесь через сохранённый вход.',409);
     if(active(r).length>=12)fail('Комната заполнена: максимум 12 игроков.',409);
     p=player(data.name,data.device,t);if(active(r).some(q=>q.name.toLocaleLowerCase('ru')===p.name.toLocaleLowerCase('ru')))fail('Такое имя уже занято. Добавьте отличительный знак.');
     r.players.push(p);newSession=true;
    }else{
     p=r.players.find(q=>q.token===token&&!q.left);if(!p)fail('Вход устарел. Войдите в комнату заново.',401);p.lastSeen=t;
    }
    advance(r,t);
   }
   const host=()=>{if(r.hostId!==p.id)fail('Это действие доступно ведущему.',403);};
   const phase=(wanted)=>{if(r.phase!==wanted)fail('Этот этап уже закончился. Обновляем игру.',409);};
   const round=()=>{if(data.round!==r.round||data.matchId!==r.matchId)fail('Этот раунд уже закончился.',409);};
   switch(action){
    case 'create':case 'join':case 'state':break;
    case 'settings':host();phase('lobby');r.settings=settings(data,r.settings);active(r).forEach(q=>q.ready=false);break;
    case 'ready':phase('lobby');if(typeof data.ready!=='boolean')fail('Некорректная готовность.');p.ready=data.ready;break;
    case 'start':{
     host();phase('lobby');const ps=active(r);if(ps.length<3)fail('Нужно хотя бы 3 игрока.');if(ps.some(q=>!online(q,t)||!q.ready))fail('Дождитесь подключения и готовности всех игроков.');
     if(r.settings.rounds>memes.length)fail('В банке недостаточно картинок для такого количества раундов.');
     r.participants=ps.map(q=>q.id);r.round=0;r.matchId=id();ps.forEach(q=>q.score=0);r.deck=chooseDeck(r);startRound(r,t);break;
    }
    case 'caption':{
     phase('caption');round();const a=r.assignments[p.id];if(!a)fail('Вы не участвуете в этом раунде.',403);
     if(typeof data.caption!=='string')fail('Напишите подпись.');const caption=data.caption.trim();if(Array.from(caption).length>200)fail('Подпись должна быть не длиннее 200 символов.');
     if(a.submitted){if(a.caption===caption)break;fail('Подпись уже отправлена.',409);}
     a.caption=caption;a.submitted=true;break;
    }
    case 'vote':{
     phase('vote');round();const e=r.entries.find(q=>q.id===data.cardId);if(!e)fail('Эта подпись недоступна.',404);if(e.owner===p.id)fail('За свою подпись голосовать нельзя.');
     if(!eligibleVoters(r).some(q=>q.id===p.id))fail('Вы не участвуете в голосовании.',403);
     if(r.votes[p.id]){if(r.votes[p.id]===e.id)break;fail('Голос уже отправлен.',409);}r.votes[p.id]=e.id;break;
    }
    case 'next':host();phase('results');round();if(r.round>=r.settings.rounds){r.phase='finished';r.deadline=null;}else startRound(r,t);break;
    case 'replay':host();phase('finished');r.phase='lobby';r.players=r.players.filter(q=>!q.left&&online(q,t));r.players.forEach(q=>{q.ready=false;q.score=0;});r.round=0;r.matchId=id();r.participants=[];break;
    case 'kick':{
     host();phase('lobby');const q=r.players.find(q=>q.id===data.playerId&&!q.left);if(!q||q.id===p.id)fail('Игрок недоступен.');q.left=true;break;
    }
    case 'leave':p.left=true;break;
    default:fail('Неизвестное действие.',404);
   }
   advance(r,t);r.revision++;r.touched=t;save.run(r.code,JSON.stringify(r),t);
   if(Math.random()<0.01)db.prepare('DELETE FROM meme_rooms WHERE touched<?').run(t-86400000);
   const result=action==='leave'?{left:true}:view(r,p,t);if(newSession)result.session={token:p.token,code:r.code,playerId:p.id};
   db.exec('COMMIT');return result;
  }catch(e){db.exec('ROLLBACK');throw e;}
 };
}
