from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.urls import reverse
from django.utils.translation import gettext_lazy as _
from netbox.models import NetBoxModel

from .choices import ItemTypeChoices

__all__ = ('FloorPlan', 'FloorPlanItem')


class FloorPlan(NetBoxModel):
    name = models.CharField(verbose_name=_('name'), max_length=100)
    site = models.ForeignKey(
        to='dcim.Site',
        on_delete=models.CASCADE,
        related_name='floorplans',
        verbose_name=_('site'),
    )
    location = models.ForeignKey(
        to='dcim.Location',
        on_delete=models.CASCADE,
        related_name='floorplans',
        blank=True,
        null=True,
        verbose_name=_('location'),
    )
    width = models.PositiveIntegerField(
        verbose_name=_('width'),
        default=2000,
        validators=[MinValueValidator(100), MaxValueValidator(100000)],
        help_text=_('Room width in centimeters'),
    )
    depth = models.PositiveIntegerField(
        verbose_name=_('depth'),
        default=1500,
        validators=[MinValueValidator(100), MaxValueValidator(100000)],
        help_text=_('Room depth in centimeters'),
    )
    grid_size = models.PositiveIntegerField(
        verbose_name=_('grid size'),
        default=50,
        validators=[MinValueValidator(5), MaxValueValidator(1000)],
        help_text=_('Grid spacing in centimeters (used for snapping)'),
    )
    background_image = models.ImageField(
        verbose_name=_('background image'),
        upload_to='floorplanner/',
        blank=True,
        help_text=_('Optional architectural drawing shown behind the plan, stretched to the room size'),
    )
    background_opacity = models.PositiveSmallIntegerField(
        verbose_name=_('background opacity'),
        default=40,
        validators=[MaxValueValidator(100)],
        help_text=_('Opacity of the background image in percent'),
    )
    description = models.CharField(verbose_name=_('description'), max_length=200, blank=True)
    comments = models.TextField(verbose_name=_('comments'), blank=True)

    class Meta:
        ordering = ('site', 'location', 'name')
        verbose_name = _('floor plan')
        verbose_name_plural = _('floor plans')
        constraints = (
            models.UniqueConstraint(
                fields=('site', 'location', 'name'),
                name='netbox_floorplanner_floorplan_unique_site_location_name',
            ),
        )

    def __str__(self):
        return self.name

    def get_absolute_url(self):
        return reverse('plugins:netbox_floorplanner:floorplan', args=[self.pk])

    def clean(self):
        super().clean()
        if self.location_id and self.site_id and self.location.site_id != self.site_id:
            raise ValidationError({'location': _('The location must belong to the selected site.')})


class FloorPlanItem(models.Model):
    """
    A single shape on a floor plan. Items are always written as a whole layout
    through the layout API endpoint; changes are change-logged on the parent plan.
    """
    floorplan = models.ForeignKey(
        to=FloorPlan,
        on_delete=models.CASCADE,
        related_name='items',
        verbose_name=_('floor plan'),
    )
    item_type = models.CharField(verbose_name=_('type'), max_length=30, choices=ItemTypeChoices)
    label = models.CharField(verbose_name=_('label'), max_length=100, blank=True)
    x = models.IntegerField(verbose_name=_('X'), default=0)
    y = models.IntegerField(verbose_name=_('Y'), default=0)
    width = models.PositiveIntegerField(verbose_name=_('width'), default=60)
    height = models.PositiveIntegerField(verbose_name=_('height'), default=60)
    rotation = models.SmallIntegerField(
        verbose_name=_('rotation'),
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(359)],
    )
    color = models.CharField(verbose_name=_('color'), max_length=7, blank=True)
    z_index = models.SmallIntegerField(verbose_name=_('z-index'), default=0)
    rack = models.ForeignKey(
        to='dcim.Rack',
        on_delete=models.CASCADE,
        related_name='floorplan_items',
        blank=True,
        null=True,
        verbose_name=_('rack'),
    )
    device = models.ForeignKey(
        to='dcim.Device',
        on_delete=models.CASCADE,
        related_name='floorplan_items',
        blank=True,
        null=True,
        verbose_name=_('device'),
    )
    properties = models.JSONField(verbose_name=_('properties'), default=dict, blank=True)

    class Meta:
        ordering = ('floorplan', 'z_index', 'pk')
        verbose_name = _('floor plan item')
        verbose_name_plural = _('floor plan items')

    def __str__(self):
        return self.label or f'{self.get_item_type_display()} #{self.pk}'
