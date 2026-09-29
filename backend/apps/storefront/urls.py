"""Customer app API, mounted at /api/app/."""
from django.urls import path, register_converter

from apps.marketplace import seller

from .views import account, catalog, engagement, orders, requests, shopping


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
    path("products/<int:pk>/reviews/", engagement.ProductReviewsView.as_view(), name="product-reviews"),
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
    path("orders/<str:reference>/returns/", engagement.OrderReturnsView.as_view(), name="order-returns"),
    # Returns, reviews, saved products, notifications
    path("returns/", engagement.ReturnListView.as_view(), name="returns"),
    path("returns/<str:reference>/", engagement.ReturnDetailView.as_view(), name="return"),
    path("returns/<str:reference>/evidence/", engagement.ReturnEvidenceView.as_view(), name="return-evidence"),
    path("returns/<str:reference>/evidence/<int:pk>/", engagement.ReturnEvidenceFileView.as_view(),
         name="return-evidence-file"),
    path("me/reviews/", engagement.MyReviewsView.as_view(), name="my-reviews"),
    path("me/reviews/<int:pk>/", engagement.MyReviewDetailView.as_view(), name="my-review"),
    path("wishlist/", engagement.WishlistView.as_view(), name="wishlist"),
    path("wishlist/merge/", engagement.WishlistMergeView.as_view(), name="wishlist-merge"),
    path("wishlist/<int:product_id>/", engagement.WishlistItemView.as_view(), name="wishlist-item"),
    path("notifications/", engagement.NotificationListView.as_view(), name="notifications"),
    path("notifications/read/", engagement.NotificationReadView.as_view(), name="notifications-read"),
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
    path("seller/earnings/", seller.EarningsView.as_view(), name="seller-earnings"),
    path("seller/orders/<int:pk>/issue/", seller.OrderIssueView.as_view(), name="seller-order-issue"),
    path("seller/orders/<int:pk>/<str:action>/", seller.OrderActionView.as_view(), name="seller-order-action"),
    path("seller/returns/", seller.ReturnListView.as_view(), name="seller-returns"),
    path("seller/returns/<str:reference>/", seller.ReturnDetailView.as_view(), name="seller-return"),
    path("seller/returns/<str:reference>/evidence/<int:pk>/", seller.ReturnEvidenceFileView.as_view(),
         name="seller-return-evidence"),
    path("seller/reviews/", seller.ReviewListView.as_view(), name="seller-reviews"),
    path("seller/reviews/<int:pk>/<str:action>/", seller.ReviewActionView.as_view(), name="seller-review-action"),
    path("seller/documents/", seller.DocumentListView.as_view(), name="seller-documents"),
]
