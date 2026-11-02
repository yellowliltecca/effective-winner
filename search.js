(()=>{
'use strict';
const $=selector=>document.querySelector(selector);
const DAYS=['Понедельник','Вторник','Среда','Четверг','Пятница','Суббота','Воскресенье'];
const SHORT=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
const KINDS={lecture:'Лекция',practice:'Практика',lab:'Лабораторная'};
const norm=value=>String(value||'').normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/[.,]+/g,' ').replace(/\s+/g,' ').trim();
const item=(tag,text,cls)=>{
 const node=document.createElement(tag);
 if(text!==undefined)node.textContent=text;
 if(cls)node.className=cls;
 return node;
};
let data={lessons:[],teachers:{}};
let lastCheck=0;
let activeRequest=null;
let expanded=new Set();
try{
 const seed=JSON.parse($('#initialData').textContent);
 if(seed.group==='111'&&Array.isArray(seed.lessons))data=seed;
}catch{}
function collection(){
 const result=new Map();
 for(const l of data.lessons||[]){
  if(!l.teacher||typeof l.teacher!=='string'||!l.title)continue;
  const alias=l.teacher.trim();
  if(!result.has(alias)){
   const profile=(data.teachers||{})[alias]||{};
   result.set(alias,{
    short:alias,
    name:profile.name||alias,
    photo:profile.photo||'',
    profile:profile.profile||'',
    lessons:[]
   });
  }
  result.get(alias).lessons.push(l);
 }
 return [...result.values()].sort((a,b)=>a.name.localeCompare(b.name,'ru-RU'));
}
function matching(teachers,query,group,kind){
 // Searching an exact surname, e.g. "Иванов", must not return "Иванова".
 const exactSurnames=query&&!query.includes(' ')?new Set(teachers.filter(t=>
  norm(t.short).split(' ')[0]===query||norm(t.name).split(' ')[0]===query
 ).map(t=>t.short)):new Set();
 const selected=[];
 for(const teacher of teachers){
  const surnameRestricted=exactSurnames.size>0;
  const teacherMatch=surnameRestricted?exactSurnames.has(teacher.short):(
   query&&(norm(teacher.name).includes(query)||norm(teacher.short).includes(query))
  );
  const lessons=teacher.lessons.filter(l=>{
   if(group!=='all'&&Array.isArray(l.groups)&&l.groups.length&&!l.groups.includes(Number(group)))return false;
   if(kind!=='all'&&l.kind!==kind)return false;
   if(!query)return true;
   if(teacherMatch)return true;
   if(surnameRestricted)return false;
   return [l.title,l.location,SHORT[l.day],DAYS[l.day],KINDS[l.kind],l.start].some(text=>norm(text).includes(query));
  }).sort((a,b)=>a.day-b.day||String(a.start).localeCompare(String(b.start))||String(a.week).localeCompare(String(b.week)));
  if(lessons.length)selected.push({...teacher,lessons});
 }
 return selected;
}
function createAvatar(teacher){
 const avatar=item('span',undefined,'search-avatar');
 const safePhoto=/^assets\/teachers\/[a-z0-9-]+\.(?:jpg|jpeg|png|webp)$/i.test(teacher.photo)?teacher.photo:'';
 const words=teacher.name.trim().split(/\s+/);
 const initials=(words.length>=3?(words[1][0]||'')+(words[2][0]||''):(words[0]?.slice(0,2)||'●')).toUpperCase();
 avatar.textContent=initials;
 if(safePhoto){
  const photo=item('img');
  photo.src='./'+safePhoto;photo.alt='';photo.loading='lazy';photo.decoding='async';
  photo.onerror=()=>photo.remove();
  avatar.append(photo);
 }
 return avatar;
}
function lessonRow(l){
 const row=item('li',undefined,'search-lesson');
 const time=item('div',undefined,'search-lesson-time');
 time.append(item('b',SHORT[l.day]||'—'),item('span',String(l.start)+'–'+String(l.end)));
 const details=item('div',undefined,'search-lesson-main');
 const subject=item('strong',l.title);
 const tags=item('div',undefined,'search-tags');
 tags.append(item('span',KINDS[l.kind]||'Занятие','search-chip'));
 if(l.week==='numerator'||l.week==='denominator'){
  tags.append(item('span',l.week==='numerator'?'Числитель':'Знаменатель','search-chip search-chip-alt'));
 }else{
  tags.append(item('span','Каждую неделю','search-chip search-chip-neutral'));
 }
 if(Array.isArray(l.groups)&&l.groups.length){
  tags.append(item('span',l.groups.join(' и ')+' подгр.','search-chip search-chip-alt'));
 }
 details.append(subject,tags);
 if(l.location)details.append(item('p','📍 '+l.location,'search-room'));
 if(l.note)details.append(item('p',l.note,'search-note'));
 row.append(time,details);
 return row;
}
function teacherCard(teacher,query){
 const card=item('details',undefined,'search-teacher');
 card.dataset.name=teacher.short;
 card.open=!!query||expanded.has(teacher.short);
 const summary=item('summary',undefined,'search-teacher-summary');
 summary.append(createAvatar(teacher));
 const title=item('div',undefined,'search-teacher-title');
 title.append(item('strong',teacher.name),item('span',teacher.short===teacher.name?'Преподаватель':teacher.short));
 const subjects=[...new Set(teacher.lessons.map(l=>l.title))];
 title.append(item('small',subjects.join(' · ')));
 const qty=item('span',teacher.lessons.length+' '+(teacher.lessons.length===1?'занятие':teacher.lessons.length<5?'занятия':'занятий'),'search-teacher-count');
 summary.append(title,qty,item('span','⌄','search-chevron'));
 card.append(summary);
 const content=item('div',undefined,'search-teacher-content');
 const heading=item('div',undefined,'search-teacher-info');
 heading.append(item('b','Занятия в расписании 111 группы'));
 if(/^https:\/\/(?:www\.)?sgu\.ru\/person\/[a-z0-9-]+\/?$/i.test(teacher.profile)){
  const link=item('a','Профиль в СГУ ↗');
  link.href=teacher.profile;link.target='_blank';link.rel='noopener noreferrer';
  heading.append(link);
 }
 content.append(heading);
 const list=item('ul',undefined,'search-lessons');
 for(const l of teacher.lessons)list.append(lessonRow(l));
 content.append(list);
 card.append(content);
 card.addEventListener('toggle',()=>{
  if(card.open)expanded.add(teacher.short);
  else expanded.delete(teacher.short);
 });
 return card;
}
function render(){
 if(!$('#searchResults'))return;
 const query=norm($('#searchQuery').value),group=$('#searchGroup').value,kind=$('#searchType').value;
 const teachers=collection();
 const found=matching(teachers,query,group,kind);
 const totalLessons=found.reduce((n,t)=>n+t.lessons.length,0);
 const info=$('#searchSummary');
 info.textContent=found.length+' '+(found.length===1?'преподаватель':found.length<5?'преподавателя':'преподавателей')+' · '+totalLessons+' '+(totalLessons===1?'занятие':totalLessons<5?'занятия':'занятий');
 const results=$('#searchResults');
 const fragment=document.createDocumentFragment();
 if(!found.length){
  const empty=item('div',undefined,'search-empty');
  empty.append(item('strong','Ничего не найдено'),item('p','Попробуй другую фамилию, предмет или номер аудитории. Проверь фильтры.'));
  fragment.append(empty);
 }else{
  for(const teacher of found)fragment.append(teacherCard(teacher,query));
 }
 results.replaceChildren(fragment);
 $('#searchSource').textContent='Расписание СГУ 111 · данные от '+(data.source_updated||'дата не указана')+'. Вне подтверждённого календаря СГУ чередование недель может меняться.';
}
async function update(){
 if(activeRequest)return;
 const now=Date.now();
 if(now-lastCheck<60000)return;
 lastCheck=now;
 const controller=new AbortController();
 activeRequest=controller;
 try{
  const response=await fetch('./data/schedule.json?search='+now,{cache:'no-store',signal:controller.signal});
  if(!response.ok)throw Error('HTTP '+response.status);
  const next=await response.json();
  if(next.group==='111'&&Array.isArray(next.lessons)&&next.lessons.length>=4){
   data=next;render();
  }
 }catch{
  // The embedded schedule is available even when offline.
 }finally{
  if(activeRequest===controller)activeRequest=null;
 }
}
function init(){
 if(!$('#searchResults')||!$('#searchQuery'))return;
 $('#searchQuery').addEventListener('input',render);
 $('#searchGroup').addEventListener('change',render);
 $('#searchType').addEventListener('change',render);
 $('#searchClear').addEventListener('click',()=>{
  $('#searchQuery').value='';$('#searchGroup').value='all';$('#searchType').value='all';
  expanded.clear();render();$('#searchQuery').focus();
 });
 window.addEventListener('search:open',()=>{render();update()});
 window.addEventListener('focus',()=>{if($('#search').style.display!=='none')update()});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&$('#search').style.display!=='none')update()});
 setInterval(()=>{if($('#search').style.display!=='none')update()},300000);
 render();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();