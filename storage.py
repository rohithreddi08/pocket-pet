"""SQLite persistence — one row per user_id."""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from pet_engine import PetState

DB_PATH = Path(__file__).parent / "pets.db"


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS pets (
            user_id    TEXT PRIMARY KEY,
            state_json TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    return conn


def load_pet(user_id: str) -> PetState | None:
    with _connect() as conn:
        row = conn.execute(
            "SELECT state_json FROM pets WHERE user_id = ?", (user_id,)
        ).fetchone()
    return PetState.from_dict(json.loads(row[0])) if row else None


def save_pet(user_id: str, state: PetState) -> None:
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO pets (user_id, state_json, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                state_json = excluded.state_json,
                updated_at = excluded.updated_at
            """,
            (user_id, json.dumps(state.to_dict()), state.last_update),
        )