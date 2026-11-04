import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('dcim', '__first__'),
        ('netbox_floorplanner', '0002_floorplan_tenant'),
    ]

    operations = [
        migrations.AlterField(
            model_name='floorplanitem',
            name='rack',
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='+', to='dcim.rack',
            ),
        ),
        migrations.AlterField(
            model_name='floorplanitem',
            name='device',
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='+', to='dcim.device',
            ),
        ),
    ]
