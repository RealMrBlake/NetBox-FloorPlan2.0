import django_filters
from dcim.models import Location, Site
from django.db.models import Q
from django.utils.translation import gettext_lazy as _
from netbox.filtersets import NetBoxModelFilterSet

from .models import FloorPlan

__all__ = ('FloorPlanFilterSet',)


class FloorPlanFilterSet(NetBoxModelFilterSet):
    site_id = django_filters.ModelMultipleChoiceFilter(
        queryset=Site.objects.all(),
        label=_('Site (ID)'),
    )
    site = django_filters.ModelMultipleChoiceFilter(
        field_name='site__slug',
        queryset=Site.objects.all(),
        to_field_name='slug',
        label=_('Site (slug)'),
    )
    location_id = django_filters.ModelMultipleChoiceFilter(
        queryset=Location.objects.all(),
        label=_('Location (ID)'),
    )
    rack_id = django_filters.NumberFilter(
        field_name='items__rack_id',
        distinct=True,
        label=_('Contains rack (ID)'),
    )

    class Meta:
        model = FloorPlan
        fields = ('id', 'name', 'description', 'width', 'depth', 'grid_size')

    def search(self, queryset, name, value):
        if not value.strip():
            return queryset
        return queryset.filter(
            Q(name__icontains=value)
            | Q(description__icontains=value)
            | Q(site__name__icontains=value)
            | Q(location__name__icontains=value)
        )
