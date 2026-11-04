from dcim.models import Location, Site
from django import forms
from django.utils.translation import gettext_lazy as _
from netbox.forms import NetBoxModelFilterSetForm, NetBoxModelForm, NetBoxModelImportForm
from netbox.plugins import get_plugin_config
from utilities.forms.fields import (
    CSVModelChoiceField, CommentField, DynamicModelChoiceField, DynamicModelMultipleChoiceField, TagFilterField,
)
from utilities.forms.rendering import FieldSet

from .models import FloorPlan

__all__ = ('FloorPlanForm', 'FloorPlanFilterForm', 'FloorPlanImportForm')


class FloorPlanForm(NetBoxModelForm):
    site = DynamicModelChoiceField(label=_('Site'), queryset=Site.objects.all())
    location = DynamicModelChoiceField(
        label=_('Location'),
        queryset=Location.objects.all(),
        required=False,
        query_params={'site_id': '$site'},
    )
    comments = CommentField()

    fieldsets = (
        FieldSet('name', 'site', 'location', 'description', 'tags', name=_('Floor plan')),
        FieldSet('width', 'depth', 'grid_size', name=_('Dimensions (cm)')),
        FieldSet('background_image', 'background_opacity', name=_('Background')),
    )

    class Meta:
        model = FloorPlan
        fields = (
            'name', 'site', 'location', 'description', 'width', 'depth', 'grid_size',
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


class FloorPlanFilterForm(NetBoxModelFilterSetForm):
    model = FloorPlan
    fieldsets = (
        FieldSet('q', 'filter_id', 'tag'),
        FieldSet('site_id', 'location_id', name=_('Location')),
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

    class Meta:
        model = FloorPlan
        fields = ('name', 'site', 'location', 'description', 'width', 'depth', 'grid_size', 'comments', 'tags')
