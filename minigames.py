"""Mini-games for Pocket Pet.

Each game mutates the PetState on success and pokes `st.session_state.reaction`
so the 3D cat plays a matching animation on the next rerun.
"""
from __future__ import annotations

import random

import streamlit as st

from pet_engine import PetState, clamp


EMOJIS = ["🍎", "🍌", "🍇", "🍓", "🥕", "🍩"]


def pattern_memory_game(pet: PetState, prefix: str = "pm") -> None:
    """Watch a sequence of emojis, then repeat it. Rounds get longer.

    Rewards the pet (curiosity↓, stress↓, XP↑) on each cleared round, and
    triggers the 3D "play" behavior so the cat chases its ball.
    """
    seq_key   = f"{prefix}_seq"
    idx_key   = f"{prefix}_idx"
    stage_key = f"{prefix}_stage"
    score_key = f"{prefix}_score"

    # --- first-time setup ---------------------------------------------------
    if seq_key not in st.session_state:
        st.session_state[seq_key]   = [random.choice(EMOJIS) for _ in range(3)]
        st.session_state[idx_key]   = 0
        st.session_state[stage_key] = "show"
        st.session_state[score_key] = 0

    seq = st.session_state[seq_key]

    # --- show phase ---------------------------------------------------------
    if st.session_state[stage_key] == "show":
        st.markdown("**Watch the sequence:**")
        st.markdown(f"### {'  '.join(seq)}")
        if st.button("✅ I'm ready", key=f"{prefix}_ready"):
            st.session_state[stage_key] = "input"
            st.session_state[idx_key]   = 0
            st.rerun()
        st.caption(f"Rounds cleared: {st.session_state[score_key]}")
        return

    # --- input phase --------------------------------------------------------
    progress = st.session_state[idx_key]
    st.markdown(f"**Repeat it!**  Progress: `{progress}/{len(seq)}`")

    cols = st.columns(len(EMOJIS))
    clicked = None
    for i, e in enumerate(EMOJIS):
        if cols[i].button(e, key=f"{prefix}_btn_{i}", use_container_width=True):
            clicked = e

    if clicked is None:
        return

    if clicked == seq[progress]:
        st.session_state[idx_key] = progress + 1

        # ---- round complete ------------------------------------------------
        if st.session_state[idx_key] == len(seq):
            # Reward the pet
            pet.curiosity  = clamp(pet.curiosity - 25)
            pet.energy     = clamp(pet.energy - 8)
            pet.stress     = clamp(pet.stress - 12)
            pet.xp        += 15
            pet.play_count += 1

            st.session_state[score_key] += 1

            # Level up: sequence grows (capped at 6)
            new_len = min(len(seq) + 1, 6)
            st.session_state[seq_key]   = [random.choice(EMOJIS) for _ in range(new_len)]
            st.session_state[stage_key] = "show"

            # 👇 tell the 3D cat to play
            st.session_state.reaction = "play"

            st.toast("Nice! Level up 🎉  (+15 XP)")

        st.rerun()

    # ---- wrong answer ------------------------------------------------------
    else:
        # Small comfort penalty so mistakes hurt a little
        pet.stress = clamp(pet.stress + 3)

        # Reset the round back to length 3
        st.session_state[seq_key]   = [random.choice(EMOJIS) for _ in range(3)]
        st.session_state[stage_key] = "show"
        st.session_state[idx_key]   = 0

        # 👇 cat gets a little sulky — play a "rest"/sad beat
        st.session_state.reaction = "rest"

        st.toast("Oops — wrong one. Back to round 1 🥲")
        st.rerun()


def reset_game(pet: PetState, prefix: str = "pm") -> None:
    """Optional helper — clears the game state for a fresh start."""
    for suffix in ("seq", "idx", "stage", "score"):
        st.session_state.pop(f"{prefix}_{suffix}", None)