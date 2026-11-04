from django.utils.translation import gettext_lazy as _
from netbox.plugins import PluginMenu, PluginMenuButton, PluginMenuItem

menu = PluginMenu(
    label=_('Floor Planner'),
    icon_class='mdi mdi-floor-plan',
    groups=(
        (_('Floor Plans'), (
            PluginMenuItem(
                link='plugins:netbox_floorplanner:floorplan_list',
                link_text=_('Floor Plans'),
                permissions=['netbox_floorplanner.view_floorplan'],
                buttons=(
                    PluginMenuButton(
                        link='plugins:netbox_floorplanner:floorplan_add',
                        title=_('Add'),
                        icon_class='mdi mdi-plus-thick',
                        permissions=['netbox_floorplanner.add_floorplan'],
                    ),
                    PluginMenuButton(
                        link='plugins:netbox_floorplanner:floorplan_bulk_import',
                        title=_('Import'),
                        icon_class='mdi mdi-upload',
                        permissions=['netbox_floorplanner.add_floorplan'],
                    ),
                ),
            ),
        )),
    ),
)
