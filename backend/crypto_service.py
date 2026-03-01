import httpx
from fastapi import APIRouter, HTTPException

crypto_router = APIRouter(prefix="/market")
COINGECKO_BASE = "https://api.coingecko.com/api/v3"

@crypto_router.get("/top30")
async def get_top30():
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{COINGECKO_BASE}/coins/markets",
                params={"vs_currency": "usd", "order": "market_cap_desc", "per_page": 30, "page": 1, "sparkline": "false"}
            )
            return resp.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@crypto_router.get("/trending")
async def get_trending():
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{COINGECKO_BASE}/search/trending")
            data = resp.json()
            # Extract just the coin data to match the expected format
            return {"coins": [item["item"] for item in data.get("coins", [])]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@crypto_router.get("/coin/{coin_id}")
async def get_coin_details(coin_id: str):
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{COINGECKO_BASE}/coins/{coin_id}", params={"localization": "false"})
            return resp.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@crypto_router.get("/chart/{coin_id}")
async def get_coin_chart(coin_id: str, days: int = 7):
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{COINGECKO_BASE}/coins/{coin_id}/market_chart", params={"vs_currency": "usd", "days": days})
            return resp.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@crypto_router.get("/global")
async def get_global_market():
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{COINGECKO_BASE}/global")
            return resp.json().get("data", {})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
