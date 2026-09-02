#!/usr/bin/env python3
"""
NexusAI Sprint 2.1 - AI CFO Production Hardening Tests
Tests briefing, streaming chat, transaction import, invoice upload, report generation, RBAC, and auth.
"""

import requests
import json
import time
import io
from typing import Dict, Any

# Configuration
# NOTE: Review request asks for localhost:3000, but NextAuth requires consistent domain for CSRF/cookies.
# Using preview URL for all requests since NEXTAUTH_URL is configured for preview domain.
# Localhost auth fails with "MissingCSRF" error due to domain mismatch.
BASE_URL = "https://financial-health-hub-17.preview.emergentagent.com"

# Test results tracking
test_results = []
bugs_found = []

# Unique test run ID to avoid conflicts
TEST_RUN_ID = str(int(time.time()))

def log_test(name: str, passed: bool, details: str = ""):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"{status}: {name}")
    if details:
        print(f"   Details: {details}")
    test_results.append({"name": name, "passed": passed, "details": details})
    if not passed:
        bugs_found.append({"test": name, "details": details})

def get_csrf_token(session: requests.Session) -> str:
    """Get CSRF token for NextAuth"""
    resp = session.get(f"{BASE_URL}/api/auth/csrf")
    return resp.json()["csrfToken"]

def login_user(session: requests.Session, email: str, password: str) -> Dict[str, Any]:
    """Login user via NextAuth credentials"""
    csrf = get_csrf_token(session)
    resp = session.post(
        f"{BASE_URL}/api/auth/callback/credentials",
        data={
            "csrfToken": csrf,
            "email": email,
            "password": password,
            "redirect": "false"
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        allow_redirects=False
    )
    return {"status": resp.status_code, "headers": dict(resp.headers), "cookies": dict(session.cookies)}

def get_session(session: requests.Session) -> Dict[str, Any]:
    """Get current session"""
    try:
        resp = session.get(f"{BASE_URL}/api/auth/session")
        data = resp.json() if resp.text else {}
        return {"status": resp.status_code, "data": data}
    except Exception as e:
        print(f"   Error getting session: {e}")
        return {"status": 0, "data": {}}

def register_user(session: requests.Session, name: str, email: str, password: str) -> Dict[str, Any]:
    """Register a new user"""
    resp = session.post(f"{BASE_URL}/api/register", json={
        "name": name,
        "email": email,
        "password": password
    })
    return {"status": resp.status_code, "data": resp.json() if resp.text else {}}

# ============================================================================
# TEST SUITE
# ============================================================================

def test_1_briefing():
    """Test 1: GET /api/cfo/briefing"""
    print("\n=== Test 1: GET /api/cfo/briefing ===")
    
    # Login as ada@test.com
    session = requests.Session()
    try:
        login_result = login_user(session, "ada@test.com", "password123")
        print(f"   Login result: {login_result}")
        session_data = get_session(session)
        print(f"   Session data: {session_data}")
    except Exception as e:
        log_test("Login as ada@test.com", False, f"Exception during login: {e}")
        import traceback
        traceback.print_exc()
        return
    
    if not session_data or not isinstance(session_data, dict):
        log_test("Login as ada@test.com", False, f"Failed to get session data: {session_data}")
        return
    
    user_data = session_data.get("data")
    if not user_data or not isinstance(user_data, dict) or not user_data.get("user"):
        log_test("Login as ada@test.com", False, f"Failed to login - no user in session. Login status: {login_result.get('status')}, Session: {session_data}")
        return
    
    log_test("Login as ada@test.com", True, f"User ID: {user_data['user'].get('id')}")
    
    # GET /api/cfo/briefing
    resp = session.get(f"{BASE_URL}/api/cfo/briefing")
    
    # Check status code
    passed = resp.status_code == 200
    log_test("GET /api/cfo/briefing returns 200", passed, f"Status: {resp.status_code}")
    
    if resp.status_code != 200:
        return
    
    data = resp.json()
    
    # Check required keys
    required_keys = ["briefing", "kpis", "health", "overdue", "anomalies", "recs", "forecast", "breakdown", "vendors"]
    missing_keys = [k for k in required_keys if k not in data]
    passed = len(missing_keys) == 0
    log_test("Briefing response has all required keys", passed, 
             f"Missing: {missing_keys}" if missing_keys else f"All keys present: {required_keys}")
    
    # Check forecast structure
    forecast = data.get("forecast", {})
    forecast_keys = ["series", "startingCash", "endingCash", "baselineDailyRev", "baselineDailyExp", "scheduledEvents", "narrative", "lowestDay"]
    missing_forecast_keys = [k for k in forecast_keys if k not in forecast]
    passed = len(missing_forecast_keys) == 0
    log_test("Forecast has all required keys", passed,
             f"Missing: {missing_forecast_keys}" if missing_forecast_keys else f"All keys present: {forecast_keys}")
    
    # Check briefing content
    briefing_text = data.get("briefing", "")
    has_business_health = "Business Health" in briefing_text
    has_vendor = any(vendor in briefing_text for vendor in ["Apex Logistics", "Vandelay Industries", "AWS"])
    passed = has_business_health and has_vendor
    log_test("Briefing contains 'Business Health' and vendor name", passed,
             f"Has 'Business Health': {has_business_health}, Has vendor: {has_vendor}")
    
    if not passed:
        print(f"   Briefing excerpt: {briefing_text[:200]}...")

def test_2_chat_stream():
    """Test 2: POST /api/cfo/chat/stream"""
    print("\n=== Test 2: POST /api/cfo/chat/stream ===")
    
    # Login as ada@test.com
    session = requests.Session()
    login_user(session, "ada@test.com", "password123")
    
    # POST /api/cfo/chat/stream
    resp = session.post(
        f"{BASE_URL}/api/cfo/chat/stream",
        json={"messages": [{"role": "user", "content": "What is my cash runway?"}]},
        stream=True
    )
    
    # Check Content-Type
    content_type = resp.headers.get("Content-Type", "")
    passed = content_type.startswith("text/event-stream")
    log_test("Response Content-Type is text/event-stream", passed, f"Content-Type: {content_type}")
    
    if resp.status_code != 200:
        log_test("POST /api/cfo/chat/stream returns 200", False, f"Status: {resp.status_code}")
        return
    
    log_test("POST /api/cfo/chat/stream returns 200", True, f"Status: {resp.status_code}")
    
    # Parse SSE stream
    events = []
    tokens = []
    
    try:
        for line in resp.iter_lines(decode_unicode=True):
            if not line:
                continue
            if line.startswith("event: "):
                event_name = line[7:].strip()
                events.append(event_name)
            elif line.startswith("data: "):
                data_str = line[6:].strip()
                try:
                    data = json.loads(data_str)
                    if event_name == "token" and "delta" in data:
                        tokens.append(data["delta"])
                except:
                    pass
    except Exception as e:
        log_test("Parse SSE stream", False, f"Error: {e}")
        return
    
    # Check required events
    required_events = ["meta", "tool_start", "tool_done", "answer_start", "token", "answer_end", "done"]
    has_meta = "meta" in events
    has_tool_start = "tool_start" in events
    has_tool_done = "tool_done" in events
    has_answer_start = "answer_start" in events
    has_token = "token" in events
    has_answer_end = "answer_end" in events
    has_done = "done" in events
    
    passed = all([has_meta, has_tool_start, has_tool_done, has_answer_start, has_token, has_answer_end, has_done])
    log_test("Stream includes all required events", passed,
             f"Events: {events[:20]}... (meta={has_meta}, tool_start={has_tool_start}, tool_done={has_tool_done}, answer_start={has_answer_start}, token={has_token}, answer_end={has_answer_end}, done={has_done})")
    
    # Check final text contains $
    final_text = "".join(tokens)
    has_dollar = "$" in final_text
    log_test("Final text contains '$'", has_dollar, f"Text excerpt: {final_text[:100]}...")

def test_3_transactions_import():
    """Test 3: POST /api/cfo/transactions with CSV"""
    print("\n=== Test 3: POST /api/cfo/transactions ===")
    
    # Login as ada@test.com
    session = requests.Session()
    login_user(session, "ada@test.com", "password123")
    
    # Create CSV with 3 rows (1 income, 2 expenses)
    csv_content = """date,description,vendor,amount
2024-01-15,Client payment for services,Acme Corp,5000
2024-01-16,Office supplies purchase,Staples,-150
2024-01-17,Software subscription,Adobe,-99"""
    
    csv_file = io.BytesIO(csv_content.encode('utf-8'))
    
    # POST /api/cfo/transactions
    resp = session.post(
        f"{BASE_URL}/api/cfo/transactions",
        files={"file": ("transactions.csv", csv_file, "text/csv")}
    )
    
    passed = resp.status_code == 200
    log_test("POST /api/cfo/transactions returns 200", passed, f"Status: {resp.status_code}")
    
    if resp.status_code != 200:
        return
    
    data = resp.json()
    imported_count = data.get("imported", 0)
    passed = imported_count >= 2
    log_test("Imported count >= 2", passed, f"Imported: {imported_count}")
    
    # GET /api/cfo/transactions to verify
    resp = session.get(f"{BASE_URL}/api/cfo/transactions")
    if resp.status_code == 200:
        data = resp.json()
        transactions = data.get("transactions", [])
        has_category = any(tx.get("category") for tx in transactions)
        log_test("At least one transaction has category field", has_category,
                 f"Total transactions: {len(transactions)}, Has category: {has_category}")

def test_4_invoice_upload():
    """Test 4: POST /api/cfo/invoices with PNG"""
    print("\n=== Test 4: POST /api/cfo/invoices ===")
    
    # Login as ada@test.com
    session = requests.Session()
    login_user(session, "ada@test.com", "password123")
    
    # 1x1 transparent PNG (hex from review request)
    png_hex = "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6300010000000500010d0a2db40000000049454e44ae426082"
    png_bytes = bytes.fromhex(png_hex)
    
    # POST /api/cfo/invoices
    start_time = time.time()
    resp = session.post(
        f"{BASE_URL}/api/cfo/invoices",
        files={"file": ("invoice.png", io.BytesIO(png_bytes), "image/png")},
        timeout=90
    )
    elapsed = time.time() - start_time
    
    # Check response time
    passed = elapsed < 90
    log_test("Invoice upload responds within 90 seconds", passed, f"Elapsed: {elapsed:.1f}s")
    
    # Check response - must be either 200 with invoice or 4xx/5xx with error
    if resp.status_code == 200:
        data = resp.json()
        has_invoice = "invoice" in data
        log_test("Invoice upload returns 200 with invoice", has_invoice, f"Response keys: {list(data.keys())}")
    elif 400 <= resp.status_code < 600:
        data = resp.json() if resp.text else {}
        has_error = "error" in data
        log_test("Invoice upload returns error response with error field", has_error, 
                 f"Status: {resp.status_code}, Response: {data}")
    else:
        log_test("Invoice upload returns valid response", False, 
                 f"Unexpected status: {resp.status_code}")

def test_5_report_generation():
    """Test 5: POST /api/cfo/report"""
    print("\n=== Test 5: POST /api/cfo/report ===")
    
    # Login as ada@test.com
    session = requests.Session()
    login_user(session, "ada@test.com", "password123")
    
    # POST /api/cfo/report
    resp = session.post(f"{BASE_URL}/api/cfo/report")
    
    passed = resp.status_code == 200
    log_test("POST /api/cfo/report returns 200", passed, f"Status: {resp.status_code}")
    
    if resp.status_code != 200:
        return
    
    data = resp.json()
    
    # Check required keys
    has_markdown = "markdown" in data
    has_context = "context" in data
    passed = has_markdown and has_context
    log_test("Report has markdown and context keys", passed, 
             f"Has markdown: {has_markdown}, Has context: {has_context}")
    
    # Check markdown content
    markdown = data.get("markdown", "")
    has_exec_summary = "## Executive Summary" in markdown
    log_test("Markdown contains '## Executive Summary'", has_exec_summary,
             f"Markdown excerpt: {markdown[:200]}...")

def test_6_rbac_no_org():
    """Test 6: Fresh user without org should get 400"""
    print("\n=== Test 6: RBAC - No Active Organization ===")
    
    # Register fresh user
    session = requests.Session()
    email = f"fresh.user.{TEST_RUN_ID}@test.com"
    register_result = register_user(session, "Fresh User", email, "password1234")
    
    if register_result["status"] != 200:
        log_test("Register fresh user", False, f"Status: {register_result['status']}")
        return
    
    log_test("Register fresh user", True, f"Email: {email}")
    
    # Login as fresh user
    login_user(session, email, "password1234")
    
    # GET /api/cfo/briefing
    resp = session.get(f"{BASE_URL}/api/cfo/briefing")
    
    passed = resp.status_code == 400
    log_test("Fresh user GET /api/cfo/briefing returns 400", passed, f"Status: {resp.status_code}")
    
    if resp.status_code == 400:
        data = resp.json()
        error_msg = data.get("error", "")
        has_no_org_error = "No active organization" in error_msg
        log_test("Error message is 'No active organization'", has_no_org_error, f"Error: {error_msg}")

def test_7_unauth_access():
    """Test 7: Unauthenticated access should return 401"""
    print("\n=== Test 7: Unauthenticated Access ===")
    
    # Create session without login
    session = requests.Session()
    
    # GET /api/cfo/briefing
    resp = session.get(f"{BASE_URL}/api/cfo/briefing")
    passed = resp.status_code == 401
    log_test("Unauth GET /api/cfo/briefing returns 401", passed, f"Status: {resp.status_code}")
    
    # POST /api/cfo/chat/stream
    resp = session.post(
        f"{BASE_URL}/api/cfo/chat/stream",
        json={"messages": [{"role": "user", "content": "test"}]}
    )
    passed = resp.status_code == 401
    log_test("Unauth POST /api/cfo/chat/stream returns 401", passed, f"Status: {resp.status_code}")

# ============================================================================
# MAIN EXECUTION
# ============================================================================

def main():
    print("=" * 80)
    print("NexusAI Sprint 2.1 - AI CFO Production Hardening Test Suite")
    print(f"Testing against: {BASE_URL}")
    print("=" * 80)
    
    try:
        test_1_briefing()
        test_2_chat_stream()
        test_3_transactions_import()
        test_4_invoice_upload()
        test_5_report_generation()
        test_6_rbac_no_org()
        test_7_unauth_access()
        
    except Exception as e:
        print(f"\n❌ CRITICAL ERROR: {e}")
        import traceback
        traceback.print_exc()
    
    # Summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    
    total = len(test_results)
    passed = sum(1 for t in test_results if t["passed"])
    failed = total - passed
    pass_rate = (passed / total * 100) if total > 0 else 0
    
    print(f"Total Tests: {total}")
    print(f"Passed: {passed}")
    print(f"Failed: {failed}")
    print(f"Pass Rate: {pass_rate:.1f}%")
    
    if bugs_found:
        print(f"\n🐛 BUGS FOUND: {len(bugs_found)}")
        for i, bug in enumerate(bugs_found, 1):
            print(f"\n{i}. {bug['test']}")
            print(f"   {bug['details']}")
    else:
        print("\n✅ No bugs found - all tests passed!")
    
    print("\n" + "=" * 80)

if __name__ == "__main__":
    main()
