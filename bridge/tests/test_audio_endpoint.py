"""Tests for the audio endpoint — auth, file validation, STT failure, SSE streaming."""

from __future__ import annotations

import io
import json
from unittest.mock import AsyncMock, patch

HEADERS = {"Authorization": "Bearer test-client-token"}

MOCK_AGENT_RESPONSE = {
    "id": "chatcmpl_audio123",
    "object": "chat.completion",
    "choices": [
        {
            "index": 0,
            "message": {"role": "assistant", "content": "Audio response!"},
            "finish_reason": "stop",
        }
    ],
    "usage": {"prompt_tokens": 5, "completion_tokens": 3, "total_tokens": 8},
}


def _parse_sse_events(body: str) -> list[dict]:
    """Parse SSE body into a list of event dicts."""
    events = []
    for line in body.split("\n"):
        line = line.strip()
        if not line or not line.startswith("data: "):
            continue
        payload = line[len("data: ") :]
        events.append(json.loads(payload))
    return events


class TestAudioEndpointAuth:
    async def test_audio_no_auth(self, client):
        response = await client.post(
            "/v1/sessions/some-id/audio",
            files={"file": ("test.wav", io.BytesIO(b"\x00" * 100), "audio/wav")},
        )
        assert response.status_code == 401

    async def test_audio_wrong_token(self, client):
        response = await client.post(
            "/v1/sessions/some-id/audio",
            headers={"Authorization": "Bearer wrong-token"},
            files={"file": ("test.wav", io.BytesIO(b"\x00" * 100), "audio/wav")},
        )
        assert response.status_code == 401


class TestAudioEndpointFileValidation:
    async def test_audio_empty_file(self, app_with_state, client):
        """Empty audio file should return 400."""
        from g2_bridge.stt_client import STTClient

        _app, _db, _agent = app_with_state
        # Must configure STT to get past the 503 check
        _app.state.settings.stt_api_url = "http://localhost:8080/transcribe"
        stt = STTClient(_app.state.settings)
        _app.state.stt = stt

        created = await client.post("/v1/sessions", headers=HEADERS, json={})
        session_id = created.json()["id"]

        response = await client.post(
            f"/v1/sessions/{session_id}/audio",
            headers=HEADERS,
            files={"file": ("test.wav", io.BytesIO(b""), "audio/wav")},
        )
        assert response.status_code == 400
        assert "Empty" in response.json()["detail"]
        await stt.close()

    async def test_audio_file_too_large(self, app_with_state, client):
        """File exceeding max_audio_bytes should return 413."""
        from g2_bridge.stt_client import STTClient

        _app, _db, _agent = app_with_state
        # Must configure STT to get past the 503 check
        _app.state.settings.stt_api_url = "http://localhost:8080/transcribe"
        _app.state.settings.max_audio_bytes = 10
        stt = STTClient(_app.state.settings)
        _app.state.stt = stt

        created = await client.post("/v1/sessions", headers=HEADERS, json={})
        session_id = created.json()["id"]

        large_data = b"\x00" * 100
        response = await client.post(
            f"/v1/sessions/{session_id}/audio",
            headers=HEADERS,
            files={"file": ("test.wav", io.BytesIO(large_data), "audio/wav")},
        )
        assert response.status_code == 413
        assert "too large" in response.json()["detail"].lower()
        await stt.close()

    async def test_audio_session_not_found(self, app_with_state, client):
        from g2_bridge.stt_client import STTClient

        _app, _db, _agent = app_with_state
        # Must configure STT to get past the 503 check
        _app.state.settings.stt_api_url = "http://localhost:8080/transcribe"
        stt = STTClient(_app.state.settings)
        _app.state.stt = stt

        response = await client.post(
            "/v1/sessions/nonexistent/audio",
            headers=HEADERS,
            files={"file": ("test.wav", io.BytesIO(b"\x00" * 100), "audio/wav")},
        )
        assert response.status_code == 404
        await stt.close()


class TestAudioEndpointSTT:
    async def test_audio_stt_not_configured(self, app_with_state, client):
        """When STT is not configured, should return 503."""
        _app, _db, _agent = app_with_state
        _app.state.settings.stt_api_url = ""

        created = await client.post("/v1/sessions", headers=HEADERS, json={})
        session_id = created.json()["id"]

        response = await client.post(
            f"/v1/sessions/{session_id}/audio",
            headers=HEADERS,
            files={"file": ("test.wav", io.BytesIO(b"\x00" * 100), "audio/wav")},
        )
        assert response.status_code == 503
        assert "STT" in response.json()["detail"]

    async def test_audio_stt_failure(self, app_with_state, client):
        """STT endpoint returning error should result in 502."""
        from g2_bridge.stt_client import STTClient

        _app, _db, _agent = app_with_state
        _app.state.settings.stt_api_url = "http://localhost:8080/transcribe"
        stt = STTClient(_app.state.settings)
        _app.state.stt = stt

        created = await client.post("/v1/sessions", headers=HEADERS, json={})
        session_id = created.json()["id"]

        with patch.object(
            stt, "transcribe", new_callable=AsyncMock, side_effect=Exception("STT service down")
        ):
            response = await client.post(
                f"/v1/sessions/{session_id}/audio",
                headers=HEADERS,
                files={"file": ("test.wav", io.BytesIO(b"\x00" * 100), "audio/wav")},
            )

        assert response.status_code == 502
        assert "STT request failed" in response.json()["detail"]
        await stt.close()

    async def test_audio_empty_transcript(self, app_with_state, client):
        """STT returning empty transcript should result in 422."""
        from g2_bridge.stt_client import STTClient

        _app, _db, _agent = app_with_state
        _app.state.settings.stt_api_url = "http://localhost:8080/transcribe"
        stt = STTClient(_app.state.settings)
        _app.state.stt = stt

        created = await client.post("/v1/sessions", headers=HEADERS, json={})
        session_id = created.json()["id"]

        with patch.object(stt, "transcribe", new_callable=AsyncMock, return_value=""):
            response = await client.post(
                f"/v1/sessions/{session_id}/audio",
                headers=HEADERS,
                files={"file": ("test.wav", io.BytesIO(b"\x00" * 100), "audio/wav")},
            )

        assert response.status_code == 422
        assert "empty transcript" in response.json()["detail"].lower()
        await stt.close()

    async def test_audio_agent_failure_returns_sse_error(self, app_with_state, client):
        """Agent failure during audio processing should send SSE error event."""
        from g2_bridge.stt_client import STTClient

        _app, _db, agent = app_with_state
        _app.state.settings.stt_api_url = "http://localhost:8080/transcribe"
        stt = STTClient(_app.state.settings)
        _app.state.stt = stt

        created = await client.post("/v1/sessions", headers=HEADERS, json={})
        session_id = created.json()["id"]

        with (
            patch.object(stt, "transcribe", new_callable=AsyncMock, return_value="hello world"),
            patch.object(
                agent, "send_message", new_callable=AsyncMock, side_effect=Exception("Agent down")
            ),
        ):
            response = await client.post(
                f"/v1/sessions/{session_id}/audio",
                headers=HEADERS,
                files={"file": ("test.wav", io.BytesIO(b"\x00" * 100), "audio/wav")},
            )

        # SSE stream returns 200 — errors are in the stream
        assert response.status_code == 200
        events = _parse_sse_events(response.text)
        # Should get transcript event first, then error event
        assert len(events) == 2
        assert events[0]["type"] == "transcript"
        assert events[0]["text"] == "hello world"
        assert events[1]["type"] == "error"
        assert "Agent down" in events[1]["message"]

        # Orphaned user message should be cleaned up
        detail = await client.get(f"/v1/sessions/{session_id}", headers=HEADERS)
        assert detail.status_code == 200
        session_data = detail.json()
        assert session_data["message_count"] == 0

        await stt.close()


class TestAudioEndpointSSE:
    async def test_audio_full_pipeline_sse(self, app_with_state, client):
        """Successful SSE pipeline: STT -> transcript event -> agent -> response event."""
        from g2_bridge.stt_client import STTClient

        _app, _db, agent = app_with_state
        _app.state.settings.stt_api_url = "http://localhost:8080/transcribe"
        stt = STTClient(_app.state.settings)
        _app.state.stt = stt

        created = await client.post("/v1/sessions", headers=HEADERS, json={})
        session_id = created.json()["id"]

        with (
            patch.object(stt, "transcribe", new_callable=AsyncMock, return_value="hello world"),
            patch.object(
                agent, "send_message", new_callable=AsyncMock, return_value=MOCK_AGENT_RESPONSE
            ),
        ):
            response = await client.post(
                f"/v1/sessions/{session_id}/audio",
                headers=HEADERS,
                files={"file": ("recording.wav", io.BytesIO(b"\x00" * 3200), "audio/wav")},
            )

        assert response.status_code == 200
        assert "text/event-stream" in response.headers.get("content-type", "")

        events = _parse_sse_events(response.text)
        assert len(events) == 2

        # Event 1: transcript
        assert events[0]["type"] == "transcript"
        assert events[0]["text"] == "hello world"

        # Event 2: response
        assert events[1]["type"] == "response"
        assert events[1]["data"]["status"] == "completed"
        assert events[1]["data"]["conversation"] == session_id

        # Verify messages persisted
        detail = await client.get(f"/v1/sessions/{session_id}", headers=HEADERS)
        assert detail.status_code == 200
        session_data = detail.json()
        assert session_data["message_count"] == 2  # user transcript + assistant response
        assert session_data["messages"][0]["role"] == "user"
        assert session_data["messages"][0]["content"] == "hello world"
        assert session_data["messages"][1]["role"] == "assistant"
        await stt.close()

    async def test_audio_transcript_event_before_response(self, app_with_state, client):
        """Verify transcript event always arrives before response event."""
        from g2_bridge.stt_client import STTClient

        _app, _db, agent = app_with_state
        _app.state.settings.stt_api_url = "http://localhost:8080/transcribe"
        stt = STTClient(_app.state.settings)
        _app.state.stt = stt

        created = await client.post("/v1/sessions", headers=HEADERS, json={})
        session_id = created.json()["id"]

        with (
            patch.object(
                stt,
                "transcribe",
                new_callable=AsyncMock,
                return_value="what's the weather?",
            ),
            patch.object(
                agent, "send_message", new_callable=AsyncMock, return_value=MOCK_AGENT_RESPONSE
            ),
        ):
            response = await client.post(
                f"/v1/sessions/{session_id}/audio",
                headers=HEADERS,
                files={"file": ("recording.wav", io.BytesIO(b"\x00" * 3200), "audio/wav")},
            )

        events = _parse_sse_events(response.text)
        types = [e["type"] for e in events]
        # transcript must come before response
        assert types.index("transcript") < types.index("response")
        await stt.close()

    async def test_audio_sse_content_type(self, app_with_state, client):
        """Response must have text/event-stream content type."""
        from g2_bridge.stt_client import STTClient

        _app, _db, agent = app_with_state
        _app.state.settings.stt_api_url = "http://localhost:8080/transcribe"
        stt = STTClient(_app.state.settings)
        _app.state.stt = stt

        created = await client.post("/v1/sessions", headers=HEADERS, json={})
        session_id = created.json()["id"]

        with (
            patch.object(stt, "transcribe", new_callable=AsyncMock, return_value="test"),
            patch.object(
                agent, "send_message", new_callable=AsyncMock, return_value=MOCK_AGENT_RESPONSE
            ),
        ):
            response = await client.post(
                f"/v1/sessions/{session_id}/audio",
                headers=HEADERS,
                files={"file": ("recording.wav", io.BytesIO(b"\x00" * 3200), "audio/wav")},
            )

        assert response.headers["content-type"] == "text/event-stream; charset=utf-8"
        await stt.close()

    async def test_audio_user_message_persisted_before_stream(self, app_with_state, client):
        """User message should be persisted in DB even before the stream starts."""
        from g2_bridge.stt_client import STTClient

        _app, _db, agent = app_with_state
        _app.state.settings.stt_api_url = "http://localhost:8080/transcribe"
        stt = STTClient(_app.state.settings)
        _app.state.stt = stt

        created = await client.post("/v1/sessions", headers=HEADERS, json={})
        session_id = created.json()["id"]

        with (
            patch.object(stt, "transcribe", new_callable=AsyncMock, return_value="hello"),
            patch.object(
                agent, "send_message", new_callable=AsyncMock, return_value=MOCK_AGENT_RESPONSE
            ),
        ):
            response = await client.post(
                f"/v1/sessions/{session_id}/audio",
                headers=HEADERS,
                files={"file": ("recording.wav", io.BytesIO(b"\x00" * 3200), "audio/wav")},
            )

        assert response.status_code == 200

        # Verify both messages are persisted (user message stored before stream)
        detail = await client.get(f"/v1/sessions/{session_id}", headers=HEADERS)
        session_data = detail.json()
        assert session_data["message_count"] == 2
        await stt.close()
