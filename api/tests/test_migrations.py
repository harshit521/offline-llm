"""Tests for the startup index migration.

Run from the repository root:

    python3 -m unittest discover -s api/tests -v
"""

from __future__ import annotations

import unittest

import support  # noqa: F401  (sets up env before app imports)

from sqlalchemy import inspect  # noqa: E402

from models import engine, ensure_indexes, init_db  # noqa: E402

INDEX_NAME = "ix_messages_conversation_id"


def _index_names(table: str) -> set[str]:
    return {
        index["name"]
        for index in inspect(engine).get_indexes(table)
        if index.get("name")
    }


class IndexMigrationTests(unittest.TestCase):
    def test_init_db_recreates_missing_messages_index(self) -> None:
        init_db()
        self.assertIn(INDEX_NAME, _index_names("messages"))

        # Simulate a database created before the index was declared.
        with engine.begin() as connection:
            connection.exec_driver_sql(f"DROP INDEX IF EXISTS {INDEX_NAME}")

        self.assertNotIn(INDEX_NAME, _index_names("messages"))

        # This is the path the app runs on every startup.
        init_db()

        self.assertIn(INDEX_NAME, _index_names("messages"))

    def test_ensure_indexes_is_idempotent(self) -> None:
        init_db()
        ensure_indexes()
        ensure_indexes()
        self.assertIn(INDEX_NAME, _index_names("messages"))


if __name__ == "__main__":
    unittest.main()
