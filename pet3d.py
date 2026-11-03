"""Embed the 3D cat in the Streamlit app.

Public API
----------
    render_pet_3d(name, hunger, energy, curiosity, stress, trigger=None, height=520)

By default this renders the Three.js viewer in ``static/cat/`` (served by
Streamlit's static file serving at ``/app/static/...``). The pet's needs and the
last care action are passed in the URL, so the cat's behavior follows the app
state: a hungry cat heads for its bowl, a tired one goes to bed, "feed" / "play"
/ "rest" trigger the matching routine.

Drop a rigged, animated cat at ``static/cat/assets/cat_rigged.glb`` and the
viewer uses it automatically; otherwise it falls back to ``assets/cat.glb``.
"""
from __future__ import annotations

import json
from urllib.parse import quote

import streamlit as st

_VIEWER_URL = "/app/static/cat/index.html"

# static/cat/assets/cat_rigged.glb — update these if you swap the model.
_CAT_MODEL_TITLE = "Somali Cat Animated ver 1.2"
_CAT_MODEL_PAGE = "https://sketchfab.com/3d-models/somali-cat-animated-ver-12-e185c3fd92b64c32b4515a32b29252fc"
_CAT_MODEL_AUTHOR = "DreamNoms"
_CAT_AUTHOR_PAGE = "https://sketchfab.com/DreamNoms"

_SKETCHFAB_URL = "https://sketchfab.com/models/b5795251a57143498ee7a9f1171e4190/embed"
_MODEL_PAGE = "https://sketchfab.com/3d-models/toyger-kitten-cat-b5795251a57143498ee7a9f1171e4190"
_AUTHOR_PAGE = "https://sketchfab.com/Nyilonelycompany"


def render_pet_3d(
    name: str,
    hunger: float,
    energy: float,
    curiosity: float,
    stress: float,
    trigger: str | None = None,
    height: int = 520,
    viewer: str = "local",
) -> None:
    """Render the 3D cat.

    Parameters
    ----------
    name       : pet name shown in the viewer HUD
    hunger, energy, curiosity, stress : 0–100 needs that drive the cat's routine
    trigger    : last care action ("feed", "play", "rest") — played once
    height     : iframe height in pixels
    viewer     : "local" (Three.js viewer, behavior-driven) or "sketchfab"
                 (static embed of the Toyger Kitten model, no behavior)
    """
    if viewer == "sketchfab":
        st.caption(f"{name}'s 3D companion")
        st.iframe(_SKETCHFAB_URL, height=height)
        st.markdown(
            f"[**Toyger Kitten Cat**]({_MODEL_PAGE}) by "
            f"[**Nyilonelycompany**]({_AUTHOR_PAGE}) on [Sketchfab](https://sketchfab.com)"
        )
        return

    # Bucket the needs: they drift every tick, and an unchanged URL keeps the
    # iframe (and its WebGL scene) alive across reruns.
    def bucket(value: float) -> int:
        return int(round(value / 5) * 5)

    state = {
        "name": name,
        "hunger": bucket(hunger),
        "energy": bucket(energy),
        "curiosity": bucket(curiosity),
        "stress": bucket(stress),
        "trigger": trigger,
    }
    st.iframe(f"{_VIEWER_URL}?state={quote(json.dumps(state))}", height=height)
    # Required by the model's CC BY 4.0 license.
    st.caption(
        f"Cat model: [{_CAT_MODEL_TITLE}]({_CAT_MODEL_PAGE}) by "
        f"[{_CAT_MODEL_AUTHOR}]({_CAT_AUTHOR_PAGE}), "
        "[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)"
    )
