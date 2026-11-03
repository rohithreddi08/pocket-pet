"""Core state engine for Pocket Pet.

Stats are 0-100 floats. `hunger`, `curiosity` and `stress` are 'bad when high',
`energy` is 'good when high'. Mood is derived, never stored.
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict, fields
from datetime import datetime, timezone
from typing import Tuple

# --- tuning constants (per hour) ---------------------------------------------
HUNGER_RATE = 8.0        # hunger climbs
ENERGY_RATE = 6.0        # energy drains
CURIOSITY_RATE = 10.0    # boredom climbs
STRESS_RATE = 5.0        # stress climbs per unmet need
STRESS_RELIEF = 3.0      # stress falls when all needs are met
MAX_TICK_HOURS = 12.0    # cap so returning after a week doesn't nuke the pet


def clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


@dataclass
class PetState:
    name: str = "Mochi"
    hunger: float = 30.0
    energy: float = 80.0
    curiosity: float = 40.0
    stress: float = 20.0
    last_update: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    feed_count: int = 0
    play_count: int = 0
    rest_count: int = 0
    xp: int = 0

    # --- (de)serialisation ---------------------------------------------------
    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> "PetState":
        known = {f.name for f in fields(cls)}
        return cls(**{k: v for k, v in data.items() if k in known})


# --- time-based decay --------------------------------------------------------

def tick(state: PetState, relaxed: bool = False,
         now: datetime | None = None) -> PetState:
    """Advance the pet's stats to `now` based on elapsed time.

    `relaxed=True` (used during study sessions) slows decay so the pet
    doesn't punish the user for focusing.
    """
    now = now or datetime.now(timezone.utc)
    last = datetime.fromisoformat(state.last_update)
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)

    hours = max(0.0, (now - last).total_seconds() / 3600.0)
    hours = min(hours, MAX_TICK_HOURS)
    if relaxed:
        hours *= 0.4

    state.hunger = clamp(state.hunger + HUNGER_RATE * hours)
    state.energy = clamp(state.energy - ENERGY_RATE * hours)
    state.curiosity = clamp(state.curiosity + CURIOSITY_RATE * hours)

    unmet = (
        (state.hunger > 70)
        + (state.energy < 30)
        + (state.curiosity > 70)
    )
    if unmet:
        state.stress = clamp(state.stress + STRESS_RATE * unmet * hours)
    else:
        state.stress = clamp(state.stress - STRESS_RELIEF * hours)

    state.last_update = now.isoformat()
    return state


# --- actions -----------------------------------------------------------------

def feed(state: PetState) -> str:
    if state.hunger < 5:
        return f"{state.name} isn't hungry right now."
    state.hunger = clamp(state.hunger - 35)
    state.energy = clamp(state.energy + 5)
    state.stress = clamp(state.stress - 5)
    state.feed_count += 1
    state.xp += 5
    return f"{state.name} munches happily! 🍙"


def play(state: PetState, intensity: float = 1.0) -> str:
    if state.energy < 15:
        return f"{state.name} is too tired to play…"
    state.energy = clamp(state.energy - 15 * intensity)
    state.curiosity = clamp(state.curiosity - 30 * intensity)
    state.hunger = clamp(state.hunger + 8 * intensity)
    state.stress = clamp(state.stress - 15 * intensity)
    state.play_count += 1
    state.xp += 10
    return f"{state.name} bounces around with joy! 🎾"


def rest(state: PetState) -> str:
    state.energy = clamp(state.energy + 40)
    state.stress = clamp(state.stress - 20)
    state.hunger = clamp(state.hunger + 5)
    state.rest_count += 1
    state.xp += 5
    return f"{state.name} curls up for a cozy nap. 💤"


# --- derived mood ------------------------------------------------------------

def mood(state: PetState) -> Tuple[str, str]:
    """Return (emoji, label)."""
    if state.stress >= 70 or state.hunger >= 85:
        return "😿", "Stressed"
    if state.hunger >= 60:
        return "🙀", "Hungry"
    if state.energy <= 25:
        return "😾", "Tired"
    if state.curiosity >= 70:
        return "😼", "Bored"
    if state.stress <= 25 and state.hunger <= 40 and state.energy >= 60:
        return "😸", "Happy"
    return "😺", "Content"