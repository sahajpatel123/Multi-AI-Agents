"""Generate the Arena Open Graph share image (1200x630 PNG).

The image is the static asset behind ``og:image`` and ``twitter:image``
in web/frontend/index.html. Sharing any Arena URL (a room link, a
prompt result) embeds this card — text-only links render a blank box
on Twitter/LinkedIn/Slack and destroy click-through.

Re-generate with:
    cd backend && python tools/generate_og_image.py

Writes: web/frontend/public/og-image.png
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# Brand palette — keep in sync with web/frontend/tailwind.config.js
BG = (250, 247, 244)        # background #FAF7F4
INK = (26, 23, 20)          # text-primary #1A1714
INK_SOFT = (107, 100, 96)   # text-secondary #6B6460
ACCENT = (196, 149, 106)    # accent #C4956A (warm copper)
BORDER = (224, 216, 208)    # border #E0D8D0

AGENT_COLORS = [
    (140, 155, 171),  # agent 1 — slate
    (155, 143, 170),  # agent 2 — mauve
    (138, 168, 153),  # agent 3 — sage
    (176, 151, 126),  # agent 4 — sienna
]

WIDTH, HEIGHT = 1200, 630
OUTPUT_PATH = (
    Path(__file__).resolve().parent.parent.parent / "frontend" / "public" / "og-image.png"
)


def _load_font(size: int) -> ImageFont.FreeTypeFont:
    """Load a serif font, falling back to PIL's default.

    Uses macOS / common Linux font paths. Falls back to PIL's bitmap
    default if nothing matches — the OG image still renders, just less
    polished. The visual hierarchy survives either way.
    """
    for name in (
        "/System/Library/Fonts/Supplemental/Georgia.ttf",
        "/Library/Fonts/Georgia.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf",
    ):
        try:
            return ImageFont.truetype(name, size=size)
        except OSError:
            continue
    return ImageFont.load_default()


def render() -> None:
    img = Image.new("RGB", (WIDTH, HEIGHT), BG)
    draw = ImageDraw.Draw(img)

    # Top accent bar — thin copper strip so the card reads as Arena even
    # at 200px thumbnail size on a Slack/Discord unfurl.
    draw.rectangle([(0, 0), (WIDTH, 8)], fill=ACCENT)

    # Subtle outer border for definition against dark surfaces.
    draw.rectangle(
        [(24, 24), (WIDTH - 24, HEIGHT - 24)],
        outline=BORDER,
        width=1,
    )

    # Brand wordmark.
    wordmark = _load_font(72)
    draw.text((80, 110), "Arena", fill=INK, font=wordmark)

    tagline = _load_font(30)
    draw.text(
        (80, 200),
        "Multi-AI Agent Chatroom",
        fill=INK_SOFT,
        font=tagline,
    )

    # The hook — large, two-line, high-contrast.
    headline = _load_font(64)
    draw.text(
        (80, 300),
        "Four minds. One question.",
        fill=INK,
        font=headline,
    )
    draw.text(
        (80, 380),
        "The best answer wins.",
        fill=INK,
        font=headline,
    )

    # Visual signal of the 4-agent panel: 4 colored chips on the right
    # side, sized to be visible at thumbnail resolution.
    chip_radius = 36
    chip_y = 470
    chip_x_start = 80
    chip_spacing = 110
    for i, color in enumerate(AGENT_COLORS):
        cx = chip_x_start + i * chip_spacing
        cy = chip_y
        draw.ellipse(
            [(cx - chip_radius, cy - chip_radius), (cx + chip_radius, cy + chip_radius)],
            fill=color,
        )
        # Agent ordinal "1"–"4" inside each chip.
        label = _load_font(36)
        text = str(i + 1)
        bbox = draw.textbbox((0, 0), text, font=label)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        draw.text(
            (cx - tw / 2 - bbox[0], cy - th / 2 - bbox[1]),
            text,
            fill=BG,
            font=label,
        )

    # Domain line at the bottom — anchors the brand even when the card
    # is cropped or rendered tiny.
    domain_font = _load_font(28)
    draw.text(
        (80, HEIGHT - 90),
        "arena.ai",
        fill=INK_SOFT,
        font=domain_font,
    )

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUTPUT_PATH, format="PNG", optimize=True)
    print(f"Wrote {OUTPUT_PATH} ({WIDTH}x{HEIGHT})")


if __name__ == "__main__":
    render()
er()
