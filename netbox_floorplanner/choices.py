from django.utils.translation import gettext_lazy as _
from utilities.choices import ChoiceSet


class ItemTypeChoices(ChoiceSet):
    TYPE_RACK = 'rack'
    TYPE_DEVICE = 'device'
    TYPE_WALL = 'wall'
    TYPE_DOOR = 'door'
    TYPE_WINDOW = 'window'
    TYPE_AREA = 'area'
    TYPE_COLUMN = 'column'
    TYPE_COOLING = 'cooling'
    TYPE_POWER = 'power'
    TYPE_LABEL = 'label'

    CHOICES = [
        (TYPE_RACK, _('Rack'), 'blue'),
        (TYPE_DEVICE, _('Device'), 'purple'),
        (TYPE_WALL, _('Wall'), 'gray'),
        (TYPE_DOOR, _('Door'), 'orange'),
        (TYPE_WINDOW, _('Window'), 'cyan'),
        (TYPE_AREA, _('Area'), 'green'),
        (TYPE_COLUMN, _('Column'), 'gray'),
        (TYPE_COOLING, _('Cooling unit'), 'teal'),
        (TYPE_POWER, _('Power / UPS'), 'yellow'),
        (TYPE_LABEL, _('Label'), 'dark'),
    ]
