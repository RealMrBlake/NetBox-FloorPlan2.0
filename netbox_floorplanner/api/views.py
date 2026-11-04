from django.db import transaction
from django.db.models import Count
from netbox.api.viewsets import NetBoxModelViewSet
from rest_framework.decorators import action
from rest_framework.response import Response

from .. import filtersets
from ..models import FloorPlan, FloorPlanItem
from .serializers import FloorPlanItemSerializer, FloorPlanSerializer, LayoutSerializer


class FloorPlanViewSet(NetBoxModelViewSet):
    queryset = FloorPlan.objects.select_related('site', 'location').prefetch_related('tags').annotate(
        item_count=Count('items')
    )
    serializer_class = FloorPlanSerializer
    filterset_class = filtersets.FloorPlanFilterSet

    @action(detail=True, methods=['get', 'put'], url_path='layout')
    def layout(self, request, pk=None):
        """
        GET returns all items of the floor plan; PUT replaces the complete layout
        atomically. The queryset is restricted by NetBox according to the HTTP
        method, so PUT requires the change permission on the floor plan.
        """
        floorplan = self.get_object()

        if request.method == 'PUT':
            serializer = LayoutSerializer(data=request.data, context={'floorplan': floorplan, 'request': request})
            serializer.is_valid(raise_exception=True)
            with transaction.atomic():
                floorplan.snapshot()
                for attr, value in serializer.validated_data.get('settings', {}).items():
                    setattr(floorplan, attr, value)
                floorplan.items.all().delete()
                FloorPlanItem.objects.bulk_create([
                    FloorPlanItem(floorplan=floorplan, **item)
                    for item in serializer.validated_data['items']
                ])
                floorplan.full_clean()
                floorplan.save()

        items = floorplan.items.select_related(
            'rack__role', 'rack__tenant', 'device__role', 'device__tenant',
        ).annotate(device_count=Count('rack__devices'))
        # device_count is annotated on the item; expose it on the rack for the serializer
        for item in items:
            if item.rack_id:
                item.rack.device_count = item.device_count

        return Response({
            'settings': {
                'width': floorplan.width,
                'depth': floorplan.depth,
                'grid_size': floorplan.grid_size,
            },
            'items': FloorPlanItemSerializer(items, many=True, context={'request': request}).data,
        })
