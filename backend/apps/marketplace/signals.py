"""Keep products' search text in step when the brand, category or vendor they are found by is renamed."""
from django.db.models import Q
from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.catalog.models import Brand, Category, Product, Vendor
from apps.catalog.search import refresh_products


@receiver(post_save, sender=Brand, dispatch_uid="marketplace_brand_search")
def brand_saved(sender, instance, created, **kwargs):
    if not created:
        refresh_products(Product.objects.filter(brand=instance))


@receiver(post_save, sender=Category, dispatch_uid="marketplace_category_search")
def category_saved(sender, instance, created, **kwargs):
    if not created:
        refresh_products(Product.objects.filter(Q(category=instance) | Q(subcategory=instance)))


@receiver(post_save, sender=Vendor, dispatch_uid="marketplace_vendor_search")
def vendor_saved(sender, instance, created, update_fields=None, **kwargs):
    if not created and (update_fields is None or "name" in update_fields):
        refresh_products(Product.objects.filter(vendor=instance))
