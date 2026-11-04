"""
Server-side SVG preview of a floor plan (read-only, no JavaScript). Mirrors the
shape styling of the designer in floorplanner.js in a simplified form.
"""
from django.utils.html import escape
from django.utils.safestring import mark_safe

from .utils import format_meters

__all__ = ('render_preview_svg',)

TYPE_COLORS = {
    'area': '#22c55e', 'wall': '#475569', 'door': '#b45309', 'window': '#0ea5e9', 'column': '#64748b',
    'rack': '#3b82f6', 'device': '#8b5cf6', 'cooling': '#06b6d4', 'power': '#f59e0b', 'label': '#334155',
}
FILLED_TYPES = ('rack', 'device', 'cooling', 'power')


def _shade(hex_color):
    try:
        n = int(hex_color.lstrip('#'), 16)
    except ValueError:
        return hex_color
    return '#{:02x}{:02x}{:02x}'.format(*(round(((n >> s) & 255) * 0.7) for s in (16, 8, 0)))


def _item_svg(item):
    x, y, w, h = item.x, item.y, item.width, item.height
    cx, cy = x + w / 2, y + h / 2
    color = item.color or TYPE_COLORS.get(item.item_type, '#868e96')
    parts = []
    t = item.item_type
    if t == 'area':
        parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="4" fill="{color}" fill-opacity="0.12" '
                     f'stroke="{color}" stroke-width="2" stroke-dasharray="8 4" vector-effect="non-scaling-stroke"/>')
    elif t in ('wall', 'door'):
        parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{color}"/>')
        if t == 'door':
            parts.append(f'<path d="M {x + w} {y} A {w} {w} 0 0 0 {x} {y - w} L {x} {y}" fill="{color}" '
                         f'fill-opacity="0.08" stroke="{color}" stroke-dasharray="4 3" vector-effect="non-scaling-stroke"/>')
    elif t == 'window':
        parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" style="fill:var(--fp-floor,#fff)" '
                     f'stroke="{color}" stroke-width="2" vector-effect="non-scaling-stroke"/>')
    elif t == 'column':
        parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{color}" fill-opacity="0.35" '
                     f'stroke="{color}" stroke-width="2" vector-effect="non-scaling-stroke"/>'
                     f'<path d="M {x} {y} L {x + w} {y + h} M {x + w} {y} L {x} {y + h}" stroke="{color}" '
                     f'vector-effect="non-scaling-stroke"/>')
    elif t in FILLED_TYPES:
        parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="2" fill="{color}" fill-opacity="0.85" '
                     f'stroke="{_shade(color)}" stroke-width="2" vector-effect="non-scaling-stroke"/>')
        if t == 'rack':
            fh = min(h * 0.12, 10)
            parts.append(f'<rect x="{x}" y="{y + h - fh}" width="{w}" height="{fh}" fill="{_shade(color)}"/>')

    text = item.label or (item.rack.name if item.rack_id else item.device.name if item.device_id else '')
    if text:
        if t == 'label':
            fs = max(8, h * 0.6)
        else:
            fs = max(6, min(h * 0.3, (w * 1.6) / max(len(text), 3), 60))
        fill = '#ffffff' if t in FILLED_TYPES else (item.color or 'currentColor') if t == 'label' else _shade(color)
        anchor, tx, ty = ('start', x + fs * 0.5, y + fs * 1.2) if t == 'area' else ('middle', cx, cy)
        # Keep text readable on items rotated upside down
        flip = f' transform="rotate(180 {tx} {ty})"' if 90 < item.rotation % 360 <= 270 else ''
        parts.append(f'<text x="{tx}" y="{ty}" font-size="{fs:.1f}" font-weight="600" text-anchor="{anchor}" '
                     f'dominant-baseline="middle" fill="{fill}"{flip}>{escape(text)}</text>')

    transform = f' transform="rotate({item.rotation} {cx} {cy})"' if item.rotation else ''
    return f'<g{transform}>{"".join(parts)}</g>'


def render_preview_svg(floorplan):
    width, depth = floorplan.width, floorplan.depth
    fs = max(10, min(max(width, depth) * 0.025, 200))
    m = fs * 2
    items = floorplan.items.select_related('rack', 'device').order_by('z_index', 'pk')
    background = ''
    if floorplan.background_image:
        background = (f'<image href="{escape(floorplan.background_image.url)}" x="0" y="0" width="{width}" '
                      f'height="{depth}" preserveAspectRatio="none" opacity="{floorplan.background_opacity / 100}"/>')
    return mark_safe(
        f'<svg class="fp-preview" xmlns="http://www.w3.org/2000/svg" viewBox="{-m} {-m} {width + 2 * m} {depth + 2 * m}" '
        f'role="img" aria-label="{escape(floorplan.name)}" font-family="Inter, system-ui, sans-serif">'
        f'<rect x="0" y="0" width="{width}" height="{depth}" style="fill:var(--fp-floor,#fff)"/>'
        f'{background}'
        f'{"".join(_item_svg(i) for i in items)}'
        f'<rect x="0" y="0" width="{width}" height="{depth}" fill="none" style="stroke:var(--fp-wall,#334155)" '
        f'stroke-width="4" vector-effect="non-scaling-stroke"/>'
        f'<text x="{width / 2}" y="{-fs * 0.6}" font-size="{fs:.1f}" text-anchor="middle" '
        f'style="fill:var(--fp-muted,#6c757d)">{format_meters(width)} m</text>'
        f'<text transform="translate({-fs * 0.6} {depth / 2}) rotate(-90)" font-size="{fs:.1f}" text-anchor="middle" '
        f'style="fill:var(--fp-muted,#6c757d)">{format_meters(depth)} m</text>'
        f'</svg>'
    )
