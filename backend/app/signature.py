"""Turns a doctor's signature image — however it arrived, an uploaded
photo/scan or a PNG exported straight off an on-screen drawing canvas —
into a consistent ink-on-transparent PNG, so the prescription PDF never
shows a stray white/paper-colored rectangle around it.

Kept separate from pdf.py (which only ever *reads* a signature that's
already been processed and stored) and from routers/staff.py (which just
calls this once, on upload).
"""

import base64
import io

from PIL import Image

# Anything this light is treated as background — comfortably above typical
# paper/scan shading, comfortably below faint pencil strokes. Antialiased
# edge pixels fade in gradually via the alpha scale below rather than
# hard-cutting at this threshold, so strokes don't look jagged.
_WHITE_THRESHOLD = 235


def make_transparent(image_bytes: bytes) -> bytes:
    """Returns a PNG (as bytes) with near-white pixels faded to
    transparent — a drawn signature (already on a white/transparent
    canvas) passes through with little visible change; an uploaded
    photo/scan of ink-on-paper has its background actually removed."""
    img = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
    pixels = img.getdata()
    new_pixels = []
    for r, g, b, a in pixels:
        brightness = (r + g + b) / 3
        if brightness >= _WHITE_THRESHOLD:
            new_pixels.append((r, g, b, 0))
        elif brightness >= _WHITE_THRESHOLD - 40:
            # Linear fade through the near-white band so anti-aliased stroke
            # edges don't get a hard, jagged cutoff.
            fade = (_WHITE_THRESHOLD - brightness) / 40
            new_pixels.append((r, g, b, round(a * fade)))
        else:
            new_pixels.append((r, g, b, a))
    img.putdata(new_pixels)

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def process_data_url(data_url: str) -> str:
    """Takes a data:image/...;base64,... string (what both the file-upload
    input and the drawing canvas send), strips the background, and returns
    a bare base64 PNG string (no "data:" prefix — that's what's stored in
    Staff.signature_image; add the prefix back on the way out)."""
    header, _, encoded = data_url.partition(",")
    if not encoded:
        raise ValueError("Not a data URL")
    raw = base64.b64decode(encoded)
    transparent = make_transparent(raw)
    return base64.b64encode(transparent).decode("ascii")
