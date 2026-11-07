"""Regression tests for the SGU schedule change-history helpers."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from track_changes import exam_changes, lesson_changes, norm, same, slot


NOW = "2026-11-05T12:00:00+00:00"
SOURCE = "05.11.2026"


def lesson(**overrides):
    item = {
        "day": 0,
        "start": "09:00",
        "end": "10:30",
        "kind": "lecture",
        "title": "Математика",
        "teacher": "Иванов И.И.",
        "location": "101 аудитория",
        "week": "both",
        "groups": [],
        "note": "",
    }
    item.update(overrides)
    return item


def exam(**overrides):
    item = {
        "date": "2026-11-10",
        "time": "09:00",
        "kind": "exam",
        "title": "Математика",
        "teacher": "Иванов И.И.",
        "location": "101 аудитория",
    }
    item.update(overrides)
    return item


class TrackChangesTests(unittest.TestCase):
    def test_norm_collapses_whitespace_and_case(self):
        self.assertEqual(norm("  МАТЕМАТИКА\n  "), "математика")

    def test_slot_treats_group_order_as_irrelevant(self):
        first = lesson(groups=[2, 1])
        second = lesson(groups=[1, 2])
        self.assertEqual(slot(first), slot(second))

    def test_same_ignores_photo_and_formatting_metadata(self):
        first = lesson(title="  МАТЕМАТИКА  ", photo="old.webp")
        second = lesson(title="математика", photo="new.webp")
        self.assertTrue(same(first, second))

    def test_unchanged_lessons_do_not_create_events(self):
        events = lesson_changes(
            [lesson()], [lesson()], NOW, SOURCE
        )
        self.assertEqual(events, [])

    def test_added_lesson_is_reported(self):
        events = lesson_changes([], [lesson()], NOW, SOURCE)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["event"], "added")
        self.assertEqual(events[0]["label"], "Добавлена пара")
        self.assertEqual(events[0]["after"], "Математика · 101 аудитория · Иванов И.И.")

    def test_removed_lesson_is_reported(self):
        events = lesson_changes([lesson()], [], NOW, SOURCE)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["event"], "removed")
        self.assertEqual(events[0]["label"], "Убрана пара")

    def test_room_change_gets_a_specific_label(self):
        before = lesson(location="101 аудитория")
        after = lesson(location="204 аудитория")
        events = lesson_changes([before], [after], NOW, SOURCE)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["event"], "changed")
        self.assertEqual(events[0]["label"], "Изменилась аудитория")

    def test_teacher_change_gets_a_specific_label(self):
        before = lesson(teacher="Иванов И.И.")
        after = lesson(teacher="Петров П.П.")
        events = lesson_changes([before], [after], NOW, SOURCE)
        self.assertEqual(events[0]["label"], "Заменён преподаватель")

    def test_subject_change_gets_a_specific_label(self):
        before = lesson(title="Математика")
        after = lesson(title="Программирование")
        events = lesson_changes([before], [after], NOW, SOURCE)
        self.assertEqual(events[0]["label"], "Изменился предмет")

    def test_group_change_is_reported_as_removal_and_addition(self):
        before = lesson(groups=[1])
        after = lesson(groups=[2])
        events = lesson_changes([before], [after], NOW, SOURCE)
        self.assertCountEqual(
            [event["event"] for event in events],
            ["removed", "added"],
        )

    def test_event_ids_are_stable_for_the_same_snapshot(self):
        before = [lesson(location="101 аудитория")]
        after = [lesson(location="204 аудитория")]
        first = lesson_changes(before, after, NOW, SOURCE)
        second = lesson_changes(before, after, NOW, SOURCE)
        self.assertEqual(first[0]["id"], second[0]["id"])

    def test_identical_exam_snapshots_do_not_create_events(self):
        events = exam_changes([exam()], [exam()], NOW, SOURCE)
        self.assertEqual(events, [])

    def test_exam_additions_and_removals_are_reported(self):
        before = [exam(date="2026-11-10")]
        after = [exam(date="2026-11-12")]
        events = exam_changes(before, after, NOW, SOURCE)
        self.assertCountEqual(
            [event["event"] for event in events],
            ["exam_removed", "exam_added"],
        )


if __name__ == "__main__":
    unittest.main()
