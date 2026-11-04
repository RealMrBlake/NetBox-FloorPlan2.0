from netbox.search import SearchIndex

from .models import FloorPlan


class FloorPlanIndex(SearchIndex):
    model = FloorPlan
    fields = (
        ('name', 100),
        ('description', 500),
        ('comments', 5000),
    )
    display_attrs = ('site', 'location', 'description')


indexes = (FloorPlanIndex,)
