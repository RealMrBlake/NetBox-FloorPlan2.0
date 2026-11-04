import django.core.validators
import django.db.models.deletion
import taggit.managers
import utilities.json
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('dcim', '__first__'),
        ('extras', '__first__'),
    ]

    operations = [
        migrations.CreateModel(
            name='FloorPlan',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ('created', models.DateTimeField(auto_now_add=True, null=True)),
                ('last_updated', models.DateTimeField(auto_now=True, null=True)),
                ('custom_field_data', models.JSONField(blank=True, default=dict, encoder=utilities.json.CustomFieldJSONEncoder)),
                ('name', models.CharField(max_length=100)),
                ('width', models.PositiveIntegerField(default=2000, validators=[django.core.validators.MinValueValidator(100), django.core.validators.MaxValueValidator(100000)])),
                ('depth', models.PositiveIntegerField(default=1500, validators=[django.core.validators.MinValueValidator(100), django.core.validators.MaxValueValidator(100000)])),
                ('grid_size', models.PositiveIntegerField(default=50, validators=[django.core.validators.MinValueValidator(5), django.core.validators.MaxValueValidator(1000)])),
                ('background_image', models.ImageField(blank=True, upload_to='floorplanner/')),
                ('background_opacity', models.PositiveSmallIntegerField(default=40, validators=[django.core.validators.MaxValueValidator(100)])),
                ('description', models.CharField(blank=True, max_length=200)),
                ('comments', models.TextField(blank=True)),
                ('site', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='floorplans', to='dcim.site')),
                ('location', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='floorplans', to='dcim.location')),
                ('tags', taggit.managers.TaggableManager(through='extras.TaggedItem', to='extras.Tag')),
            ],
            options={
                'verbose_name': 'floor plan',
                'verbose_name_plural': 'floor plans',
                'ordering': ('site', 'location', 'name'),
            },
        ),
        migrations.AddConstraint(
            model_name='floorplan',
            constraint=models.UniqueConstraint(
                fields=('site', 'location', 'name'),
                name='netbox_floorplanner_floorplan_unique_site_location_name',
            ),
        ),
        migrations.CreateModel(
            name='FloorPlanItem',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ('item_type', models.CharField(max_length=30)),
                ('label', models.CharField(blank=True, max_length=100)),
                ('x', models.IntegerField(default=0)),
                ('y', models.IntegerField(default=0)),
                ('width', models.PositiveIntegerField(default=60)),
                ('height', models.PositiveIntegerField(default=60)),
                ('rotation', models.SmallIntegerField(default=0, validators=[django.core.validators.MinValueValidator(0), django.core.validators.MaxValueValidator(359)])),
                ('color', models.CharField(blank=True, max_length=7)),
                ('z_index', models.SmallIntegerField(default=0)),
                ('properties', models.JSONField(blank=True, default=dict)),
                ('floorplan', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='items', to='netbox_floorplanner.floorplan')),
                ('rack', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='floorplan_items', to='dcim.rack')),
                ('device', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='floorplan_items', to='dcim.device')),
            ],
            options={
                'verbose_name': 'floor plan item',
                'verbose_name_plural': 'floor plan items',
                'ordering': ('floorplan', 'z_index', 'pk'),
            },
        ),
    ]
