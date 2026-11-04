import django.db.models.deletion
from django.db import migrations, models


def inherit_tenant(apps, schema_editor):
    """Pre-fill the tenant of existing floor plans from their location or site."""
    FloorPlan = apps.get_model('netbox_floorplanner', 'FloorPlan')
    for plan in FloorPlan.objects.select_related('site', 'location').filter(tenant__isnull=True):
        tenant_id = (plan.location.tenant_id if plan.location_id else None) or plan.site.tenant_id
        if tenant_id:
            plan.tenant_id = tenant_id
            plan.save(update_fields=['tenant'])


class Migration(migrations.Migration):

    dependencies = [
        ('tenancy', '__first__'),
        ('netbox_floorplanner', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='floorplan',
            name='tenant',
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.PROTECT,
                related_name='floorplans', to='tenancy.tenant',
            ),
        ),
        migrations.RunPython(inherit_tenant, migrations.RunPython.noop),
    ]
