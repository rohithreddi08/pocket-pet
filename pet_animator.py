"""Animated SVG pet for Pocket Pet.

Renders a self-contained HTML+SVG+CSS widget. CSS keyframes are keyed off a
mood class so the pet visually communicates its state without any JS.
"""
from __future__ import annotations

import streamlit as st

# Map engine mood labels -> CSS class suffix.
MOOD_CLASS = {
    "Happy": "happy",
    "Content": "content",
    "Tired": "tired",
    "Hungry": "hungry",
    "Bored": "bored",
    "Stressed": "stressed",
}

# One-shot reaction emoji per action key.
REACTIONS = {
    "feed": "🍙",
    "play": "🎾",
    "rest": "💤",
    "study": "🌟",
}


def render_animated_pet(
    mood_label: str,
    reaction: str | None = None,
    height: int = 280,
) -> None:
    """Render the animated pet.

    mood_label: one of the labels returned by `pet_engine.mood()`.
    reaction:  optional action key — plays a brief floating-emoji burst.
    """
    mood_class = MOOD_CLASS.get(mood_label, "content")

    burst_html = ""
    if reaction in REACTIONS:
        burst_html = f'<div class="burst">{REACTIONS[reaction]}</div>'

    zzz_html = '<div class="zzz">z</div>' if reaction == "rest" else ""

    html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * {{ box-sizing: border-box; }}
  html, body {{
    margin: 0; padding: 0; height: 100%;
    display: flex; align-items: center; justify-content: center;
    background: transparent; overflow: hidden;
  }}
  .stage {{
    width: 100%; height: 100%; position: relative;
    display: flex; align-items: center; justify-content: center;
  }}
  .pet-wrap {{
    width: 230px; height: 230px; position: relative;
    display: flex; align-items: center; justify-content: center;
  }}
  svg.pet {{
    width: 100%; height: 100%;
    transform-origin: center 82%;
    animation: breathe 3s ease-in-out infinite;
  }}

  /* --- idle breathing --- */
  @keyframes breathe {{
    0%, 100% {{ transform: scale(1) translateY(0); }}
    50%      {{ transform: scale(1.025) translateY(-3px); }}
  }}

  /* --- blink --- */
  .eye {{
    transform-origin: center;
    animation: blink 4.5s ease-in-out infinite;
  }}
  @keyframes blink {{
    0%, 88%, 100% {{ transform: scaleY(1); }}
    92%           {{ transform: scaleY(0.08); }}
  }}

  /* --- tail wag --- */
  .tail {{
    transform-origin: 148px 152px;
    animation: tail 2.4s ease-in-out infinite;
  }}
  @keyframes tail {{
    0%, 100% {{ transform: rotate(-8deg); }}
    50%      {{ transform: rotate(12deg); }}
  }}

  /* ---------- mood overrides ---------- */
  .mood-happy svg.pet {{ animation: hop 1.2s ease-in-out infinite; }}
  @keyframes hop {{
    0%, 100% {{ transform: translateY(0) scale(1); }}
    40%, 60% {{ transform: translateY(-14px) scale(1.03); }}
  }}
  .mood-happy .tail {{ animation-duration: 0.7s; }}

  .mood-tired svg.pet {{ animation: sway 5s ease-in-out infinite; }}
  @keyframes sway {{
    0%, 100% {{ transform: rotate(-2deg); }}
    50%      {{ transform: rotate(2deg); }}
  }}

  .mood-stressed svg.pet {{ animation: shake 0.35s ease-in-out infinite; }}
  @keyframes shake {{
    0%, 100% {{ transform: translateX(0); }}
    25%      {{ transform: translateX(-2px); }}
    75%      {{ transform: translateX(2px); }}
  }}

  .mood-hungry .mouth {{ animation: chew 1.1s ease-in-out infinite; }}
  @keyframes chew {{
    0%, 100% {{ transform: translateY(0); }}
    50%      {{ transform: translateY(2px); }}
  }}

  /* --- reaction burst --- */
  .burst {{
    position: absolute; top: 8%; left: 50%;
    font-size: 42px; pointer-events: none;
    animation: pop 1.6s ease-out forwards;
  }}
  @keyframes pop {{
    0%   {{ opacity: 0; transform: translate(-50%, 20px) scale(0.4); }}
    30%  {{ opacity: 1; transform: translate(-50%, -10px) scale(1.2); }}
    100% {{ opacity: 0; transform: translate(-50%, -60px) scale(1); }}
  }}

  /* --- floating z's when resting --- */
  .zzz {{
    position: absolute; top: 6%; right: 12%;
    font-size: 30px; color: #7c9cbf; font-weight: 700;
    animation: float 2.8s ease-in-out infinite;
  }}
  @keyframes float {{
    0%   {{ opacity: 0; transform: translate(0, 0) scale(0.5); }}
    30%  {{ opacity: 1; }}
    100% {{ opacity: 0; transform: translate(28px, -40px) scale(1.1); }}
  }}
</style>
</head>
<body>
  <div class="stage mood-{mood_class}">
    <div class="pet-wrap">
      {burst_html}
      {zzz_html}
      <svg class="pet" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
        <!-- tail -->
        <g class="tail">
          <path d="M 148 152 Q 180 140 172 105"
                stroke="#f4a261" stroke-width="9" fill="none"
                stroke-linecap="round"/>
        </g>

        <!-- body -->
        <ellipse cx="100" cy="152" rx="52" ry="36" fill="#f4a261"/>
        <ellipse cx="100" cy="158" rx="34" ry="22" fill="#ffd7a8" opacity="0.85"/>

        <!-- paws -->
        <ellipse cx="72" cy="184" rx="12" ry="7" fill="#f4a261"/>
        <ellipse cx="128" cy="184" rx="12" ry="7" fill="#f4a261"/>

        <!-- ears -->
        <polygon points="58,74 66,32 92,64" fill="#f4a261"/>
        <polygon points="108,64 134,32 142,74" fill="#f4a261"/>
        <polygon points="65,68 70,45 84,64" fill="#ffcf9e"/>
        <polygon points="116,64 130,45 135,68" fill="#ffcf9e"/>

        <!-- head -->
        <circle cx="100" cy="98" r="50" fill="#f4a261"/>

        <!-- cheeks -->
        <ellipse cx="72" cy="110" rx="8" ry="5" fill="#ff9fb0" opacity="0.55"/>
        <ellipse cx="128" cy="110" rx="8" ry="5" fill="#ff9fb0" opacity="0.55"/>

        <!-- whiskers -->
        <g stroke="#8a5a2b" stroke-width="1.4" stroke-linecap="round" opacity="0.55">
          <line x1="42" y1="104" x2="66" y2="108"/>
          <line x1="42" y1="116" x2="66" y2="116"/>
          <line x1="134" y1="108" x2="158" y2="104"/>
          <line x1="134" y1="116" x2="158" y2="116"/>
        </g>

        <!-- eyes -->
        <g class="eyes">
          <ellipse class="eye" cx="82" cy="94" rx="6.5" ry="9" fill="#2b2b2b"/>
          <ellipse class="eye" cx="118" cy="94" rx="6.5" ry="9" fill="#2b2b2b"/>
          <circle cx="84" cy="90" r="2.2" fill="#fff"/>
          <circle cx="120" cy="90" r="2.2" fill="#fff"/>
        </g>

        <!-- nose -->
        <path d="M 95 108 L 105 108 L 100 114 Z" fill="#e0566b"/>

        <!-- mouth -->
        <g stroke="#2b2b2b" stroke-width="2" fill="none" stroke-linecap="round">
          <path class="mouth" d="M 100 114 Q 94 121 87 118"/>
          <path class="mouth" d="M 100 114 Q 106 121 113 118"/>
        </g>
      </svg>
    </div>
  </div>
</body>
</html>"""

    st.iframe(html, height=height)