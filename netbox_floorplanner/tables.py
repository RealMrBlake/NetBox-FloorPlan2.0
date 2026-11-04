import django_tables2 as tables
from django.utils.translation import gettext_lazy as _
from netbox.tables import NetBoxTable, columns

from .models import FloorPlan
from .utils import format_room_size

__all__ = ('FloorPlanTable',)


class FloorPlanTable(NetBoxTable):
    name = tables.Column(verbose_name=_('Name'), linkify=True)
    site = tables.Column(verbose_name=_('Site'), linkify=True)
    location = tables.Column(verbose_name=_('Location'), linkify=True)
    room_size = tables.Column(verbose_name=_('Room size (m)'), empty_values=(), orderable=False)
    width = tables.Column(verbose_name=_('Width (cm)'))
    depth = tables.Column(verbose_name=_('Depth (cm)'))
    item_count = tables.Column(verbose_name=_('Items'))
    rack_count = tables.Column(verbose_name=_('Racks'))
    tags = columns.TagColumn(url_name='plugins:netbox_floorplanner:floorplan_list')

    class Meta(NetBoxTable.Meta):
        model = FloorPlan
        fields = (
            'pk', 'id', 'name', 'site', 'location', 'room_size', 'width', 'depth', 'grid_size', 'item_count',
            'rack_count', 'description', 'tags', 'created', 'last_updated',
        )
        default_columns = ('name', 'site', 'location', 'room_size', 'rack_count', 'description')

    def render_room_size(self, record):
        return f'{format_room_size(record.width, record.depth)} m'
