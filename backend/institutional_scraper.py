"""
institutional_scraper.py — Real institutional report scraper.
Downloads and analyzes reports from 10+ major financial institutions.
Uses local_vault.py for persistence (no MongoDB needed).
"""
import io
import asyncio
import logging
import requests
from bs4 import BeautifulSoup
from datetime import datetime, timezone
from urllib.parse import urlparse
from PyPDF2 import PdfReader
import local_vault

logger = logging.getLogger("institutional_scraper")

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
}

# ─── Source Definitions ───

SOURCES = [
    {
        "name": "J.P. Morgan",
        "type": "PDF",
        "target": "Global Market Outlook",
        "scrape_url": "https://am.jpmorgan.com/us/en/asset-management/liq/insights/market-insights/",
        "fallback_url": "https://am.jpmorgan.com/content/dam/jpm-am-aem/global/en/insights/market-insights/mi-weekly-market-recap.pdf",
        "backup_urls": [
            "https://www.jpmorgan.com/insights",
        ],
        "allow_proxy_fallback": True,
    },
    {
        "name": "Federal Reserve",
        "type": "HTML",
        "target": "FOMC Minutes / Statements",
        "scrape_url": "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm",
        "fallback_url": None,
        "allow_proxy_fallback": True,
    },
    {
        "name": "ECB",
        "type": "HTML",
        "target": "Monetary Policy Decisions",
        "scrape_url": "https://www.ecb.europa.eu/press/accounts/html/index.en.html",
        "fallback_url": None,
        "allow_proxy_fallback": True,
    },
    {
        "name": "BIS",
        "type": "HTML",
        "target": "Quarterly Review",
        "scrape_url": "https://www.bis.org/statistics/dataportal/index.htm",
        "fallback_url": None,
        "backup_urls": [
            "https://www.bis.org/rss/index.htm",
            "https://www.bis.org/",
        ],
        "allow_proxy_fallback": True,
    },
    {
        "name": "IMF",
        "type": "HTML",
        "target": "World Economic Outlook",
        "scrape_url": "https://www.imf.org/en/Publications/WEO",
        "fallback_url": None,
        "backup_urls": [
            "https://www.imf.org/en/Home",
        ],
        "allow_proxy_fallback": True,
    },
    {
        "name": "Goldman Sachs",
        "type": "HTML",
        "target": "Market Insights",
        "scrape_url": "https://www.goldmansachs.com/insights",
        "fallback_url": None,
        "backup_urls": [
            "https://www.goldmansachs.com/insights/articles",
        ],
        "allow_proxy_fallback": True,
    },
    {
        "name": "BlackRock",
        "type": "HTML",
        "target": "Investment Institute Weekly",
        "scrape_url": "https://www.blackrock.com/corporate/insights/blackrock-investment-institute/publications/weekly-commentary",
        "fallback_url": None,
        "allow_proxy_fallback": True,
    },
    {
        "name": "Morgan Stanley",
        "type": "HTML",
        "target": "Global Strategy Research",
        "scrape_url": "https://www.morganstanley.com/insights",
        "fallback_url": None,
        "backup_urls": [
            "https://www.morganstanley.com/ideas",
        ],
        "allow_proxy_fallback": True,
    },
    {
        "name": "CFTC",
        "type": "HTML",
        "target": "Commitments of Traders Reports",
        "scrape_url": "https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm",
        "fallback_url": None,
        "allow_proxy_fallback": True,
    },
    {
        "name": "World Bank",
        "type": "HTML",
        "target": "Global Economic Prospects",
        "scrape_url": "https://www.worldbank.org/en/publication/global-economic-prospects",
        "fallback_url": None,
        "allow_proxy_fallback": True,
    },
]

MIN_TEXT_LENGTH = 100
PROXY_TIMEOUT = 45


def _build_proxy_url(url: str) -> str:
    if not url:
        return ""
    clean = str(url).strip()
    if clean.startswith("https://r.jina.ai/http://") or clean.startswith("https://r.jina.ai/https://"):
        return clean
    if clean.startswith("http://"):
        return f"https://r.jina.ai/{clean}"
    if clean.startswith("https://"):
        return f"https://r.jina.ai/http://{clean[len('https://'):]}"
    return f"https://r.jina.ai/http://{clean}"


def _extract_text_from_pdf(pdf_bytes: bytes, max_pages: int = 15) -> str:
    """Extract text from a PDF byte stream."""
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        text = ""
        for i, page in enumerate(reader.pages):
            if i >= max_pages:
                break
            extracted = page.extract_text()
            if extracted:
                text += extracted + "\n"
        return text.strip()
    except Exception as e:
        logger.error(f"PDF extraction error: {e}")
        return ""


def _extract_text_from_html(html_content: str, max_chars: int = 8000) -> str:
    """Extract article text from an HTML page."""
    try:
        soup = BeautifulSoup(html_content, 'html.parser')
        # Remove scripts, styles, nav, footer
        for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
            tag.decompose()

        # Try to find main content
        main = soup.find("main") or soup.find("article") or soup.find("div", class_=lambda x: x and ("content" in x.lower() or "article" in x.lower()))
        if main:
            text = main.get_text(separator="\n", strip=True)
        else:
            text = soup.get_text(separator="\n", strip=True)

        # Clean up
        lines = [line.strip() for line in text.split("\n") if len(line.strip()) > 20]
        return "\n".join(lines)[:max_chars]
    except Exception as e:
        logger.error(f"HTML extraction error: {e}")
        return ""


def _find_pdf_link(html_content: str, base_url: str, keywords: list = None) -> str:
    """Find the first PDF link in an HTML page."""
    try:
        soup = BeautifulSoup(html_content, 'html.parser')
        keywords = keywords or ["outlook", "research", "report", "review", "minutes"]
        for a in soup.find_all('a', href=True):
            href = a['href']
            if '.pdf' in href.lower():
                text = (a.get_text() + " " + href).lower()
                if any(kw in text for kw in keywords):
                    if href.startswith('http'):
                        return href
                    elif href.startswith('/'):
                        parsed = urlparse(base_url)
                        return f"{parsed.scheme}://{parsed.netloc}{href}"
        return None
    except Exception:
        return None


def _extract_text_from_proxy_markdown(raw: str, max_chars: int = 8000) -> str:
    """
    r.jina.ai returns markdown-style normalized content.
    Keep only substantial narrative lines.
    """
    lines = []
    for line in str(raw or "").splitlines():
        s = line.strip()
        if not s:
            continue
        if s.startswith(("Title:", "URL Source:", "Published Time:", "Markdown Content:")):
            continue
        if len(s) < 25:
            continue
        lines.append(s)
    return "\n".join(lines)[:max_chars]


def _candidate_urls(source: dict) -> list:
    candidates = []
    for url in [source.get("scrape_url"), source.get("fallback_url"), *(source.get("backup_urls") or [])]:
        if url and url not in candidates:
            candidates.append(url)
    if source.get("allow_proxy_fallback", True):
        proxy_candidates = []
        for url in candidates:
            proxy = _build_proxy_url(url)
            if proxy and proxy not in candidates and proxy not in proxy_candidates:
                proxy_candidates.append(proxy)
        candidates.extend(proxy_candidates)
    return candidates


def _analyze_text_locally(text: str, source_name: str) -> dict:
    """
    Analyze report text without external AI.
    Extracts bias (BULLISH/BEARISH/NEUTRAL) using keyword analysis.
    """
    text_lower = text.lower()

    # Keyword scoring
    bullish_words = ["growth", "recovery", "expansion", "optimistic", "upside", "positive", "rally",
                     "resilient", "strong", "bullish", "upgrade", "overweight", "buy", "accelerating",
                     "crescita", "rialzo", "positivo"]
    bearish_words = ["recession", "contraction", "downturn", "risk", "decline", "bearish", "downside",
                     "weakness", "slowdown", "sell", "underweight", "deteriorating", "headwinds",
                     "ribasso", "negativo", "recessione"]

    bull_count = sum(text_lower.count(w) for w in bullish_words)
    bear_count = sum(text_lower.count(w) for w in bearish_words)

    if bull_count > bear_count * 1.3:
        bias = "BULLISH"
    elif bear_count > bull_count * 1.3:
        bias = "BEARISH"
    else:
        bias = "NEUTRAL"

    # Extract first meaningful sentences as summary
    sentences = [s.strip() for s in text.split('.') if len(s.strip()) > 40]
    summary = '. '.join(sentences[:3]) + '.' if sentences else "Report estratto ma testo insufficiente per riepilogo."

    # Detect affected assets
    affected = []
    asset_keywords = {
        "SPX": ["s&p", "spx", "sp500", "s&p 500"],
        "NAS100": ["nasdaq", "nas100", "tech", "technology"],
        "XAUUSD": ["gold", "xauusd", "precious metals", "oro"],
        "EURUSD": ["euro", "eurusd", "eur/usd", "ecb"],
        "US10Y": ["treasury", "bond", "yield", "10y", "10-year"],
        "DXY": ["dollar", "usd", "dxy", "greenback"],
    }
    for asset, kws in asset_keywords.items():
        if any(kw in text_lower for kw in kws):
            affected.append(asset)

    return {
        "title": f"{source_name} Report Analysis",
        "summary": summary[:500],
        "bias": bias,
        "affected_assets": affected or ["General Market"],
        "bull_score": bull_count,
        "bear_score": bear_count,
        "text_length": len(text),
    }


async def scrape_source(source: dict) -> dict:
    """Scrape a single source and return the result."""
    name = source["name"]
    logger.info(f"📡 Scraping {name}...")

    status = {
        "name": name,
        "target": source["target"],
        "type": source["type"],
        "last_attempt": datetime.now(timezone.utc).isoformat(),
        "status": "RUNNING",
    }
    local_vault.save_scraper_status(name, status)

    try:
        text = ""
        used_url = source["scrape_url"]
        error_trace = []

        for candidate_url in _candidate_urls(source):
            try:
                timeout = PROXY_TIMEOUT if "r.jina.ai" in candidate_url else 20
                response = await asyncio.to_thread(
                    requests.get, candidate_url, headers=HEADERS, timeout=timeout
                )
                if response.status_code != 200:
                    error_trace.append(f"{candidate_url} -> HTTP {response.status_code}")
                    continue

                content_type = response.headers.get("content-type", "").lower()
                candidate_text = ""

                # PDF flow
                if source["type"] == "PDF" or "pdf" in content_type:
                    if "pdf" in content_type:
                        candidate_text = _extract_text_from_pdf(response.content)
                    else:
                        pdf_url = _find_pdf_link(response.text, candidate_url)
                        if pdf_url:
                            pdf_resp = await asyncio.to_thread(
                                requests.get, pdf_url, headers=HEADERS, timeout=25
                            )
                            if pdf_resp.status_code == 200:
                                candidate_text = _extract_text_from_pdf(pdf_resp.content)
                        if not candidate_text:
                            candidate_text = (
                                _extract_text_from_proxy_markdown(response.text)
                                if "r.jina.ai" in candidate_url
                                else _extract_text_from_html(response.text)
                            )
                else:
                    candidate_text = (
                        _extract_text_from_proxy_markdown(response.text)
                        if "r.jina.ai" in candidate_url
                        else _extract_text_from_html(response.text)
                    )

                if candidate_text and len(candidate_text) >= MIN_TEXT_LENGTH:
                    text = candidate_text
                    used_url = candidate_url
                    break
                error_trace.append(f"{candidate_url} -> insufficient_text({len(candidate_text)})")
            except Exception as inner_exc:
                error_trace.append(f"{candidate_url} -> {str(inner_exc)[:120]}")

        if not text:
            raise Exception(" ; ".join(error_trace[-4:]) or "Insufficient text extracted")

        # Step 2: Analyze
        analysis = _analyze_text_locally(text, name)

        # Step 3: Save report
        doc = {
            "filename": f"{name.replace(' ', '_')}_report.{'pdf' if source['type']=='PDF' else 'html'}",
            "bank": name,
            "title": source["target"],
            "source_url": used_url,
            "upload_timestamp": datetime.now(timezone.utc).isoformat(),
            "status": "SYNCED",
            "analysis": analysis,
            "uploaded_by": "Karion Scraper (Auto)",
            "text_preview": text[:300],
        }
        local_vault.save_report(doc)

        # Update status
        status["status"] = "SYNCED"
        status["last_success"] = datetime.now(timezone.utc).isoformat()
        status["text_length"] = len(text)
        status["source_url"] = used_url
        status["bias"] = analysis["bias"]
        local_vault.save_scraper_status(name, status)

        logger.info(f"✅ {name}: {analysis['bias']} ({len(text)} chars)")
        return doc

    except Exception as e:
        error_msg = str(e)[:200]
        logger.error(f"❌ {name}: {error_msg}")
        status["status"] = "ERROR"
        status["error"] = error_msg
        local_vault.save_scraper_status(name, status)
        return None


async def run_institutional_ingestion():
    """
    Main orchestrator — scrapes all sources concurrently.
    Called by APScheduler or manually via the Trigger button.
    """
    logger.info("🚀 Starting Institutional Ingestion Pipeline...")

    tasks = [scrape_source(source) for source in SOURCES]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    success = sum(1 for r in results if r and not isinstance(r, Exception))
    failed = len(results) - success

    statuses = get_sources_status()
    logger.info(f"📊 Ingestion complete: {success} successful, {failed} failed out of {len(SOURCES)} sources")
    return {
        "success": success,
        "failed": failed,
        "total": len(SOURCES),
        "sources": statuses,
    }


def get_sources_status() -> list:
    """Get the current status of all configured sources."""
    saved = local_vault.get_scraper_statuses()
    saved_map = {s["name"]: s for s in saved}

    result = []
    for source in SOURCES:
        name = source["name"]
        if name in saved_map:
            entry = saved_map[name]
        else:
            entry = {
                "name": name,
                "target": source["target"],
                "type": source["type"],
                "status": "IDLE",
                "last_attempt": None,
            }
        result.append(entry)
    return result
