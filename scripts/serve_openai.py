"""Serve the browser app and proxy structured AI requests to OpenAI.

The browser keeps its existing structured-response envelope so evidence and
memo-source validation remain shared with existing callers.
"""
import argparse
import getpass
import json
import os
from pathlib import Path
import re
import socket
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

WEB_ROOT = Path(__file__).resolve().parents[1] / "web"
MAX_BODY_BYTES = 200_000
MODEL = "gpt-6-luna"


def json_schema(schema):
    """Convert the browser schema to strict JSON Schema for Responses."""
    kind = schema["type"].lower()
    result = {"type": kind}
    if kind == "object":
        result["properties"] = {key: json_schema(value) for key, value in schema["properties"].items()}
        result["required"] = list(result["properties"])
        result["additionalProperties"] = False
    elif kind == "array":
        result["items"] = json_schema(schema["items"])
    elif kind not in ("string", "integer", "number", "boolean"):
        raise ValueError("Unsupported schema")
    return result


def response_request(body, model):
    config = body["generationConfig"]
    parts = body["contents"][0]["parts"]
    prompt = "\n".join(part["text"] for part in parts)
    if not prompt.strip():
        raise ValueError("Empty prompt")
    schema = json_schema(config["responseSchema"])
    limit = config.get("maxOutputTokens", 3000)
    if type(limit) is not int or not 128 <= limit <= 4000:
        raise ValueError("Invalid output limit")
    effort = config.get("reasoningEffort", "none")
    if effort not in ("none", "low", "medium", "high", "xhigh", "max"):
        raise ValueError("Invalid reasoning effort")
    if "maxOutputTokens" not in config and effort in ("high", "xhigh", "max"):
        limit = 8192
    return {
        "model": model,
        "input": prompt,
        "store": False,
        "reasoning": {"effort": effort},
        "max_output_tokens": limit,
        "text": {"format": {
            "type": "json_schema", "name": "researchtrail",
            "strict": True, "schema": schema,
        }},
    }


def response_envelope(data):
    if data.get("status") != "completed":
        raise ValueError("Incomplete response")
    texts = []
    for item in data.get("output", []):
        for part in item.get("content", []):
            if part.get("type") == "refusal":
                return {"candidates": [{"finishReason": "SAFETY"}]}
            if part.get("type") == "output_text":
                texts.append(part["text"])
    if not texts:
        raise ValueError("Empty response")
    text = "".join(texts)
    json.loads(text)
    return {"candidates": [{"content": {"parts": [{"text": text}]}}]}


class OpenAIServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address, api_key, model=MODEL):
        self.api_key = api_key
        self.model = model
        self.slots = threading.BoundedSemaphore(2)
        super().__init__(address, Handler)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB_ROOT), **kwargs)

    def log_message(self, *_args):
        # Prompts, credentials and upstream response bodies never enter access logs.
        pass

    def send_json(self, status, value):
        data = json.dumps(value, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        try:
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def error(self, status, message):
        self.send_json(status, {"error": {"message": message}})

    def local_request(self):
        # Bind to loopback and reject foreign origins and DNS-rebinding hosts.
        port = self.server.server_port
        hosts = {f"127.0.0.1:{port}", f"localhost:{port}"}
        origin = self.headers.get("Origin")
        return self.headers.get("Host") in hosts and (
            origin is None or origin in {f"http://{host}" for host in hosts}
        ) and self.headers.get("Sec-Fetch-Site") != "cross-site"

    def do_GET(self):
        if not self.local_request():
            self.error(403, "이 서버의 로컬 화면에서 접속해 주세요.")
            return
        if re.fullmatch(r"/api/openai/models/[^/?]+", self.path):
            self.send_json(200, {"configured": bool(self.server.api_key), "model": self.server.model})
        elif self.path.startswith("/api/"):
            self.error(404, "지원하지 않는 요청이에요.")
        else:
            super().do_GET()

    def do_POST(self):
        if not self.local_request():
            self.error(403, "이 서버의 로컬 화면에서 접속해 주세요.")
            return
        if not re.fullmatch(r"/api/openai/models/[^/?]+:generateContent", self.path):
            self.error(404, "지원하지 않는 요청이에요.")
            return
        if self.headers.get("Content-Type", "").split(";")[0] != "application/json":
            self.error(415, "JSON 요청이 필요해요.")
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= MAX_BODY_BYTES:
                raise ValueError("Invalid size")
            self.connection.settimeout(10)
            body = json.loads(self.rfile.read(length))
            request_body = response_request(body, self.server.model)
        except (ValueError, TypeError, KeyError, IndexError, RecursionError, socket.timeout):
            self.error(400, "요청 형식이나 크기를 확인해 주세요.")
            return
        if not self.server.api_key:
            self.error(503, "서버를 시작할 때 OpenAI API 키를 입력해 주세요.")
            return
        if not self.server.slots.acquire(blocking=False):
            self.error(429, "처리 중인 요청이 많아요. 잠시 뒤 다시 시도해 주세요.")
            return
        try:
            request = Request(
                "https://api.openai.com/v1/responses",
                data=json.dumps(request_body).encode(),
                headers={"Content-Type": "application/json",
                         "Authorization": f"Bearer {self.server.api_key}"},
                method="POST",
            )
            timeout = 40 if request_body["reasoning"]["effort"] == "none" else 120
            with urlopen(request, timeout=timeout) as reply:
                result = json.load(reply)
            self.send_json(200, response_envelope(result))
        except HTTPError as exc:
            status = exc.code if exc.code in (400, 401, 403, 404, 429) else 503
            messages = {
                400: "OpenAI 모델의 Structured Outputs 지원과 요청 설정을 확인해 주세요.",
                401: "서버에 설정한 OpenAI API 키를 확인해 주세요.",
                403: "OpenAI 프로젝트의 모델 접근 권한을 확인해 주세요.",
                404: "OPENAI_MODEL 설정과 모델 접근 권한을 확인해 주세요.",
                429: "OpenAI API 사용 한도 또는 결제 잔액을 확인해 주세요.",
                503: "OpenAI에 일시적으로 연결할 수 없어요.",
            }
            self.error(status, messages[status])
        except (TimeoutError, URLError):
            self.error(504, "OpenAI 응답 시간이 초과됐어요.")
        except (ValueError, KeyError, TypeError):
            self.error(502, "OpenAI의 정리 결과를 읽지 못했어요. 다시 시도해 주세요.")
        finally:
            self.server.slots.release()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=5500)
    args = parser.parse_args()
    # Runtime-only secret loading. .env is ignored by Git and outside web/.
    config_path = WEB_ROOT.parent / ".env"
    if config_path.exists():
        for line in config_path.read_text().splitlines():
            name, separator, value = line.partition("=")
            if separator and name.strip() in ("OPENAI_API_KEY", "OPENAI_MODEL"):
                os.environ.setdefault(name.strip(), value.strip().strip("\"'"))
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not key:
        key = getpass.getpass("OpenAI API 키 입력 (화면에 표시되지 않음): ").strip()
    if not key:
        parser.error("OpenAI API 키가 필요합니다.")
    model = os.environ.get("OPENAI_MODEL", MODEL).strip()
    try:
        server = OpenAIServer(("127.0.0.1", args.port), key, model)
    except OSError:
        parser.exit(1, f"{args.port}번 포트가 사용 중입니다. 기존 서버를 종료하거나 --port로 바꿔 주세요.\n")
    print(f"ResearchTrail · OpenAI {model}\nhttp://127.0.0.1:{args.port}/")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
