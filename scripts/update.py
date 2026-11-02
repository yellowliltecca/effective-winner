
import datetime as dt
import json
from pathlib import Path
import re
import sys
from bs4 import BeautifulSoup
import requests

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data/schedule.json'
INDEX = ROOT / 'index.html'
SOURCE = 'https://www.sgu.ru/schedule/knt/do/111'
CALENDAR = 'https://www.sgu.ru/schedule/knt'

TYPES = re.compile(
    r'(?<!\w)(ЛЕКЦИЯ|ПРАКТИКА|ЛАБОРАТОРНАЯ РАБОТА|ЛАБОРАТОРНАЯ)(?!\w)',
    re.I
)
TEACHER = re.compile(
    r'(?<!\w)[А-ЯЁ][а-яё-]+\s+[А-ЯЁ]\.\s*(?:[А-ЯЁ]\.)?'
)
MONTHS = dict(zip(
    'января февраля марта апреля мая июня июля августа '
    'сентября октября ноября декабря'.split(),
    range(1, 13)
))


def clean(s):
    return re.sub(r'\s+', ' ', s or '').strip()


def page(url):
    r = requests.get(
        url,
        timeout=35,
        headers={
            'User-Agent': 'SGU111Schedule/1.0',
            'Accept-Language': 'ru-RU'
        }
    )
    r.raise_for_status()
    if len(r.content) < 1500:
        raise ValueError('Слишком короткий ответ СГУ')
    r.encoding = r.apparent_encoding or 'utf-8'
    return BeautifulSoup(r.text, 'html.parser')


def previous():
    try:
        old = json.loads(DATA.read_text('utf-8'))
        if len(old.get('lessons', [])) >= 5:
            return old
    except (OSError, ValueError):
        pass

    html = INDEX.read_text('utf-8')
    m = re.search(
        r'<script id="initialData" type="application/json">(.*?)</script>',
        html, re.S
    )
    if not m:
        raise ValueError('Начальные данные не найдены')

    old = json.loads(m.group(1))
    if old.get('group') != '111' or len(old.get('lessons', [])) < 5:
        raise ValueError('Неверные начальные данные')

    DATA.parent.mkdir(parents=True, exist_ok=True)
    DATA.write_text(
        json.dumps(old, ensure_ascii=False, indent=2) + '\n',
        'utf-8'
    )
    return old


def parse_schedule(soup):
    table = next(
        (t for t in soup.select('table')
         if 'понедельник' in t.get_text(' ', strip=True).lower()
         and 'пятница' in t.get_text(' ', strip=True).lower()),
        None
    )
    if table is None:
        raise ValueError('Таблица занятий не найдена')

    lessons = []
    slots = set()

    for row in table.select('tr'):
        cells = row.find_all(['td', 'th'], recursive=False)
        if len(cells) < 7:
            continue

        times = re.findall(
            r'\b\d{1,2}:\d{2}\b',
            clean(cells[0].get_text(' ', strip=True))
        )
        if len(times) < 2:
            continue

        start, end = times[:2]
        slots.add(start)

        for day, cell in enumerate(cells[1:7]):
            raw = clean(cell.get_text(' ', strip=True))
            pieces = list(TYPES.finditer(raw))

            for i, match in enumerate(pieces):
                finish = (
                    pieces[i + 1].start()
                    if i + 1 < len(pieces)
                    else len(raw)
                )
                part = clean(raw[match.end():finish])
                week = 'both'

                w = re.match(r'^(Ч|З)(?=\s|$)', part, re.I)
                if w:
                    week = (
                        'numerator'
                        if w.group(1).upper() == 'Ч'
                        else 'denominator'
                    )
                    part = clean(part[w.end():])

                groups = []
                g = re.match(
                    r'^(\d(?:\s*(?:и|,)\s*\d)*)\s*'
                    r'под(?:г(?:руппа)?)?\.?(?=\s|$)',
                    part, re.I
                )
                if g:
                    groups = [
                        int(n)
                        for n in re.findall(r'\d', g.group(1))
                    ]
                    part = clean(part[g.end():])

                changed = '↺' in part
                part = clean(part.replace('↺', ''))

                names = list(TEACHER.finditer(part))
                name = names[-1] if names else None

                if name:
                    title = clean(part[:name.start()])
                    teacher = clean(name.group())
                    location = clean(part[name.end():])
                else:
                    place = re.search(
                        r'\b\d+\s*корпус\b|'
                        r'\bДистанционно\b|'
                        r'\bСпортивный комплекс\b',
                        part, re.I
                    )
                    title = (
                        clean(part[:place.start()])
                        if place else part
                    )
                    location = (
                        clean(part[place.start():])
                        if place else ''
                    )
                    teacher = ''

                if not title:
                    continue

                kind = (
                    'lecture'
                    if match.group().lower() == 'лекция'
                    else 'practice'
                    if match.group().lower() == 'практика'
                    else 'lab'
                )

                lessons.append(dict(
                    day=day,
                    start=start,
                    end=end,
                    kind=kind,
                    title=title,
                    teacher=teacher,
                    location=location,
                    week=week,
                    groups=groups,
                    note='',
                    after_change=changed
                ))

    if (
        len(lessons) < 5
        or len(slots) < 4
        or not any(
            'математ' in l['title'].lower()
            or 'программирован' in l['title'].lower()
            for l in lessons
        )
    ):
        raise ValueError('Подозрительный ответ СГУ')

    return sorted(
        lessons,
        key=lambda l: (
            l['day'], l['start'], l['week'], l['title']
        )
    )


def parse_calendar(soup):
    text = clean(soup.get_text(' ', strip=True)).lower()
    years = list(re.finditer(
        r'[12]\s*семестр\s+(\d{4})\s*г', text
    ))
    pattern = (
        r'(\d{1,2})\s+([а-яё]+)\s*[–—-]\s*'
        r'\d{1,2}\s+[а-яё]+\s+'
        r'(числитель|знаменатель)'
    )
    weeks = {}

    for m in re.finditer(pattern, text):
        y = [x for x in years if x.start() < m.start()]
        if not y or m.group(2) not in MONTHS:
            continue

        try:
            date = dt.date(
                int(y[-1].group(1)),
                MONTHS[m.group(2)],
                int(m.group(1))
            )
        except ValueError:
            continue

        start = date - dt.timedelta(days=date.weekday())
        weeks[start.isoformat()] = {
            'start': start.isoformat(),
            'type': (
                'numerator'
                if m.group(3) == 'числитель'
                else 'denominator'
            )
        }

    return list(weeks.values()) if len(weeks) >= 5 else None


def parse_exams(soup):
    for table in soup.select('table'):
        header = clean(
            table.get_text(' ', strip=True)
        ).lower()

        if (
            'отчётность' not in header
            and 'отчетность' not in header
        ) or 'преподаватель' not in header:
            continue

        result = []

        for tr in table.select('tr'):
            cells = tr.find_all(
                ['td', 'th'], recursive=False
            )
            if len(cells) < 4:
                continue

            a = [
                clean(c.get_text(' ', strip=True))
                for c in cells[:4]
            ]

            match = re.match(
                r'(\d{1,2})\s+([а-яё]+)\s+'
                r'(\d{4})\s*г?\.?\s*'
                r'(\d{1,2}:\d{2})?',
                a[0], re.I
            )

            if (
                not match
                or match.group(2).lower() not in MONTHS
            ):
                continue

            try:
                date = dt.date(
                    int(match.group(3)),
                    MONTHS[match.group(2).lower()],
                    int(match.group(1))
                ).isoformat()
            except ValueError:
                continue

            typ = re.match(
                r'^(Дифференцированный зач[её]т|'
                r'Экзамен|Зач[её]т|Консультация)\s+',
                a[1], re.I
            )

            result.append({
                'date': date,
                'time': match.group(4) or '',
                'kind': (
                    typ.group(1) if typ else 'Аттестация'
                ),
                'title': (
                    a[1][typ.end():] if typ else a[1]
                ),
                'teacher': a[2],
                'location': a[3]
            })

        return result

    return None


def main():
    old = previous()
    soup = page(SOURCE)
    text = clean(soup.get_text(' ', strip=True))

    if (
        '111 группа' not in text
        or 'Факультет компьютерных наук' not in text
    ):
        raise ValueError('Открыта не страница 111 группы')

    m = re.search(
        r'Дата последнего обновления\s*:\s*'
        r'(\d{2}\.\d{2}\.\d{4})',
        text
    )
    if not m:
        raise ValueError('Не найдена дата обновления')

    lessons = parse_schedule(soup)
    exams = parse_exams(soup)

    try:
        calendar = (
            parse_calendar(page(CALENDAR))
            or old.get('week_calendar', [])
        )
    except Exception:
        calendar = old.get('week_calendar', [])

    changed = (
        lessons != old.get('lessons', [])
        or (
            exams is not None
            and exams != old.get('exams', [])
        )
    )

    new = dict(
        old,
        lessons=lessons,
        week_calendar=calendar,
        source_updated=m.group(1),
        initial_snapshot=False
    )

    if exams is not None:
        new['exams'] = exams

    if changed:
        new['changes'] = [
            {
                'event': 'changed',
                'day': e['day'],
                'time': e['start'],
                'text': e['title'],
                'detail': e.get('location', '')
            }
            for e in lessons
            if e not in old.get('lessons', [])
        ][:18]
        new['changes_at'] = (
            dt.datetime.now(dt.timezone.utc).isoformat()
        )

    if new != old:
        new['fetched_at'] = (
            dt.datetime.now(dt.timezone.utc).isoformat()
        )
        DATA.write_text(
            json.dumps(
                new, ensure_ascii=False, indent=2
            ) + '\n',
            'utf-8'
        )
        print('Расписание обновлено:', len(lessons))
    else:
        print('Изменений нет')


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(
            'СГУ недоступен, сохранено предыдущее '
            'расписание:', exc,
            file=sys.stderr
        )
        sys.exit(1)
