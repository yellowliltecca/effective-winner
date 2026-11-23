#!/usr/bin/env python3
"""Persist real SGU lesson changes without reporting photo or formatting changes."""
import datetime as dt
import hashlib
import json
from collections import defaultdict
from pathlib import Path
import sys

LESSON_FIELDS = ('day', 'start', 'end', 'week', 'groups', 'title', 'kind', 'teacher', 'location', 'note')
EXAM_FIELDS = ('date', 'time', 'title', 'kind', 'teacher', 'location')
NAMES = {'day':'День', 'start':'Начало', 'end':'Конец', 'date':'Дата', 'time':'Время',
         'week':'Неделя', 'groups':'Подгруппа', 'title':'Предмет', 'kind':'Тип',
         'teacher':'Преподаватель', 'location':'Аудитория', 'note':'Примечание'}


def display(row, field):
    value = row.get(field)
    if field == 'day' and isinstance(value, int) and 0 <= value < 7:
        return ('Пн','Вт','Ср','Чт','Пт','Сб','Вс')[value]
    if field == 'groups':
        return ', '.join(map(str, sorted(value or []))) or 'Все'
    if field == 'date' and value:
        return dt.date.fromisoformat(value).strftime('%d.%m.%Y')
    words = {'both':'Каждую неделю','numerator':'Числитель','denominator':'Знаменатель',
             'lecture':'Лекция','practice':'Практика','lab':'Лабораторная'}
    return words.get(value, str(value or '—'))


def key(row, fields):
    return tuple(' '.join(display(row, field).split()).casefold().replace('ё','е') for field in fields)


def compare(old, new, exam, now, source):
    fields = EXAM_FIELDS if exam else LESSON_FIELDS
    previous, upcoming = list(old), list(new)
    pairs = []
    def match(keys, exact=False):
        old_keys, new_keys = defaultdict(list), defaultdict(list)
        for row in previous: old_keys[key(row, keys)].append(row)
        for row in upcoming: new_keys[key(row, keys)].append(row)
        for signature in sorted(old_keys.keys() & new_keys.keys()):
            left, right = old_keys[signature], new_keys[signature]
            if not exact and (len(left) != 1 or len(right) != 1):
                continue
            for a, b in zip(left, right):
                previous.remove(a)
                upcoming.remove(b)
                if not exact: pairs.append((a,b))

    match(fields, exact=True)
    if exam:
        match(('title','kind','date','time'))
        match(('title','kind','teacher'))
        match(('title','kind'))
    else:
        match(('day','start','week','groups','title'))
        match(('title','kind','teacher','groups'))
        match(('title','kind','groups'))
        match(('day','start','week','groups'))
    pairs.extend((row,None) for row in previous)
    pairs.extend((None,row) for row in upcoming)
    result = []
    for a,b in pairs:
        row = b or a
        operation = 'changed' if a and b else 'added' if b else 'removed'
        labels = ('Добавлена дата сессии','Убрана дата сессии','Изменена дата сессии') if exam else ('Добавлена пара','Убрана пара','Изменена пара')
        label = dict(zip(('added','removed','changed'),labels))[operation]
        changes = []
        if a and b:
            for field in fields:
                if key(a,(field,)) != key(b,(field,)):
                    changes.append((field, display(a,field), display(b,field)))
            if any(field in ('day','date','start','time') for field,_,_ in changes):
                label = 'Перенос аттестации' if exam else 'Перенос пары'
            elif len(changes)==1:
                label = {'teacher':'Замена преподавателя','location':'Смена аудитории','end':'Новое время окончания'}.get(changes[0][0],label)
        def description(item, side):
            if not item: return ''
            if changes:
                return ' · '.join(f'{NAMES[c[0]]}: {c[side]}' for c in changes)
            return ' · '.join(display(item,k) for k in ('kind','location','teacher','note') if item.get(k))
        groups = sorted(set((a or {}).get('groups',[])) | set((b or {}).get('groups',[])))
        if any(not x.get('groups') for x in (a,b) if x): groups=[]
        payload = json.dumps([a,b,now], sort_keys=True, ensure_ascii=False)
        result.append(dict(id=hashlib.sha256(payload.encode()).hexdigest()[:20], at=now,
            source_updated=source,event=('exam_' if exam else '')+operation,label=label,
            title=row['title'],day=row.get('day'),date=row.get('date',''),
            time=row.get('time',row.get('start','')),week=row.get('week','both'),groups=groups,
            before=description(a,1),after=description(b,2)))
    return result

def update(before_file, after_file):
    old = json.loads(Path(before_file).read_text(encoding='utf-8'))
    path = Path(after_file)
    new = json.loads(path.read_text(encoding='utf-8'))
    if old.get('group') != '111' or new.get('group') != '111' or len(new.get('lessons',[])) < 5:
        raise ValueError('Invalid group/schedule: no history changes recorded')
    now = dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')
    source = new.get('source_updated','')
    events = compare(old.get('lessons',[]),new.get('lessons',[]),False,now,source)
    events += compare(old.get('exams',[]),new.get('exams',[]),True,now,source)
    history = list(old.get('history',[]))
    fresh = events
    if fresh:
        new['history'] = (fresh + history)[:150]
        new['changes_at'] = now
        new['changes'] = [dict(event=e['event'],day=e['day'],time=e['time'],
                               text=e['title'],detail=e['label']) for e in fresh[:18]]
    else:
        new['history'] = history
        new['changes'] = old.get('changes',[])
        new['changes_at'] = old.get('changes_at')
    result = json.dumps(new,ensure_ascii=False,indent=2) + '\n'
    if result != path.read_text(encoding='utf-8'):
        path.write_text(result,encoding='utf-8')
    print(f'Schedule history: {len(new["history"])} entries, {len(fresh)} new')

if __name__ == '__main__':
    update(sys.argv[1],sys.argv[2])
