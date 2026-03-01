"""
Karion Trading Dashboard API Tests
Tests for multi-source analysis, COT data, VIX, and authentication
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'http://localhost:8000').rstrip('/')
REQUEST_TIMEOUT = float(os.environ.get("TEST_HTTP_TIMEOUT", "15"))

# Test credentials (generated to keep suite idempotent across reruns)
TEST_EMAIL = os.environ.get("TEST_EMAIL", f"test_{int(time.time() * 1000)}@example.com")
TEST_PASSWORD = os.environ.get("TEST_PASSWORD", "Password123!")
TEST_NAME = os.environ.get("TEST_NAME", "API Test User")


def http_get(url, timeout=REQUEST_TIMEOUT, **kwargs):
    return requests.get(url, timeout=timeout, **kwargs)


def http_post(url, timeout=REQUEST_TIMEOUT, **kwargs):
    return requests.post(url, timeout=timeout, **kwargs)


def ensure_test_user():
    """Create test user if missing; ignore duplicate registration."""
    response = http_post(
        f"{BASE_URL}/api/auth/register",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD, "name": TEST_NAME},
    )
    if response.status_code not in (200, 400):
        pytest.fail(f"Unable to provision test user. Status: {response.status_code}")


class TestHealthAndRoot:
    """Basic API health checks"""
    
    def test_api_root(self):
        """Test API root endpoint"""
        response = http_get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "online"
        assert "TradingOS" in data["message"]


class TestAuthentication:
    """Authentication endpoint tests"""
    
    def test_login_success(self):
        """Test successful login with valid credentials"""
        ensure_test_user()
        response = http_post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["email"] == TEST_EMAIL
        assert data["token_type"] == "bearer"
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        response = http_post(f"{BASE_URL}/api/auth/login", json={
            "email": "wrong@email.com",
            "password": "wrongpassword"
        })
        assert response.status_code == 401


class TestMultiSourceAnalysis:
    """Multi-source analysis engine tests"""
    
    def test_multi_source_endpoint(self):
        """Test /api/analysis/multi-source returns all 4 assets"""
        response = http_get(f"{BASE_URL}/api/analysis/multi-source")
        assert response.status_code == 200
        data = response.json()
        
        # Check structure
        assert "analyses" in data
        assert "vix" in data
        assert "regime" in data
        assert "timestamp" in data
        
        # Check all 4 assets present
        analyses = data["analyses"]
        expected_symbols = ["XAUUSD", "NAS100", "SP500", "EURUSD"]
        for symbol in expected_symbols:
            assert symbol in analyses, f"Missing {symbol} in analyses"
            
            # Validate analysis structure
            analysis = analyses[symbol]
            assert "direction" in analysis
            assert analysis["direction"] in ["Up", "Down", "Neutral"]
            assert "p_up" in analysis
            assert 0 <= analysis["p_up"] <= 100
            assert "confidence" in analysis
            assert 0 <= analysis["confidence"] <= 100
            assert "impulse" in analysis
            assert analysis["impulse"] in ["Prosegue", "Diminuisce", "Inverte"]
            assert "drivers" in analysis
            assert "regime" in analysis
            assert "trade_ready" in analysis
            assert "price" in analysis
    
    def test_vix_data_in_multi_source(self):
        """Test VIX data is included in multi-source response"""
        response = http_get(f"{BASE_URL}/api/analysis/multi-source")
        assert response.status_code == 200
        data = response.json()
        
        vix = data["vix"]
        assert "current" in vix
        assert "change" in vix
        assert "direction" in vix
        assert "regime" in vix
        assert vix["direction"] in ["rising", "falling", "stable"]
        assert vix["regime"] in ["risk-on", "risk-off", "neutral"]


class TestCOTData:
    """COT (Commitment of Traders) endpoint tests"""
    
    def test_cot_data_endpoint(self):
        """Test /api/cot/data returns all 4 assets"""
        response = http_get(f"{BASE_URL}/api/cot/data")
        assert response.status_code == 200
        data = response.json()
        
        # Check structure
        assert "data" in data
        assert "next_release" in data
        assert "last_update" in data
        
        # Check all 4 assets present
        cot_data = data["data"]
        expected_symbols = ["NAS100", "SP500", "XAUUSD", "EURUSD"]
        for symbol in expected_symbols:
            assert symbol in cot_data, f"Missing {symbol} in COT data"
            
            # Validate COT structure
            asset = cot_data[symbol]
            assert "bias" in asset
            assert asset["bias"] in ["Bull", "Bear", "Neutral"]
            assert "confidence" in asset
            assert 0 <= asset["confidence"] <= 100
            assert "squeeze_risk" in asset
            assert 0 <= asset["squeeze_risk"] <= 100
            assert "crowding" in asset
            assert "categories" in asset
            assert "driver_text" in asset
            assert "report_type" in asset
    
    def test_cot_categories_structure(self):
        """Test COT categories have correct structure"""
        response = http_get(f"{BASE_URL}/api/cot/data")
        assert response.status_code == 200
        data = response.json()
        
        # Check TFF report structure (NAS100, SP500, EURUSD)
        nas100 = data["data"]["NAS100"]
        assert nas100["report_type"] == "TFF"
        categories = nas100["categories"]
        assert "asset_manager" in categories
        assert "leveraged" in categories
        assert "dealer" in categories
        
        # Check category fields
        am = categories["asset_manager"]
        assert "name" in am
        assert "long" in am
        assert "short" in am
        assert "net" in am
        assert "net_change" in am
        assert "percentile_52w" in am
        
        # Check Disaggregated report structure (XAUUSD)
        xau = data["data"]["XAUUSD"]
        assert xau["report_type"] == "Disaggregated"
        xau_categories = xau["categories"]
        assert "managed_money" in xau_categories
        assert "swap_dealers" in xau_categories
        assert "producer" in xau_categories
    
    def test_cot_single_symbol(self):
        """Test /api/cot/{symbol} endpoint"""
        response = http_get(f"{BASE_URL}/api/cot/SP500")
        assert response.status_code == 200
        data = response.json()
        assert data["symbol"] == "SP500"
        assert "bias" in data
        assert "categories" in data


class TestVIXEndpoint:
    """VIX market data endpoint tests"""
    
    def test_vix_endpoint(self):
        """Test /api/market/vix returns real VIX data"""
        response = http_get(f"{BASE_URL}/api/market/vix")
        assert response.status_code == 200
        data = response.json()
        
        assert "current" in data
        assert "yesterday" in data
        assert "change" in data
        assert "direction" in data
        assert "regime" in data
        assert "source" in data
        
        # VIX should be a reasonable value (typically 10-80)
        assert 5 <= data["current"] <= 100
        
        # Source should be yahoo_finance or simulated
        assert data["source"] in ["yahoo_finance", "simulated"]


class TestMarketPrices:
    """Market prices endpoint tests"""
    
    def test_market_prices_endpoint(self):
        """Test /api/market/prices returns all assets"""
        response = http_get(f"{BASE_URL}/api/market/prices")
        assert response.status_code == 200
        data = response.json()
        
        expected_symbols = ["XAUUSD", "NAS100", "SP500", "EURUSD"]
        for symbol in expected_symbols:
            assert symbol in data, f"Missing {symbol} in market prices"
            
            price_data = data[symbol]
            assert "price" in price_data
            assert "change" in price_data
            assert "source" in price_data


class TestRiskAnalysis:
    """Risk analysis endpoint tests"""
    
    def test_risk_analysis_endpoint(self):
        """Test /api/risk/analysis returns comprehensive risk data"""
        response = http_get(f"{BASE_URL}/api/risk/analysis")
        assert response.status_code == 200
        data = response.json()
        
        assert "risk_score" in data
        assert 0 <= data["risk_score"] <= 100
        assert "risk_category" in data
        assert data["risk_category"] in ["SAFE", "MEDIUM", "HIGH"]
        assert "vix" in data
        assert "components" in data
        assert "assets" in data
        assert "asset_tilts" in data


class TestPhilosophyQuote:
    """Philosophy quote endpoint tests"""
    
    def test_philosophy_quote(self):
        """Test /api/philosophy/quote returns a quote"""
        response = http_get(f"{BASE_URL}/api/philosophy/quote")
        assert response.status_code == 200
        data = response.json()
        
        assert "author" in data
        assert "quote" in data
        assert len(data["quote"]) > 0


class TestAuthenticatedEndpoints:
    """Tests for endpoints requiring authentication"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        ensure_test_user()
        response = http_post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Authentication failed")
    
    def test_get_me(self, auth_token):
        """Test /api/auth/me returns current user"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = http_get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == TEST_EMAIL
    
    def test_psychology_stats(self, auth_token):
        """Test /api/psychology/stats endpoint"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = http_get(f"{BASE_URL}/api/psychology/stats", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "avg_confidence" in data
        assert "avg_discipline" in data
        assert "total_entries" in data
    
    def test_ascension_status(self, auth_token):
        """Test /api/ascension/status endpoint"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = http_get(f"{BASE_URL}/api/ascension/status", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "xp" in data
        assert "current_level" in data
        assert "all_levels" in data

    def test_deep_research_payload(self, auth_token):
        """Test /api/research/deep-research endpoint"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = http_get(f"{BASE_URL}/api/research/deep-research", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "status" in data
        assert "signals" in data
        assert "diversification" in data
        assert "risk_exposure" in data
        assert "weekly_bias" in data
        assert "monthly_bias" in data

    def test_collection_status_endpoint(self, auth_token):
        """Test collection control status endpoint"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = http_get(f"{BASE_URL}/api/system/collection/status", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "collection_allowed" in data
        assert "reason" in data
        assert "market_window_open" in data

    def test_data_integrity_endpoint(self, auth_token):
        """Test data integrity endpoint"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = http_get(f"{BASE_URL}/api/system/data-integrity", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "ok"
        assert "mongo" in data
        assert "files" in data
        assert "data_lake" in data

    def test_storage_maintenance_endpoint(self, auth_token):
        """Test storage maintenance endpoint"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = http_post(f"{BASE_URL}/api/system/storage/maintenance", headers=headers, json={})
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "ok"
        assert "maintenance" in data
        assert "data_lake" in data


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
