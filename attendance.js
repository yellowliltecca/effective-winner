(()=>{
'use strict';
const $=selector=>document.querySelector(selector);
const $all=selector=>[...document.querySelectorAll(selector)];
const STORE='sgu111-attendance-v1';
const VALID=new Set(['present','absent']);
const kinds={lecture:'Лекция',practice:'Практика',lab:'Лабораторная',other:'Другое'};
const dates=new Intl.DateTimeFormat('ru-RU',{timeZone:'UTC',day:'numeric',month:'short',year:'numeric'});
const dateTime=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Saratov',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const norm=value=>String(value||'').normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('ru-RU');
const isDate=d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d+'T12:00:00Z'));
const n=s=>{const m=/^(\d{2}):(\d{2})$/.exec(s||'');return m?(+m[1]*60 + +m[2]):NaN};
const formatDate=d=>dates.format(new Date(d+'T12:00:00Z'));
const keyOf=r=>JSON.stringify([r.date,r.start,r.kind,norm(r.title),[...(r.groups||[])].map(Number).sort().join(',')]);
let records=Object.create(null);
function validRecord(row){
 return row&&typeof row==='object'&&isDate(row.date)&&n(row.start)>=0&&
   typeof row.title==='string'&&row.title.length<=200&&
   ['lecture','practice','lab','other'].includes(row.kind)&&VALID.has(row.status)&&
   Array.isArray(row.groups)&&row.groups.length<=5&&row.groups.every(v=>Number.isInteger(v)&&v>=1&&v<=3)&&
   (!row.end||!Number.isNaN(n(row.end)));
}
function read(){
 try{
  const json=JSON.parse(localStorage.getItem(STORE)||'{}');
  const entries=json?.entries;
  if(!entries||typeof entries!=='object')return;
  for(const row of Object.values(entries).slice(0,4000)){
   if(!validRecord(row))continue;
   const clean={date:row.date,start:row.start,end:String(row.end||''),title:row.title,kind:row.kind,groups:row.groups,status:row.status,excused:row.status==='absent'&&row.excused===true,updated:String(row.updated||'')};
   records[keyOf(clean)]=clean;
  }
 }catch{records=Object.create(null)}
}
function persist(){
 try{localStorage.setItem(STORE,JSON.stringify({version:1,entries:records}));$('#attendanceMessage').textContent='Отметки сохранены на этом устройстве.';return true}
 catch{$('#attendanceMessage').textContent='Не удалось сохранить отметки. Проверь свободное место и настройки браузера.';return false}
}
function saratov(){
 const p=Object.fromEntries(dateTime.formatToParts(new Date()).map(x=>[x.type,x.value]));
 return {date:p.year+'-'+p.month+'-'+p.day,minute:(+p.hour)*60+(+p.minute)};
}
function eligible(r){
 const now=saratov();
 return r.date<now.date || (r.date===now.date && n(r.start)<=now.minute);
}
function formCard(card){
 const date=card.dataset.attDate,groups=card.dataset.attGroups?card.dataset.attGroups.split(',').map(Number):[];
 return{date,start:card.dataset.attTime,end:card.dataset.attEnd||'',title:card.dataset.attTitle||'',kind:card.dataset.attKind||'other',groups};
}
function el(tag,text,cls){
 const node=document.createElement(tag);
 if(text!==undefined)node.textContent=text;
 if(cls)node.className=cls;
 return node;
}
function action(text,status,selected,cb){
 const b=el('button',text,'att-choice'+(selected?' is-selected':''));
 b.type='button';b.dataset.status=status;b.setAttribute('aria-pressed',String(selected));b.onclick=cb;
 return b;
}
function change(r,status){
 if(!eligible(r))return;
 if(r.groups.length&&$('#group')?.value==='all'){
  $('#attendanceMessage').textContent='Сначала выбери свою подгруппу в расписании, чтобы не учитывать чужие пары.';
  return;
 }
 const id=keyOf(r);
 if(status===null)delete records[id];
 else records[id]={...r,status,excused:records[id]?.status==='absent'&&status==='absent'&&records[id]?.excused===true,updated:new Date().toISOString()};
 persist();refreshControls();renderReport();
}
function buildButtons(card){
 const r=formCard(card),id=keyOf(r),record=records[id],container=card.querySelector('.attendance-controls')||el('div',undefined,'attendance-controls');
 if(!container.parentNode)card.querySelector('.lesson-info')?.append(container);
 container.replaceChildren();
 if(!eligible(r)){
  container.append(el('span','Отметить можно после начала пары','att-hint'));
  return;
 }
 if(r.groups.length&&$('#group')?.value==='all'){
  container.append(el('span','Выбери подгруппу, чтобы отметить пару','att-hint'));
  return;
 }
 const label=el('span','Посещаемость:','att-hint');
 container.append(label);
 container.append(action('✓ Был','present',record?.status==='present',()=>change(r,'present')));
 container.append(action('— Пропустил','absent',record?.status==='absent',()=>change(r,'absent')));
 if(record)container.append(action('Сбросить','reset',false,()=>change(r,null)));
}
function refreshControls(){
 $all('#content .lesson[data-att-date]').forEach(card=>buildButtons(card));
}
function addControls(){
 $all('#content .lesson[data-att-date]').forEach(card=>{
  if(card.dataset.attReady==='yes')return;
  card.dataset.attReady='yes';
  buildButtons(card);
 });
}
const dateDiff=(from,to)=>Math.floor((Date.parse(from+'T12:00:00Z')-Date.parse(to+'T12:00:00Z'))/86400000);
function selectedRecords(){
 const filter=$('#attendancePeriod')?.value||'all';
 const kind=$('#attendanceKind')?.value||'all';
 const today=saratov().date;
 return Object.values(records).filter(r=>{
  if(kind!=='all'&&r.kind!==kind)return false;
  if(filter==='all')return true;
  return dateDiff(today,r.date)<Number(filter)&&dateDiff(today,r.date)>=0;
 }).sort((a,b)=>(b.date+b.start).localeCompare(a.date+a.start));
}
function makeStat(label,value,description){
 const box=el('article',undefined,'att-stat');
 box.append(el('div',label,'att-stat-label'),el('strong',String(value),'att-stat-value'),el('small',description||'','att-stat-note'));
 return box;
}
function summary(list){
 const total=list.length,present=list.filter(r=>r.status==='present').length,missed=total-present;
 const excused=list.filter(r=>r.status==='absent'&&r.excused).length;
 const percent=total?Math.round(present/total*100):null;
 const root=$('#attendanceStats');root.replaceChildren(
  makeStat('Отмечено',total,'пар и занятий'),
  makeStat('Посетил',present,'из отмеченных'),
  makeStat('Пропустил',missed,'из них уваж. '+excused),
  makeStat('Посещаемость',percent===null?'—':percent+'%','по отмеченным парам')
 );
 const bar=$('#attendanceProgress');bar.style.width=(percent??0)+'%';
 $('#attendanceProgressLabel').textContent=total?present+' из '+total+' отмеченных занятий посещено':'Отметь хотя бы одно занятие для статистики';
}
function groupSubjects(list){
 const subjects=new Map();
 for(const r of list){
  const key=norm(r.title);
  if(!subjects.has(key))subjects.set(key,{title:r.title,yes:0,no:0,lecture:0,practice:0,lab:0});
  const x=subjects.get(key);
  if(r.status==='present')x.yes++;else x.no++;
  x[r.kind]=(x[r.kind]||0)+1;
 }
 const root=$('#attendanceSubjects');root.replaceChildren();
 const sorted=[...subjects.values()].sort((a,b)=>b.no-a.no || a.title.localeCompare(b.title,'ru'));
 if(!sorted.length){root.append(el('div','Пока нет отметок для выбранного периода.','att-empty'));return}
 for(const x of sorted){
  const total=x.yes+x.no;
  const p=Math.round(x.yes/total*100);
  const card=el('div',undefined,'att-subject');
  const heading=el('div',undefined,'att-subject-heading');
  heading.append(el('strong',x.title),el('span',p+'%','att-subject-pct'));
  const desc=el('div','Посетил '+x.yes+' · Пропустил '+x.no+' · Лекций '+x.lecture+' · Практик '+x.practice+' · Лаб. '+x.lab,'att-subject-detail');
  const track=el('div',undefined,'att-track'),fill=el('span');
  fill.style.width=p+'%';track.append(fill);
  card.append(heading,desc,track);root.append(card);
 }
}
function markExcused(r){
 const id=keyOf(r),entry=records[id];
 if(!entry||entry.status!=='absent')return;
 entry.excused=!entry.excused;entry.updated=new Date().toISOString();
 persist();renderReport();
}
function renderHistory(list){
 const root=$('#attendanceHistory');root.replaceChildren();
 if(!list.length){root.append(el('p','Нет сохранённых отметок. Открой прошедший день в расписании и выбери «Был» или «Пропустил».','att-empty'));return}
 for(const r of list.slice(0,120)){
  const item=el('article',undefined,'att-record');
  const badge=el('span',r.status==='present'?'✓ Был':'— Пропустил','att-record-badge '+(r.status==='present'?'present':'absent'));
  const info=el('div',undefined,'att-record-info');
  info.append(el('strong',r.title),el('small',formatDate(r.date)+' · '+r.start+' · '+(kinds[r.kind]||'Занятие')+(r.groups.length?' · '+r.groups.join(', ')+' подгр.':'')));
  item.append(badge,info);
  if(r.status==='absent'){
   const excuse=el('button',r.excused?'Уважительная ✓':'Уваж. причина','att-mini');
   excuse.type='button';excuse.title='Отметить уважительную причину пропуска';
   excuse.setAttribute('aria-pressed',String(!!r.excused));
   excuse.onclick=()=>markExcused(r);
   item.append(excuse);
  }
  const reset=el('button','×','att-delete');reset.type='button';reset.title='Удалить отметку';reset.setAttribute('aria-label','Сбросить отметку');
  reset.onclick=()=>change(r,null);
  item.append(reset);root.append(item);
 }
 if(list.length>120)root.append(el('p','Показаны последние 120 отметок. Общая статистика учитывает все записи.','att-empty'));
}
function renderReport(){
 if(!$('#attendanceStats'))return;
 const list=selectedRecords();
 summary(list);groupSubjects(list);renderHistory(list);
 $('#attendanceTotalRecords').textContent=Object.keys(records).length+' отметок на этом устройстве';
 $('#attendanceGroupTip').hidden=$('#group')?.value!=='all';
}
function exportData(){
 const blob=new Blob([JSON.stringify({app:'sgu111-attendance',version:1,exportedAt:new Date().toISOString(),entries:records},null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob),link=el('a');link.href=url;link.download='sgu111-attendance-'+saratov().date+'.json';
 document.body.append(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function importData(file){
 if(!file||file.size>2000000){$('#attendanceMessage').textContent='Файл слишком большой (максимум 2 МБ).';return}
 try{
  const parsed=JSON.parse(await file.text());
  if(parsed.app!=='sgu111-attendance'||parsed.version!==1||!parsed.entries||typeof parsed.entries!=='object')throw Error('format');
  const all=Object.values(parsed.entries);
  if(all.length>4000||!all.every(validRecord))throw Error('invalid');
  let merged=0;
  for(const r of all){
   const id=keyOf(r);
   if(records[id])continue;
   records[id]={date:r.date,start:r.start,end:r.end||'',title:r.title,kind:r.kind,groups:r.groups,status:r.status,excused:r.status==='absent'&&r.excused===true,updated:r.updated||''};
   merged++;
  }
  if(!persist())return;
  $('#attendanceMessage').textContent='Импорт завершён: добавлено '+merged+' отметок. Существующие сохранены.';
  refreshControls();renderReport();
 }catch{$('#attendanceMessage').textContent='Не удалось импортировать: выбери JSON-копию посещаемости с этого сайта.'}
}
function init(){
 const panel=$('#attendance'),content=$('#content');
 if(!panel||!content||!$('#group'))return;
 read();
 const observer=new MutationObserver(addControls);
 observer.observe(content,{childList:true,subtree:true});
 addControls();
 $('#group').addEventListener('change',()=>{refreshControls();renderReport()});
 $('#attendancePeriod').onchange=renderReport;
 $('#attendanceKind').onchange=renderReport;
 $('#attendanceExport').onclick=exportData;
 $('#attendanceImport').onclick=()=>$('#attendanceFile').click();
 $('#attendanceFile').onchange=event=>{const file=event.target.files?.[0];if(file)importData(file);event.target.value=''};
 window.addEventListener('storage',event=>{if(event.key!==STORE)return;records=Object.create(null);read();refreshControls();renderReport()});
 window.addEventListener('focus',()=>{refreshControls();renderReport()});
 setInterval(()=>{refreshControls()},60000);
 renderReport();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();