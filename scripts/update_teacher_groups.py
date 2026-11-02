"""Build a faculty-wide teacher timetable, based only on official SGU group pages.

No extra hosting: GitHub Actions publishes a static JSON index alongside the website.
Failed SGU requests preserve a previous *labelled* snapshot, never fabricate lessons.
"""
import concurrent.futures
import datetime as dt
import json
import re
from pathlib import Path
from urllib.parse import urlparse
from bs4 import BeautifulSoup
import requests

from update import ROOT, DATA, CALENDAR, SOURCE, clean, page, parse_schedule

OUT = ROOT / 'data' / 'teacher-groups.json'
GROUP_URL = re.compile(r'^https://(?:www\.)?sgu\.ru/schedule/knt/do/(\d{3})/?$')
DIRECTORY = 'https://www.sgu.ru/schedule/knt'
USER_AGENT = 'SGU111Schedule/2.0 (faculty teacher timetable)'
TIMEOUT = 16


def group_links(soup):
    result = {}
    for anchor in soup.select('a[href]'):
        href = requests.compat.urljoin(DIRECTORY, anchor.get('href', ''))
        m = GROUP_URL.fullmatch(href)
        if m and clean(anchor.get_text(' ', strip=True)) == m.group(1):
            result[m.group(1)] = href
    return result


def fetch_group(group, url):
    response = requests.get(url, timeout=TIMEOUT, headers={
        'User-Agent': USER_AGENT, 'Accept-Language': 'ru-RU'
    })
    response.raise_for_status()
    if not GROUP_URL.fullmatch(response.url) or len(response.content) < 1500:
        raise ValueError('Invalid SGU group response')
    soup = BeautifulSoup(response.content, 'html.parser')
    text = clean(soup.get_text(' ', strip=True))
    if not re.search(r'\b' + re.escape(group) + r'\s+группа\b', text, re.I):
        raise ValueError('Group identity mismatch')
    if 'Факультет компьютерных наук' not in text:
        raise ValueError('Wrong faculty')
    match = re.search(r'Дата последнего обновления\s*:\s*(\d{2}\.\d{2}\.\d{4})', text)
    # Other SGU groups may not yet have a published timetable.
    try:
        lessons = parse_schedule(soup, strict=False)
    except ValueError:
        lessons = []
    if not lessons:
        raise ValueError('No confirmed lesson table')
    return {
        'group': group,
        'url': url,
        'source_updated': match.group(1) if match else '',
        'checked_at': dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'),
        'lessons': [
            {field: lesson[field] for field in (
                'day', 'start', 'end', 'kind', 'title', 'teacher',
                'location', 'week', 'groups'
            )} for lesson in lessons if lesson.get('teacher')
        ]
    }


def main():
    base = json.loads(DATA.read_text('utf-8'))
    main_teachers = set(base.get('teachers', {}).keys())
    previous = {}
    if OUT.is_file():
        try:
            old = json.loads(OUT.read_text('utf-8'))
            previous = {g['group']: g for g in old.get('groups', []) if g.get('group')}
        except (ValueError, OSError, KeyError):
            pass
    directory = group_links(page(DIRECTORY))
    if len(directory) < 12:
        raise ValueError('SGU faculty directory incomplete: refusing to erase the index')
    groups = sorted((g, url) for g, url in directory.items() if g != '111')
    failures, loaded = [], []
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        futures = {pool.submit(fetch_group, group, url): (group, url) for group, url in groups}
        for future in concurrent.futures.as_completed(futures):
            group, url = futures[future]
            try:
                info = future.result()
                loaded.append(info)
            except (requests.RequestException, ValueError) as error:
                failures.append(group)
                if group in previous:
                    loaded.append(previous[group])
                print('Skipping group', group, ':', error)
    # Preserve all instructors of group 111, including those who currently
    # have no lessons in the other inspected groups.
    for entry in loaded:
        entry['lessons'] = [
            l for l in entry['lessons'] if l['teacher'] in main_teachers
        ]
    output = {
        'faculty': 'КНиИТ',
        'source': DIRECTORY,
        'checked_at': dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'),
        'groups_discovered': len(groups),
        'groups_checked': len(groups) - len(failures),
        'groups_failed': sorted(failures),
        'groups': sorted(loaded, key=lambda v: v['group'])
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n', 'utf-8')
    total = sum(len(g['lessons']) for g in loaded)
    print('Faculty teachers indexed:', total, 'entries,', len(loaded), 'groups; failures', len(failures))


if __name__ == '__main__':
    main()
