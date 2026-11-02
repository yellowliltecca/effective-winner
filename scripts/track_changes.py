#!/usr/bin/env python3
"""Persist real SGU lesson changes without reporting photo or formatting changes."""
import datetime as dt
import hashlib
import json
from collections import defaultdict
from pathlib import Path
import sys

FIELDS = ('title', 'kind', 'teacher', 'location', 'note', 'end')

def norm(value):
    return ' '.join(str(value or '').split()).casefold()

def slot(l):
    return (l.get('day', 0), l.get('start', ''),
            l.get('week', 'both'), tuple(sorted(l.get('groups', []))))

def same(a, b):
    return all(norm(a.get(k)) == norm(b.get(k)) for k in FIELDS)

def describe(l):
    if not l:
        return 'Нет занятия'
    return ' · '.join(str(x) for x in
        (l.get('title'), l.get('location'), l.get('teacher')) if x)

def make_event(before, after, now, source):
    item = after or before
    fields = [f for f in FIELDS if norm((before or {}).get(f)) != norm((after or {}).get(f))]
    typ = 'changed' if before and after else 'added' if after else 'removed'
    if typ == 'added':
        label = 'Добавлена пара'
    elif typ == 'removed':
        label = 'Убрана пара'
    elif fields == ['location']:
        label = 'Изменилась аудитория'
    elif fields == ['teacher']:
        label = 'Заменён преподаватель'
    elif 'title' in fields:
        label = 'Изменился предмет'
    else:
        label = 'Изменена пара'
    payload = json.dumps([before, after, now], sort_keys=True, ensure_ascii=False)
    return dict(
        id=hashlib.sha256(payload.encode()).hexdigest()[:20],
        at=now, source_updated=source, event=typ, label=label,
        day=item.get('day'), time=item.get('start', ''),
        week=item.get('week', 'both'), groups=item.get('groups', []),
        title=item.get('title', ''), before=describe(before) if before else '',
        after=describe(after) if after else ''
    )

def lesson_changes(old, new, now, source):
    before, after = defaultdict(list), defaultdict(list)
    for l in old: before[slot(l)].append(l)
    for l in new: after[slot(l)].append(l)
    events = []
    for key in sorted(set(before) | set(after)):
        past = list(before[key])
        upcoming = []
        for lesson in after[key]:
            index = next((i for i, previous in enumerate(past)
                          if same(previous, lesson)), None)
            if index is None:
                upcoming.append(lesson)
            else:
                past.pop(index)
        while past and upcoming:
            previous = past.pop(0)
            best = max(range(len(upcoming)),
                key=lambda i: int(norm(previous.get('title')) == norm(upcoming[i].get('title'))))
            events.append(make_event(previous, upcoming.pop(best), now, source))
        for lesson in past: events.append(make_event(lesson, None, now, source))
        for lesson in upcoming: events.append(make_event(None, lesson, now, source))
    return events

def exam_changes(old, new, now, source):
    def key(e):
        return tuple(norm(e.get(k)) for k in ('date','time','kind','title','teacher','location'))
    oldmap = {key(x):x for x in old}
    newmap = {key(x):x for x in new}
    result = []
    for key_ in sorted(set(oldmap) ^ set(newmap)):
        exam = newmap.get(key_) or oldmap[key_]
        added = key_ in newmap
        payload = json.dumps([key_,added,now], ensure_ascii=False)
        result.append(dict(
            id=hashlib.sha256(payload.encode()).hexdigest()[:20],
            at=now, source_updated=source,
            event='exam_added' if added else 'exam_removed',
            label='Добавлена дата сессии' if added else 'Убрана дата сессии',
            date=exam.get('date',''), day=None, time=exam.get('time',''),
            week='both',groups=[],title=exam.get('title',''),
            before='' if added else describe(exam),
            after=describe(exam) if added else ''
        ))
    return result

def update(before_file, after_file):
    old = json.loads(Path(before_file).read_text(encoding='utf-8'))
    path = Path(after_file)
    new = json.loads(path.read_text(encoding='utf-8'))
    if old.get('group') != '111' or new.get('group') != '111' or len(new.get('lessons',[])) < 5:
        raise ValueError('Invalid group/schedule: no history changes recorded')
    now = dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')
    source = new.get('source_updated','')
    events = lesson_changes(old.get('lessons',[]),new.get('lessons',[]),now,source)
    events += exam_changes(old.get('exams',[]),new.get('exams',[]),now,source)
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
