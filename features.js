(()=>{
'use strict';
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const key='sgu111-alerts-v1';
let prefs;try{prefs=JSON.parse(localStorage.getItem(key))||{}}catch{prefs={}}
let data=null,opened=false;
const save=()=>{try{localStorage.setItem(key,JSON.stringify(prefs))}catch{}};
const clock=()=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Saratov',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(x=>[x.type,x.value]));return{date:p.year+'-'+p.month+'-'+p.day,sec:+p.hour*3600 + +p.minute*60 + +p.second}};
const secs=t=>{const [h,m]=String(t).split(':').map(Number);return h*3600+m*60};
const remaining=s=>{s=Math.max(0,Math.floor(s));return [Math.floor(s/3600),Math.floor(s%3600/60),s%60].map(x=>String(x).padStart(2,'0')).join(':')};
const week=date=>{
 const d=new Date(date+'T12:00:00Z');
 d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));
 const start=d.toISOString().slice(0,10);
 const explicit=(data?.week_calendar||[]).find(x=>x.start===start);
 if(explicit)return explicit.type;
 const diff=Math.round((Date.parse(start)-Date.parse('2026-08-31'))/604800000);
 return ((diff%2)+2)%2===0?'numerator':'denominator';
};
const group=()=>$('#group')?.value||'all';
const relevant=e=>group()==='all'||!e.groups?.length||e.groups.includes(Number(group()));
const events=()=>Array.isArray(data?.history)?data.history.filter(relevant):[];
const seen=()=>new Set(Array.isArray(prefs.seen)?prefs.seen:[]);
function timer(){
 if(!data)return;
 const now=clock(),baseDate=new Date(now.date+'T12:00:00Z');
 const todayDay=(baseDate.getUTCDay()+6)%7;
 const applicable=(l,day,parity)=>l.day===day&&(l.week==='both'||l.week===parity)&&relevant(l)&&l.start&&l.end;
 const todayLessons=data.lessons.filter(l=>applicable(l,todayDay,week(now.date)));
 const current=todayLessons.find(l=>secs(l.start)<=now.sec&&now.sec<secs(l.end));
 let upcoming=null;
 for(let offset=0;offset<21&&!upcoming;offset++){
  const date=new Date(baseDate.getTime()+offset*86400000);
  const iso=date.toISOString().slice(0,10),day=(date.getUTCDay()+6)%7,parity=week(iso);
  const list=data.lessons.filter(l=>applicable(l,day,parity)).sort((a,b)=>secs(a.start)-secs(b.start));
  const lesson=list.find(l=>offset>0||secs(l.start)>now.sec);
  if(lesson)upcoming={lesson,iso,offset,seconds:offset*86400+secs(lesson.start)-now.sec};
 }
 const label=$('#liveLabel'),value=$('#liveValue'),info=$('#liveInfo');
 const subject=$('#nextSubject'),nextLabel=$('#nextLabel'),nextInfo=$('#nextInfo'),bar=$('#liveBar');
 if(!label||!value||!info||!subject||!nextLabel||!nextInfo)return;
 if(bar)bar.hidden=true;
 label.textContent='До следующей пары';
 if(!upcoming){
  value.textContent='—';value.setAttribute('aria-label','Нет занятий в ближайшие три недели');
  info.textContent='По времени Саратова';nextLabel.textContent='Расписание';
  subject.textContent='Пока занятий нет';
  nextInfo.textContent='В ближайшие 3 недели · '+(group()==='all'?'все подгруппы':group()+'-я подгруппа');
  return;
 }
 const l=upcoming.lesson,all=Math.max(0,Math.floor(upcoming.seconds));
 const d=Math.floor(all/86400),h=Math.floor(all%86400/3600),m=Math.floor(all%3600/60),second=all%60;
 const timerText=[h,m,second].map(x=>String(x).padStart(2,'0')).join(':');
 value.textContent=(d?d+' дн.  ':'')+timerText;
 value.setAttribute('aria-label',(d?d+' дней, ':'')+h+' часов, '+m+' минут, '+second+' секунд до следующей пары');
 const prior=(!current&&upcoming.offset===0)
   ?todayLessons.filter(x=>secs(x.end)<=now.sec&&secs(x.end)<secs(l.start))
      .sort((a,b)=>secs(b.end)-secs(a.end))[0]
   :null;
 const onBreak=!!prior;
 if(onBreak){
   label.textContent='☕ Перерыв · до следующей пары';
   info.textContent='Перерыв '+prior.end+'–'+l.start+' · время Саратова';
   if(bar){
     bar.hidden=false;
     const duration=secs(l.start)-secs(prior.end);
     bar.firstElementChild.style.width=Math.max(0,Math.min(100,(now.sec-secs(prior.end))/duration*100)).toFixed(1)+'%';
   }
 }else{
   info.textContent=current?'Сейчас идёт: '+current.title+' · до '+current.end:'Время Саратова (UTC+4)';
 }
 nextLabel.textContent='Следующее занятие';subject.textContent=l.title;
 const dateText=upcoming.offset===0?'Сегодня':upcoming.offset===1?'Завтра':new Intl.DateTimeFormat('ru-RU',{timeZone:'UTC',weekday:'short',day:'numeric',month:'short'}).format(new Date(upcoming.iso+'T12:00:00Z'));
 nextInfo.textContent=[dateText+' в '+l.start,l.location,l.groups?.length?l.groups.join(' и ')+' подгруппа':null].filter(Boolean).join(' · ');
}
function paint(){const list=events(),ids=seen(),unread=list.filter(e=>!ids.has(e.id));const badge=$('#alertBadge');badge.hidden=!unread.length;badge.textContent=unread.length>99?'99+':unread.length;
$('#alertSummary').textContent=list.length+' записей · '+unread.length+' непрочитанных';
$('#alertList').innerHTML=list.length?list.slice(0,80).map(e=>'<article class="alert-item '+(ids.has(e.id)?'':'unread')+'"><div><b>'+esc(e.label||'Изменение')+'</b><time>'+esc(e.at?new Date(e.at).toLocaleString('ru-RU',{timeZone:'Europe/Saratov',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'')+'</time></div><small>'+esc((Number.isInteger(e.day)?['Пн','Вт','Ср','Чт','Пт','Сб'][e.day]+' · ':'')+(e.time||'')+(e.groups?.length?' · '+e.groups.join(', ')+' подгр.':''))+'</small>'+(e.before?'<p>Было: '+esc(e.before)+'</p>':'')+(e.after?'<p><strong>Стало: '+esc(e.after)+'</strong></p>':'')+'</article>').join(''):'<p class="alert-empty">Изменений пока нет. История заполняется при обновлении расписания СГУ.</p>'}
function open(){opened=true;$('#alertsPanel').hidden=false;$('#alertButton').setAttribute('aria-expanded','true');prefs.seen=[...new Set([...(prefs.seen||[]),...events().map(e=>e.id)])].slice(-400);save();paint()}
function close(){opened=false;$('#alertsPanel').hidden=true;$('#alertButton').setAttribute('aria-expanded','false')}
function accept(next){if(next?.group!=='111'||!Array.isArray(next.lessons)||next.lessons.length<5)return;data=next;const ids=(next.history||[]).map(x=>x.id),old=Array.isArray(prefs.known)?new Set(prefs.known):null;const fresh=old?events().filter(x=>!old.has(x.id)):[];prefs.known=ids.slice(0,400);save();if(fresh.length){$('#alertToast').hidden=false;$('#alertToastText').textContent='Изменений расписания: '+fresh.length;if(prefs.notify&&'Notification'in window&&Notification.permission==='granted'){try{new Notification('СГУ — изменения расписания',{body:fresh.length+' новых изменений',tag:'sgu111-alerts',icon:'./icon.svg'})}catch{}}}paint();timer();renderFreshness()}
let lastReachable=false;
let lastSiteCheck=null;
const formatAt=iso=>{
 if(!iso)return 'нет подтверждённой проверки';
 const date=new Date(iso);
 return Number.isNaN(date.getTime())?'нет подтверждённой проверки':
 new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Saratov',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(date)+' (Саратов)';
};
function renderFreshness(){
 const chip=$('#freshnessBadge'),title=$('#freshnessTitle'),details=$('#freshnessDetails');
 if(!chip||!title||!details)return;
 const checked=data?.checked_at||data?.fetched_at;
 const valid=checked&&!Number.isNaN(Date.parse(checked));
 const age=valid?(Date.now()-Date.parse(checked))/3600000:Infinity;
 const stale=!valid||age>6;
 const offline=!navigator.onLine||!lastReachable;
 const state=offline?'Офлайн':stale?'Данные могут устареть':'Онлайн';
 chip.textContent=(offline?'● ':stale?'● ':'● ')+state;
 chip.className='freshness-badge '+(offline?'offline':stale?'stale':'online');
 title.textContent='Проверено СГУ: '+formatAt(checked);
 details.textContent='СГУ изменил расписание: '+(data?.source_updated||'дата не указана')+
  ' · Сайт проверил файл: '+(lastSiteCheck?new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Saratov',hour:'2-digit',minute:'2-digit'}).format(lastSiteCheck):'нет соединения');
 chip.title=offline?'Нет доступа к опубликованным данным. Используется сохранённое расписание.':
  stale?'Последняя успешная проверка СГУ была больше 6 часов назад.':
  'Опубликованные данные доступны. Это не постоянное соединение с СГУ.';
}
async function load(){
 try{
  const r=await fetch('./data/schedule.json?t='+Date.now(),{cache:'no-store'});
  if(!r.ok)throw Error('HTTP '+r.status);
  const payload=await r.json();
  if(payload?.group!=='111'||!Array.isArray(payload.lessons)||payload.lessons.length<5)throw Error('Неверные данные');
  lastReachable=true;lastSiteCheck=new Date();accept(payload);
 }catch{lastReachable=false}
 renderFreshness();
}
function init(){if(!$('.next-card')||!$('.nav'))return;const style=document.createElement('style');style.textContent='.live-box{margin-top:13px;padding-top:12px;border-top:1px solid #ffffff35}.live-header{display:flex;align-items:center;justify-content:space-between;gap:10px;color:#fff;font-size:12px}.live-header strong{font-size:19px;font-variant-numeric:tabular-nums}.live-info{font-size:11px;color:#c7d7ee;margin-top:5px}.live-track{margin-top:9px;height:7px;background:#ffffff30;border-radius:10px;overflow:hidden}.live-track span{display:block;height:100%;background:#77edc7;border-radius:10px}.alert-button{position:relative}.alert-badge{position:absolute;right:-4px;top:-5px;background:#e75455;color:white;font-size:10px;border-radius:100px;padding:2px 5px}.alerts-panel{margin:14px 0;background:var(--paper);border:1px solid var(--stroke);border-radius:17px;padding:17px}.alerts-panel[hidden],.alert-toast[hidden]{display:none!important}.alerts-head{display:flex;justify-content:space-between;align-items:start;gap:12px}.alerts-head h2{margin:0;font-size:17px}.alerts-head p{font-size:11px;color:var(--soft);margin:5px 0}.alerts-panel button{border:1px solid var(--stroke);background:var(--bg);color:var(--ink);padding:9px 12px;border-radius:10px;cursor:pointer}.alerts-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:12px 0}.alerts-actions small{color:var(--soft)}.alert-list{display:grid;gap:9px;max-height:430px;overflow:auto}.alert-item{padding:12px;border:1px solid var(--stroke);border-radius:12px;font-size:12px;overflow-wrap:anywhere}.alert-item.unread{background:var(--primary-pale);border-color:var(--primary)}.alert-item div{display:flex;justify-content:space-between;gap:12px}.alert-item time,.alert-item small{color:var(--soft);font-size:10px}.alert-item p{margin:5px 0}.alert-empty{font-size:12px;color:var(--soft)}.alert-toast{position:fixed;bottom:20px;right:20px;z-index:30;padding:14px;background:var(--paper);border:1px solid var(--primary);color:var(--ink);box-shadow:0 12px 36px #101b3444;border-radius:13px}.alert-toast button{margin-left:12px;cursor:pointer}@media(max-width:650px){.alerts-panel{padding:12px}.alert-toast{left:12px;right:12px}}';document.head.append(style);
const timerStyle=document.createElement('style');timerStyle.textContent="\n.overview{grid-template-columns:minmax(0,.76fr) minmax(0,1.35fr);align-items:stretch;gap:18px}\n.overview-left{display:flex;flex-direction:column;justify-content:center}\n.next-card{display:flex;flex-direction:column;justify-content:center;min-width:0;padding:22px 25px;background:linear-gradient(120deg,#ffffff18,#ffffff0d);border:1px solid #ffffff40}\n.live-box{order:-1;margin:0 0 19px!important;padding:0 0 17px!important;border-top:0!important;border-bottom:1px solid #ffffff30}\n.live-header{display:flex!important;flex-direction:column;align-items:flex-start!important;gap:6px!important}\n.live-header span{font-size:12px;font-weight:780;color:#bed4fb;letter-spacing:.02em}\n.live-header strong{display:block;width:100%;font-size:clamp(39px,5.8vw,66px)!important;line-height:1.05!important;font-weight:850;letter-spacing:-.07em;white-space:nowrap;font-variant-numeric:tabular-nums;color:#fff}\n.live-info{font-size:12px!important;line-height:1.5;color:#cbdafa!important;margin-top:10px!important;overflow-wrap:anywhere}\n.next-label{font-weight:800;font-size:11px;color:#bed4fb}\n.next-card h2{font-size:clamp(17px,2.2vw,22px)!important;margin:6px 0!important}\n.next-details{font-size:12px!important;color:#d4e2fd!important}\n@media(max-width:900px){.overview{grid-template-columns:minmax(0,.7fr) minmax(0,1fr)}.live-header strong{font-size:clamp(36px,5vw,56px)!important}}\n@media(max-width:650px){.overview{grid-template-columns:1fr;gap:12px;padding:14px;border-radius:18px}.next-card{order:-1;padding:20px 18px;border-radius:15px}.overview-left{order:1;padding:4px 8px 8px}.overview h1{font-size:20px}.overview-sub{font-size:11px}.live-header strong{font-size:clamp(37px,10.5vw,56px)!important}.live-box{margin-bottom:13px!important;padding-bottom:13px!important}.next-details{font-size:11px!important}}\n@media(max-width:350px){.next-card{padding:17px 12px}.live-header strong{font-size:34px!important}}\n";document.head.append(timerStyle);
const freshnessStyle=document.createElement('style');
freshnessStyle.textContent=".freshness-strip{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 16px;margin:12px 0 0;border:1px solid var(--stroke);border-radius:13px;background:var(--paper);color:var(--ink)}.freshness-badge{font-size:12px;font-weight:800;padding:6px 10px;border-radius:9px;white-space:nowrap}.freshness-badge.online{background:#e5f7ef;color:#126c50}.freshness-badge.offline{background:#f1f3f6;color:#65758e}.freshness-badge.stale{background:#fff0d5;color:#936323}.freshness-data{display:flex;flex-direction:column;gap:2px;min-width:0}.freshness-data strong{font-size:12px;line-height:1.45}.freshness-data small{font-size:11px;color:var(--soft);line-height:1.5}@media(max-width:650px){.freshness-strip{padding:11px 12px;gap:8px}}";
document.head.append(freshnessStyle);
$('.overview').insertAdjacentHTML('afterend','<div class="freshness-strip" role="status" aria-live="off"><span class="freshness-badge offline" id="freshnessBadge">● Проверяем…</span><div class="freshness-data"><strong id="freshnessTitle">Последняя проверка СГУ: неизвестна</strong><small id="freshnessDetails">Подключаемся к опубликованному расписанию…</small></div></div>');
window.addEventListener('online',renderFreshness);
window.addEventListener('offline',renderFreshness);
setInterval(renderFreshness,60000);
$('.next-card').insertAdjacentHTML('beforeend','<div class="live-box"><div class="live-header"><span id="liveLabel">До следующей пары</span><strong id="liveValue" role="timer" aria-label="До начала ближайшего занятия">—</strong></div><div id="liveInfo" class="live-info">Время Саратова</div><div class="live-track" id="liveBar" hidden><span></span></div></div>');
const b=document.createElement('button');b.id='alertButton';b.type='button';b.className='icon-btn alert-button';b.title='Изменения расписания';b.setAttribute('aria-expanded','false');b.innerHTML='🔔<span class="alert-badge" id="alertBadge" hidden></span>';$('.nav').insertBefore(b,$('#theme'));
const panel=document.createElement('section');panel.className='alerts-panel';panel.id='alertsPanel';panel.hidden=true;panel.innerHTML='<div class="alerts-head"><div><h2>История изменений</h2><p id="alertSummary">Проверка…</p></div><button id="alertsClose" type="button" aria-label="Закрыть">✕</button></div><div class="alerts-actions"><button id="alertsPermission" type="button">Включить уведомления</button><small>Оповещения работают при открытом сайте. При закрытом сайте push-сервис не настроен.</small></div><div id="alertList" class="alert-list"></div>';$('#notice').after(panel);
const toast=document.createElement('div');toast.className='alert-toast';toast.id='alertToast';toast.hidden=true;toast.innerHTML='<span id="alertToastText"></span><button id="alertToastOpen">Посмотреть</button>';document.body.append(toast);
b.onclick=()=>opened?close():open();$('#alertsClose').onclick=close;$('#alertToastOpen').onclick=()=>{$('#alertToast').hidden=true;open()};$('#group').addEventListener('change',()=>{timer();paint()});
const permission=$('#alertsPermission');function label(){permission.textContent=prefs.notify?'Отключить уведомления':'Включить уведомления';if(!('Notification'in window)||!window.isSecureContext||Notification.permission==='denied'){permission.disabled=true;permission.textContent='Недоступно в браузере'}}permission.onclick=async()=>{if(prefs.notify)prefs.notify=false;else if('Notification'in window){try{prefs.notify=await Notification.requestPermission()==='granted'}catch{prefs.notify=false}}save();label()};label();
try{accept(JSON.parse($('#initialData').textContent))}catch{}load();setInterval(timer,1000);setInterval(load,90000);window.addEventListener('focus',load);document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();