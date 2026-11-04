# NetBox Floor Planner

`netbox_floorplanner` is a NetBox plugin that adds a modern, drag & drop floor plan designer for sites and locations: place racks, devices, walls, doors, windows, areas and infrastructure on a to-scale plan, then use it as an interactive map that links straight back into NetBox.

It is a from-scratch alternative to the community `netbox-floorplan-plugin`, with a canvas-style editor in the spirit of draw.io instead of a form-based workflow.

| | |
|---|---|
| **Repository** | [git.mrblake.cc/MrBlake/NetBox-FloorPlan2.0](https://git.mrblake.cc/MrBlake/NetBox-FloorPlan2.0) |
| **Package** | `netbox-floorplanner` |
| **Plugin name** | `netbox_floorplanner` |
| **NetBox** | 4.7.2 or newer |
| **Python** | 3.12 or newer |
| **Languages** | English, German (follows the NetBox user language) |

## Requirements

- NetBox **4.7.2 or newer**. Older versions are rejected at startup (`min_version = 4.7.2`).
- Python 3.12 or newer.
- No additional Python dependencies and no JavaScript build step. The designer is plain JavaScript and SVG and uses the Material Design Icons that ship with NetBox.

## Installation and updates

1. Install the package into the NetBox virtual environment. Pin a release tag or commit for production:

   ```bash
   source /opt/netbox/venv/bin/activate
   pip install "git+https://git.mrblake.cc/MrBlake/NetBox-FloorPlan2.0.git@v0.1.0"
   ```

2. Add the same source to `local_requirements.txt`, so NetBox upgrades (`upgrade.sh`) reinstall the plugin automatically:

   ```text
   git+https://git.mrblake.cc/MrBlake/NetBox-FloorPlan2.0.git@v0.1.0
   ```

   For private repositories use a deploy token or SSH key and keep the credentials out of this file.

3. Enable the plugin in `configuration.py`:

   ```python
   PLUGINS = [
       'netbox_floorplanner',
   ]

   PLUGINS_CONFIG = {
       'netbox_floorplanner': {
           # optional, see "Configuration"
       },
   }
   ```

4. Run the migrations, collect the static files and restart NetBox:

   ```bash
   cd /opt/netbox/netbox
   python manage.py migrate netbox_floorplanner
   python manage.py collectstatic --no-input
   sudo systemctl restart netbox netbox-rq
   ```

Before updating, back up the database and try the update on a staging instance first. After every update, run `migrate` and `collectstatic` again. The static files are versioned, so browsers pick up the new designer automatically.

## Main features

- **Drag & drop designer:** drag shapes, racks and devices from the palette onto the plan, or click an entry to drop it in the middle of the view.
- **To-scale plans:** 1 unit = 1 cm. Racks are sized from their `outer_width` and `outer_depth` (mm or inch), with a configurable fallback.
- **Editing:** move, resize with 8 handles, free rotation with 15° snapping, multi-selection (Shift+click or rubber band), z-order, copy/paste/duplicate, arrow-key nudging and 100 undo/redo steps.
- **Smart snapping:** snaps to the grid, plus magnetic alignment to the edges of neighbouring items and room walls, with visible guide lines. Hold **Alt** to place freely.
- **Shape library:** wall, door (with swing arc), window, area/zone, column, cooling unit, power/UPS and free text labels, each with an editable colour.
- **NetBox integration:**
  - The palette lists the site's racks (filtered by location) and its non-racked devices, such as access points and cameras. Objects already placed are marked and can only be placed once.
  - A **Floor Plans** tab on Site and Location pages, with a pre-filled "Add floor plan" button.
  - A **Show on floor plan** button on Rack and Device pages that opens the plan, zooms to the object and highlights it.
- **Interactive view mode:** pan, zoom, tooltips (status, role, tenant, height, device count), click to open the rack or device (Ctrl+click opens a new tab), colouring by type, status or role, and a search box that highlights matches.
- **Background drawings:** upload a CAD or architectural image per plan, stretched to the room size with adjustable opacity.
- **Export:** SVG (vector) and high-resolution PNG, with the background embedded.
- **NetBox native:** change logging, journaling, tags, custom fields, global search, CSV/YAML import, bulk delete, object permissions, REST API, dark mode and fullscreen.

### Keyboard shortcuts (designer)

| Key | Action |
|---|---|
| Drag / Shift+click / drag on empty space | Move / multi-select / rubber-band select |
| Alt (while dragging) | Disable snapping |
| Space+drag, middle mouse | Pan |
| Mouse wheel, `+` / `-` / `0` | Zoom / fit to screen |
| `R` / Shift+`R` | Rotate 90° clockwise / counter-clockwise |
| Arrow keys (Shift = one grid step) | Nudge by 1 cm |
| Del / Backspace | Delete |
| Ctrl+Z, Ctrl+Y / Ctrl+Shift+Z | Undo, redo |
| Ctrl+C / Ctrl+V / Ctrl+D / Ctrl+A | Copy / paste / duplicate / select all |
| Ctrl+S | Save |
| Esc | Clear selection |

## Configuration

All settings are optional and go under `PLUGINS_CONFIG['netbox_floorplanner']`.

| Setting | Default | Description |
|---|---|---|
| `default_width` | `2000` | Initial width (cm) for new floor plans |
| `default_depth` | `1500` | Initial depth (cm) for new floor plans |
| `default_grid_size` | `50` | Initial grid size (cm) for new floor plans |
| `default_rack_width` | `60` | Rack footprint width (cm) when the rack has no `outer_width` |
| `default_rack_depth` | `120` | Rack footprint depth (cm) when the rack has no `outer_depth` |

## REST API

| Endpoint | Methods | Description |
|---|---|---|
| `/api/plugins/floorplanner/floorplans/` | GET, POST, PUT, PATCH, DELETE | Standard NetBox CRUD for floor plans |
| `/api/plugins/floorplanner/floorplans/<id>/layout/` | GET, PUT | Read or atomically replace the complete layout |

Example layout payload:

```json
{
  "settings": { "width": 2000, "depth": 1500, "grid_size": 50 },
  "items": [
    { "item_type": "rack", "x": 300, "y": 200, "width": 60, "height": 120, "rotation": 0, "rack": 12 },
    { "item_type": "wall", "x": 0, "y": 600, "width": 800, "height": 15, "rotation": 0 },
    { "item_type": "label", "label": "Cold aisle A", "x": 300, "y": 330, "width": 200, "height": 40 }
  ]
}
```

`item_type` is one of `rack`, `device`, `wall`, `door`, `window`, `area`, `column`, `cooling`, `power` or `label`. `x` and `y` are the top-left corner of the unrotated shape in cm, and `rotation` is applied around its centre.

## Important semantics

- **Coordinates are centimetres.** The `height` field of an item is its depth on the floor (the Y extent), not its height in rack units.
- **The layout is saved as a whole.** Saving replaces all items of the plan in one transaction and writes a single change-log entry on the floor plan. Item IDs are not stable across saves, so reference racks and devices instead.
- **Racks and devices can be placed at most once per plan,** and must belong to the plan's site. Pasted copies of linked items become unlinked shapes.
- **Deleting a rack or device removes its item** from every floor plan. Deleting a site or location deletes its floor plans.
- **Permissions:** viewing a plan requires `view_floorplan`, and the designer and the layout `PUT` require `change_floorplan`. The rack and device lists in the palette follow the user's normal NetBox permissions.
- **The designer is a client-side editor.** Unsaved changes live only in the browser tab. The page warns before you navigate away from unsaved changes.

## Translations

The UI is in English and German and follows the language selected in the NetBox user preferences. The German catalogue is in `netbox_floorplanner/locale/de/LC_MESSAGES/`. After changing `django.po`, recompile it:

```bash
cd netbox_floorplanner && django-admin compilemessages -l de
```

## Uninstall

1. Optional: export the plans you want to keep (SVG/PNG or `GET …/layout/`).
2. Drop the plugin tables:

   ```bash
   python manage.py migrate netbox_floorplanner zero
   ```

3. Remove `netbox_floorplanner` from `PLUGINS` and `PLUGINS_CONFIG`, and its line from `local_requirements.txt`.
4. Uninstall the package and restart NetBox:

   ```bash
   pip uninstall netbox-floorplanner
   sudo systemctl restart netbox netbox-rq
   ```

Uploaded background images stay in `MEDIA_ROOT/floorplanner/` and can be deleted manually.
