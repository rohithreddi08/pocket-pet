"""Pocket Pet (classic) — the original Streamlit version, kept for reference.

Run with: streamlit run app_classic.py   (the main app is now app.py → static/pet/)

Full app entrypoint. Pet state lives in `pet_engine.py`, persistence in
`storage.py`, the 3D animated pet in `pet3d.py`, and the mini-game in
`minigames.py`.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import streamlit as st

from pet_engine import PetState, clamp, feed, mood, play, rest, tick
from storage import load_pet, save_pet
from minigames import pattern_memory_game
from pet3d import render_pet_3d


# ---------------------------------------------------------------------------
# Page config
# ---------------------------------------------------------------------------
st.set_page_config(page_title="Pocket Pet", page_icon="🐾", layout="centered")


# ---------------------------------------------------------------------------
# Session bootstrap
# ---------------------------------------------------------------------------
def get_user_id() -> str:
    """Stable per-browser id, persisted in the URL query string."""
    if "user_id" not in st.session_state:
        uid = st.query_params.get("uid")
        if not uid:
            uid = uuid.uuid4().hex[:8]
            st.query_params["uid"] = uid
        st.session_state.user_id = uid
    return st.session_state.user_id


def persist() -> None:
    save_pet(get_user_id(), st.session_state.pet)


if "pet" not in st.session_state:
    st.session_state.pet = load_pet(get_user_id()) or PetState()

if "reaction" not in st.session_state:
    st.session_state.reaction = None


# ---------------------------------------------------------------------------
# Small UI helper
# ---------------------------------------------------------------------------
def stat_bar(label: str, value: float, icon: str, higher_is_better: bool = False) -> None:
    """Render a colour-coded stat bar. For most stats, low is good."""
    badness = (100 - value) if higher_is_better else value
    colour = "#4caf50" if badness < 40 else "#ff9800" if badness < 70 else "#f44336"
    st.markdown(
        f"**{icon} {label}** &nbsp; `{int(value)}`"
        f"<div style='background:#e8e8e8;border-radius:8px;height:10px;margin:2px 0 10px;'>"
        f"<div style='width:{value:.0f}%;background:{colour};height:10px;border-radius:8px;"
        f"transition:width .4s ease;'></div></div>",
        unsafe_allow_html=True,
    )


# ---------------------------------------------------------------------------
# Header
# ---------------------------------------------------------------------------
st.title("🐾 Pocket Pet")
st.caption("A tiny zero-mess companion for hostel life and study breaks.")


# ---------------------------------------------------------------------------
# 3D animated pet (NOT auto-refreshed — keeps the WebGL scene alive)
# ---------------------------------------------------------------------------
pet = st.session_state.pet
studying = st.session_state.get("study_start") is not None
tick(pet, relaxed=studying)
_, label = mood(pet)

trigger = st.session_state.reaction
st.session_state.reaction = None            # play once

render_pet_3d(
    name=pet.name,
    hunger=pet.hunger,
    energy=pet.energy,
    curiosity=pet.curiosity,
    stress=pet.stress,
    trigger=trigger,
)
persist()


# ---------------------------------------------------------------------------
# Stat bars (auto-refresh every 20 s)
# ---------------------------------------------------------------------------
@st.fragment(run_every="20s")
def stat_panel() -> None:
    pet = st.session_state.pet
    studying = st.session_state.get("study_start") is not None
    tick(pet, relaxed=studying)
    persist()

    _, label = mood(pet)
    st.caption(f"**{pet.name}** · feeling {label.lower()}")

    c1, c2 = st.columns(2)
    with c1:
        stat_bar("Hunger",    pet.hunger,    "🍽️")
        stat_bar("Curiosity", pet.curiosity, "🔍")
    with c2:
        stat_bar("Energy",    pet.energy,    "⚡", higher_is_better=True)
        stat_bar("Stress",    pet.stress,    "💢")

    st.caption(f"⭐ XP: {pet.xp}")


stat_panel()


# ---------------------------------------------------------------------------
# Tabs
# ---------------------------------------------------------------------------
tab_care, tab_game, tab_study, tab_settings = st.tabs(
    ["🐾 Care", "🎮 Mini-game", "📚 Study", "⚙️ Settings"]
)


# --- Care ------------------------------------------------------------------
with tab_care:
    st.subheader("Care actions")
    c1, c2, c3 = st.columns(3)

    if c1.button("🍙 Feed", use_container_width=True):
        st.toast(feed(st.session_state.pet))
        st.session_state.reaction = "feed"
        persist()
        st.rerun()

    if c2.button("🎾 Play", use_container_width=True):
        st.toast(play(st.session_state.pet))
        st.session_state.reaction = "play"
        persist()
        st.rerun()

    if c3.button("💤 Rest", use_container_width=True):
        st.toast(rest(st.session_state.pet))
        st.session_state.reaction = "rest"
        persist()
        st.rerun()

    st.divider()
    st.caption(
        f"Fed {st.session_state.pet.feed_count}× · "
        f"Played {st.session_state.pet.play_count}× · "
        f"Rested {st.session_state.pet.rest_count}×"
    )


# --- Mini-game -------------------------------------------------------------
with tab_game:
    st.subheader("🧠 Pattern Memory")
    st.caption("Clears boredom and stress. Keep the streak alive to level up.")
    pattern_memory_game(st.session_state.pet)
    persist()


# --- Study -----------------------------------------------------------------
with tab_study:
    st.subheader("📚 Focus session")

    @st.fragment(run_every="1s")
    def study_timer() -> None:
        pet = st.session_state.pet
        start = st.session_state.get("study_start")

        if start is None:
            st.info(
                "Start a focus session — the pet relaxes while you work and "
                "rewards you when you finish."
            )
            dur = st.select_slider(
                "Session length (minutes)",
                options=[10, 15, 25, 45, 60],
                value=25,
            )
            if st.button("▶️ Start focus session", type="primary"):
                st.session_state.study_start = datetime.now(timezone.utc).isoformat()
                st.session_state.study_dur = dur
                st.session_state.study_done = False
            return

        start_dt = datetime.fromisoformat(start)
        dur_s = st.session_state.study_dur * 60
        elapsed = (datetime.now(timezone.utc) - start_dt).total_seconds()
        remaining = max(0.0, dur_s - elapsed)
        m, s = divmod(int(remaining), 60)

        st.metric("Time remaining", f"{m:02d}:{s:02d}")
        st.progress(min(1.0, elapsed / dur_s))

        if remaining <= 0 and not st.session_state.get("study_done"):
            pet.stress = clamp(pet.stress - 20)
            pet.energy = clamp(pet.energy - 5)
            pet.xp += 25
            st.session_state.study_done = True
            st.session_state.reaction = "play"
            persist()
            st.success("Focus complete! Your pet gives you a proud little headbutt. 🌟")
            st.rerun(scope="app")

        if st.button("⏹️ End session"):
            st.session_state.study_start = None
            st.session_state.study_done = False

    study_timer()


# --- Settings --------------------------------------------------------------
with tab_settings:
    st.subheader("Settings")
    pet = st.session_state.pet

    new_name = st.text_input("Pet name", value=pet.name, max_chars=20)
    if new_name.strip() and new_name != pet.name:
        pet.name = new_name.strip()
        persist()
        st.toast("Renamed ✨")

    st.divider()
    st.caption(
        f"Your pet ID: `{get_user_id()}` — bookmark this page to "
        f"come back to the same pet."
    )

    if st.button("🔄 Reset pet", type="secondary"):
        st.session_state.pet = PetState(name=pet.name)
        persist()
        st.rerun()


# ---------------------------------------------------------------------------
# Final persistence for top-level interactions
# ---------------------------------------------------------------------------
persist()