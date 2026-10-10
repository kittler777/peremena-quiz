const app=document.querySelector('#app');
const API=(window.PEREMENA_API||'').replace(/\/$/,'');
const imageBase=location.hostname.endsWith('up.railway.app')?'https://kittler777.github.io/peremena-quiz/':'./';
const storage={get:(k,session=false)=>{try{return (session?sessionStorage:localStorage).getItem(k);}catch{return null;}},set:(k,v,session=false)=>{try{(session?sessionStorage:localStorage).setItem(k,v);}catch{}},remove:(k,session=false)=>{try{(session?sessionStorage:localStorage).removeItem(k);}catch{}}};
let device=storage.get('memes-device-v2');if(!device){device=crypto.randomUUID();storage.set('memes-device-v2',device);}
let session;try{session=JSON.parse(storage.get('memes-session-v2',true)||'null');}catch{session=null;}
let state=null,busy=false,viewKey='',clockOffset=0,selected=null,formError='',connectionError=false;
let homeTab=new URLSearchParams(location.search).has('room')?'join':'create';
let homeName=storage.get('memes-name')||'',homeCode=new URLSearchParams(location.search).get('room')||'';
let pollTimer,toastTimer;
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=id=>document.getElementById(id);
const draftKey=()=>state?`memes-draft:${state.code}:${state.matchId}:${state.round}`:'';
const draft=()=>storage.get(draftKey(),true)||'';
const isHost=()=>state?.hostId===state?.me;
const me=()=>state?.players.find(p=>p.id===state.me);
const button=(text,action,disabled=false,cls='',extra='')=>`<button type="button" class="button ${cls}" data-action="${action}" ${disabled?'disabled':''} ${extra}>${text}</button>`;
const dots=(done,total)=>`<div class="progress-dots" aria-hidden="true">${Array.from({length:total},(_,i)=>`<i class="${i<done?'done':''}"></i>`).join('')}</div>`;
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,5000);}
function connection(message=''){$('connection').textContent=message;$('connection').hidden=!message;connectionError=!!message;}
function imageHTML(image,alt='Картинка для подписи',lazy=false){return `<img src="${escape(imageBase+image.path)}" width="${image.width}" height="${image.height}" alt="${escape(alt)}" ${lazy?'loading="lazy"':''} decoding="async">`;}
function home(){return `<section class="home"><div class="hero"><span class="eyebrow">Мемы + друзья = хороший вечер</span><h1>Картинка наша.<br>Шутка <em>твоя.</em></h1><p class="hero-description">Придумывай подписи, голосуй вслепую и выясни, кто в вашей компании самый смешной.</p><div class="hero-tags"><span class="tag">3–12 игроков</span><span class="tag">100 мемов</span><span class="tag">Каждый со своего экрана</span></div><div class="hero-showcase" aria-label="Примеры мемов"><div class="sample-meme">${imageHTML({path:'assets/memes/m97984.jpg',width:500,height:375},'Девочка на фоне горящего дома')}<p class="sample-caption">Когда наконец удалил<br>рабочий чат</p></div><div class="sample-meme second">${imageHTML({path:'assets/memes/m27813981.jpg',width:480,height:601},'Гарольд с ноутбуком')}<p class="sample-caption">«Давай ещё один раунд»<br>в три часа ночи</p></div><span class="sticker">ТУТ<br>МОГЛА БЫТЬ<br>ТВОЯ ШУТКА</span></div></div><section class="panel entry-panel"><span class="eyebrow">Без регистрации</span><h2>Все свои?</h2><p class="muted">Собери компанию в одной комнате.</p><div class="tabs" role="tablist" aria-label="Вход в игру"><button class="tab ${homeTab==='create'?'active':''}" role="tab" aria-selected="${homeTab==='create'}" data-action="tab-create">Создать комнату</button><button class="tab ${homeTab==='join'?'active':''}" role="tab" aria-selected="${homeTab==='join'}" data-action="tab-join">Войти по коду</button></div><form id="entry-form"><div class="field"><label for="player-name">Как тебя зовут?</label><input id="player-name" name="name" value="${escape(homeName)}" maxlength="20" placeholder="Имя или ник" autocomplete="nickname" required></div>${homeTab==='join'?`<div class="field"><label for="room-code">Код от друзей</label><input id="room-code" class="code-input" value="${escape(homeCode)}" name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="123456" autocomplete="off" required></div>`:''}${formError?`<div class="error" role="alert">${escape(formError)}</div>`:''}<button class="button wide" type="submit" ${busy?'disabled':''}>${busy?'Подключаемся…':homeTab==='create'?'Создать комнату ↗':'Войти в комнату ↗'}</button><p class="entry-note">${homeTab==='create'?'Получишь код — отправь его друзьям.<br>Раунды и время выберешь в комнате.':'Открой игру на своём устройстве.<br>Каждый участник играет за себя.'}</p></form></section></section><section class="home-foot"><div class="mini-step"><span class="step-number">01</span><div><b>Лови картинку</b><p>У каждого — свой случайный мем.</p></div></div><div class="mini-step"><span class="step-number">02</span><div><b>Придумай подпись</b><p>Одна шутка. Никакого правильного ответа.</p></div></div><div class="mini-step"><span class="step-number">03</span><div><b>Выбирай смешное</b><p>Авторы скрыты. Победителю — балл.</p></div></div></section><p class="source-footer">Подпиши это! · Сделано для вечеров с друзьями</p>`;}
function gameHeader(title,caption){return `<div class="game-header"><div><div class="round-label">${escape(caption)}</div><h1>${title}</h1></div>${state.deadline?`<div class="timer-pill" id="timer"><span>ОСТАЛОСЬ</span><strong id="seconds">—</strong></div>`:`<div class="room-badge"><span>КОМНАТА</span><b>${state.code}</b></div>`}</div>`;}
function bottom(){return `<div class="bottom-actions"><span>Ты — <b>${escape(me()?.name||'участник')}</b>${isHost()?' · ведущий':''}</span><button class="text-button" data-action="leave">Выйти из комнаты ↗</button></div>`;}
function lobby(){
 const host=isHost(),ready=me()?.ready,ps=state.players,allReady=ps.length>=3&&ps.every(p=>p.ready&&p.online),valid=state.settings.rounds<=state.maxRounds;
 return gameHeader('Пока собираемся…','Скоро будет смешно')+`<div class="lobby-layout"><section class="panel"><div class="panel-title"><h3>Ваша компания</h3><span class="pill">${ps.length} / 12</span></div><div class="invite-box"><span class="eyebrow">Отправь этот код друзьям</span><div class="invite-code">${state.code}</div><div class="invite-actions">${button('Скопировать код','copy-code',false,'small soft')}${button('Ссылка на комнату ↗','copy-link',false,'small secondary')}</div></div><div class="player-list">${ps.map((p,i)=>`<div class="player-row"><span class="avatar a${i%4}">${escape(Array.from(p.name)[0].toUpperCase())}</span><div class="player-info"><div class="player-name">${escape(p.name)}${p.id===state.me?' <small>(ты)</small>':''}</div><div class="player-meta">${p.id===state.hostId?'Ведущий':!p.online?'Переподключается…':'Участник'}</div></div><span class="ready-status ${p.ready&&p.online?'yes':''}">${!p.online?'Нет связи':p.ready?'✓ Готов':'Думает…'}</span>${host&&p.id!==state.me?`<button class="kick" data-action="kick" data-id="${p.id}" aria-label="Удалить ${escape(p.name)} из комнаты">×</button>`:''}</div>`).join('')}</div><p class="start-note">${ps.length<3?`Нужно ещё ${3-ps.length} ${3-ps.length===1?'игрока':'игрока'} для старта.`:'Когда все нажмут «Я готов», ведущий начнёт игру.'}</p></section><section class="panel"><span class="eyebrow">Параметры партии</span><h3>Как будем играть?</h3><div class="setting-grid"><div><label for="rounds">Раундов</label><select id="rounds" ${!host||busy?'disabled':''}>${Array.from({length:8},(_,i)=>i+3).map(n=>`<option value="${n}" ${state.settings.rounds===n?'selected':''} ${n>state.maxRounds?'disabled':''}>${n} раундов</option>`).join('')}</select></div><div><label for="caption-time">На подпись</label><select id="caption-time" ${!host||busy?'disabled':''}>${[45,60,90,120].map(n=>`<option value="${n}" ${state.settings.captionSeconds===n?'selected':''}>${n} секунд</option>`).join('')}</select></div></div>${!valid?`<div class="error">Для ${ps.length} игроков выберите максимум ${state.maxRounds} раундов, чтобы картинки не повторялись.</div>`:''}<p class="muted">Голосование — 45 секунд. Если все закончат раньше, ждать не придётся.</p><div class="start-actions">${button(ready?'✓ Я готов · отменить':'Я готов','ready',busy,ready?'lime wide':'wide')}${host?button('Начать игру →','start',busy||!allReady||!valid,'secondary wide'):''}</div><p class="start-note">${!host?'Настройки и старт — у ведущего.':!allReady?'Дождитесь готовности всех участников.':'Все в сборе. Можно начинать!'} При изменении параметров готовность сбрасывается.</p><div class="lobby-info"><p><b>Каждому своя картинка.</b><br>За свою подпись голосовать нельзя.</p><p><b>100 мемов в банке.</b><br>В этой партии картинки не повторятся.</p></div></section></div>`+bottom();
}
function progress(verb){return `<div class="progress-line">${dots(state.done,state.total)}<span>${verb}: ${state.done} из ${state.total}</span></div>`;}
function caption(){
 return gameHeader('Твой выход.','Раунд '+state.round+' / '+state.settings.rounds+' · Придумываем')+`<p class="phase-intro">Картинка случайная. Подпись — целиком твоя. Остальные пока её не видят.</p><div class="caption-layout"><div class="meme-frame"><div class="meme-image-wrap">${imageHTML(state.image)}</div><div class="meme-foot"><span>ТВОЯ КАРТИНКА</span><button class="text-button" data-action="zoom-own">Увеличить ↗</button></div></div><section class="panel caption-form">${state.submitted?`<span class="eyebrow">Уже в игре</span><h2>${state.myCaption?'Подпись отправлена!':'Раунд пропущен'}</h2>${state.myCaption?`<p class="sent-caption caption-preview">${escape(state.myCaption)}</p>`:''}<div class="waiting"><b>Теперь ждём остальных.</b><p>Когда все закончат или истечёт время, увидишь мемы друзей. Авторы останутся в секрете.</p></div>`:`<span class="eyebrow">Главное — смешно</span><h2>Что здесь происходит?</h2><p class="muted">Придумай ситуацию, мысль или реплику. Готовая шутка появится под картинкой.</p><form id="caption-form"><label for="caption-input">Твоя подпись</label><textarea id="caption-input" name="caption" placeholder="Когда…" maxlength="400" required>${escape(draft())}</textarea><div class="field-footer"><span>Черновик сохраняется</span><span id="char-count">${Array.from(draft()).length} / 200</span></div><button class="button wide" type="submit" id="caption-send" ${busy||!draft().trim()||Array.from(draft()).length>200?'disabled':''}>${busy?'Отправляем…':'Отправить подпись →'}</button></form><button class="text-button" data-action="skip" ${busy?'disabled':''}>Пропустить этот раунд</button><p class="caption-tip">После отправки подпись изменить нельзя. Не рассказывай друзьям, какая картинка досталась тебе: так голосование будет интереснее.</p>`}${progress('Подписали')}</section></div>`+bottom();
}
function cardHTML(c,i,result=false){
 const picked=state.myVote?state.myVote===c.id:selected===c.id;
 return `<${result?'article':'button'} ${result?'':'type="button"'} id="card-${c.id}" class="vote-card ${result?'result-card':''} ${c.own?'own':''} ${picked?'selected':''} ${c.winner?'winner':''}" ${result?'':`data-action="select" data-id="${c.id}" ${c.own||!state.canVote||busy?'disabled':''} aria-pressed="${picked}" aria-label="${escape(c.own?'Ваша подпись':`Выбрать подпись ${i+1}: ${c.caption}`)}"`}><div class="meme-image-wrap">${imageHTML(c.image,`Картинка мема ${i+1}`,true)}</div><span class="vote-caption">${escape(c.caption)}</span><div class="vote-card-footer">${result?`<span class="result-author">${c.winner?'★ ':''}${escape(c.author)}${c.own?' (ты)':''}</span><span class="vote-count">${c.votes} ${c.votes===1?'голос':c.votes>1&&c.votes<5?'голоса':'голосов'}${c.winner?' · +1':''}</span>`:`<span>${c.own?'Твоя подпись · нельзя голосовать':state.myVote===c.id?'✓ Твой голос':`Мем №${i+1}`}</span>${!c.own?`<span class="selection-circle">${picked?'✓':''}</span>`:''}`}</div></${result?'article':'button'}>`;
}
function voting(){
 if(selected&&!state.cards.some(c=>c.id===selected&&!c.own))selected=null;
 return gameHeader('Кто сделал смешнее?','Раунд '+state.round+' / '+state.settings.rounds+' · Голосуем')+`<p class="phase-intro">Имена спрятаны. Выбери одну чужую подпись и подтверди голос. ${state.canVote?'Нажми на картинку, чтобы выбрать.':''}</p><div class="vote-grid">${state.cards.map((c,i)=>cardHTML(c,i)).join('')}</div><div class="vote-bar"><div><b>${state.voted?'✓ Твой голос принят':!state.canVote?'Тут только твоя подпись':selected?'Мем выбран. Отправляем?':'Какой мем твой любимый?'}</b><p>${state.voted?'Авторы откроются после голосования.':!state.canVote?'Ждём, когда проголосуют остальные.':'Один голос. За себя голосовать нельзя.'} · ${state.done} / ${state.total}</p></div>${state.canVote?button(busy?'Отправляем…':'Голосовать →','vote',busy||!selected,'lime'):''}</div>`+bottom();
}
function scoreHTML(list){const top=list[0]?.score;let rank=0,last=-1;return `<div class="score-list">${list.map((p,i)=>{if(p.score!==last){rank=i+1;last=p.score;}return `<div class="score-row ${p.score===top?'leader':''}"><span class="score-rank">${rank}</span><span class="score-name">${escape(p.name)}${p.id===state.me?' <small>(ты)</small>':''}${p.left?' <small>· вышел</small>':''}</span><span class="score-num">${p.score}</span></div>`;}).join('')}</div>`;}
function result(){
 const names=state.cards.filter(c=>c.winner).map(c=>c.author),title=state.resultReason==='no-captions'?'В этот раз без подписей.':state.resultReason==='no-votes'?'Никто не проголосовал.':state.resultReason==='tie'?'Победила дружба. И шутки!':escape(names[0])+' забирает раунд!';
 const sub=state.resultReason==='tie'?names.map(escape).join(', ')+' — каждому +1 балл.':state.winners.length?'Самая популярная подпись получает +1 балл.':'Баллы не начислены. В следующем раунде получится лучше.';
 return gameHeader('Раскрываем карты.','Раунд '+state.round+' / '+state.settings.rounds+' · Результаты')+`<section class="results-banner"><div class="award-icon">${state.winners.length?'★':'↻'}</div><div><h2>${title}</h2><p>${sub}</p></div></section><div class="results-layout"><div>${state.cards.length?`<div class="vote-grid">${[...state.cards].sort((a,b)=>b.votes-a.votes).map((c,i)=>cardHTML(c,i,true)).join('')}</div>`:`<div class="panel"><h3>Новая картинка — новая попытка.</h3><p class="muted" style="margin-top:12px">Никто не отправил подпись до конца таймера.</p></div>`}</div><aside class="panel score-panel"><span class="eyebrow">Общий счёт</span><h3>Кто впереди?</h3>${scoreHTML(state.leaderboard)}${isHost()?button(state.round===state.settings.rounds?'Итоги партии →':'Следующий раунд →','next',busy,'wide'): `<p class="start-note">Ждём, когда ведущий продолжит игру.</p>`}<p class="start-note">${state.settings.rounds-state.round?`Осталось раундов: ${state.settings.rounds-state.round}.`:'Это был последний раунд.'}</p></aside></div>`+bottom();
}
function final(){
 const top=state.leaderboard[0]?.score||0,leaders=state.leaderboard.filter(p=>p.score===top),title=top?leaders.length===1?escape(leaders[0].name)+' —<br>мастер мемов!':'У нас несколько<br>мастеров мемов!':'Разогрелись?<br>Теперь реванш.';
 return `<section class="final"><div class="award-icon">★</div><span class="eyebrow">${state.settings.rounds} раундов · Комната ${state.code}</span><h1>${title}</h1><p class="muted">${top?leaders.map(p=>escape(p.name)).join(', ')+` · ${top} ${top===1?'балл':top<5?'балла':'баллов'}. `:''}В следующий раз шутки будут ещё лучше.</p><div class="panel"><h3>Финальный счёт</h3>${scoreHTML(state.leaderboard)}</div><div class="final-buttons">${isHost()?button('Сыграть ещё раз ↻','replay',busy,'wide'):'<p class="muted">Ведущий может начать новую партию в этой комнате.</p>'}</div></section>`+bottom();
}
function render(force=false){
 const key=JSON.stringify({state:state?{...state,revision:undefined,serverTime:undefined}:null,busy,homeTab,formError,selected});
 if(!force&&key===viewKey){updateClock();return;}viewKey=key;
 const focus=document.activeElement,focusId=focus?.id,selection=focus&&['INPUT','TEXTAREA'].includes(focus.tagName)?[focus.selectionStart,focus.selectionEnd]:null;
 app.innerHTML=!state?home():state.phase==='lobby'?lobby():state.phase==='caption'?caption():state.phase==='vote'?voting():state.phase==='results'?result():final();
 if(focusId&&$(focusId)&&!$(focusId).disabled){$(focusId).focus({preventScroll:true});if(selection&&$(focusId).setSelectionRange)try{$(focusId).setSelectionRange(...selection);}catch{}}
 updateClock();
}
function updateClock(){if(!state?.deadline||!$('seconds'))return;const remaining=Math.max(0,Math.ceil((state.deadline-Date.now()-clockOffset)/1000));$('seconds').textContent=remaining;$('timer').classList.toggle('urgent',remaining<=10);}
function apply(s){
 if(s.left)return;
 if(state&&s.code===state.code&&s.revision<state.revision)return;
 const oldPhase=state?.phase,oldRound=state?.round;state=s;
 if(oldPhase!==s.phase||oldRound!==s.round){selected=null;if(oldPhase){window.scrollTo({top:0,behavior:'instant'});}if(oldPhase==='caption'&&s.phase!=='caption')storage.remove(`memes-draft:${s.code}:${s.matchId}:${oldRound}`,true);}
 render();
}
async function request(action,params={}){
 const start=Date.now(),controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
 try{
  const response=await fetch(API+'/api/'+action,{method:'POST',headers:{'Content-Type':'application/json',...(session?{'Authorization':'Bearer '+session.token}:{})},body:JSON.stringify({code:session?.code,...params}),signal:controller.signal,cache:'no-store'});
  let s;try{s=await response.json();}catch{throw new Error('Сервер временно недоступен. Попробуйте ещё раз.');}
  if(!response.ok)throw Object.assign(new Error(s.error||'Не удалось выполнить действие.'),{status:response.status});
  if(s.serverTime)clockOffset=s.serverTime-(start+Date.now())/2;
  connection();return s;
 }catch(e){if(e.name==='AbortError'||e instanceof TypeError)throw new Error('Не удалось связаться с сервером. Черновик сохранён. Попробуйте ещё раз.');throw e;}
 finally{clearTimeout(timeout);}
}
function clearSession(){session=null;state=null;storage.remove('memes-session-v2',true);viewKey='';connection();}
async function mutate(action,params={}){
 if(busy)return;busy=true;formError='';render();
 try{
  const s=await request(action,params);
  if(s.session){session=s.session;storage.set('memes-session-v2',JSON.stringify(session),true);storage.set('memes-name',homeName);}
  if(action==='leave'){clearSession();toast('Ты вышел из комнаты.');}
  else apply(s);
 }catch(e){if(e.status===401){clearSession();formError=e.message;}else if(!state)formError=e.message;else toast(e.message);}
 finally{busy=false;render();schedulePoll();}
}
function schedulePoll(){clearTimeout(pollTimer);if(session)pollTimer=setTimeout(poll,1400);}
async function poll(){
 if(!session)return;if(busy){schedulePoll();return;}
 try{apply(await request('state'));}
 catch(e){if(e.status===401||e.status===404){clearSession();formError=e.message;render();}else connection('Связь прервалась. Переподключаемся автоматически…');}
 finally{schedulePoll();}
}
async function copy(value,message){try{await navigator.clipboard.writeText(value);toast(message);}catch{const input=document.createElement('textarea');input.value=value;input.style.position='fixed';input.style.opacity='0';document.body.append(input);input.select();try{if(document.execCommand('copy'))toast(message);else toast(value);}catch{toast(value);}input.remove();}}
function zoom(image){let dialog=$('image-zoom');if(!dialog){dialog=document.createElement('dialog');dialog.id='image-zoom';dialog.className='image-dialog';document.body.append(dialog);}dialog.innerHTML=`<button class="dialog-close" aria-label="Закрыть картинку" data-action="close-zoom">×</button>${imageHTML(image,'Твоя картинка крупным планом')}`;dialog.showModal();dialog.querySelector('button').onclick=()=>dialog.close();}
app.addEventListener('submit',e=>{
 e.preventDefault();if(busy)return;
 if(e.target.id==='entry-form'){homeName=$('player-name').value.trim();homeCode=$('room-code')?.value.trim()||homeCode;mutate(homeTab==='create'?'create':'join',{name:homeName,device,...(homeTab==='join'?{code:homeCode}:{})});}
 if(e.target.id==='caption-form')mutate('caption',{round:state.round,matchId:state.matchId,caption:$('caption-input').value});
});
app.addEventListener('input',e=>{
 if(e.target.id==='player-name')homeName=e.target.value;
 if(e.target.id==='room-code'){e.target.value=e.target.value.replace(/\D/g,'').slice(0,6);homeCode=e.target.value;}
 if(e.target.id==='caption-input'){storage.set(draftKey(),e.target.value,true);const n=Array.from(e.target.value).length;$('char-count').textContent=n+' / 200';$('char-count').style.color=n>200?'#b84036':'';$('caption-send').disabled=busy||!e.target.value.trim()||n>200;}
});
app.addEventListener('change',e=>{if(['rounds','caption-time'].includes(e.target.id))mutate('settings',{rounds:Number($('rounds').value),captionSeconds:Number($('caption-time').value)});});
app.addEventListener('click',e=>{
 const target=e.target.closest('[data-action]');if(!target||target.disabled)return;const action=target.dataset.action;
 if(action==='tab-create'||action==='tab-join'){homeTab=action.slice(4);formError='';render();return;}
 if(action==='copy-code'){copy(state.code,'Код скопирован. Отправь друзьям!');return;}
 if(action==='copy-link'){const url=new URL('https://kittler777.github.io/peremena-quiz/');url.searchParams.set('room',state.code);copy(url.href,'Ссылка на комнату скопирована.');return;}
 if(action==='select'){selected=target.dataset.id;render();return;}
 if(action==='zoom-own'){zoom(state.image);return;}
 if(action==='ready'){mutate('ready',{ready:!me().ready});return;}
 if(action==='start'||action==='replay'){mutate(action);return;}
 if(action==='next'){mutate('next',{round:state.round,matchId:state.matchId});return;}
 if(action==='vote'){if(selected)mutate('vote',{round:state.round,matchId:state.matchId,cardId:selected});return;}
 if(action==='skip'){if(confirm('Пропустить раунд? Твоя картинка не попадёт в голосование.'))mutate('caption',{round:state.round,matchId:state.matchId,caption:''});return;}
 if(action==='leave'){if(confirm('Выйти из комнаты? Если ты ведущий, роль перейдёт другому игроку.'))mutate('leave');return;}
 if(action==='kick'){if(confirm('Удалить этого игрока из комнаты?'))mutate('kick',{playerId:target.dataset.id});}
});
// Failed images have a visible recovery action without hiding the caption.
app.addEventListener('error',e=>{if(e.target.tagName!=='IMG')return;const parent=e.target.parentElement;if(parent.querySelector('.image-broken'))return;const text=document.createElement('span');text.className='image-broken';text.textContent='Картинка не загрузилась. Проверь связь и обнови страницу: вход и черновик сохранятся.';parent.append(text);},true);
$('rules-open').onclick=()=>$('rules').showModal();$('rules-close').onclick=()=>$('rules').close();
for(const dialog of document.querySelectorAll('dialog'))dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
window.addEventListener('online',()=>{if(session)poll();});document.addEventListener('visibilitychange',()=>{if(!document.hidden&&session)poll();});
setInterval(updateClock,250);
if(session){app.innerHTML='<p class="loading">Возвращаемся в комнату…</p>';poll();}else render();
