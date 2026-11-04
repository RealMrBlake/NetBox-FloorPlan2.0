from django.utils.translation import gettext_lazy as _
from netbox.plugins import PluginConfig

__version__ = '0.1.4'


class FloorPlannerConfig(PluginConfig):
    name = 'netbox_floorplanner'
    verbose_name = 'NetBox-Floorplaner'
    description = _('Drag & drop floor plan designer for sites and locations')
    version = __version__
    author = 'Claude'
    base_url = 'floorplanner'
    min_version = '4.7.2'
    default_settings = {
        # Default dimensions (cm) for new floor plans
        'default_width': 2000,
        'default_depth': 1500,
        'default_grid_size': 50,
        # Rack footprint (cm) used when a rack has no outer dimensions
        'default_rack_width': 60,
        'default_rack_depth': 120,
    }


config = FloorPlannerConfig
