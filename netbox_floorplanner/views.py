from dcim.models import Location, Site
from django.db.models import Count, Q
from django.urls import reverse
from django.utils.translation import gettext_lazy as _
from netbox.plugins import get_plugin_config
from netbox.views import generic
from utilities.permissions import get_permission_for_model
from utilities.views import ViewTab, register_model_view

from . import filtersets, forms, tables
from .choices import ItemTypeChoices
from .models import FloorPlan
from .strings import get_js_strings


def floorplans_queryset():
    return FloorPlan.objects.select_related('site', 'location').annotate(
        item_count=Count('items', distinct=True),
        rack_count=Count('items', filter=Q(items__rack__isnull=False), distinct=True),
    )


def designer_config(request, floorplan, mode):
    """Configuration handed to the JavaScript designer via json_script."""
    rack_filter = f'site_id={floorplan.site_id}'
    if floorplan.location_id:
        rack_filter += f'&location_id={floorplan.location_id}'
    return {
        'mode': mode,
        'id': floorplan.pk,
        'name': floorplan.name,
        'settings': {
            'width': floorplan.width,
            'depth': floorplan.depth,
            'grid_size': floorplan.grid_size,
        },
        'background': {
            'url': floorplan.background_image.url if floorplan.background_image else None,
            'opacity': floorplan.background_opacity / 100,
        },
        'api': {
            'layout': reverse('plugins-api:netbox_floorplanner-api:floorplan-layout', args=[floorplan.pk]),
            'racks': reverse('dcim-api:rack-list') + f'?{rack_filter}&limit=1000&ordering=name',
            'devices': reverse('dcim-api:device-list') + f'?{rack_filter}&rack_id=null&limit=1000&ordering=name',
        },
        'highlight': request.GET.get('highlight', ''),
        'defaults': {
            'rack_width': get_plugin_config('netbox_floorplanner', 'default_rack_width'),
            'rack_depth': get_plugin_config('netbox_floorplanner', 'default_rack_depth'),
        },
        'types': {choice[0]: str(choice[1]) for choice in ItemTypeChoices.CHOICES},
        'strings': get_js_strings(),
    }


@register_model_view(FloorPlan, 'list', path='', detail=False)
class FloorPlanListView(generic.ObjectListView):
    queryset = floorplans_queryset()
    table = tables.FloorPlanTable
    filterset = filtersets.FloorPlanFilterSet
    filterset_form = forms.FloorPlanFilterForm


@register_model_view(FloorPlan)
class FloorPlanView(generic.ObjectView):
    queryset = floorplans_queryset()

    def get_extra_context(self, request, instance):
        return {'designer_config': designer_config(request, instance, 'view')}


@register_model_view(FloorPlan, 'designer', path='designer')
class FloorPlanDesignerView(generic.ObjectView):
    queryset = FloorPlan.objects.select_related('site', 'location')
    template_name = 'netbox_floorplanner/floorplan_designer.html'
    tab = ViewTab(
        label=_('Designer'),
        permission='netbox_floorplanner.change_floorplan',
        weight=100,
    )

    def get_required_permission(self):
        return get_permission_for_model(FloorPlan, 'change')

    def get_extra_context(self, request, instance):
        return {'designer_config': designer_config(request, instance, 'edit')}


@register_model_view(FloorPlan, 'add', detail=False)
@register_model_view(FloorPlan, 'edit')
class FloorPlanEditView(generic.ObjectEditView):
    queryset = FloorPlan.objects.all()
    form = forms.FloorPlanForm

    def alter_object(self, obj, request, url_args, url_kwargs):
        # Allow pre-filling site/location from the Site or Location tab
        if not obj.pk:
            if site_id := request.GET.get('site'):
                obj.site_id = site_id
            if location_id := request.GET.get('location'):
                obj.location_id = location_id
        return obj


@register_model_view(FloorPlan, 'delete')
class FloorPlanDeleteView(generic.ObjectDeleteView):
    queryset = FloorPlan.objects.all()


@register_model_view(FloorPlan, 'bulk_import', path='import', detail=False)
class FloorPlanBulkImportView(generic.BulkImportView):
    queryset = FloorPlan.objects.all()
    model_form = forms.FloorPlanImportForm


@register_model_view(FloorPlan, 'bulk_delete', path='delete', detail=False)
class FloorPlanBulkDeleteView(generic.BulkDeleteView):
    queryset = floorplans_queryset()
    filterset = filtersets.FloorPlanFilterSet
    table = tables.FloorPlanTable


#
# "Floor plans" tabs on Site and Location
#

class BaseFloorPlanChildrenView(generic.ObjectChildrenView):
    child_model = FloorPlan
    table = tables.FloorPlanTable
    filterset = filtersets.FloorPlanFilterSet
    template_name = 'netbox_floorplanner/object_floorplans.html'
    filter_field = None

    def get_children(self, request, parent):
        return floorplans_queryset().restrict(request.user, 'view').filter(**{self.filter_field: parent})

    def get_extra_context(self, request, instance):
        return {'add_params': f'{self.filter_field}={instance.pk}' + (
            f'&site={instance.site_id}' if self.filter_field == 'location' else ''
        )}


@register_model_view(Site, 'floorplans', path='floorplans')
class SiteFloorPlansView(BaseFloorPlanChildrenView):
    queryset = Site.objects.all()
    filter_field = 'site'
    tab = ViewTab(
        label=_('Floor Plans'),
        badge=lambda obj: obj.floorplans.count(),
        permission='netbox_floorplanner.view_floorplan',
        weight=1500,
    )


@register_model_view(Location, 'floorplans', path='floorplans')
class LocationFloorPlansView(BaseFloorPlanChildrenView):
    queryset = Location.objects.all()
    filter_field = 'location'
    tab = ViewTab(
        label=_('Floor Plans'),
        badge=lambda obj: obj.floorplans.count(),
        permission='netbox_floorplanner.view_floorplan',
        weight=1500,
    )
