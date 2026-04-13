"""Tests for the audio endpoint — auth, file validation, STT failure, empty transcript."""

from __future__ import annotations

import io
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

    async def test_audio_agent_failure(self, app_with_state, client):
        """Agent failure during audio processing should result in 502."""
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

        assert response.status_code == 502
        assert "Agent request failed" in response.json()["detail"]
        await stt.close()


class TestAudioEndpointSuccess:
    async def test_audio_full_pipeline(self, app_with_state, client):
        """Successful audio pipeline: upload → STT → agent → response."""
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
        data = response.json()
        assert data["transcript"] == "hello world"
        assert data["response"]["status"] == "completed"

        # Verify messages persisted
        detail = await client.get(f"/v1/sessions/{session_id}", headers=HEADERS)
        assert detail.status_code == 200
        session_data = detail.json()
        assert session_data["message_count"] == 2  # user transcript + assistant response
        assert session_data["messages"][0]["role"] == "user"
        assert session_data["messages"][0]["content"] == "hello world"
        assert session_data["messages"][1]["role"] == "assistant"
        await stt.close()
