"""Customer app API, mounted at /api/app/."""
from django.urls import path, register_converter

from apps.marketplace import seller

from .views import account, catalog, orders, requests, shopping


class MediaKind:
    """Store images: "logo" or "banner" (never an arbitrary field name)."""

    regex = "logo|banner"

    def to_python(self, value):
        return value

    def to_url(self, value):
        return value


register_converter(MediaKind, "store_media")

app_name = "storefront"

urlpatterns = [
    path("config/", catalog.ConfigView.as_view(), name="config"),
    # Account
    path("auth/request-code/", account.RequestCodeView.as_view(), name="request-code"),
    path("auth/register/", account.RegisterView.as_view(), name="register"),
    path("auth/login/", account.LoginView.as_view(), name="login"),
    path("auth/refresh/", account.RefreshView.as_view(), name="refresh"),
    path("auth/reset-password/", account.ResetPasswordView.as_view(), name="reset-password"),
    path("auth/logout/", account.LogoutView.as_view(), name="logout"),
    path("auth/change-password/", account.ChangePasswordView.as_view(), name="change-password"),
    path("auth/delete-account/", account.DeleteAccountView.as_view(), name="delete-account"),
    path("me/", account.ProfileView.as_view(), name="me"),
    path("devices/", account.DeviceView.as_view(), name="devices"),
    # Shop
    path("categories/", catalog.CategoryListView.as_view(), name="categories"),
    path("products/", catalog.ProductListView.as_view(), name="products"),
    path("products/<int:pk>/", catalog.ProductDetailView.as_view(), name="product"),
    path("images/<int:pk>/", catalog.ProductImageView.as_view(), name="product-image"),
    path("stores/", catalog.StoreListView.as_view(), name="stores"),
    path("stores/<slug:slug>/", catalog.StoreDetailView.as_view(), name="store"),
    path("stores/<slug:slug>/<store_media:kind>/", catalog.StoreMediaView.as_view(), name="store-media"),
    path("cities/", catalog.CityListView.as_view(), name="cities"),
    path("sourcing-countries/", catalog.SourcingCountryListView.as_view(), name="sourcing-countries"),
    # Addresses, cart, checkout
    path("addresses/", shopping.AddressListView.as_view(), name="addresses"),
    path("addresses/<int:pk>/", shopping.AddressDetailView.as_view(), name="address"),
    path("cart/", shopping.CartView.as_view(), name="cart"),
    path("cart/items/", shopping.CartItemListView.as_view(), name="cart-items"),
    path("cart/items/<int:pk>/", shopping.CartItemDetailView.as_view(), name="cart-item"),
    path("cart/guest/", shopping.GuestCartView.as_view(), name="cart-guest"),
    path("cart/merge/", shopping.CartMergeView.as_view(), name="cart-merge"),
    path("checkout/preview/", shopping.CheckoutPreviewView.as_view(), name="checkout-preview"),
    path("checkout/place-order/", shopping.PlaceOrderView.as_view(), name="place-order"),
    # Orders & tracking
    path("orders/", orders.OrderListView.as_view(), name="orders"),
    path("orders/<str:reference>/", orders.OrderDetailView.as_view(), name="order"),
    path("orders/<str:reference>/cancel/", orders.OrderCancelView.as_view(), name="order-cancel"),
    path("orders/<str:reference>/pay/", orders.OrderPayView.as_view(), name="order-pay"),
    path("orders/<str:reference>/check-payment/", orders.OrderPaymentCheckView.as_view(), name="order-check-payment"),
    # Buy for me / Deliver for me, support
    path("requests/", requests.QuoteListView.as_view(), name="requests"),
    path("requests/<int:pk>/", requests.QuoteDetailView.as_view(), name="request"),
    path("requests/<int:pk>/accept/", requests.QuoteReplyView.as_view(), name="request-accept"),
    path("requests/<int:pk>/decline/", requests.QuoteDeclineView.as_view(), name="request-decline"),
    path("support/messages/", requests.SupportChatView.as_view(), name="support-messages"),
    # Seller (vendor) area — the signed-in account's own store only
    path("seller/store/", seller.ApplicationView.as_view(), name="seller-store"),
    path("seller/store/<store_media:kind>/", seller.StoreMediaUploadView.as_view(), name="seller-store-media"),
    path("seller/dashboard/", seller.DashboardView.as_view(), name="seller-dashboard"),
    path("seller/products/", seller.ProductListView.as_view(), name="seller-products"),
    path("seller/products/<int:pk>/", seller.ProductDetailView.as_view(), name="seller-product"),
    path("seller/products/<int:pk>/images/", seller.ProductImageUploadView.as_view(), name="seller-product-images"),
    path("seller/products/<int:pk>/images/<int:image_id>/", seller.ProductImageDetailView.as_view(),
         name="seller-product-image"),
    path("seller/products/<int:pk>/stock/", seller.StockView.as_view(), name="seller-product-stock"),
    path("seller/images/<int:pk>/", seller.ImageFileView.as_view(), name="seller-image"),
    path("seller/orders/", seller.OrderListView.as_view(), name="seller-orders"),
    path("seller/orders/<int:pk>/", seller.OrderDetailView.as_view(), name="seller-order"),
    path("seller/orders/<int:pk>/<str:action>/", seller.OrderActionView.as_view(), name="seller-order-action"),
    path("seller/earnings/", seller.EarningsView.as_view(), name="seller-earnings"),
]
