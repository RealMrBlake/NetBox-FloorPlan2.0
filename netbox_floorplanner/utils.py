import re

from django.utils import formats

__all__ = ('format_meters', 'format_room_size', 'parse_room_size')

# Accepts e.g. "4x3", "4 x 3 m", "4m x 3m", "12,5 × 8", "4.2*3"
ROOM_SIZE_RE = re.compile(
    r'^\s*(\d+(?:[.,]\d+)?)\s*m?\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*m?\s*$',
    re.IGNORECASE,
)


def parse_room_size(value):
    """Parse "<width> x <depth>" in meters; returns (width_cm, depth_cm) or None."""
    match = ROOM_SIZE_RE.match(value or '')
    if not match:
        return None
    width, depth = (round(float(v.replace(',', '.')) * 100) for v in match.groups())
    return width, depth


def format_meters(cm):
    """Format a centimeter value as meters using the active locale, e.g. 450 -> "4,5"."""
    text = f'{cm / 100:.2f}'.rstrip('0').rstrip('.')
    return text.replace('.', formats.get_format('DECIMAL_SEPARATOR'))


def format_room_size(width_cm, depth_cm):
    return f'{format_meters(width_cm)} x {format_meters(depth_cm)}'
