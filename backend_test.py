#!/usr/bin/env python3
"""
Trading Dashboard Backend API Testing Suite
Tests all endpoints with comprehensive coverage
"""

import requests
import sys
import json
from datetime import datetime
import time

class TradingDashboardTester:
    def __init__(self, base_url="https://trade-os-1.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.token = None
        self.user_id = None
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []
        self.session = requests.Session()
        self.session.headers.update({'Content-Type': 'application/json'})

    def log_test(self, name, success, details=""):
        """Log test results"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name}")
        else:
            print(f"❌ {name} - {details}")
            self.failed_tests.append({"test": name, "error": details})

    def make_request(self, method, endpoint, data=None, files=None, expected_status=200):
        """Make HTTP request with error handling"""
        url = f"{self.base_url}/{endpoint}"
        headers = {}
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'
        
        try:
            if method == 'GET':
                response = self.session.get(url, headers=headers)
            elif method == 'POST':
                if files:
                    # Don't set Content-Type for file uploads
                    response = self.session.post(url, files=files, headers=headers)
                else:
                    response = self.session.post(url, json=data, headers=headers)
            elif method == 'PUT':
                response = self.session.put(url, json=data, headers=headers)
            elif method == 'DELETE':
                response = self.session.delete(url, headers=headers)
            
            success = response.status_code == expected_status
            return success, response.json() if success else {}, response.status_code
        except Exception as e:
            return False, {}, str(e)

    def test_root_endpoint(self):
        """Test API root endpoint"""
        success, data, status = self.make_request('GET', '')
        self.log_test("API Root Endpoint", success and data.get('status') == 'online', f"Status: {status}")
        return success

    def test_user_registration(self):
        """Test user registration"""
        test_user = {
            "email": "test@trading.com",
            "password": "test123",
            "name": "Test Trader"
        }
        
        success, data, status = self.make_request('POST', 'auth/register', test_user, expected_status=200)
        if success and 'access_token' in data:
            self.token = data['access_token']
            self.user_id = data['user']['id']
            self.session.headers.update({'Authorization': f'Bearer {self.token}'})
        
        self.log_test("User Registration", success, f"Status: {status}")
        return success

    def test_user_login(self):
        """Test user login (fallback if registration fails)"""
        login_data = {
            "email": "test@trading.com",
            "password": "test123"
        }
        
        success, data, status = self.make_request('POST', 'auth/login', login_data, expected_status=200)
        if success and 'access_token' in data:
            self.token = data['access_token']
            self.user_id = data['user']['id']
            self.session.headers.update({'Authorization': f'Bearer {self.token}'})
        
        self.log_test("User Login", success, f"Status: {status}")
        return success

    def test_get_current_user(self):
        """Test get current user info"""
        success, data, status = self.make_request('GET', 'auth/me')
        self.log_test("Get Current User", success and 'email' in data, f"Status: {status}")
        return success

    def test_market_prices(self):
        """Test market prices endpoint"""
        success, data, status = self.make_request('GET', 'market/prices')
        expected_symbols = ['XAUUSD', 'NAS100', 'SP500', 'DOW']
        has_symbols = all(symbol in data for symbol in expected_symbols)
        self.log_test("Market Prices", success and has_symbols, f"Status: {status}")
        return success

    def test_philosophy_quote(self):
        """Test philosophy quote endpoint"""
        success, data, status = self.make_request('GET', 'philosophy/quote')
        has_quote = 'quote' in data and 'author' in data
        self.log_test("Philosophy Quote", success and has_quote, f"Status: {status}")
        return success

    def test_psychology_checkin(self):
        """Test psychology check-in creation"""
        checkin_data = {
            "confidence": 8,
            "discipline": 7,
            "emotional_state": "calmo",
            "sleep_hours": 7.5,
            "sleep_quality": 8,
            "notes": "Test check-in"
        }
        
        success, data, status = self.make_request('POST', 'psychology/checkin', checkin_data, expected_status=200)
        self.log_test("Psychology Check-in", success and 'id' in data, f"Status: {status}")
        return success

    def test_psychology_stats(self):
        """Test psychology statistics"""
        success, data, status = self.make_request('GET', 'psychology/stats')
        has_stats = 'avg_confidence' in data and 'total_entries' in data
        self.log_test("Psychology Stats", success and has_stats, f"Status: {status}")
        return success

    def test_journal_entry(self):
        """Test journal entry creation"""
        journal_data = {
            "plan_respected": True,
            "emotions": "Calmo e concentrato durante il trading",
            "lucid_state": True,
            "optimization_notes": "Migliorare la gestione del rischio",
            "errors_today": "Entrato troppo presto su EURUSD",
            "lessons_learned": "Aspettare conferma del breakout"
        }
        
        success, data, status = self.make_request('POST', 'journal/entry', journal_data, expected_status=200)
        has_ai_suggestions = 'ai_suggestions' in data
        self.log_test("Journal Entry Creation", success and has_ai_suggestions, f"Status: {status}")
        return success

    def test_journal_entries(self):
        """Test get journal entries"""
        success, data, status = self.make_request('GET', 'journal/entries')
        self.log_test("Get Journal Entries", success and isinstance(data, list), f"Status: {status}")
        return success

    def test_strategy_creation(self):
        """Test strategy creation"""
        strategy_data = {
            "name": "Test Strategy",
            "content": "Strategia di breakout su timeframe H1 con conferma volume"
        }
        
        success, data, status = self.make_request('POST', 'strategy', strategy_data, expected_status=200)
        if success and 'id' in data:
            self.strategy_id = data['id']
        self.log_test("Strategy Creation", success and 'id' in data, f"Status: {status}")
        return success

    def test_strategy_optimization(self):
        """Test strategy AI optimization"""
        if not hasattr(self, 'strategy_id'):
            self.log_test("Strategy Optimization", False, "No strategy ID available")
            return False
            
        success, data, status = self.make_request('POST', f'strategy/{self.strategy_id}/optimize')
        has_optimizations = 'optimizations' in data and isinstance(data['optimizations'], list)
        self.log_test("Strategy AI Optimization", success and has_optimizations, f"Status: {status}")
        return success

    def test_ai_chat(self):
        """Test AI chat functionality"""
        chat_data = {
            "messages": [{"role": "user", "content": "Dammi un consiglio per il trading"}],
            "context": "general"
        }
        
        success, data, status = self.make_request('POST', 'ai/chat', chat_data)
        has_response = 'response' in data and data['response']
        self.log_test("AI Chat", success and has_response, f"Status: {status}")
        return success

    def test_monte_carlo_simulation(self):
        """Test Monte Carlo simulation"""
        mc_params = {
            "win_rate": 0.6,
            "avg_win": 2.0,
            "avg_loss": 1.0,
            "num_trades": 1000,
            "initial_capital": 10000,
            "risk_per_trade": 0.02
        }
        
        success, data, status = self.make_request('POST', 'montecarlo/simulate', mc_params)
        has_results = 'equity_curves' in data and 'bankruptcy_rate' in data
        self.log_test("Monte Carlo Simulation", success and has_results, f"Status: {status}")
        return success

    def test_community_post(self):
        """Test community post creation"""
        post_data = {
            "caption": "Great trade today! +150 pips on EURUSD",
            "profit": 150.50,
            "image_url": "https://example.com/chart.png"
        }
        
        success, data, status = self.make_request('POST', 'community/posts', post_data, expected_status=200)
        if success and 'id' in data:
            self.post_id = data['id']
        self.log_test("Community Post Creation", success and 'id' in data, f"Status: {status}")
        return success

    def test_community_like(self):
        """Test community post like"""
        if not hasattr(self, 'post_id'):
            self.log_test("Community Post Like", False, "No post ID available")
            return False
            
        success, data, status = self.make_request('POST', f'community/posts/{self.post_id}/like')
        self.log_test("Community Post Like", success and data.get('status') == 'liked', f"Status: {status}")
        return success

    def test_discipline_rules(self):
        """Test discipline rules CRUD"""
        # Create rule
        rule_data = {"rule": "Never risk more than 2% per trade"}
        success, data, status = self.make_request('POST', 'rules', rule_data, expected_status=200)
        
        if success and 'id' in data:
            rule_id = data['id']
            
            # Get rules
            success2, data2, status2 = self.make_request('GET', 'rules')
            
            # Delete rule
            success3, data3, status3 = self.make_request('DELETE', f'rules/{rule_id}')
            
            overall_success = success and success2 and success3
            self.log_test("Discipline Rules CRUD", overall_success, f"Create: {status}, Get: {status2}, Delete: {status3}")
        else:
            self.log_test("Discipline Rules CRUD", False, f"Create failed: {status}")
        
        return success

    def test_ascension_status(self):
        """Test ascension/gamification status"""
        success, data, status = self.make_request('GET', 'ascension/status')
        has_xp_data = 'xp' in data and 'current_level' in data
        self.log_test("Ascension Status", success and has_xp_data, f"Status: {status}")
        return success

    def test_settings_update(self):
        """Test settings updates"""
        # Test theme update
        success1, data1, status1 = self.make_request('PUT', 'settings/theme?theme=dark')
        
        # Test language update  
        success2, data2, status2 = self.make_request('PUT', 'settings/language?language=it')
        
        overall_success = success1 and success2
        self.log_test("Settings Update", overall_success, f"Theme: {status1}, Language: {status2}")
        return overall_success

    def run_all_tests(self):
        """Run complete test suite"""
        print("🚀 Starting Trading Dashboard API Tests...")
        print(f"📡 Testing against: {self.base_url}")
        print("=" * 60)
        
        # Core API tests
        self.test_root_endpoint()
        
        # Authentication tests
        auth_success = self.test_user_registration()
        if not auth_success:
            print("⚠️  Registration failed, trying login...")
            auth_success = self.test_user_login()
        
        if not auth_success:
            print("❌ Authentication failed completely. Cannot continue with protected endpoints.")
            return self.generate_report()
        
        self.test_get_current_user()
        
        # Market data tests
        self.test_market_prices()
        self.test_philosophy_quote()
        
        # Psychology module tests
        self.test_psychology_checkin()
        self.test_psychology_stats()
        
        # Journal tests
        self.test_journal_entry()
        self.test_journal_entries()
        
        # Strategy tests
        self.test_strategy_creation()
        self.test_strategy_optimization()
        
        # AI tests
        self.test_ai_chat()
        
        # Monte Carlo tests
        self.test_monte_carlo_simulation()
        
        # Community tests
        self.test_community_post()
        self.test_community_like()
        
        # Rules tests
        self.test_discipline_rules()
        
        # Gamification tests
        self.test_ascension_status()
        
        # Settings tests
        self.test_settings_update()
        
        return self.generate_report()

    def generate_report(self):
        """Generate test report"""
        print("\n" + "=" * 60)
        print("📊 TEST RESULTS SUMMARY")
        print("=" * 60)
        print(f"✅ Tests Passed: {self.tests_passed}/{self.tests_run}")
        print(f"❌ Tests Failed: {len(self.failed_tests)}")
        print(f"📈 Success Rate: {(self.tests_passed/self.tests_run)*100:.1f}%")
        
        if self.failed_tests:
            print("\n🔍 FAILED TESTS:")
            for test in self.failed_tests:
                print(f"  • {test['test']}: {test['error']}")
        
        return {
            "total_tests": self.tests_run,
            "passed_tests": self.tests_passed,
            "failed_tests": self.failed_tests,
            "success_rate": (self.tests_passed/self.tests_run)*100 if self.tests_run > 0 else 0
        }

def main():
    tester = TradingDashboardTester()
    results = tester.run_all_tests()
    
    # Return appropriate exit code
    return 0 if results["success_rate"] >= 80 else 1

if __name__ == "__main__":
    sys.exit(main())