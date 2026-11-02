(()=>{
'use strict';
const $=s=>document.querySelector(s);
const d=iso=>new Date(iso+'T12:00:00Z');
const iso=date=>date.toISOString().slice(0,10);
const weekdays=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
let events=[],month='',chosen='',source='';
const eventType=e=>/экзамен/i.test(e.kind)?'Экзамен':/зач[её]т/i.test(e.kind)?'Зачёт':'Консультация';
const fmt=day=>new Intl.DateTimeFormat('ru-RU',{timeZone:'UTC',day:'numeric',month:'long',year:'numeric'}).format(d(day));
const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e};
function setData(next){if(!next||!Array.isArray(next.exams))return;events=next.exams.filter(e=>/^\d{4}-\d\d-\d\d$/.test(e.date||'')).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));source=next.source_updated||'';if(!month){const upcoming=events.find(e=>e.date>=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Saratov',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()));month=(upcoming||events[events.length-1])?.date.slice(0,7)||new Date().toISOString().slice(0,7)}render()}
function calendar(){
 const [year,mo]=month.split('-').map(Number),start=new Date(Date.UTC(year,mo-1,1,12)),days=new Date(Date.UTC(year,mo,0)).getUTCDate(),offset=(start.getUTCDay()+6)%7;
 const title=new Intl.DateTimeFormat('ru-RU',{timeZone:'UTC',month:'long',year:'numeric'}).format(start);
 $('#sessionMonth').textContent=title.charAt(0).toUpperCase()+title.slice(1);
 const root=$('#sessionCalendar');root.replaceChildren();
 weekdays.forEach(w=>root.append(node('span',w,'session-dayname')));
 for(let i=0;i<offset;i++)root.append(node('span',undefined,'session-blank'));
 for(let i=1;i<=days;i++){
  const date=month+'-'+String(i).padStart(2,'0'),group=events.filter(e=>e.date===date);
  const button=node('button',String(i),'session-day'+(group.some(e=>eventType(e)!=='Консультация')?' has-exam':'')+(group.length&&!group.some(e=>eventType(e)!=='Консультация')?' has-consult':'')+(chosen===date?' picked':''));
  button.type='button';button.setAttribute('aria-label',fmt(date)+', '+group.length+' событий');button.setAttribute('aria-pressed',String(chosen===date));
  if(group.length){const dots=node('span',undefined,'session-dots');for(const e of group.slice(0,3))dots.append(node('i',undefined,eventType(e)==='Консультация'?'consult':''));button.append(dots)}
  button.onclick=()=>{chosen=chosen===date?'':date;render()};root.append(button);
 }
}
function details(){
 const filtered=events.filter(e=>!chosen||e.date===chosen);
 const box=$('#sessionEvents');box.replaceChildren();
 $('#sessionEventsTitle').textContent=chosen?'События за '+fmt(chosen):'Все экзамены и зачёты';
 if(!filtered.length){box.append(node('p',chosen?'На эту дату событий нет.':'Сессия пока не опубликована.','session-empty'));return}
 for(const e of filtered){
  const card=node('article',undefined,'session-event');
  const top=node('div',undefined,'session-event-top');
  top.append(node('strong',e.title),node('span',eventType(e),'session-type'+(eventType(e)==='Консультация'?' consult':'')));
  const dateLine=node('div',fmt(e.date)+(e.time?' · '+e.time:''),'session-event-date');
  const teacher=node('p',e.teacher?'Преподаватель: '+e.teacher:'','session-meta');
  const room=node('p',e.location?'Место: '+e.location:'','session-meta');
  card.append(top,dateLine);
  if(e.teacher)card.append(teacher);
  if(e.location)card.append(room);
  const past=e.date<new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Saratov'});
  if(past)card.append(node('small','Дата прошла · остаётся в календаре','session-past'));
  box.append(card);
 }
}
function render(){if(!$('#sessionCalendar'))return;calendar();details();$('#sessionCount').textContent=events.length+' событий · источник СГУ '+(source||'');}
async function sync(){try{const r=await fetch('./data/schedule.json?session='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error('http');const payload=await r.json();if(payload.group==='111')setData(payload)}catch{}}
function init(){
 if(!$('#sessionCalendar'))return;
 try{setData(JSON.parse($('#initialData').textContent))}catch{}
 $('#sessionPrev').onclick=()=>{const [y,m]=month.split('-').map(Number);month=new Date(Date.UTC(y,m-2,1,12)).toISOString().slice(0,7);chosen='';render()};
 $('#sessionNext').onclick=()=>{const [y,m]=month.split('-').map(Number);month=new Date(Date.UTC(y,m,1,12)).toISOString().slice(0,7);chosen='';render()};
 $('#sessionAll').onclick=()=>{chosen='';render()};
 window.addEventListener('session:open',sync);
 window.addEventListener('focus',()=>{if($('#exams').style.display!=='none')sync()});
 setInterval(()=>{if($('#exams').style.display!=='none')sync()},300000);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();