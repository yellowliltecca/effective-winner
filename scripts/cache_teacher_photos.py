
import io
import json
from pathlib import Path
import re
from urllib.parse import urlparse

from PIL import Image, ImageOps
import requests

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data/schedule.json'
HTML = ROOT / 'index.html'
PHOTOS = ROOT / 'assets/teachers'

PHOTOS.mkdir(parents=True, exist_ok=True)
(PHOTOS / '.gitkeep').touch(exist_ok=True)


def official(url):
    p = urlparse(url)
    return (
        p.scheme == 'https'
        and p.hostname in (
            'sgu.ru', 'www.sgu.ru', 'new.sgu.ru'
        )
        and '/sites/default/files/' in p.path
    )


def download(url, destination):
    response = requests.get(
        url,
        timeout=30,
        headers={
            'User-Agent': 'SGU111Schedule/1.0',
            'Referer': 'https://www.sgu.ru/'
        }
    )
    response.raise_for_status()

    if (
        not official(response.url)
        or not response.headers.get(
            'content-type', ''
        ).startswith('image/')
        or len(response.content) > 5_000_000
    ):
        raise ValueError('Неверный ответ сервера фотографий')

    with Image.open(io.BytesIO(response.content)) as im:
        im.verify()

    with Image.open(io.BytesIO(response.content)) as im:
        if min(im.size) < 80:
            raise ValueError('Слишком маленькая фотография')

        portrait = ImageOps.exif_transpose(im).convert('RGB')
        portrait.thumbnail(
            (480, 480),
            Image.Resampling.LANCZOS
        )
        portrait.save(destination, 'WEBP', quality=84)


def main():
    data = json.loads(DATA.read_text('utf-8'))

    for short, teacher in data.get('teachers', {}).items():
        name = teacher.get('name', short)
        source = (
            teacher.get('photo_source')
            or teacher.get('photo', '')
        )

        safe = re.sub(
            '[^a-z0-9-]',
            '-',
            urlparse(
                teacher.get('profile', '')
            ).path.rsplit('/', 1)[-1].lower()
        ).strip('-')

        if not safe:
            import hashlib
            safe = hashlib.sha256(
                name.encode()
            ).hexdigest()[:16]

        relative = 'assets/teachers/' + safe + '.webp'
        filepath = ROOT / relative

        if filepath.is_file():
            teacher['photo'] = relative
            continue

        if not official(source):
            teacher['photo'] = ''
            continue

        try:
            download(source, filepath)
            teacher['photo'] = relative
            print('Фото сохранено:', name)

        except (
            requests.RequestException,
            ValueError,
            OSError
        ) as error:
            teacher['photo'] = ''
            print('Будут инициалы:', name, error)

    DATA.write_text(
        json.dumps(
            data,
            ensure_ascii=False,
            indent=2
        ) + '\n',
        'utf-8'
    )

    html = HTML.read_text('utf-8')
    payload = json.dumps(
        data,
        ensure_ascii=False,
        indent=2
    ).replace('</', '<\\/')

    updated, count = re.subn(
        r'(<script id="initialData" '
        r'type="application/json">).*?(</script>)',
        lambda m: m.group(1) + payload + m.group(2),
        html,
        count=1,
        flags=re.S
    )

    if count != 1:
        raise ValueError('Блок initialData не найден')

    HTML.write_text(updated, 'utf-8')


if __name__ == '__main__':
    main()
