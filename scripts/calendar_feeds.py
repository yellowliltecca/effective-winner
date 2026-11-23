"""Build stable calendar subscription URLs from the published SGU timetable."""
import hashlib
import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOCAL = timezone(timedelta(hours=4))


def escape(value):
    return str(value).replace("\\", "\\\\").replace("\r\n", "\n").replace("\n", "\\n").replace(";", "\\;").replace(",", "\\,")


def fold(line):
    result = []
    size = 0
    for char in line:
        length = len(char.encode("utf-8"))
        if size + length > 75:
            result.append("\r\n ")
            size = 1
        result.append(char)
        size += length
    return "".join(result)


def stamp(day, clock):
    value = datetime.fromisoformat(f"{day}T{clock}").replace(tzinfo=LOCAL)
    return value.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def build(data, group):
    name = "Все подгруппы" if group == "all" else f"{group}-я подгруппа"
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//SGU111//Schedule//RU",
             "CALSCALE:GREGORIAN", "X-WR-CALNAME:СГУ 111 · " + name]
    changed = datetime.fromisoformat(data["fetched_at"]).astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    for week in data["week_calendar"]:
        monday = date.fromisoformat(week["start"])
        occurrences = {}
        for lesson in sorted(data["lessons"], key=lambda row: row["start"]):
            groups = sorted(lesson["groups"])
            if group != "all" and groups and int(group) not in groups:
                continue
            if lesson["week"] not in ("both", week["type"]):
                continue
            day = monday + timedelta(days=lesson["day"])
            identity = json.dumps([str(day), lesson["title"], lesson["kind"], groups], ensure_ascii=False)
            ordinal = occurrences.get(identity, 0)
            occurrences[identity] = ordinal + 1
            uid = hashlib.sha256(f"{identity}/{ordinal}".encode()).hexdigest()[:32]
            teacher = lesson.get("teacher", "")
            person = data.get("teachers", {}).get(teacher, {}).get("name", teacher)
            description = " · ".join(filter(None, [person, lesson.get("note"), 
                "Подгруппа " + ", ".join(map(str, groups)) if groups else ""]))
            lines.extend(["BEGIN:VEVENT", f"UID:{uid}@sgu111", "DTSTAMP:" + changed,
                          "DTSTART:" + stamp(day, lesson["start"]), "DTEND:" + stamp(day, lesson["end"]),
                          "SUMMARY:" + escape(lesson["title"]), "LOCATION:" + escape(lesson.get("location", "")),
                          "DESCRIPTION:" + escape(description), "END:VEVENT"])
    lines.append("END:VCALENDAR")
    return ("\r\n".join(map(fold, lines)) + "\r\n").encode("utf-8")


if __name__ == "__main__":
    schedule = json.loads((ROOT / "data/schedule.json").read_text(encoding="utf-8"))
    target = ROOT / "calendars"
    target.mkdir(exist_ok=True)
    for selection in ("all", "1", "2", "3"):
        (target / f"group-{selection}.ics").write_bytes(build(schedule, selection))
