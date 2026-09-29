"""Phone numbers are the customer app's login. They are stored in one canonical form: digits with country code."""
import re

DEFAULT_COUNTRY_CODE = "255"  # Tanzania


def normalize_phone(value: str) -> str:
    """
    "0712 345 678", "+255712345678", "255-712-345678" and "712345678" all become "255712345678".
    Returns "" when the value can't be a phone number.
    """
    digits = re.sub(r"\D", "", value or "")
    if digits.startswith("00"):
        digits = digits[2:]
    if len(digits) == 10 and digits.startswith("0"):
        digits = DEFAULT_COUNTRY_CODE + digits[1:]
    elif len(digits) == 9 and not digits.startswith("0"):
        digits = DEFAULT_COUNTRY_CODE + digits
    return digits if 10 <= len(digits) <= 15 else ""


def display_phone(phone: str) -> str:
    return f"+{phone}" if phone else ""
