(()=>{
'use strict';
const $=s=>document.querySelector(s);
const d=iso=>new Date(iso+'T12:00:00Z');
const iso=date=>date.toISOString().slice(0,10);
const saratovDate=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Saratov',year:'numeric',month:'2-digit',day:'2-digit'});
const today=()=>saratovDate.format(new Date());
const weekdays=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
let events=[],month='',chosen='',source='';
const eventType=e=>/экзамен/i.test(e.kind)?'Экзамен':/зач[её]т/i.test(e.kind)?'Зачёт':'Консультация';
const eventStyles={
 'Экзамен':{name:'exam-date',short:'Экз.'},
 'Зачёт':{name:'credit',short:'Зач.'},
 'Консультация':{name:'consult',short:'Конс.'}
};
const fmt=day=>new Intl.DateTimeFormat('ru-RU',{timeZone:'UTC',day:'numeric',month:'long',year:'numeric'}).format(d(day));
const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e};
function setData(next){if(!next||!Array.isArray(next.exams))return;events=next.exams.filter(e=>/^\d{4}-\d\d-\d\d$/.test(e.date||'')).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));source=next.source_updated||'';if(!month)month=today().slice(0,7);render()}
function calendar(){
 const current=today();
 const [year,mo]=month.split('-').map(Number),start=new Date(Date.UTC(year,mo-1,1,12)),days=new Date(Date.UTC(year,mo,0)).getUTCDate(),offset=(start.getUTCDay()+6)%7;
 const title=new Intl.DateTimeFormat('ru-RU',{timeZone:'UTC',month:'long',year:'numeric'}).format(start);
 $('#sessionMonth').textContent=title.charAt(0).toUpperCase()+title.slice(1);
 const root=$('#sessionCalendar');root.replaceChildren();
 weekdays.forEach(w=>root.append(node('span',w,'session-dayname')));
 for(let i=0;i<offset;i++)root.append(node('span',undefined,'session-blank'));
 for(let i=1;i<=days;i++){
  const date=month+'-'+String(i).padStart(2,'0'),group=events.filter(e=>e.date===date);
  const types=Object.keys(eventStyles).filter(type=>group.some(e=>eventType(e)===type));
  const button=node('button',String(i),'session-day'+(chosen===date?' picked':''));
  if(date===current){
   button.setAttribute('aria-current','date');
   button.append(node('span','Сегодня','today-caption'));
  }
  button.type='button';
  button.setAttribute('aria-label',[fmt(date),...(date===current?['сегодня']:[]),...types].join(', '));
  button.setAttribute('aria-pressed',String(chosen===date));
  if(types.length){
   button.classList.add('event-date',eventStyles[types[0]].name);
   for(const type of types){
    const style=eventStyles[type];
    button.append(node('span',style.short,'date-label '+style.name));
   }
  }
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
  top.append(node('strong',e.title),node('span',eventType(e),'session-type '+eventStyles[eventType(e)].name));
  const dateLine=node('div',fmt(e.date)+(e.time?' · '+e.time:''),'session-event-date');
  const teacher=node('p',e.teacher?'Преподаватель: '+e.teacher:'','session-meta');
  const room=node('p',e.location?'Место: '+e.location:'','session-meta');
  card.append(top,dateLine);
  if(e.teacher)card.append(teacher);
  if(e.location)card.append(room);
  const past=e.date<today();
  if(past)card.append(node('small','Дата прошла · остаётся в календаре','session-past'));
  box.append(card);
 }
}
function nextAssessment(){
 const clock=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Saratov',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date());
 const date=today();
 const next=events.find(e=>/зач[её]т|экзамен/i.test(e.kind) && (e.date>date || (e.date===date && (!e.time || e.time>=clock))));
 const jump=$('#nextSessionEvent');
 const first=events.find(e=>e.date>date || (e.date===date && (!e.time || e.time>=clock)));
 const consult=$('#upcomingConsult');
 consult.hidden=!first || first===next;
 if(first && first!==next){
  consult.textContent=eventType(first)+' · '+fmt(first.date)+(first.time?' в '+first.time:'')+' →';
  consult.onclick=()=>{month=first.date.slice(0,7);chosen=first.date;render();$('#sessionCalendar .picked')?.focus({preventScroll:true});};
 }
 jump.hidden=!next;
 $('#sessionCountdownEmpty').hidden=!!next;
 if(!next)return;
 const days=Math.round((d(next.date)-d(date))/86400000);
 const forms={one:'день',few:'дня',many:'дней'};
 const countdown=days===0?'Сегодня':days===1?'Завтра':'Через '+days+' '+forms[new Intl.PluralRules('ru').select(days)];
 const heading=countdown+' · '+eventType(next);
 const summary=next.title+' · '+fmt(next.date)+(next.time?' в '+next.time:'');
 if(jump.dataset.summary!==heading+summary){
  jump.replaceChildren(node('strong',heading),node('span',summary));
  jump.dataset.summary=heading+summary;
 }
 jump.onclick=()=>{month=next.date.slice(0,7);chosen=next.date;render();$('#sessionCalendar .picked')?.focus({preventScroll:true});};
}
function render(){if(!$('#sessionCalendar'))return;calendar();details();nextAssessment();
 $('#sessionCount').textContent=events.length+' событий · источник СГУ '+(source||'');}
async function sync(){try{const r=await fetch('./data/schedule.json?session='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error('http');const payload=await r.json();if(payload.group==='111')setData(payload)}catch{}}
function init(){
 if(!$('#sessionCalendar'))return;
 const legend=node('div',undefined,'session-legend');
 for(const [type,style] of Object.entries(eventStyles))legend.append(node('span',type,'session-type '+style.name));
 const jump=node('button',undefined,'session-jump');jump.type='button';jump.id='nextSessionEvent';jump.hidden=true;
 const empty=node('p','Предстоящих зачётов и экзаменов в расписании пока нет.','session-meta');empty.id='sessionCountdownEmpty';empty.hidden=true;
 const consult=node('button',undefined,'consult-jump');consult.id='upcomingConsult';consult.type='button';consult.hidden=true;
 $('#sessionCalendar').before(jump,empty,consult,legend);
 setInterval(()=>{if(!document.hidden && $('#exams').style.display!=='none')nextAssessment()},15000);
 try{setData(JSON.parse($('#initialData').textContent))}catch{}
 $('#sessionPrev').onclick=()=>{const [y,m]=month.split('-').map(Number);month=new Date(Date.UTC(y,m-2,1,12)).toISOString().slice(0,7);chosen='';render()};
 $('#sessionNext').onclick=()=>{const [y,m]=month.split('-').map(Number);month=new Date(Date.UTC(y,m,1,12)).toISOString().slice(0,7);chosen='';render()};
 $('#sessionAll').onclick=()=>{chosen='';render()};
 let lastDate=today();
 function refreshDate(){
  const current=today();
  if(current===lastDate)return;
  if(!chosen && month===lastDate.slice(0,7))month=current.slice(0,7);
  lastDate=current;
  render();
 }
 setTimeout(function midnight(){
  refreshDate();
  const clock=new Date(Date.now()+4*3600000);
  const elapsed=((clock.getUTCHours()*60+clock.getUTCMinutes())*60+clock.getUTCSeconds())*1000+clock.getUTCMilliseconds();
  setTimeout(midnight,86400000-elapsed+30);
 },0);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshDate()});
 window.addEventListener('session:open',()=>{refreshDate();sync()});
 window.addEventListener('focus',()=>{if($('#exams').style.display!=='none')sync()});
 setInterval(()=>{if($('#exams').style.display!=='none')sync()},300000);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();