"""Timezone configuration and timestamp conversion tests."""

from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from g2_bridge.config import Settings, _resolve_tz


class TestResolveTz:
    """Tests for _resolve_tz helper."""

    def test_empty_returns_none(self) -> None:
        assert _resolve_tz("") is None

    def test_utc_returns_none(self) -> None:
        assert _resolve_tz("UTC") is None

    def test_utc_case_insensitive(self) -> None:
        assert _resolve_tz("utc") is None
        assert _resolve_tz("Utc") is None

    def test_valid_timezone(self) -> None:
        tz = _resolve_tz("Europe/Vienna")
        assert tz is not None
        assert tz.key == "Europe/Vienna"

    def test_us_timezone(self) -> None:
        tz = _resolve_tz("America/New_York")
        assert tz is not None
        assert tz.key == "America/New_York"

    def test_invalid_timezone_raises(self) -> None:
        with pytest.raises(ValueError, match="Invalid timezone"):
            _resolve_tz("Invalid/Zone")

    def test_invalid_gibberish_raises(self) -> None:
        with pytest.raises(ValueError, match="Invalid timezone"):
            _resolve_tz("not-a-tz")


class TestSettingsTimezone:
    """Tests for Settings timezone validation."""

    def test_default_utc(self) -> None:
        s = Settings(bridge_token="t", agent_api_key="k")
        assert s.timezone == "UTC"

    def test_valid_timezone_accepted(self) -> None:
        s = Settings(
            bridge_token="t",
            agent_api_key="k",
            timezone="Europe/Vienna",
        )
        assert s.timezone == "Europe/Vienna"

    def test_invalid_timezone_rejected(self) -> None:
        with pytest.raises(ValueError, match="Invalid timezone"):
            Settings(
                bridge_token="t",
                agent_api_key="k",
                timezone="Invalid/Zone",
            )


class TestConvertUtcToLocal:
    """Tests for Settings.convert_utc_to_local."""

    def test_utc_passthrough(self) -> None:
        """UTC timezone returns timestamps unchanged."""
        s = Settings(bridge_token="t", agent_api_key="k")
        ts = "2026-04-14T20:30:00+00:00"
        assert s.convert_utc_to_local(ts) == ts

    def test_vienna_summer_time(self) -> None:
        """Europe/Vienna is UTC+2 during CEST (summer)."""
        s = Settings(
            bridge_token="t",
            agent_api_key="k",
            timezone="Europe/Vienna",
        )
        # April 14 is CEST (UTC+2)
        result = s.convert_utc_to_local("2026-04-14T20:30:00+00:00")
        dt = datetime.fromisoformat(result)
        assert dt.hour == 22
        assert dt.minute == 30
        assert dt.tzinfo is not None

    def test_vienna_winter_time(self) -> None:
        """Europe/Vienna is UTC+1 during CET (winter)."""
        s = Settings(
            bridge_token="t",
            agent_api_key="k",
            timezone="Europe/Vienna",
        )
        # January 15 is CET (UTC+1)
        result = s.convert_utc_to_local("2026-01-15T10:00:00+00:00")
        dt = datetime.fromisoformat(result)
        assert dt.hour == 11
        assert dt.tzinfo is not None

    def test_new_york_conversion(self) -> None:
        """America/New_York is UTC-4 during EDT (summer)."""
        s = Settings(
            bridge_token="t",
            agent_api_key="k",
            timezone="America/New_York",
        )
        result = s.convert_utc_to_local("2026-04-14T20:30:00+00:00")
        dt = datetime.fromisoformat(result)
        assert dt.hour == 16
        assert dt.minute == 30

    def test_naive_timestamp_treated_as_utc(self) -> None:
        """Timestamps without timezone info are treated as UTC."""
        s = Settings(
            bridge_token="t",
            agent_api_key="k",
            timezone="Europe/Vienna",
        )
        result = s.convert_utc_to_local("2026-04-14T20:30:00")
        dt = datetime.fromisoformat(result)
        assert dt.hour == 22

    def test_microseconds_preserved(self) -> None:
        """Microsecond precision is preserved through conversion."""
        s = Settings(
            bridge_token="t",
            agent_api_key="k",
            timezone="Europe/Vienna",
        )
        result = s.convert_utc_to_local("2026-04-14T20:30:00.123456+00:00")
        dt = datetime.fromisoformat(result)
        assert dt.microsecond == 123456

    def test_iso_format_output(self) -> None:
        """Output is valid ISO format with timezone offset."""
        s = Settings(
            bridge_token="t",
            agent_api_key="k",
            timezone="Europe/Vienna",
        )
        result = s.convert_utc_to_local("2026-04-14T20:30:00+00:00")
        # Should be parseable and contain offset
        dt = datetime.fromisoformat(result)
        assert dt.tzinfo is not None
        # Verify round-trip: convert back to UTC
        utc_dt = dt.astimezone(ZoneInfo("UTC"))
        assert utc_dt.hour == 20
        assert utc_dt.minute == 30
