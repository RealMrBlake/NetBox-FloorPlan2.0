import django_tables2 as tables
from django.utils.translation import gettext_lazy as _
from netbox.tables import NetBoxTable, columns

from .models import FloorPlan

__all__ = ('FloorPlanTable',)


class FloorPlanTable(NetBoxTable):
    name = tables.Column(verbose_name=_('Name'), linkify=True)
    site = tables.Column(verbose_name=_('Site'), linkify=True)
    location = tables.Column(verbose_name=_('Location'), linkify=True)
    width = tables.Column(verbose_name=_('Width (cm)'))
    depth = tables.Column(verbose_name=_('Depth (cm)'))
    item_count = tables.Column(verbose_name=_('Items'))
    rack_count = tables.Column(verbose_name=_('Racks'))
    tags = columns.TagColumn(url_name='plugins:netbox_floorplanner:floorplan_list')

    class Meta(NetBoxTable.Meta):
        model = FloorPlan
        fields = (
            'pk', 'id', 'name', 'site', 'location', 'width', 'depth', 'grid_size', 'item_count', 'rack_count',
            'description', 'tags', 'created', 'last_updated',
        )
        default_columns = ('name', 'site', 'location', 'width', 'depth', 'rack_count', 'description')
