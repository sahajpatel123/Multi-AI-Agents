"""Auth hardening: constant-time login to prevent username enumeration.

authenticate_user must run a bcrypt comparison even when the email is unknown,
so response time does not reveal whether an account exists.
"""


class _FakeQuery:
    def __init__(self, result):
        self._result = result

    def filter(self, *args, **kwargs):
        return self

    def first(self):
        return self._result


class _FakeDB:
    def __init__(self, user=None):
        self._user = user

    def query(self, *args, **kwargs):
        return _FakeQuery(self._user)


def test_authenticate_unknown_email_still_runs_hash(monkeypatch):
    from arena.core import auth

    calls = []
    real_verify = auth.verify_password

    def spy(plain, hashed):
        calls.append(hashed)
        return real_verify(plain, hashed)

    monkeypatch.setattr(auth, "verify_password", spy)

    result = auth.authenticate_user(_FakeDB(user=None), "nobody@example.com", "pw")

    assert result is None
    # A bcrypt comparison must have run despite the missing account — this is the
    # timing-equalization step. Without it, unknown emails would be measurably
    # faster than wrong passwords on real accounts.
    assert len(calls) == 1
    assert calls[0] == auth._DUMMY_PASSWORD_HASH


def test_authenticate_existing_user_password_paths():
    from arena.core import auth
    from arena.db_models import User

    user = User(email="a@b.com", password_hash=auth.hash_password("correct-horse"))
    db = _FakeDB(user=user)

    assert auth.authenticate_user(db, "a@b.com", "correct-horse") is user
    assert auth.authenticate_user(db, "a@b.com", "wrong-password") is None
