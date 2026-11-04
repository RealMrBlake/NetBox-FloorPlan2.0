from netbox.plugins import PluginTemplateExtension

from .models import FloorPlanItem


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


template_extensions = [RackFloorPlanButton]
