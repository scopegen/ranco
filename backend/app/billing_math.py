"""Shared math for the two-stage treatment/consultation charge calculation.

A charge is derived in two ordered steps, both stored on the row itself
(Treatment / Consultation):

  1. Price adjustment — price_adjustment_type/value. Corrects the base price
     (service_price or fee) UPWARD only — there's no decrease direction here,
     since decreasing the price is already covered by discount below. This
     changes the actual agreed price and IS reflected on invoices/generated
     documents.
  2. Discount — discount_type/value, decrease-only, unchanged from before
     this module existed. Computed on the ADJUSTED price from step 1, not
     the original base price, and stays a Billing-tab-only concern — never
     shown on invoices/generated documents.

Used by both app.routers.treatments._treatment_charge and
app.routers.consultations._consultation_charge so the two stay identical.
"""


def apply_price_adjustment(base_price: float, adjustment_type: str | None, adjustment_value: float | None) -> float:
    """Returns the adjusted (increased) price."""
    if not adjustment_type or not adjustment_value:
        return base_price
    if adjustment_type == "percent":
        amount = base_price * (float(adjustment_value) / 100)
    else:
        amount = float(adjustment_value)
    return base_price + amount


def apply_discount(adjusted_price: float, discount_type: str | None, discount_value: float | None) -> float:
    """Returns the discount amount (never more than adjusted_price)."""
    if not discount_type or not discount_value:
        return 0.0
    if discount_type == "percent":
        amount = adjusted_price * (float(discount_value) / 100)
    else:
        amount = float(discount_value)
    return min(amount, adjusted_price)
