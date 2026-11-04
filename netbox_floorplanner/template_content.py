from netbox.plugins import PluginTemplateExtension

from .models import FloorPlan, FloorPlanItem
from .preview import render_preview_svg


class RackFloorPlanButton(PluginTemplateExtension):
    """Adds a "Show on floor plan" button to racks and devices that are placed on a plan."""
    models = ['dcim.rack', 'dcim.device']

    def buttons(self):
        obj = self.context['object']
        field = 'rack' if obj._meta.model_name == 'rack' else 'device'
        item = FloorPlanItem.objects.filter(**{field: obj}).select_related('floorplan').first()
        if item is None:
            return ''
        return self.render('netbox_floorplanner/inc/floorplan_button.html', extra_context={
            'floorplan': item.floorplan,
            'highlight': f'{field}-{obj.pk}',
        })


class LocationFloorPlanPreview(PluginTemplateExtension):
    """Shows clickable previews of the location's floor plans on the location page."""
    models = ['dcim.location']

    def full_width_page(self):
        request = self.context['request']
        plans = FloorPlan.objects.restrict(request.user, 'view').filter(location=self.context['object'])
        if not plans:
            return ''
        return self.render('netbox_floorplanner/inc/location_floorplans.html', extra_context={
            'previews': [(plan, render_preview_svg(plan)) for plan in plans],
        })


template_extensions = [RackFloorPlanButton, LocationFloorPlanPreview]
