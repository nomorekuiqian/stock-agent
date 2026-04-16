"""Unit tests for shared/otp_utils.py — WeChat-agnostic 6-digit OTP."""
import pytest
from app.shared import otp_utils


def setup_function():
    otp_utils._pending_otps.clear()


@pytest.fixture(autouse=True)
def clear_otps():
    otp_utils._pending_otps.clear()
    yield
    otp_utils._pending_otps.clear()


class TestGenerateNumericOtp:

    def test_returns_6_digit_string(self):
        code = otp_utils.generate_numeric_otp(email="u@test.com", action="create_new")
        assert len(code) == 6
        assert code.isdigit()

    def test_stores_openid_when_provided(self):
        otp_utils.generate_numeric_otp(email="u@test.com", action="create_new", openid="o_abc")
        entry = otp_utils._pending_otps["u@test.com"]
        assert entry["openid"] == "o_abc"

    def test_openid_none_when_omitted(self):
        otp_utils.generate_numeric_otp(email="web@test.com", action="login")
        entry = otp_utils._pending_otps["web@test.com"]
        assert entry["openid"] is None

    def test_resend_overwrites_previous_code(self):
        code1 = otp_utils.generate_numeric_otp("u@test.com", "create_new")
        code2 = otp_utils.generate_numeric_otp("u@test.com", "create_new")
        assert len(otp_utils._pending_otps) == 1  # only one entry per email
        if code1 != code2:
            result = otp_utils.verify_numeric_otp("u@test.com", code1)
            assert result["valid"] is False


class TestVerifyNumericOtp:

    def test_correct_code_returns_valid(self):
        code = otp_utils.generate_numeric_otp("u@test.com", "create_new", openid="o_abc")
        result = otp_utils.verify_numeric_otp("u@test.com", code)
        assert result["valid"] is True
        assert result["email"] == "u@test.com"
        assert result["openid"] == "o_abc"
        assert result["action"] == "create_new"

    def test_correct_code_without_openid(self):
        code = otp_utils.generate_numeric_otp("web@test.com", "login")
        result = otp_utils.verify_numeric_otp("web@test.com", code)
        assert result["valid"] is True
        assert result["openid"] is None

    def test_wrong_code_returns_invalid_code(self):
        otp_utils.generate_numeric_otp("u@test.com", "create_new")
        result = otp_utils.verify_numeric_otp("u@test.com", "000000")
        assert result["valid"] is False
        assert result["reason"] == "invalid_code"

    def test_code_consumed_after_success(self):
        code = otp_utils.generate_numeric_otp("u@test.com", "create_new")
        otp_utils.verify_numeric_otp("u@test.com", code)
        result = otp_utils.verify_numeric_otp("u@test.com", code)
        assert result["valid"] is False
        assert result["reason"] == "not_found"

    def test_unknown_email_returns_not_found(self):
        result = otp_utils.verify_numeric_otp("ghost@test.com", "123456")
        assert result["valid"] is False
        assert result["reason"] == "not_found"
