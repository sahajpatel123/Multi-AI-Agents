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


def test_legacy_hash_is_rehashed_on_login(monkeypatch):
    """If authenticate_user falls through to the legacy verify path, the user's
    hash should be transparently upgraded so subsequent logins skip the legacy
    branch entirely.
    """
    from arena.core import auth
    from arena.db_models import User
    import bcrypt

    # Simulate a "legacy" hash: bcrypt of the raw password (no SHA256 prehash).
    legacy_plain = "legacy-pass-1234"
    legacy_hash = bcrypt.hashpw(legacy_plain.encode("utf-8")[:72], bcrypt.gensalt(12)).decode("utf-8")

    user = User(email="legacy@example.com", password_hash=legacy_hash)

    # Stub the DB so commit() doesn't try to flush.
    class _StubDB(_FakeDB):
        def __init__(self, user):
            super().__init__(user=user)
            self.committed = False
        def add(self, _u):
            pass
        def commit(self):
            self.committed = True

    db = _StubDB(user)
    result = auth.authenticate_user(db, "legacy@example.com", legacy_plain)

    assert result is user, "auth must succeed via legacy path with the correct raw password"
    assert db.committed, "DB commit must fire so the new hash persists"
    # After commit, the user's hash should be the modern format.
    assert user.password_hash != legacy_hash, "stale legacy hash must be replaced"
    matched, used_legacy = auth.verify_password(legacy_plain, user.password_hash)
    assert matched is True
    assert used_legacy is False, (
        "post-migration verify MUST take the modern path; the legacy fallback is "
        "only a one-shot bridge for pre-prehash hashes."
    )
