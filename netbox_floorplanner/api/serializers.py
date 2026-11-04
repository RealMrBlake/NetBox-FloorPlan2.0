from dcim.api.serializers import LocationSerializer, SiteSerializer
from dcim.choices import DeviceStatusChoices, RackStatusChoices
from dcim.models import Device, Rack
from django.utils.translation import gettext as _
from netbox.api.serializers import NetBoxModelSerializer
from tenancy.api.serializers import TenantSerializer
from rest_framework import serializers

from ..models import FloorPlan, FloorPlanItem

__all__ = ('FloorPlanSerializer', 'FloorPlanItemSerializer', 'LayoutSerializer')


class FloorPlanSerializer(NetBoxModelSerializer):
    url = serializers.HyperlinkedIdentityField(view_name='plugins-api:netbox_floorplanner-api:floorplan-detail')
    site = SiteSerializer(nested=True)
    location = LocationSerializer(nested=True, required=False, allow_null=True, default=None)
    tenant = TenantSerializer(nested=True, required=False, allow_null=True, default=None)
    item_count = serializers.IntegerField(read_only=True, required=False)

    class Meta:
        model = FloorPlan
        fields = (
            'id', 'url', 'display', 'name', 'site', 'location', 'tenant', 'width', 'depth', 'grid_size',
            'background_image', 'background_opacity', 'description', 'comments', 'item_count',
            'tags', 'custom_fields', 'created', 'last_updated',
        )
        brief_fields = ('id', 'url', 'display', 'name', 'description')


def _object_info(obj, status_choices):
    """Compact representation of a linked NetBox object for the designer."""
    role = getattr(obj, 'role', None)
    tenant = getattr(obj, 'tenant', None)
    info = {
        'id': obj.pk,
        'name': obj.name or str(obj),
        'url': obj.get_absolute_url(),
        'status': obj.status,
        'status_label': str(dict(status_choices).get(obj.status, obj.status)),
        'status_color': status_choices.colors.get(obj.status, 'gray'),
        'role': role.name if role else None,
        'role_color': f'#{role.color}' if role and role.color else None,
        'tenant': tenant.name if tenant else None,
    }
    if isinstance(obj, Rack):
        info['u_height'] = obj.u_height
        info['device_count'] = getattr(obj, 'device_count', None)
    return info


class FloorPlanItemSerializer(serializers.ModelSerializer):
    rack = serializers.PrimaryKeyRelatedField(queryset=Rack.objects.all(), required=False, allow_null=True)
    device = serializers.PrimaryKeyRelatedField(queryset=Device.objects.all(), required=False, allow_null=True)
    object = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = FloorPlanItem
        fields = (
            'id', 'item_type', 'label', 'x', 'y', 'width', 'height', 'rotation', 'color', 'z_index',
            'rack', 'device', 'properties', 'object',
        )
        read_only_fields = ('id',)

    def get_object(self, item):
        if item.rack_id:
            return _object_info(item.rack, RackStatusChoices)
        if item.device_id:
            return _object_info(item.device, DeviceStatusChoices)
        return None

    def validate_color(self, value):
        if value and not (len(value) == 7 and value.startswith('#')):
            raise serializers.ValidationError(_('Color must be a hex value like #3b82f6.'))
        return value

    def validate(self, data):
        floorplan = self.context.get('floorplan')
        for field in ('rack', 'device'):
            obj = data.get(field)
            if obj is not None and floorplan is not None and obj.site_id != floorplan.site_id:
                raise serializers.ValidationError({field: _('{obj} does not belong to site {site}.').format(
                    obj=obj, site=floorplan.site,
                )})
        if data.get('rack') and data.get('device'):
            raise serializers.ValidationError(_('An item can be linked to a rack or a device, not both.'))
        return data


class LayoutSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = FloorPlan
        fields = ('width', 'depth', 'grid_size')


class LayoutSerializer(serializers.Serializer):
    settings = LayoutSettingsSerializer(required=False)
    items = FloorPlanItemSerializer(many=True)

    def validate_items(self, items):
        seen = set()
        for item in items:
            for field in ('rack', 'device'):
                obj = item.get(field)
                if obj is None:
                    continue
                key = (field, obj.pk)
                if key in seen:
                    raise serializers.ValidationError(_('{obj} is placed more than once.').format(obj=obj))
                seen.add(key)
        return items
