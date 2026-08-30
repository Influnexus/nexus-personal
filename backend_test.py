#!/usr/bin/env python3
"""
REGRESSION TEST for FINAL PRE-PRODUCTION HARDENING
Tests that 4 contained changes (security headers, CORS restriction, landing copy, orphan route deletion)
did NOT break any existing functionality.
"""

import requests
import json
import time
import sys

# Base URL from .env
BASE_URL = "https://financial-health-hub-17.preview.emergentagent.com"
API_BASE = f"{BASE_URL}/api"

# Test credentials
FOUNDER_EMAIL = "founder@nexusai.com"
FOUNDER_PASSWORD = "FxeCgujuk8kA2PWNUO2qRu7"

# Color codes for output
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
RESET = '\033[0m'

def log_success(msg):
    print(f"{GREEN}✅ {msg}{RESET}")

def log_error(msg):
    print(f"{RED}❌ {msg}{RESET}")

def log_info(msg):
    print(f"{YELLOW}ℹ️  {msg}{RESET}")

def get_csrf_token(session):
    """Get CSRF token for NextAuth"""
    try:
        resp = session.get(f"{API_BASE}/auth/csrf", timeout=10)
        if resp.status_code == 200:
            return resp.json().get('csrfToken')
        return None
    except Exception as e:
        log_error(f"Failed to get CSRF token: {e}")
        return None

def create_business_demo_session():
    """Create a business demo session (Enterprise CFO)"""
    log_info("Creating BUSINESS demo session...")
    session = requests.Session()
    
    try:
        # Get CSRF token
        csrf_token = get_csrf_token(session)
        if not csrf_token:
            log_error("Failed to get CSRF token for business demo")
            return None
        
        # Create demo session using demo provider (not credentials)
        resp = session.post(
            f"{API_BASE}/auth/callback/demo",
            data={
                'csrfToken': csrf_token,
                'callbackUrl': f"{BASE_URL}/dashboard",
                'json': 'true'
            },
            headers={'Content-Type': 'application/x-www-form-urlencoded'},
            allow_redirects=False,
            timeout=15
        )
        
        # Check if session was created (302 redirect or session cookie)
        if resp.status_code in [200, 302] and '__Secure-authjs.session-token' in session.cookies:
            log_success("Business demo session created")
            return session
        else:
            log_error(f"Business demo creation failed: {resp.status_code}, location: {resp.headers.get('location', 'N/A')}")
            return None
            
    except Exception as e:
        log_error(f"Business demo session creation error: {e}")
        return None

def create_personal_demo_session():
    """Create a personal demo session"""
    log_info("Creating PERSONAL demo session...")
    session = requests.Session()
    
    try:
        # Get CSRF token
        csrf_token = get_csrf_token(session)
        if not csrf_token:
            log_error("Failed to get CSRF token for personal demo")
            return None
        
        # Create demo session with demo provider and product=personal
        resp = session.post(
            f"{API_BASE}/auth/callback/demo",
            data={
                'csrfToken': csrf_token,
                'product': 'personal',
                'callbackUrl': f"{BASE_URL}/personal",
                'json': 'true'
            },
            headers={'Content-Type': 'application/x-www-form-urlencoded'},
            allow_redirects=False,
            timeout=15
        )
        
        # Check if session was created
        if resp.status_code in [200, 302] and '__Secure-authjs.session-token' in session.cookies:
            log_success("Personal demo session created")
            return session
        else:
            log_error(f"Personal demo creation failed: {resp.status_code}, location: {resp.headers.get('location', 'N/A')}")
            return None
            
    except Exception as e:
        log_error(f"Personal demo session creation error: {e}")
        return None

def test_enterprise_regression(session):
    """Test Enterprise CFO features (business demo)"""
    print("\n" + "="*80)
    print("TEST 1: ENTERPRISE REGRESSION")
    print("="*80)
    
    if not session:
        log_error("No business demo session available")
        return False
    
    all_passed = True
    
    # Test 1a: GET /api/cfo/briefing
    try:
        log_info("Testing GET /api/cfo/briefing...")
        resp = session.get(f"{API_BASE}/cfo/briefing", timeout=30)
        
        if resp.status_code == 200:
            data = resp.json()
            required_keys = ['briefing', 'kpis', 'health', 'forecast']
            missing_keys = [k for k in required_keys if k not in data]
            
            if missing_keys:
                log_error(f"Briefing missing keys: {missing_keys}")
                all_passed = False
            else:
                log_success(f"GET /api/cfo/briefing → 200 with all required keys")
        else:
            log_error(f"GET /api/cfo/briefing → {resp.status_code}")
            all_passed = False
    except Exception as e:
        log_error(f"Briefing test failed: {e}")
        all_passed = False
    
    # Test 1b: POST /api/cfo/chat/stream
    try:
        log_info("Testing POST /api/cfo/chat/stream...")
        resp = session.post(
            f"{API_BASE}/cfo/chat/stream",
            json={'messages': [{'role': 'user', 'content': 'What is my cash runway?'}]},
            headers={'Accept': 'text/event-stream'},
            stream=True,
            timeout=60
        )
        
        if resp.status_code == 200:
            content_type = resp.headers.get('content-type', '')
            if 'text/event-stream' not in content_type:
                log_error(f"Wrong content-type: {content_type}")
                all_passed = False
            else:
                # Parse SSE events (standard format with event: and data: lines)
                events_found = set()
                final_text = ""
                current_event = None
                
                for line in resp.iter_lines(decode_unicode=True):
                    if line.startswith('event: '):
                        current_event = line[7:].strip()
                        events_found.add(current_event)
                    elif line.startswith('data: '):
                        try:
                            event_data = json.loads(line[6:])
                            if current_event == 'token':
                                final_text += event_data.get('delta', event_data.get('content', ''))
                        except:
                            pass
                
                required_events = {'meta', 'tool_start', 'tool_done', 'answer_start', 'token', 'answer_end', 'done'}
                missing_events = required_events - events_found
                
                if missing_events:
                    log_error(f"Missing SSE events: {missing_events}")
                    all_passed = False
                elif '$' not in final_text:
                    log_error("Final text doesn't contain $ amount")
                    all_passed = False
                else:
                    log_success(f"POST /api/cfo/chat/stream → SSE with all events, text contains $")
        else:
            log_error(f"POST /api/cfo/chat/stream → {resp.status_code}")
            all_passed = False
    except Exception as e:
        log_error(f"Chat stream test failed: {e}")
        all_passed = False
    
    return all_passed

def test_personal_smoke(session):
    """Test Personal Finance features"""
    print("\n" + "="*80)
    print("TEST 2: PERSONAL SMOKE TESTS")
    print("="*80)
    
    if not session:
        log_error("No personal demo session available")
        return False
    
    all_passed = True
    
    # Test 2a: GET /api/personal/forecast
    try:
        log_info("Testing GET /api/personal/forecast...")
        resp = session.get(f"{API_BASE}/personal/forecast", timeout=30)
        
        if resp.status_code == 200:
            data = resp.json()
            if 'forecast' in data and 'series' in data['forecast']:
                log_success(f"GET /api/personal/forecast → 200 with forecast.series")
            else:
                log_error(f"Forecast missing required structure")
                all_passed = False
        else:
            log_error(f"GET /api/personal/forecast → {resp.status_code}")
            all_passed = False
    except Exception as e:
        log_error(f"Forecast test failed: {e}")
        all_passed = False
    
    # Test 2b: GET /api/personal/alerts
    try:
        log_info("Testing GET /api/personal/alerts...")
        resp = session.get(f"{API_BASE}/personal/alerts", timeout=30)
        
        if resp.status_code == 200:
            data = resp.json()
            if 'alerts' in data and 'summary' in data:
                log_success(f"GET /api/personal/alerts → 200 with alerts and summary")
            else:
                log_error(f"Alerts missing required structure")
                all_passed = False
        else:
            log_error(f"GET /api/personal/alerts → {resp.status_code}")
            all_passed = False
    except Exception as e:
        log_error(f"Alerts test failed: {e}")
        all_passed = False
    
    # Test 2c: POST /api/personal/chat (SSE)
    try:
        log_info("Testing POST /api/personal/chat...")
        resp = session.post(
            f"{API_BASE}/personal/chat",
            json={'messages': [{'role': 'user', 'content': 'How am I doing financially?'}]},
            headers={'Accept': 'text/event-stream'},
            stream=True,
            timeout=60
        )
        
        if resp.status_code == 200:
            content_type = resp.headers.get('content-type', '')
            if 'text/event-stream' not in content_type:
                log_error(f"Wrong content-type: {content_type}")
                all_passed = False
            else:
                # Parse SSE events (standard format with event: and data: lines)
                events_found = set()
                final_text = ""
                current_event = None
                
                for line in resp.iter_lines(decode_unicode=True):
                    if line.startswith('event: '):
                        current_event = line[7:].strip()
                        events_found.add(current_event)
                    elif line.startswith('data: '):
                        try:
                            event_data = json.loads(line[6:])
                            if current_event == 'token':
                                final_text += event_data.get('delta', event_data.get('content', ''))
                        except:
                            pass
                
                if 'tool_start' in events_found and 'token' in events_found and 'done' in events_found:
                    if '₹' in final_text or '$' in final_text:
                        log_success(f"POST /api/personal/chat → SSE streams with currency figures")
                    else:
                        log_error("Final text doesn't contain currency figures")
                        all_passed = False
                else:
                    log_error(f"Missing expected events. Found: {events_found}")
                    all_passed = False
        else:
            log_error(f"POST /api/personal/chat → {resp.status_code}")
            all_passed = False
    except Exception as e:
        log_error(f"Personal chat test failed: {e}")
        all_passed = False
    
    # Test 2d: POST /api/personal/scenarios/evaluate
    try:
        log_info("Testing POST /api/personal/scenarios/evaluate...")
        resp = session.post(
            f"{API_BASE}/personal/scenarios/evaluate",
            json={
                'levers': {
                    'oneTimePurchase': {'amount': 200000}
                }
            },
            timeout=30
        )
        
        if resp.status_code == 200:
            data = resp.json()
            if 'baseline' in data and 'scenario' in data:
                log_success(f"POST /api/personal/scenarios/evaluate → 200 with baseline/scenario")
            else:
                log_error(f"Scenario response missing required structure")
                all_passed = False
        else:
            log_error(f"POST /api/personal/scenarios/evaluate → {resp.status_code}")
            all_passed = False
    except Exception as e:
        log_error(f"Scenario evaluate test failed: {e}")
        all_passed = False
    
    return all_passed

def test_auth_protection():
    """Test authentication protection"""
    print("\n" + "="*80)
    print("TEST 3: AUTH PROTECTION")
    print("="*80)
    
    all_passed = True
    
    # Test 3a: Unauthenticated POST /api/personal/chat → 401
    try:
        log_info("Testing unauthenticated POST /api/personal/chat...")
        resp = requests.post(
            f"{API_BASE}/personal/chat",
            json={'messages': [{'role': 'user', 'content': 'test'}]},
            timeout=10
        )
        
        if resp.status_code == 401:
            log_success(f"Unauthenticated POST /api/personal/chat → 401 (correct)")
        else:
            log_error(f"Expected 401, got {resp.status_code}")
            all_passed = False
    except Exception as e:
        log_error(f"Unauth chat test failed: {e}")
        all_passed = False
    
    # Test 3b: Unauthenticated GET /personal → redirect to /login
    try:
        log_info("Testing unauthenticated GET /personal...")
        resp = requests.get(f"{BASE_URL}/personal", allow_redirects=False, timeout=10)
        
        if resp.status_code in [302, 307]:
            location = resp.headers.get('location', '')
            if '/login' in location or '/api/auth/signin' in location:
                log_success(f"Unauthenticated GET /personal → {resp.status_code} redirect to login")
            else:
                log_error(f"Redirect to unexpected location: {location}")
                all_passed = False
        else:
            log_error(f"Expected 302/307 redirect, got {resp.status_code}")
            all_passed = False
    except Exception as e:
        log_error(f"Unauth page test failed: {e}")
        all_passed = False
    
    return all_passed

def test_orphan_routes(session):
    """Test that orphan routes are deleted"""
    print("\n" + "="*80)
    print("TEST 4: ORPHAN ROUTES DELETED")
    print("="*80)
    
    if not session:
        log_error("No authenticated session available")
        return False
    
    all_passed = True
    
    # Test 4a: GET /personal/ask should be 404
    try:
        log_info("Testing GET /personal/ask (should be 404)...")
        resp = session.get(f"{BASE_URL}/personal/ask", timeout=10)
        
        if resp.status_code == 404:
            log_success(f"GET /personal/ask → 404 (orphan route deleted)")
        else:
            log_error(f"Expected 404, got {resp.status_code} (orphan route still exists?)")
            all_passed = False
    except Exception as e:
        log_error(f"Orphan route /personal/ask test failed: {e}")
        all_passed = False
    
    # Test 4b: GET /personal/scenario should be 404
    try:
        log_info("Testing GET /personal/scenario (should be 404)...")
        resp = session.get(f"{BASE_URL}/personal/scenario", timeout=10)
        
        if resp.status_code == 404:
            log_success(f"GET /personal/scenario → 404 (orphan route deleted)")
        else:
            log_error(f"Expected 404, got {resp.status_code} (orphan route still exists?)")
            all_passed = False
    except Exception as e:
        log_error(f"Orphan route /personal/scenario test failed: {e}")
        all_passed = False
    
    # Test 4c: Canonical routes should still work
    try:
        log_info("Testing GET /personal/chat (canonical route, should work)...")
        resp = session.get(f"{BASE_URL}/personal/chat", timeout=10)
        
        if resp.status_code == 200:
            log_success(f"GET /personal/chat → 200 (canonical route works)")
        else:
            log_error(f"Canonical route /personal/chat failed: {resp.status_code}")
            all_passed = False
    except Exception as e:
        log_error(f"Canonical route /personal/chat test failed: {e}")
        all_passed = False
    
    try:
        log_info("Testing GET /personal/scenarios (canonical route, should work)...")
        resp = session.get(f"{BASE_URL}/personal/scenarios", timeout=10)
        
        if resp.status_code == 200:
            log_success(f"GET /personal/scenarios → 200 (canonical route works)")
        else:
            log_error(f"Canonical route /personal/scenarios failed: {resp.status_code}")
            all_passed = False
    except Exception as e:
        log_error(f"Canonical route /personal/scenarios test failed: {e}")
        all_passed = False
    
    return all_passed

def test_cors_headers():
    """Test CORS headers are correctly set"""
    print("\n" + "="*80)
    print("TEST 5: CORS HEADERS")
    print("="*80)
    
    all_passed = True
    
    try:
        log_info("Testing CORS headers on /api/health...")
        resp = requests.get(f"{API_BASE}/health", timeout=10)
        
        acao = resp.headers.get('Access-Control-Allow-Origin', '')
        acah = resp.headers.get('Access-Control-Allow-Headers', '')
        
        expected_origin = "https://financial-health-hub-17.preview.emergentagent.com"
        
        if acao == expected_origin:
            log_success(f"Access-Control-Allow-Origin: {acao} (correct, not wildcard)")
        else:
            log_error(f"Access-Control-Allow-Origin: {acao} (expected {expected_origin})")
            all_passed = False
        
        if 'Content-Type' in acah and 'Authorization' in acah:
            log_success(f"Access-Control-Allow-Headers: {acah} (narrowed correctly)")
        else:
            log_error(f"Access-Control-Allow-Headers: {acah} (missing expected headers)")
            all_passed = False
        
        # Verify CSP frame-ancestors is set
        csp = resp.headers.get('Content-Security-Policy', '')
        if 'frame-ancestors' in csp:
            log_success(f"Content-Security-Policy frame-ancestors set: {csp}")
        else:
            log_error(f"Content-Security-Policy missing frame-ancestors")
            all_passed = False
        
        # Verify X-Frame-Options is NOT set (removed)
        xfo = resp.headers.get('X-Frame-Options', '')
        if not xfo:
            log_success(f"X-Frame-Options removed (correct)")
        else:
            log_error(f"X-Frame-Options still present: {xfo}")
            all_passed = False
        
    except Exception as e:
        log_error(f"CORS headers test failed: {e}")
        all_passed = False
    
    return all_passed

def main():
    print("\n" + "="*80)
    print("REGRESSION TEST: FINAL PRE-PRODUCTION HARDENING")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Testing that 4 hardening changes did NOT break functionality:")
    print("  1. Security headers (CSP, CORS)")
    print("  2. Landing copy (non-functional)")
    print("  3. CORS origin restriction (from '*' to production origin)")
    print("  4. Orphan route deletion (/personal/ask, /personal/scenario)")
    print("="*80)
    
    results = {}
    
    # Create sessions
    business_session = create_business_demo_session()
    time.sleep(5)  # Rate limit spacing - increased
    personal_session = create_personal_demo_session()
    time.sleep(5)
    
    # Run tests
    results['enterprise'] = test_enterprise_regression(business_session)
    time.sleep(2)
    
    results['personal'] = test_personal_smoke(personal_session)
    time.sleep(2)
    
    results['auth'] = test_auth_protection()
    time.sleep(2)
    
    results['orphan_routes'] = test_orphan_routes(business_session if business_session else personal_session)
    time.sleep(2)
    
    results['cors'] = test_cors_headers()
    
    # Summary
    print("\n" + "="*80)
    print("REGRESSION TEST SUMMARY")
    print("="*80)
    
    all_passed = all(results.values())
    
    for test_name, passed in results.items():
        status = f"{GREEN}PASS{RESET}" if passed else f"{RED}FAIL{RESET}"
        print(f"{test_name.upper()}: {status}")
    
    print("="*80)
    
    if all_passed:
        print(f"{GREEN}✅ ALL REGRESSION TESTS PASSED{RESET}")
        print(f"{GREEN}✅ CORS restriction did NOT break same-origin API calls{RESET}")
        print(f"{GREEN}✅ Enterprise CFO unaffected{RESET}")
        print(f"{GREEN}✅ Personal Finance APIs working{RESET}")
        print(f"{GREEN}✅ Auth protection working{RESET}")
        print(f"{GREEN}✅ Orphan routes deleted, canonical routes work{RESET}")
        return 0
    else:
        print(f"{RED}❌ SOME REGRESSION TESTS FAILED{RESET}")
        return 1

if __name__ == "__main__":
    sys.exit(main())
