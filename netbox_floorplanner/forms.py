from dcim.models import Location, Site
from django import forms
from django.utils.translation import gettext_lazy as _
from netbox.forms import NetBoxModelFilterSetForm, NetBoxModelForm, NetBoxModelImportForm
from netbox.plugins import get_plugin_config
from tenancy.forms import TenancyFilterForm, TenancyForm
from tenancy.models import Tenant
from utilities.forms.fields import (
    CSVModelChoiceField, CommentField, DynamicModelChoiceField, DynamicModelMultipleChoiceField, TagFilterField,
)
from utilities.forms.rendering import FieldSet

from .models import FloorPlan
from .utils import format_room_size, parse_room_size

__all__ = ('FloorPlanForm', 'FloorPlanFilterForm', 'FloorPlanImportForm')


class FloorPlanForm(TenancyForm, NetBoxModelForm):
    site = DynamicModelChoiceField(label=_('Site'), queryset=Site.objects.all())
    location = DynamicModelChoiceField(
        label=_('Location'),
        queryset=Location.objects.all(),
        required=False,
        query_params={'site_id': '$site'},
    )
    room_size = forms.CharField(
        label=_('Room size (m)'),
        required=False,
        help_text=_('Width x depth in meters, e.g. "4 x 3" or "12,5 x 8". Takes precedence over the centimeter values.'),
    )
    comments = CommentField()

    fieldsets = (
        FieldSet('name', 'site', 'location', 'description', 'tags', name=_('Floor plan')),
        FieldSet('tenant_group', 'tenant', name=_('Tenancy')),
        FieldSet('room_size', 'width', 'depth', 'grid_size', name=_('Dimensions')),
        FieldSet('background_image', 'background_opacity', name=_('Background')),
    )

    class Meta:
        model = FloorPlan
        fields = (
            'name', 'site', 'location', 'tenant_group', 'tenant', 'description', 'width', 'depth', 'grid_size',
            'background_image', 'background_opacity', 'comments', 'tags',
        )
        widgets = {
            'background_image': forms.ClearableFileInput(attrs={'accept': 'image/*'}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if not self.instance.pk:
            for field, setting in (('width', 'default_width'), ('depth', 'default_depth'),
                                   ('grid_size', 'default_grid_size')):
                self.fields[field].initial = get_plugin_config('netbox_floorplanner', setting)
        width = self.instance.width if self.instance.pk else self.fields['width'].initial
        depth = self.instance.depth if self.instance.pk else self.fields['depth'].initial
        self.fields['room_size'].initial = format_room_size(width, depth)

    def clean(self):
        super().clean()
        # Only apply the meter value if the user actually edited it, so the
        # centimeter fields can still be used on their own.
        if 'room_size' in self.changed_data and self.cleaned_data.get('room_size'):
            size = parse_room_size(self.cleaned_data['room_size'])
            if size is None:
                raise forms.ValidationError({'room_size': _('Enter the size as "width x depth" in meters, e.g. "4 x 3".')})
            self.cleaned_data['width'], self.cleaned_data['depth'] = size
        return self.cleaned_data


class FloorPlanFilterForm(TenancyFilterForm, NetBoxModelFilterSetForm):
    model = FloorPlan
    fieldsets = (
        FieldSet('q', 'filter_id', 'tag'),
        FieldSet('site_id', 'location_id', name=_('Location')),
        FieldSet('tenant_group_id', 'tenant_id', name=_('Tenant')),
    )
    site_id = DynamicModelMultipleChoiceField(queryset=Site.objects.all(), required=False, label=_('Site'))
    location_id = DynamicModelMultipleChoiceField(
        queryset=Location.objects.all(),
        required=False,
        query_params={'site_id': '$site_id'},
        label=_('Location'),
    )
    tag = TagFilterField(model)


class FloorPlanImportForm(NetBoxModelImportForm):
    site = CSVModelChoiceField(label=_('Site'), queryset=Site.objects.all(), to_field_name='name')
    location = CSVModelChoiceField(
        label=_('Location'), queryset=Location.objects.all(), to_field_name='name', required=False,
    )
    tenant = CSVModelChoiceField(
        label=_('Tenant'), queryset=Tenant.objects.all(), to_field_name='name', required=False,
    )

    class Meta:
        model = FloorPlan
        fields = ('name', 'site', 'location', 'tenant', 'description', 'width', 'depth', 'grid_size', 'comments', 'tags')
