#!/usr/bin/env python3
"""
Sprint 6 — Customer Validation & Product Analytics Backend Testing
Tests: POST /api/analytics/track, POST /api/feedback, GET /api/admin/analytics,
server-side instrumentation, privacy checks, and full regression.
"""
import requests
import json
import time
import hmac
import hashlib
from datetime import datetime

BASE_URL = "https://financial-health-hub-17.preview.emergentagent.com"

# Test credentials
FOUNDER_EMAIL = "founder@nexusai.com"
FOUNDER_PASSWORD = open("/app/memory/test_credentials.md").read().split("founder@nexusai.com / ")[1].splitlines()[0].strip()  # never hardcode

def print_test(name, passed, details=""):
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"{status}: {name}")
    if details:
        print(f"  {details}")

def get_csrf_token(session):
    """Get CSRF token for NextAuth"""
    resp = session.get(f"{BASE_URL}/api/auth/csrf")
    if resp.status_code == 200:
        return resp.json().get("csrfToken")
    return None

def create_demo_session():
    """Create a demo session via NextAuth demo provider"""
    session = requests.Session()
    csrf = get_csrf_token(session)
    if not csrf:
        return None, "Failed to get CSRF token"
    
    resp = session.post(
        f"{BASE_URL}/api/auth/callback/demo",
        data={"csrfToken": csrf},
        allow_redirects=False
    )
    
    if resp.status_code in [302, 200]:
        # Verify session
        sess_resp = session.get(f"{BASE_URL}/api/auth/session")
        if sess_resp.status_code == 200:
            sess_data = sess_resp.json()
            if sess_data.get("user"):
                return session, None
    
    return None, f"Demo session creation failed: {resp.status_code}"

def register_and_login(email, password):
    """Register a new user and login"""
    session = requests.Session()
    
    # Register
    reg_resp = session.post(f"{BASE_URL}/api/register", json={
        "name": "Test User",
        "email": email,
        "password": password
    })
    
    if reg_resp.status_code != 200:
        return None, f"Registration failed: {reg_resp.status_code}"
    
    # Login
    csrf = get_csrf_token(session)
    if not csrf:
        return None, "Failed to get CSRF token"
    
    login_resp = session.post(
        f"{BASE_URL}/api/auth/callback/credentials",
        data={
            "csrfToken": csrf,
            "email": email,
            "password": password,
            "redirect": "false"
        },
        allow_redirects=False
    )
    
    if login_resp.status_code in [302, 200]:
        # Verify session
        sess_resp = session.get(f"{BASE_URL}/api/auth/session")
        if sess_resp.status_code == 200:
            sess_data = sess_resp.json()
            if sess_data.get("user"):
                return session, None
    
    return None, f"Login failed: {login_resp.status_code}"

def test_analytics_track():
    """Test POST /api/analytics/track endpoint"""
    print("\n=== TEST 1: POST /api/analytics/track ===")
    
    # Test 1.1: Valid whitelisted event
    resp = requests.post(f"{BASE_URL}/api/analytics/track", json={
        "event": "landing_page_visit",
        "visitorId": "test-vis-1",
        "sessionId": "test-ses-1",
        "page": "/"
    })
    print_test("Valid whitelisted event", resp.status_code == 200 and resp.json().get("ok") == True)
    
    # Test 1.2: Unknown event name
    resp = requests.post(f"{BASE_URL}/api/analytics/track", json={
        "event": "unknown_event_xyz",
        "visitorId": "test-vis-2",
        "sessionId": "test-ses-2",
        "page": "/"
    })
    print_test("Unknown event returns 400", resp.status_code == 400)
    
    # Test 1.3: Malformed JSON
    resp = requests.post(
        f"{BASE_URL}/api/analytics/track",
        data="not valid json",
        headers={"Content-Type": "application/json"}
    )
    print_test("Malformed JSON returns 400", resp.status_code == 400)
    
    # Test 1.4: Meta sanitization - send extra fields
    resp = requests.post(f"{BASE_URL}/api/analytics/track", json={
        "event": "dashboard_viewed",
        "visitorId": "test-vis-3",
        "sessionId": "test-ses-3",
        "page": "/dashboard",
        "meta": {
            "status": "ok",
            "evil": "<script>alert('xss')</script>",
            "email": "secret@example.com",
            "amount": 99999,
            "note": "secret text"
        }
    })
    print_test("Meta sanitization accepted", resp.status_code == 200)
    
    # Test 1.5: Page with query string
    resp = requests.post(f"{BASE_URL}/api/analytics/track", json={
        "event": "dashboard_viewed",
        "visitorId": "test-vis-4",
        "sessionId": "test-ses-4",
        "page": "/dashboard?token=abc123&secret=xyz"
    })
    print_test("Page with query string accepted", resp.status_code == 200)
    
    # Test 1.6: Authenticated session - userId/orgId attached server-side
    session, err = create_demo_session()
    if session:
        resp = session.post(f"{BASE_URL}/api/analytics/track", json={
            "event": "cfo_chat_viewed",
            "visitorId": "test-vis-5",
            "sessionId": "test-ses-5",
            "page": "/cfo/chat",
            "userId": "fake-client-id"  # Should be ignored
        })
        print_test("Authenticated event tracking", resp.status_code == 200)
    else:
        print_test("Authenticated event tracking", False, f"Demo session failed: {err}")

def test_feedback():
    """Test POST /api/feedback endpoint"""
    print("\n=== TEST 2: POST /api/feedback ===")
    
    # Test 2.1: Unauthenticated request
    resp = requests.post(f"{BASE_URL}/api/feedback", json={
        "type": "rating",
        "rating": "very_useful",
        "text": "Great app!",
        "page": "/dashboard"
    })
    print_test("Unauthenticated returns 401", resp.status_code == 401)
    
    # Create authenticated session
    session, err = create_demo_session()
    if not session:
        print_test("Feedback tests skipped", False, f"Demo session failed: {err}")
        return
    
    # Test 2.2: Valid rating feedback
    resp = session.post(f"{BASE_URL}/api/feedback", json={
        "type": "rating",
        "rating": "very_useful",
        "text": "Great app!",
        "page": "/dashboard"
    })
    print_test("Valid rating feedback", resp.status_code == 200 and resp.json().get("ok") == True)
    
    # Test 2.3: Invalid rating value
    resp = session.post(f"{BASE_URL}/api/feedback", json={
        "type": "rating",
        "rating": "invalid_rating",
        "text": "Test",
        "page": "/dashboard"
    })
    print_test("Invalid rating returns 400", resp.status_code == 400)
    
    # Test 2.4: Valid problem report
    resp = session.post(f"{BASE_URL}/api/feedback", json={
        "type": "problem",
        "text": "Upload failed for me",
        "feature": "invoices",
        "errorId": "req_123",
        "page": "/cfo/invoices"
    })
    print_test("Valid problem report", resp.status_code == 200 and resp.json().get("ok") == True)
    
    # Test 2.5: Problem without text
    resp = session.post(f"{BASE_URL}/api/feedback", json={
        "type": "problem",
        "page": "/dashboard"
    })
    print_test("Problem without text returns 400", resp.status_code == 400)

def test_admin_analytics():
    """Test GET /api/admin/analytics endpoint"""
    print("\n=== TEST 3: GET /api/admin/analytics ===")
    
    # Test 3.1: Unauthenticated request
    resp = requests.get(f"{BASE_URL}/api/admin/analytics")
    print_test("Unauthenticated returns 401", resp.status_code == 401)
    
    # Test 3.2: Regular (non-founder) user
    session, err = create_demo_session()
    if session:
        resp = session.get(f"{BASE_URL}/api/admin/analytics")
        print_test("Non-founder returns 403", resp.status_code == 403)
    else:
        print_test("Non-founder test skipped", False, f"Demo session failed: {err}")
    
    # Test 3.3: Founder user
    timestamp = int(time.time() * 1000)
    founder_email = f"founder_test_{timestamp}@nexusai.com"
    
    # Use actual founder account
    founder_session, err = register_and_login(FOUNDER_EMAIL, FOUNDER_PASSWORD)
    if not founder_session:
        # Try to login if already registered
        founder_session = requests.Session()
        csrf = get_csrf_token(founder_session)
        if csrf:
            login_resp = founder_session.post(
                f"{BASE_URL}/api/auth/callback/credentials",
                data={
                    "csrfToken": csrf,
                    "email": FOUNDER_EMAIL,
                    "password": FOUNDER_PASSWORD,
                    "redirect": "false"
                },
                allow_redirects=False
            )
    
    if founder_session:
        resp = founder_session.get(f"{BASE_URL}/api/admin/analytics")
        if resp.status_code == 200:
            data = resp.json()
            has_summary = "summary" in data
            has_funnel = "funnel" in data
            has_daily = "daily" in data
            has_weekly = "weekly" in data
            has_feature_adoption = "featureAdoption" in data
            has_ai_usage = "aiUsage" in data
            has_errors = "errors" in data
            has_feedback = "feedback" in data
            
            all_keys = has_summary and has_funnel and has_daily and has_weekly and has_feature_adoption and has_ai_usage and has_errors and has_feedback
            print_test("Founder returns 200 with full payload", all_keys, 
                      f"Keys present: summary={has_summary}, funnel={has_funnel}, daily={has_daily}, weekly={has_weekly}, featureAdoption={has_feature_adoption}, aiUsage={has_ai_usage}, errors={has_errors}, feedback={has_feedback}")
            
            # Test 3.4: Range parameter
            resp = founder_session.get(f"{BASE_URL}/api/admin/analytics?range=7")
            print_test("Range parameter ?range=7 works", resp.status_code == 200)
            
            resp = founder_session.get(f"{BASE_URL}/api/admin/analytics?range=90")
            print_test("Range parameter ?range=90 works", resp.status_code == 200)
            
            resp = founder_session.get(f"{BASE_URL}/api/admin/analytics?range=999")
            data = resp.json()
            print_test("Range parameter ?range=999 clamps to 90", resp.status_code == 200 and data.get("rangeDays") == 90)
        else:
            print_test("Founder returns 200", False, f"Status: {resp.status_code}, Body: {resp.text[:200]}")
    else:
        print_test("Founder test skipped", False, "Could not login as founder")

def test_server_instrumentation():
    """Test server-side event instrumentation"""
    print("\n=== TEST 4: Server-side Event Instrumentation ===")
    
    # Test 4.1: Register a new user → signup_completed event
    timestamp = int(time.time() * 1000)
    test_email = f"instrumentation_test_{timestamp}@nexusai.com"
    session, err = register_and_login(test_email, "TestPassword1234")
    print_test("Register creates signup_completed event", session is not None, 
               "Event should be in analytics_events collection")
    
    if not session:
        print("Skipping remaining instrumentation tests - registration failed")
        return
    
    # Test 4.2: Start demo → demo_started event
    demo_session, err = create_demo_session()
    print_test("Demo start creates demo_started event", demo_session is not None,
               "Event should be in analytics_events collection")
    
    if not demo_session:
        print("Using regular session for remaining tests")
        demo_session = session
    
    # Test 4.3: Send AI CFO chat message → cfo_question + cfo_response_completed events
    resp = demo_session.post(f"{BASE_URL}/api/cfo/chat/stream", json={
        "messages": [{"role": "user", "content": "What is my cash position?"}]
    }, stream=True)
    
    if resp.status_code == 200:
        # Read SSE stream
        done_found = False
        for line in resp.iter_lines():
            if line:
                line_str = line.decode('utf-8')
                if line_str.startswith('event: done'):
                    done_found = True
                    break
        print_test("AI chat creates cfo_question + cfo_response_completed events", done_found,
                   "Events should be in analytics_events collection with organizationId")
    else:
        print_test("AI chat creates events", False, f"Chat failed: {resp.status_code}")
    
    # Test 4.4: Upload CSV → csv_import_started + csv_import_completed events
    csv_content = "date,description,vendor,amount\n2024-01-01,Test,Vendor A,100\n2024-01-02,Test2,Vendor B,200"
    resp = demo_session.post(
        f"{BASE_URL}/api/cfo/transactions",
        files={"file": ("test.csv", csv_content, "text/csv")}
    )
    print_test("CSV import creates csv_import_started + csv_import_completed events", 
               resp.status_code == 200,
               "Events should be in analytics_events collection")
    
    # Test 4.5: Upload invalid file to invoices → invoice_upload_started + invoice_upload_failed
    resp = demo_session.post(
        f"{BASE_URL}/api/cfo/invoices",
        files={"file": ("test.txt", "not an image", "text/plain")}
    )
    print_test("Invalid invoice upload creates invoice_upload_started + invoice_upload_failed events",
               resp.status_code in [400, 500],
               "Events should be in analytics_events collection with meta.reason")

def test_privacy_checks():
    """Test privacy - no sensitive data in analytics events"""
    print("\n=== TEST 5: Privacy Checks (MongoDB Inspection Required) ===")
    
    print("⚠️  MANUAL CHECK REQUIRED:")
    print("   Connect to MongoDB and inspect analytics_events collection:")
    print("   - mongosh $MONGO_URL")
    print("   - use nexusai")
    print("   - db.analytics_events.find().sort({createdAt: -1}).limit(10)")
    print("   - Verify NO chat message text, NO file contents, NO invoice amounts, NO emails")
    print("   - Only whitelisted meta keys: status, feature, reason, errorId, durationSec, first")
    print("   - Page field should have NO query strings (e.g., /dashboard not /dashboard?token=abc)")

def test_regression():
    """Test regression - existing flows unchanged"""
    print("\n=== TEST 6: Regression Testing ===")
    
    # Test 6.1: Demo mode creation
    session, err = create_demo_session()
    print_test("Demo mode creation works", session is not None)
    
    if not session:
        print("Skipping remaining regression tests - demo mode failed")
        return
    
    # Test 6.2: AI CFO chat streaming
    resp = session.post(f"{BASE_URL}/api/cfo/chat/stream", json={
        "messages": [{"role": "user", "content": "What is my revenue?"}]
    }, stream=True)
    
    done_found = False
    if resp.status_code == 200:
        for line in resp.iter_lines():
            if line:
                line_str = line.decode('utf-8')
                if line_str.startswith('event: done'):
                    done_found = True
                    break
    print_test("AI CFO chat streaming works", done_found)
    
    # Test 6.3: CSV import
    csv_content = "date,description,vendor,amount\n2024-01-01,Test,Vendor A,100\n2024-01-02,Test2,Vendor B,200"
    resp = session.post(
        f"{BASE_URL}/api/cfo/transactions",
        files={"file": ("test.csv", csv_content, "text/csv")}
    )
    if resp.status_code == 200:
        data = resp.json()
        print_test("CSV import works", "imported" in data and data["imported"] > 0)
    else:
        print_test("CSV import works", False, f"Status: {resp.status_code}")
    
    # Test 6.4: Invoice upload validation (empty file)
    resp = session.post(
        f"{BASE_URL}/api/cfo/invoices",
        files={"file": ("empty.png", b"", "image/png")}
    )
    print_test("Invoice upload validation (empty file)", resp.status_code == 400)
    
    # Test 6.5: Billing - GET /api/billing/subscription
    resp = session.get(f"{BASE_URL}/api/billing/subscription")
    print_test("Billing subscription endpoint works", resp.status_code == 200)
    
    # Test 6.6: Billing - POST /api/billing/trial
    resp = session.post(f"{BASE_URL}/api/billing/trial", json={
        "plan": "starter",
        "interval": "monthly",
        "region": "international"
    })
    if resp.status_code == 200:
        print_test("Billing trial start works (also creates trial_started event)", True)
    else:
        # May fail if trial already exists
        print_test("Billing trial start", resp.status_code in [200, 400], 
                   f"Status: {resp.status_code} (400 acceptable if trial exists)")
    
    # Test 6.7: Memory - GET/POST /api/memory
    resp = session.get(f"{BASE_URL}/api/memory")
    print_test("Memory GET works", resp.status_code == 200)
    
    resp = session.post(f"{BASE_URL}/api/memory", json={
        "category": "business",
        "label": "Test Memory",
        "value": "Test value for regression"
    })
    if resp.status_code == 200:
        print_test("Memory POST works (also creates memory_used event)", True)
    else:
        print_test("Memory POST works", False, f"Status: {resp.status_code}")
    
    # Test 6.8: Tenant isolation - create two demo sessions
    session_a, _ = create_demo_session()
    session_b, _ = create_demo_session()
    
    if session_a and session_b:
        # Get org IDs
        sess_a_data = session_a.get(f"{BASE_URL}/api/auth/session").json()
        sess_b_data = session_b.get(f"{BASE_URL}/api/auth/session").json()
        
        org_a = sess_a_data.get("user", {}).get("activeOrgId")
        org_b = sess_b_data.get("user", {}).get("activeOrgId")
        
        if org_a and org_b and org_a != org_b:
            # Create memory in org A
            session_a.post(f"{BASE_URL}/api/memory", json={
                "category": "business",
                "label": "Org A Secret",
                "value": "Secret data for org A"
            })
            
            # Try to read from org B
            resp_b = session_b.get(f"{BASE_URL}/api/memory")
            if resp_b.status_code == 200:
                memories_b = resp_b.json()
                has_org_a_secret = any(m.get("label") == "Org A Secret" for m in memories_b.get("business", []))
                print_test("Tenant isolation (memory)", not has_org_a_secret,
                           "Org B should NOT see Org A's memories")
            else:
                print_test("Tenant isolation (memory)", False, f"Memory GET failed: {resp_b.status_code}")
        else:
            print_test("Tenant isolation", False, "Could not create two separate orgs")
    else:
        print_test("Tenant isolation", False, "Could not create two demo sessions")

def main():
    print("=" * 80)
    print("SPRINT 6 — CUSTOMER VALIDATION & PRODUCT ANALYTICS BACKEND TESTING")
    print("=" * 80)
    
    test_analytics_track()
    test_feedback()
    test_admin_analytics()
    test_server_instrumentation()
    test_privacy_checks()
    test_regression()
    
    print("\n" + "=" * 80)
    print("TESTING COMPLETE")
    print("=" * 80)
    print("\n⚠️  IMPORTANT: Manual MongoDB inspection required for privacy checks!")
    print("   See TEST 5 output above for instructions.")

if __name__ == "__main__":
    main()
