APP = "/api/app"


def test_cards_say_how_many_units_are_in_stock(api, shop):
    cards = {p["name"]: p for p in api.get(f"{APP}/products/").json()["results"]}
    assert cards["Galaxy A54"]["available"] == 5 and cards["Galaxy A54"]["in_stock"] is True
    assert cards["USB-C Cable"]["available"] == 50
    assert "Unreleased Phone" not in cards  # drafts aren't listed at all
