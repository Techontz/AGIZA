"""Customer app API, mounted at /api/app/."""
from django.urls import path

from .views import account, catalog, orders, requests, shopping

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
    path("cities/", catalog.CityListView.as_view(), name="cities"),
    path("sourcing-countries/", catalog.SourcingCountryListView.as_view(), name="sourcing-countries"),
    # Addresses, cart, checkout
    path("addresses/", shopping.AddressListView.as_view(), name="addresses"),
    path("addresses/<int:pk>/", shopping.AddressDetailView.as_view(), name="address"),
    path("cart/", shopping.CartView.as_view(), name="cart"),
    path("cart/items/", shopping.CartItemListView.as_view(), name="cart-items"),
    path("cart/items/<int:pk>/", shopping.CartItemDetailView.as_view(), name="cart-item"),
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
]
