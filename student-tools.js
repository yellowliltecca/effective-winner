(()=>{
'use strict';
const $=s=>document.querySelector(s);
const read=(k,f)=>{try{return JSON.parse(localStorage.getItem(k))??f}catch{return f}};
const save=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));return true}catch{return false}};
const num=(v,def)=>Number.isFinite(+v)?Math.max(0,Math.min(180,Math.round(+v))):def;
const prefKey='sgu111-commute-v1',hwKey='sgu111-homework-v1';
let pref=read(prefKey,{travel:30,buffer:10}),tasks=read(hwKey,[]),data;
if(!Array.isArray(tasks))tasks=[];
try{data=JSON.parse($('#initialData').textContent)}catch{data={lessons:[],week_calendar:[]}}
const weekdays=['Понедельник','Вторник','Среда','Четверг','Пятница','Суббота','Воскресенье'];
const dUTC=s=>new Date(s+'T12:00:00Z');
const add=(s,n)=>new Date(dUTC(s).getTime()+n*86400000).toISOString().slice(0,10);
const day=s=>(dUTC(s).getUTCDay()+6)%7;
const dateLabel=s=>new Intl.DateTimeFormat('ru-RU',{timeZone:'UTC',day:'numeric',month:'long'}).format(dUTC(s));
const clock=()=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Saratov',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(v=>[v.type,v.value]));return{iso:p.year+'-'+p.month+'-'+p.day,sec:+p.hour*3600 + +p.minute*60 + +p.second}};
const seconds=s=>{const [h,m]=String(s).split(':').map(Number);return h*3600+m*60};
const count=s=>{const a=Math.max(0,Math.floor(s)),d=Math.floor(a/86400),h=Math.floor(a%86400/3600),m=Math.floor(a%3600/60),sec=a%60;return(d?d+' дн. ':'')+[h,m,sec].map(n=>String(n).padStart(2,'0')).join(':')};
const parity=s=>{const monday=add(s,-day(s)),explicit=(data.week_calendar||[]).find(w=>w.start===monday);if(explicit)return explicit.type;const n=Math.round((Date.parse(monday)-Date.parse('2026-08-31'))/604800000);return((n%2+2)%2===0)?'numerator':'denominator'};
const group=()=>$('#group')?.value||'all';
const lessons=s=>(data.lessons||[]).filter(l=>l.day===day(s)&&(l.week==='both'||l.week===parity(s))&&(group()==='all'||!l.groups?.length||l.groups.includes(+group()))).sort((a,b)=>String(a.start).localeCompare(String(b.start)));
const element=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e};
function nextClass(){const now=clock();for(let i=0;i<21;i++){const iso=add(now.iso,i),l=lessons(iso).find(l=>i>0||seconds(l.start)>now.sec);if(l)return{iso,l,until:i*86400+seconds(l.start)-now.sec}}return null}
function subjects(){const box=$('#hwSubject'),current=box.value,values=[...new Set([...(data.lessons||[]).map(l=>l.title),...tasks.map(t=>t.subject)].filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));box.replaceChildren();for(const x of values){const opt=element('option',x);opt.value=x;box.append(opt)}if(values.includes(current))box.value=current}
function renderTasks(){const box=$('#hwList');box.replaceChildren();$('#hwCount').textContent=tasks.filter(t=>!t.done).length+' невыполненных';
if(!tasks.length){box.append(element('p','Пока нет заданий.','student-sub'));return}
for(const t of [...tasks].sort((a,b)=>Number(a.done)-Number(b.done)||(a.due||'9999').localeCompare(b.due||'9999'))){
 const row=element('div',undefined,'student-task'+(t.done?' finished':'')),check=element('input');check.type='checkbox';check.checked=!!t.done;check.setAttribute('aria-label','Выполнено: '+t.subject);
 check.onchange=()=>{t.done=check.checked;save(hwKey,tasks);renderTasks()};
 const body=element('div',undefined,'task-body');body.append(element('b',t.subject),element('div',t.text),element('small',t.due?'Срок: '+dateLabel(t.due):'Без срока'));
 const remove=element('button','×');remove.type='button';remove.title='Удалить задание';remove.onclick=()=>{tasks=tasks.filter(x=>x.id!==t.id);save(hwKey,tasks);renderTasks()};
 row.append(check,body,remove);box.append(row);
}}
function lessonButtons(){$('#content')?.querySelectorAll('.lesson').forEach(card=>{if(card.querySelector('.hw-inline'))return;const heading=card.querySelector('.lesson-info h3'),target=card.querySelector('.lesson-info');if(!heading||!target)return;const button=element('button','＋ ДЗ','student-btn hw-inline');button.type='button';button.onclick=()=>{$('#hwSubject').value=heading.textContent.trim();$('#hwText').focus();$('#homework').scrollIntoView({behavior:'smooth',block:'center'})};target.append(button)})}
function offline(){
if(!('serviceWorker'in navigator)||location.protocol!=='https:')return;
navigator.serviceWorker.register('./sw.js',{scope:'./'}).then(async reg=>{await navigator.serviceWorker.ready;(reg.active||reg.waiting)?.postMessage({type:'CACHE_CORE'})}).catch(()=>{});
}
async function sync(){try{const r=await fetch('./data/schedule.json?tools='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error('fetch');const x=await r.json();if(x.group==='111'&&x.lessons?.length>=5){data=x;subjects()}}catch{}}
function init(){
if(!$('.overview')||!$('#classes')||!$('#initialData'))return;
const css='.student-card,.homework-card{border:1px solid var(--stroke);background:var(--paper);border-radius:18px;padding:18px 20px;min-width:0}.student-card h2,.homework-card h2{font-size:16px;margin:0 0 10px}.student-sub{font-size:12px;color:var(--soft);line-height:1.5}.student-value{font-size:clamp(24px,3vw,34px);font-weight:850;letter-spacing:-.035em;line-height:1.25;margin:8px 0;font-variant-numeric:tabular-nums}.student-lesson{font-size:12px;line-height:1.5;margin-top:7px;overflow-wrap:anywhere}.student-controls{display:flex;gap:9px;flex-wrap:wrap;align-items:center;margin-top:12px}.student-controls label{font-size:11px;color:var(--soft)}.student-controls input{width:62px;margin:0 5px;border:1px solid var(--stroke);border-radius:8px;padding:7px;background:var(--bg);color:var(--ink)}.student-btn{background:var(--primary-pale);color:var(--primary);border:1px solid var(--stroke);border-radius:9px;padding:8px 11px;font-size:12px;font-weight:750;cursor:pointer}.student-btn:hover{border-color:var(--primary)}.student-notice{font-size:12px;color:var(--primary);margin:5px 0 12px}.homework-card{margin:20px 0}.homework-form{display:grid;grid-template-columns:1.2fr 1.6fr 140px auto;gap:9px;align-items:end}.homework-form label{font-size:11px;color:var(--soft);display:grid;gap:5px;min-width:0}.homework-form select,.homework-form input{width:100%;min-width:0;padding:10px;border:1px solid var(--stroke);border-radius:9px;background:var(--bg);color:var(--ink)}.homework-form button{background:var(--primary);color:white;border:0;border-radius:9px;padding:11px;font-weight:760}.student-task{display:flex;align-items:start;gap:10px;border:1px solid var(--stroke);border-radius:10px;padding:11px;margin-top:9px;font-size:13px}.student-task input{accent-color:var(--primary);margin-top:4px}.student-task .task-body{flex:1;overflow-wrap:anywhere;min-width:0}.student-task .task-body b{display:block}.student-task .task-body small{display:block;font-size:11px;color:var(--soft)}.student-task.finished .task-body{text-decoration:line-through;opacity:.6}.student-task button{border:0;background:none;color:var(--soft);font-size:21px;cursor:pointer}.hw-inline{margin-top:8px;padding:5px 8px;font-size:11px}@media(max-width:800px){.student-grid{grid-template-columns:1fr}.homework-form{grid-template-columns:1fr 1fr}.homework-form label:nth-child(2){grid-column:1/-1;grid-row:2}.homework-form label:nth-child(3){grid-column:1;grid-row:3}.homework-form button{grid-column:2;grid-row:3}}@media(max-width:500px){.student-card,.homework-card{padding:14px}.student-value{font-size:27px}.homework-form label:first-child{grid-column:1/-1}}';
const style=element('style',css);document.head.append(style);
const homework=element('section');homework.id='homework';homework.className='homework-card';homework.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><h2>📝 Домашние задания</h2><span id="hwCount" class="student-sub"></span></div><p class="student-sub">Хранятся только на этом устройстве, без синхронизации.</p><form class="homework-form" id="hwForm"><label>Предмет<select id="hwSubject" required></select></label><label>Что нужно сделать<input id="hwText" required maxlength="500" placeholder="Домашнее задание"></label><label>Срок<input type="date" id="hwDue"></label><button type="submit">Добавить</button></form><div class="student-sub" role="status" id="hwNotice"></div><div id="hwList"></div>';
$('#classes').after(homework);
$('#hwForm').onsubmit=e=>{e.preventDefault();const subject=$('#hwSubject').value,text=$('#hwText').value.trim(),due=$('#hwDue').value;if(!subject||!text)return;tasks.push({id:Date.now()+'-'+Math.random().toString(36).slice(2),subject,text,due,done:false});if(!save(hwKey,tasks))$('#hwNotice').textContent='Не удалось сохранить ДЗ: проверь хранилище браузера';$('#hwText').value='';renderTasks()};
const content=$('#content');if(content){new MutationObserver(lessonButtons).observe(content,{childList:true,subtree:true});lessonButtons()}
subjects();renderTasks();offline();sync();
setInterval(sync,300000);window.addEventListener('focus',sync);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();