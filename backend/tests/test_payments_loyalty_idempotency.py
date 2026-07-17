"""Loyalty accrual must be idempotent under Razorpay webhook redelivery.

Razorpay delivers webhooks at least once. A redelivered subscription.charged
event must not accrue loyalty twice, or a user could reach the 10-payment
reward (2 free months) with fewer than 10 real payments.
"""

import types


class _FakeQuery:
    def __init__(self, result):
        self._result = result

    def filter(self, *args, **kwargs):
        return self

    def first(self):
        return self._result


class _FakeDB:
    def __init__(self, user):
        self._user = user
        self.added = []

    def query(self, *args, **kwargs):
        return _FakeQuery(self._user)

    def add(self, obj):
        self.added.append(obj)


def _row():
    return types.SimpleNamespace(
        tier="pro",
        billing_period="monthly",
        plan_id="plan_pro",
        user_id=1,
        razorpay_subscription_id="sub_x",
    )


def _settings():
    return types.SimpleNamespace(razorpay_pro_monthly_plan_id="plan_pro")


def _user():
    return types.SimpleNamespace(
        id=1,
        consecutive_payments=0,
        loyalty_reward_active=False,
        loyalty_free_months_remaining=0,
        loyalty_resume_at=None,
    )


def test_loyalty_skips_redelivered_charge():
    from arena.routes import payments

    user = _user()
    db = _FakeDB(user)
    payments._loyalty_on_pro_monthly_charged(
        db, _row(), _settings(), is_new_charge=False
    )
    # Redelivered webhook: no accrual.
    assert user.consecutive_payments == 0


def test_loyalty_accrues_on_new_charge():
    from arena.routes import payments

    user = _user()
    db = _FakeDB(user)
    payments._loyalty_on_pro_monthly_charged(
        db, _row(), _settings(), is_new_charge=True
    )
    assert user.consecutive_payments == 1


def test_repeated_new_charges_accrue_once_each():
    """Ten genuinely-new charges accrue to exactly the reward threshold — while
    duplicate deliveries interleaved between them add nothing."""
    from arena.routes import payments

    user = _user()
    db = _FakeDB(user)
    for _ in range(9):
        payments._loyalty_on_pro_monthly_charged(
            db, _row(), _settings(), is_new_charge=True
        )
        # A duplicate delivery of the same charge must not count.
        payments._loyalty_on_pro_monthly_charged(
            db, _row(), _settings(), is_new_charge=False
        )
    assert user.consecutive_payments == 9
    assert user.loyalty_reward_active is False  # reward only triggers at 10
