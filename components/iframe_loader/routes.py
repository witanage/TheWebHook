from flask import render_template, session, Response, request
import urllib.request
import urllib.error
import socket
import ipaddress
from urllib.parse import urlparse

from . import iframe_loader_bp
from ..utils import login_required, log


@iframe_loader_bp.route("/iframe-loader")
@login_required
def iframe_loader():
    """iFrame Loader page"""
    user_id = session["user_id"]
    username = session.get("username", "User")
    log(f"User {user_id} accessed iFrame Loader")
    return render_template("iframe-loader.html", username=username)


@iframe_loader_bp.route("/iframe-proxy")
@login_required
def iframe_proxy():
    """Proxy for fetching external URLs with X-Frame-Options and CSP headers stripped"""
    url = request.args.get("url", "").strip()

    if not url:
        return Response("<p>URL parameter is required.</p>", status=400, content_type="text/html")

    try:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            return Response("<p>Only http and https URLs are allowed.</p>", status=400, content_type="text/html")
        hostname = parsed.hostname
        if not hostname:
            return Response("<p>Invalid URL: missing hostname.</p>", status=400, content_type="text/html")
    except Exception:
        return Response("<p>Invalid URL.</p>", status=400, content_type="text/html")

    # SSRF protection: block requests to private/loopback addresses
    try:
        ip_str = socket.gethostbyname(hostname)
        ip = ipaddress.ip_address(ip_str)
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast:
            return Response("<p>Access to private or local addresses is not permitted.</p>", status=403,
                            content_type="text/html")
    except socket.gaierror:
        return Response("<p>Could not resolve hostname.</p>", status=502, content_type="text/html")

    try:
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.5",
            }
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            content = resp.read()
            content_type = resp.headers.get("Content-Type", "text/html; charset=utf-8")
            status_code = resp.status
    except urllib.error.HTTPError as e:
        content = e.read()
        content_type = e.headers.get("Content-Type", "text/html; charset=utf-8")
        status_code = e.code
    except urllib.error.URLError as e:
        return Response(f"<p>Failed to fetch URL: {e.reason}</p>", status=502, content_type="text/html")
    except Exception as e:
        return Response(f"<p>Proxy error: {e}</p>", status=500, content_type="text/html")

    # For HTML responses, inject <base href> so relative URLs resolve correctly
    if "text/html" in content_type:
        try:
            charset = "utf-8"
            if "charset=" in content_type:
                charset = content_type.split("charset=")[-1].strip().split(";")[0].strip()
            html = content.decode(charset, errors="replace")
            base_tag = f'<base href="{url}">'
            lower = html.lower()
            if "<head>" in lower:
                idx = lower.index("<head>") + len("<head>")
                html = html[:idx] + base_tag + html[idx:]
            elif "<html>" in lower:
                idx = lower.index("<html>") + len("<html>")
                html = html[:idx] + "<head>" + base_tag + "</head>" + html[idx:]
            else:
                html = base_tag + html
            content = html.encode("utf-8")
            content_type = "text/html; charset=utf-8"
        except Exception:
            pass

    flask_response = Response(content, status=status_code, content_type=content_type)
    # X-Frame-Options is intentionally omitted to allow embedding
    return flask_response
