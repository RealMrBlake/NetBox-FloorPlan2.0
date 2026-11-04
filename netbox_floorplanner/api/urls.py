from netbox.api.routers import NetBoxRouter

from . import views

app_name = 'netbox_floorplanner-api'

router = NetBoxRouter()
router.register('floorplans', views.FloorPlanViewSet)

urlpatterns = router.urls
