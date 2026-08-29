from pathlib import Path
from urllib.parse import urlsplit

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from jinja2 import Environment, FileSystemLoader, select_autoescape
from mcp.server.fastmcp import FastMCP
from starlette.requests import Request
from starlette.responses import HTMLResponse, PlainTextResponse, RedirectResponse, Response

from invest_assistant.bootstrap.config import Settings, get_settings
from invest_assistant.modules.basic.mcp.oauth.provider import LiuliOAuthProvider
from invest_assistant.modules.basic.mcp.oauth.service import OAuthLoginError, OAuthRequestError

oauth_metadata_router = APIRouter(tags=["mcp-oauth"])

_templates = Environment(
    loader=FileSystemLoader(Path(__file__).parent / "templates"),
    autoescape=select_autoescape(["html"]),
)
_security_headers = {
    "Cache-Control": "no-store",
    "Pragma": "no-cache",
    "Content-Security-Policy": "default-src 'none'; form-action 'self'; base-uri 'none'",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
}


def build_protected_resource_metadata(settings: Settings) -> dict:
    return {
        "resource": settings.mcp_oauth_resource_url.rstrip("/"),
        "authorization_servers": [settings.mcp_oauth_issuer_url.rstrip("/")],
        "scopes_supported": ["mcp", "offline_access"],
        "bearer_methods_supported": ["header"],
    }


def build_authorization_server_metadata(settings: Settings) -> dict:
    issuer = settings.mcp_oauth_issuer_url.rstrip("/")
    return {
        "issuer": issuer,
        "authorization_endpoint": f"{issuer}/authorize",
        "token_endpoint": f"{issuer}/token",
        "revocation_endpoint": f"{issuer}/revoke",
        "scopes_supported": ["mcp", "offline_access"],
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code", "refresh_token"],
        "token_endpoint_auth_methods_supported": ["client_secret_basic", "client_secret_post"],
        "revocation_endpoint_auth_methods_supported": ["client_secret_basic", "client_secret_post"],
        "code_challenge_methods_supported": ["S256"],
    }


@oauth_metadata_router.get("/.well-known/oauth-protected-resource/mcp")
def oauth_protected_resource_metadata() -> JSONResponse:
    settings = get_settings()
    if not settings.mcp_oauth_enabled:
        raise HTTPException(status_code=404)
    return JSONResponse(build_protected_resource_metadata(settings), headers={"Cache-Control": "no-store"})


@oauth_metadata_router.get("/.well-known/oauth-authorization-server/mcp")
def oauth_authorization_server_metadata() -> JSONResponse:
    settings = get_settings()
    if not settings.mcp_oauth_enabled:
        raise HTTPException(status_code=404)
    return JSONResponse(build_authorization_server_metadata(settings), headers={"Cache-Control": "no-store"})


def register_oauth_ui_routes(server: FastMCP, provider: LiuliOAuthProvider) -> None:
    @server.custom_route("/oauth/login", methods=["GET"], name="oauth_login")
    async def oauth_login(request: Request) -> Response:
        request_id = request.query_params.get("request_id", "")
        try:
            context = await provider.get_browser_authorization_context(request_id)
        except OAuthRequestError:
            return _secure(PlainTextResponse("授权请求无效或已过期", status_code=400))
        return _render_authorization_page(request, provider, context)

    @server.custom_route("/oauth/authorize", methods=["POST"], name="oauth_authorize_form")
    async def oauth_authorize(request: Request) -> Response:
        form = await request.form()
        request_id = _form_text(form.get("request_id"))
        csrf_token = _form_text(form.get("csrf_token"))
        action = _form_text(form.get("action"))
        username = _form_text(form.get("username"))[:128]
        password = _form_text(form.get("password"))[:1024]
        try:
            result = await provider.complete_browser_authorization(
                request_id=request_id,
                csrf_token=csrf_token,
                username=username,
                password=password,
                approved=action == "approve",
            )
        except OAuthLoginError:
            try:
                context = await provider.get_browser_authorization_context(request_id)
            except OAuthRequestError:
                return _secure(PlainTextResponse("授权请求无效或已过期", status_code=400))
            return _render_authorization_page(
                request,
                provider,
                context,
                error="用户名或密码错误",
                status_code=401,
            )
        except OAuthRequestError:
            return _secure(PlainTextResponse("授权请求无效或已过期", status_code=400))
        return _secure(RedirectResponse(result.redirect_url, status_code=303))


def _render_authorization_page(
    request: Request,
    provider: LiuliOAuthProvider,
    context,
    *,
    error: str | None = None,
    status_code: int = 200,
) -> HTMLResponse:
    callback_host = urlsplit(context.redirect_uri).hostname or ""
    template = _templates.get_template("authorize.html")
    content = template.render(
        request=request,
        form_action=request.url_for("oauth_authorize_form"),
        request_id=context.request_id,
        csrf_token=provider.csrf_token_for_request(context.request_id),
        client_name=context.client_name,
        callback_host=callback_host,
        scopes=context.scopes,
        allowed_tools=context.allowed_tools,
        error=error,
    )
    return _secure(HTMLResponse(content, status_code=status_code))


def _secure(response: Response):
    response.headers.update(_security_headers)
    return response


def _form_text(value) -> str:
    return value if isinstance(value, str) else ""
