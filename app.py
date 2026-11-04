"""Pocket Pet — launcher.

The game itself is a standalone web app in ``static/pet/`` (Three.js + Web
Audio, saves to the browser). Streamlit serves it as a static file and this
page embeds it. Talking to the cat needs the microphone, which browsers only
allow in the top-level page, so there's also a full-screen link.

    streamlit run app.py

The original Streamlit version is kept in ``app_classic.py``.
"""
from __future__ import annotations

import streamlit as st

GAME_URL = "/app/static/pet/index.html"

st.set_page_config(page_title="Pocket Pet", page_icon="🐾", layout="wide")

# Let the game use the whole page.
st.markdown(
    """
    <style>
      .block-container { padding-top: 0.6rem; padding-bottom: 0.4rem; max-width: 1400px; }
      header[data-testid="stHeader"] { display: none; }
    </style>
    """,
    unsafe_allow_html=True,
)

left, right = st.columns([3, 1], vertical_alignment="center")
left.markdown("### 🐾 Pocket Pet")
right.link_button("Open full screen · enables talking 🎙️", GAME_URL, use_container_width=True)

st.iframe(GAME_URL, height=780)

st.caption(
    "Tip: on your phone, open the full-screen link and use **Add to Home Screen** — "
    "it installs like an app and works offline. · Cat model: "
    "[Somali Cat Animated ver 1.2](https://sketchfab.com/3d-models/somali-cat-animated-ver-12-e185c3fd92b64c32b4515a32b29252fc) "
    "by [DreamNoms](https://sketchfab.com/DreamNoms), "
    "[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); "
    "[Cat](https://poly.pizza/m/DJ9rpAhrh3) by J-Toastie, "
    "[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). · Dog models: "
    "Husky, Shiba Inu and [German Shepherd](https://poly.pizza/m/Hssa6NPc6W) "
    "by [Quaternius](https://quaternius.com/), [CC0](https://creativecommons.org/publicdomain/zero/1.0/); "
    "[Pug](https://poly.pizza/m/xvcUwuKl4c) by Quaternius, [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). · "
    "Hamster: [Hamster](https://poly.pizza/m/3YtzEQ5TVUP) by Poly by Google, "
    "[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)."
)
