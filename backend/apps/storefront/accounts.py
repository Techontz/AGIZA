"""
Customer account services: registration, sign-in, password reset and account deletion.

Registration requires a verified phone. A verified phone may claim the CRM
customer staff already created for that number (orders placed by phone or
WhatsApp then show in the app); otherwise a new customer is created.
"""
from __future__ import annotations

import logging

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import F
from django.utils import timezone

from apps.chat.services import find_customer
from apps.core.audit import record_audit
from apps.core.workflow import WorkflowError
from apps.parties.models import Customer

from . import otp
from .auth import issue_tokens
from .models import CustomerAccount, PhoneVerification
from .phone import normalize_phone

Purpose = PhoneVerification.Purpose


logger = logging.getLogger("apps.storefront")


def require_phone(value: str) -> str:
    phone = normalize_phone(value)
    if not phone:
        raise WorkflowError("Enter a valid phone number, e.g. 0712 345 678.", field="phone")
    return phone


def check_password_strength(password: str):
    try:
        validate_password(password)
    except DjangoValidationError as exc:
        raise WorkflowError(" ".join(exc.messages), field="password")


def request_code(phone: str, purpose: str) -> None:
    phone = require_phone(phone)
    exists = CustomerAccount.objects.filter(phone=phone).exists()
    if purpose == Purpose.REGISTER and exists:
        raise WorkflowError("This phone number already has an AGIZA account. Sign in instead.", field="phone")
    if purpose == Purpose.RESET_PASSWORD and not exists:
        return  # don't reveal which numbers have accounts
    otp.issue(phone, purpose)


def _check_email(email: str, customer: Customer | None):
    if not email:
        return
    taken = Customer.objects.filter(email=email).exclude(pk=getattr(customer, "pk", None)).exists()
    if taken:
        raise WorkflowError("This email is already used by another customer.", field="email")


def register(*, phone: str, code: str, full_name: str, password: str, email: str = "", request=None) -> dict:
    phone = require_phone(phone)
    full_name = full_name.strip()
    email = (email or "").strip().lower()
    if not full_name:
        raise WorkflowError("Enter your full name.", field="full_name")
    check_password_strength(password)
    if CustomerAccount.objects.filter(phone=phone).exists():
        raise WorkflowError("This phone number already has an AGIZA account. Sign in instead.", field="phone")
    existing = find_customer(phone, "web")
    if existing is not None and hasattr(existing, "account"):
        existing = None  # the number matched another customer's account (different country code)
    _check_email(email, existing)
    otp.consume(phone, Purpose.REGISTER, code)  # outside the transaction below: failed guesses must count

    with transaction.atomic():
        if existing is None:
            customer = Customer.objects.create(full_name=full_name, email=email, phone=f"+{phone}",
                                               preferred_channel=Customer.Channel.APP)
        else:
            customer = existing
            fields = []
            if email and not customer.email:
                customer.email = email
                fields.append("email")
            if customer.status != Customer.Status.ACTIVE:
                customer.status = Customer.Status.ACTIVE
                fields.append("status")
            if fields:
                customer.save(update_fields=[*fields, "updated_at"])
        account = CustomerAccount(customer=customer, phone=phone, phone_verified_at=timezone.now(),
                                  last_login=timezone.now())
        account.set_password(password)
        account.save()
        record_audit(action="create", request=request, instance=customer, object_repr=f"App account for {customer}",
                     changes={"app_account": [None, f"+{phone}"], "linked_existing": [None, existing is not None]})
    return {"account": account, **issue_tokens(account)}


def login(*, phone: str, password: str) -> dict:
    account = (CustomerAccount.objects.select_related("customer")
               .filter(phone=normalize_phone(phone)).first())
    if account is None or not account.check_password(password or ""):
        from .otp import mask_phone

        logger.warning("Customer sign-in failed for %s", mask_phone(normalize_phone(phone) or ""))
        raise WorkflowError("Incorrect phone number or password.", conflict=False, field="non_field_errors")
    if not account.is_active or account.customer.status != Customer.Status.ACTIVE:
        raise WorkflowError("This account is disabled. Contact AGIZA support.", field="non_field_errors")
    account.last_login = timezone.now()
    account.save(update_fields=["last_login"])
    return {"account": account, **issue_tokens(account)}


def reset_password(*, phone: str, code: str, password: str) -> None:
    phone = require_phone(phone)
    check_password_strength(password)
    account = CustomerAccount.objects.filter(phone=phone, is_active=True).first()
    if account is None:
        raise WorkflowError("This code has expired. Ask for a new one.", field="code")
    otp.consume(phone, Purpose.RESET_PASSWORD, code)
    account.set_password(password)
    account.save(update_fields=["password", "updated_at"])
    revoke_tokens(account)


def change_password(account: CustomerAccount, *, current: str, new: str) -> dict:
    if not account.check_password(current or ""):
        raise WorkflowError("Your current password is incorrect.", field="current_password")
    check_password_strength(new)
    account.set_password(new)
    account.save(update_fields=["password", "updated_at"])
    revoke_tokens(account)
    return issue_tokens(account)


def revoke_tokens(account: CustomerAccount) -> None:
    """Sign out everywhere: tokens of earlier session versions stop working (checked on every request and refresh)."""
    CustomerAccount.objects.filter(pk=account.pk).update(session_version=F("session_version") + 1)
    account.refresh_from_db(fields=["session_version"])


@transaction.atomic
def delete_account(account: CustomerAccount, *, password: str, request=None) -> None:
    """
    Close the app account (Google Play data-deletion requirement). Orders, payments and returns stay
    for accounting, but the person is anonymised: name, phone and email are removed from the customer
    record, and addresses, saved products, notifications, cart and devices are deleted. Not possible
    while an order is still on its way (AGIZA needs the contact details to deliver it).
    """
    if not account.check_password(password or ""):
        raise WorkflowError("Your password is incorrect.", field="password")
    customer = account.customer
    active = customer.orders.exclude(status__in=["delivered", "completed", "cancelled"]).values_list(
        "reference", flat=True)
    if active:
        raise WorkflowError(f"You have orders in progress ({', '.join(active[:3])}). You can delete your account "
                            "once they are delivered or cancelled, or contact AGIZA support.", conflict=True)
    revoke_tokens(account)
    from apps.marketplace import services as marketplace

    marketplace.on_owner_account_closed(account)
    account.devices.all().delete()
    if hasattr(customer, "cart"):
        customer.cart.delete()
    record_audit(action="delete", request=request, instance=customer,
                 object_repr=f"App account for customer {customer.reference}",
                 changes={"app_account": ["closed by the customer", None]})
    account.delete()
    _anonymise(customer)


def _anonymise(customer):
    from .models import CustomerNotification, WishlistItem

    customer.addresses.all().delete()
    WishlistItem.objects.filter(customer=customer).delete()
    CustomerNotification.objects.filter(customer=customer).delete()
    customer.full_name = f"Former customer {customer.reference}"
    customer.phone = ""
    customer.email = ""
    fields = ["full_name", "phone", "email", "updated_at"]
    if hasattr(customer, "company_name"):
        customer.company_name = ""
        fields.append("company_name")
    customer.save(update_fields=fields)
