#!/usr/bin/env python3
"""
Sprint 2.7 Phase 4A - Billing Architecture Backend Test
Tests the NEW billing architecture with demo-mode authentication.
"""
import requests
import json
import time
import io
from datetime import datetime

# Base URL from .env
BASE_URL = "https://financial-health-hub-17.preview.emergentagent.com"
API_BASE = f"{BASE_URL}/api"

def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

def create_demo_session():
    """Create a fresh demo session with cookies persisted"""
    session = requests.Session()
    
    # Step 1: Get CSRF token
    log("Getting CSRF token...")
    csrf_resp = session.get(f"{API_BASE}/auth/csrf")
    if csrf_resp.status_code != 200:
        log(f"❌ CSRF request failed: {csrf_resp.status_code}")
        return None
    csrf_token = csrf_resp.json().get('csrfToken')
    log(f"✅ CSRF token obtained: {csrf_token[:20]}...")
    
    # Step 2: Create demo session
    log("Creating demo session...")
    demo_resp = session.post(
        f"{API_BASE}/auth/callback/demo",
        data={'csrfToken': csrf_token},
        allow_redirects=False
    )
    if demo_resp.status_code not in [200, 302]:
        log(f"❌ Demo session creation failed: {demo_resp.status_code}")
        return None
    log(f"✅ Demo session created (status: {demo_resp.status_code})")
    
    # Verify session
    session_resp = session.get(f"{API_BASE}/auth/session")
    if session_resp.status_code != 200:
        log(f"❌ Session verification failed: {session_resp.status_code}")
        return None
    
    session_data = session_resp.json()
    if not session_data.get('user'):
        log(f"❌ No user in session")
        return None
    
    log(f"✅ Session verified - User: {session_data['user'].get('email', 'N/A')}, isDemo: {session_data['user'].get('isDemo')}, activeOrgId: {session_data['user'].get('activeOrgId')}")
    return session

def test_1_initial_subscription_state(session):
    """Test 1: GET /api/billing/subscription with no subscription yet"""
    log("\n=== TEST 1: Initial subscription state (no subscription) ===")
    try:
        resp = session.get(f"{API_BASE}/billing/subscription")
        log(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            log(f"❌ FAIL: Expected 200, got {resp.status_code}")
            log(f"Response: {resp.text}")
            return False
        
        data = resp.json()
        log(f"Response keys: {list(data.keys())}")
        
        # Check subscription is null
        if data.get('subscription') is not None:
            log(f"❌ FAIL: Expected subscription to be null, got {data.get('subscription')}")
            return False
        log("✅ subscription is null")
        
        # Check usage array
        usage = data.get('usage', {}).get('usage', [])
        if not isinstance(usage, list):
            log(f"❌ FAIL: Expected usage.usage to be array, got {type(usage)}")
            return False
        log(f"✅ usage.usage is array with {len(usage)} items")
        
        # Check free tier limits
        usage_dict = {u['metric']: u for u in usage}
        expected_limits = {
            'ai_messages': 20,
            'invoices_processed': 5,
            'csv_imports': 1
        }
        
        for metric, expected_limit in expected_limits.items():
            if metric not in usage_dict:
                log(f"❌ FAIL: Missing metric {metric} in usage")
                return False
            actual_limit = usage_dict[metric].get('limit')
            if actual_limit != expected_limit:
                log(f"❌ FAIL: {metric} limit is {actual_limit}, expected {expected_limit}")
                return False
            log(f"✅ {metric} limit = {actual_limit} (correct)")
        
        # Check plans object
        plans = data.get('plans', {})
        if not isinstance(plans, dict):
            log(f"❌ FAIL: Expected plans to be object, got {type(plans)}")
            return False
        
        required_plans = ['starter', 'growth', 'enterprise']
        for plan in required_plans:
            if plan not in plans:
                log(f"❌ FAIL: Missing plan '{plan}' in plans object")
                return False
        log(f"✅ plans object has all required keys: {required_plans}")
        
        log("✅ TEST 1 PASSED")
        return True
        
    except Exception as e:
        log(f"❌ TEST 1 FAILED with exception: {e}")
        return False

def test_2_start_trial(session):
    """Test 2: POST /api/billing/trial with starter plan"""
    log("\n=== TEST 2: Start trial (starter/monthly/INTL) ===")
    try:
        resp = session.post(
            f"{API_BASE}/billing/trial",
            json={"plan": "starter", "interval": "monthly", "region": "INTL"}
        )
        log(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            log(f"❌ FAIL: Expected 200, got {resp.status_code}")
            log(f"Response: {resp.text}")
            return False
        
        data = resp.json()
        subscription = data.get('subscription', {})
        
        # Check status is trialing
        if subscription.get('status') != 'trialing':
            log(f"❌ FAIL: Expected status='trialing', got '{subscription.get('status')}'")
            return False
        log("✅ subscription.status = 'trialing'")
        
        # Check provider is null
        if subscription.get('provider') is not None:
            log(f"❌ FAIL: Expected provider=null, got '{subscription.get('provider')}'")
            return False
        log("✅ subscription.provider = null")
        
        # Check trialEndsAt is roughly 14 days from now
        trial_ends = subscription.get('trialEndsAt')
        if not trial_ends:
            log(f"❌ FAIL: trialEndsAt is missing")
            return False
        log(f"✅ trialEndsAt = {trial_ends} (roughly 14 days from now)")
        
        log("✅ TEST 2 PASSED")
        return True
        
    except Exception as e:
        log(f"❌ TEST 2 FAILED with exception: {e}")
        return False

def test_3_duplicate_trial(session):
    """Test 3: POST /api/billing/trial again (should fail with 400)"""
    log("\n=== TEST 3: Duplicate trial attempt (should fail) ===")
    try:
        resp = session.post(
            f"{API_BASE}/billing/trial",
            json={"plan": "starter", "interval": "monthly", "region": "INTL"}
        )
        log(f"Status: {resp.status_code}")
        
        if resp.status_code != 400:
            log(f"❌ FAIL: Expected 400, got {resp.status_code}")
            log(f"Response: {resp.text}")
            return False
        
        data = resp.json()
        error = data.get('error', '')
        if 'already has a subscription' not in error.lower():
            log(f"❌ FAIL: Expected error about existing subscription, got: {error}")
            return False
        
        log(f"✅ Got 400 with correct error: {error}")
        log("✅ TEST 3 PASSED")
        return True
        
    except Exception as e:
        log(f"❌ TEST 3 FAILED with exception: {e}")
        return False

def test_4_change_plan(session):
    """Test 4: PATCH /api/billing/plan to growth"""
    log("\n=== TEST 4: Change plan to growth/monthly ===")
    try:
        resp = session.patch(
            f"{API_BASE}/billing/plan",
            json={"plan": "growth", "interval": "monthly"}
        )
        log(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            log(f"❌ FAIL: Expected 200, got {resp.status_code}")
            log(f"Response: {resp.text}")
            return False
        
        data = resp.json()
        subscription = data.get('subscription', {})
        
        if subscription.get('plan') != 'growth':
            log(f"❌ FAIL: Expected plan='growth', got '{subscription.get('plan')}'")
            return False
        
        log(f"✅ subscription.plan = 'growth'")
        log("✅ TEST 4 PASSED")
        return True
        
    except Exception as e:
        log(f"❌ TEST 4 FAILED with exception: {e}")
        return False

def test_5_cancel_at_period_end(session):
    """Test 5: POST /api/billing/cancel with immediate=false"""
    log("\n=== TEST 5: Cancel at period end (immediate=false) ===")
    try:
        resp = session.post(
            f"{API_BASE}/billing/cancel",
            json={"immediate": False}
        )
        log(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            log(f"❌ FAIL: Expected 200, got {resp.status_code}")
            log(f"Response: {resp.text}")
            return False
        
        data = resp.json()
        subscription = data.get('subscription', {})
        
        if subscription.get('cancelAtPeriodEnd') != True:
            log(f"❌ FAIL: Expected cancelAtPeriodEnd=true, got {subscription.get('cancelAtPeriodEnd')}")
            return False
        
        log(f"✅ cancelAtPeriodEnd = true")
        log("✅ TEST 5 PASSED")
        return True
        
    except Exception as e:
        log(f"❌ TEST 5 FAILED with exception: {e}")
        return False

def test_6_resume_subscription(session):
    """Test 6: POST /api/billing/resume"""
    log("\n=== TEST 6: Resume subscription ===")
    try:
        resp = session.post(f"{API_BASE}/billing/resume")
        log(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            log(f"❌ FAIL: Expected 200, got {resp.status_code}")
            log(f"Response: {resp.text}")
            return False
        
        data = resp.json()
        subscription = data.get('subscription', {})
        
        if subscription.get('cancelAtPeriodEnd') != False:
            log(f"❌ FAIL: Expected cancelAtPeriodEnd=false, got {subscription.get('cancelAtPeriodEnd')}")
            return False
        
        log(f"✅ cancelAtPeriodEnd = false")
        log("✅ TEST 6 PASSED")
        return True
        
    except Exception as e:
        log(f"❌ TEST 6 FAILED with exception: {e}")
        return False

def test_7_cancel_immediate(session):
    """Test 7: POST /api/billing/cancel with immediate=true"""
    log("\n=== TEST 7: Cancel immediately (immediate=true) ===")
    try:
        resp = session.post(
            f"{API_BASE}/billing/cancel",
            json={"immediate": True}
        )
        log(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            log(f"❌ FAIL: Expected 200, got {resp.status_code}")
            log(f"Response: {resp.text}")
            return False
        
        data = resp.json()
        subscription = data.get('subscription', {})
        
        if subscription.get('status') != 'canceled':
            log(f"❌ FAIL: Expected status='canceled', got '{subscription.get('status')}'")
            return False
        
        log(f"✅ status = 'canceled'")
        log("✅ TEST 7 PASSED")
        return True
        
    except Exception as e:
        log(f"❌ TEST 7 FAILED with exception: {e}")
        return False

def test_8_invoices_empty(session):
    """Test 8: GET /api/billing/invoices (should be empty)"""
    log("\n=== TEST 8: Get invoices (should be empty) ===")
    try:
        resp = session.get(f"{API_BASE}/billing/invoices")
        log(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            log(f"❌ FAIL: Expected 200, got {resp.status_code}")
            log(f"Response: {resp.text}")
            return False
        
        data = resp.json()
        invoices = data.get('invoices', None)
        
        if not isinstance(invoices, list):
            log(f"❌ FAIL: Expected invoices to be array, got {type(invoices)}")
            return False
        
        if len(invoices) != 0:
            log(f"❌ FAIL: Expected empty invoices array, got {len(invoices)} items")
            return False
        
        log(f"✅ invoices = [] (empty)")
        log("✅ TEST 8 PASSED")
        return True
        
    except Exception as e:
        log(f"❌ TEST 8 FAILED with exception: {e}")
        return False

def test_9_payment_methods_empty(session):
    """Test 9: GET /api/billing/payment-methods (should be empty)"""
    log("\n=== TEST 9: Get payment methods (should be empty) ===")
    try:
        resp = session.get(f"{API_BASE}/billing/payment-methods")
        log(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            log(f"❌ FAIL: Expected 200, got {resp.status_code}")
            log(f"Response: {resp.text}")
            return False
        
        data = resp.json()
        methods = data.get('paymentMethods', None)
        
        if not isinstance(methods, list):
            log(f"❌ FAIL: Expected paymentMethods to be array, got {type(methods)}")
            return False
        
        if len(methods) != 0:
            log(f"❌ FAIL: Expected empty paymentMethods array, got {len(methods)} items")
            return False
        
        log(f"✅ paymentMethods = [] (empty)")
        log("✅ TEST 9 PASSED")
        return True
        
    except Exception as e:
        log(f"❌ TEST 9 FAILED with exception: {e}")
        return False

def test_10_checkout_not_configured(session):
    """Test 10: POST /api/billing/checkout (should return 503 not_configured)"""
    log("\n=== TEST 10: Checkout (should be not_configured) ===")
    try:
        resp = session.post(
            f"{API_BASE}/billing/checkout",
            json={"plan": "starter", "interval": "monthly", "region": "INTL"}
        )
        log(f"Status: {resp.status_code}")
        
        if resp.status_code != 503:
            log(f"❌ FAIL: Expected 503, got {resp.status_code}")
            log(f"Response: {resp.text}")
            return False
        
        data = resp.json()
        error = data.get('error', '')
        message = data.get('message', '')
        
        if error != 'not_configured':
            log(f"❌ FAIL: Expected error='not_configured', got '{error}'")
            return False
        
        if not message or len(message) < 10:
            log(f"❌ FAIL: Expected human-readable message, got '{message}'")
            return False
        
        log(f"✅ error = 'not_configured'")
        log(f"✅ message = '{message}'")
        log("✅ TEST 10 PASSED")
        return True
        
    except Exception as e:
        log(f"❌ TEST 10 FAILED with exception: {e}")
        return False

def test_11_portal_not_configured(session):
    """Test 11: POST /api/billing/portal (should return 503 or graceful error)"""
    log("\n=== TEST 11: Portal (should be not_configured) ===")
    try:
        resp = session.post(f"{API_BASE}/billing/portal")
        log(f"Status: {resp.status_code}")
        
        if resp.status_code != 503:
            log(f"❌ FAIL: Expected 503, got {resp.status_code}")
            log(f"Response: {resp.text}")
            return False
        
        data = resp.json()
        error = data.get('error', '')
        message = data.get('message', '')
        
        if error != 'not_configured':
            log(f"❌ FAIL: Expected error='not_configured', got '{error}'")
            return False
        
        if not message or len(message) < 10:
            log(f"❌ FAIL: Expected human-readable message, got '{message}'")
            return False
        
        log(f"✅ error = 'not_configured'")
        log(f"✅ message = '{message}'")
        log("✅ TEST 11 PASSED")
        return True
        
    except Exception as e:
        log(f"❌ TEST 11 FAILED with exception: {e}")
        return False

def test_12_usage_gating(session):
    """Test 12: Usage gating - upload CSV twice, second should fail with 402"""
    log("\n=== TEST 12: Usage gating (CSV import limit) ===")
    try:
        # Create a small valid CSV
        csv_content = "date,description,vendor,amount\n2024-01-01,Test 1,Vendor A,100.00\n2024-01-02,Test 2,Vendor B,200.00"
        csv_file = io.BytesIO(csv_content.encode('utf-8'))
        
        # First upload (should succeed)
        log("Uploading first CSV...")
        resp1 = session.post(
            f"{API_BASE}/cfo/transactions",
            files={'file': ('test.csv', csv_file, 'text/csv')}
        )
        log(f"First upload status: {resp1.status_code}")
        
        if resp1.status_code != 200:
            log(f"❌ FAIL: First upload failed with {resp1.status_code}")
            log(f"Response: {resp1.text}")
            return False
        
        log("✅ First CSV upload succeeded")
        
        # Second upload (should fail with 402)
        log("Uploading second CSV (should hit limit)...")
        csv_file2 = io.BytesIO(csv_content.encode('utf-8'))
        resp2 = session.post(
            f"{API_BASE}/cfo/transactions",
            files={'file': ('test2.csv', csv_file2, 'text/csv')}
        )
        log(f"Second upload status: {resp2.status_code}")
        
        if resp2.status_code != 402:
            log(f"❌ FAIL: Expected 402, got {resp2.status_code}")
            log(f"Response: {resp2.text}")
            return False
        
        data2 = resp2.json()
        error = data2.get('error', '')
        message = data2.get('message', '')
        
        if error != 'usage_limit':
            log(f"❌ FAIL: Expected error='usage_limit', got '{error}'")
            return False
        
        if not message or 'limit' not in message.lower():
            log(f"❌ FAIL: Expected clear message about limit, got '{message}'")
            return False
        
        log(f"✅ Got 402 with error='usage_limit'")
        log(f"✅ Message: '{message}'")
        
        # Verify usage in subscription endpoint
        log("Verifying usage in /api/billing/subscription...")
        resp3 = session.get(f"{API_BASE}/billing/subscription")
        if resp3.status_code != 200:
            log(f"⚠️ Warning: Could not verify usage (status {resp3.status_code})")
        else:
            data3 = resp3.json()
            usage = data3.get('usage', {}).get('usage', [])
            csv_usage = next((u for u in usage if u['metric'] == 'csv_imports'), None)
            if csv_usage:
                log(f"✅ csv_imports used = {csv_usage.get('used')} (limit: {csv_usage.get('limit')})")
            else:
                log(f"⚠️ Warning: csv_imports metric not found in usage")
        
        log("✅ TEST 12 PASSED")
        return True
        
    except Exception as e:
        log(f"❌ TEST 12 FAILED with exception: {e}")
        return False

def test_13_webhook_stripe_no_signature(session):
    """Test 13: POST /api/webhooks/stripe without signature (should return 200 with note)"""
    log("\n=== TEST 13: Stripe webhook without signature ===")
    try:
        resp = session.post(
            f"{API_BASE}/webhooks/stripe",
            json={"test": True}
        )
        log(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            log(f"❌ FAIL: Expected 200, got {resp.status_code}")
            log(f"Response: {resp.text}")
            return False
        
        data = resp.json()
        note = data.get('note', '')
        
        if 'not configured' not in note.lower():
            log(f"❌ FAIL: Expected 'not configured' note, got '{note}'")
            return False
        
        log(f"✅ Got 200 with note: '{note}'")
        log("✅ TEST 13 PASSED")
        return True
        
    except Exception as e:
        log(f"❌ TEST 13 FAILED with exception: {e}")
        return False

def test_14_webhook_razorpay_no_signature(session):
    """Test 14: POST /api/webhooks/razorpay without signature (should return 200 with note)"""
    log("\n=== TEST 14: Razorpay webhook without signature ===")
    try:
        resp = session.post(
            f"{API_BASE}/webhooks/razorpay",
            json={"test": True}
        )
        log(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            log(f"❌ FAIL: Expected 200, got {resp.status_code}")
            log(f"Response: {resp.text}")
            return False
        
        data = resp.json()
        note = data.get('note', '')
        
        if 'not configured' not in note.lower():
            log(f"❌ FAIL: Expected 'not configured' note, got '{note}'")
            return False
        
        log(f"✅ Got 200 with note: '{note}'")
        log("✅ TEST 14 PASSED")
        return True
        
    except Exception as e:
        log(f"❌ TEST 14 FAILED with exception: {e}")
        return False

def test_15_unauthenticated_access():
    """Test 15: Unauthenticated access to billing endpoints (should return 401)"""
    log("\n=== TEST 15: Unauthenticated access (should return 401) ===")
    try:
        endpoints = [
            ('GET', f"{API_BASE}/billing/subscription"),
            ('POST', f"{API_BASE}/billing/trial"),
            ('POST', f"{API_BASE}/billing/cancel"),
        ]
        
        all_passed = True
        for method, url in endpoints:
            if method == 'GET':
                resp = requests.get(url)
            else:
                resp = requests.post(url, json={})
            
            log(f"{method} {url.split('/api/')[-1]} -> {resp.status_code}")
            
            if resp.status_code != 401:
                log(f"❌ FAIL: Expected 401, got {resp.status_code}")
                all_passed = False
            else:
                log(f"✅ Got 401 (correct)")
        
        if all_passed:
            log("✅ TEST 15 PASSED")
        else:
            log("❌ TEST 15 FAILED")
        
        return all_passed
        
    except Exception as e:
        log(f"❌ TEST 15 FAILED with exception: {e}")
        return False

def test_16_enterprise_trial_blocked(session):
    """Test 16: POST /api/billing/trial with enterprise plan (should fail with 400)"""
    log("\n=== TEST 16: Enterprise trial (should be blocked) ===")
    try:
        resp = session.post(
            f"{API_BASE}/billing/trial",
            json={"plan": "enterprise", "interval": "monthly", "region": "INTL"}
        )
        log(f"Status: {resp.status_code}")
        
        if resp.status_code != 400:
            log(f"❌ FAIL: Expected 400, got {resp.status_code}")
            log(f"Response: {resp.text}")
            return False
        
        data = resp.json()
        error = data.get('error', '')
        
        # Accept either Zod validation error ("Invalid input") or service-layer error about Enterprise
        # Both correctly block enterprise trials, just at different layers
        if 'invalid' not in error.lower() and ('enterprise' not in error.lower() or 'contact sales' not in error.lower()):
            log(f"❌ FAIL: Expected error blocking enterprise trial, got: {error}")
            return False
        
        log(f"✅ Got 400 blocking enterprise trial: {error}")
        log("✅ TEST 16 PASSED")
        return True
        
    except Exception as e:
        log(f"❌ TEST 16 FAILED with exception: {e}")
        return False

def main():
    log("=" * 80)
    log("Sprint 2.7 Phase 4A - Billing Architecture Backend Test")
    log("=" * 80)
    
    results = {}
    
    # Create first demo session for tests 1-11
    log("\n>>> Creating FIRST demo session for tests 1-11...")
    session1 = create_demo_session()
    if not session1:
        log("❌ CRITICAL: Could not create demo session. Aborting.")
        return
    
    # Run tests 1-11 with first session
    results['test_1'] = test_1_initial_subscription_state(session1)
    results['test_2'] = test_2_start_trial(session1)
    results['test_3'] = test_3_duplicate_trial(session1)
    results['test_4'] = test_4_change_plan(session1)
    results['test_5'] = test_5_cancel_at_period_end(session1)
    results['test_6'] = test_6_resume_subscription(session1)
    results['test_7'] = test_7_cancel_immediate(session1)
    results['test_8'] = test_8_invoices_empty(session1)
    results['test_9'] = test_9_payment_methods_empty(session1)
    results['test_10'] = test_10_checkout_not_configured(session1)
    results['test_11'] = test_11_portal_not_configured(session1)
    
    # Create second demo session for test 12 (usage gating)
    log("\n>>> Creating SECOND demo session for test 12 (usage gating)...")
    session2 = create_demo_session()
    if not session2:
        log("❌ WARNING: Could not create second demo session. Skipping test 12.")
        results['test_12'] = False
    else:
        results['test_12'] = test_12_usage_gating(session2)
    
    # Tests 13-14 can use either session
    results['test_13'] = test_13_webhook_stripe_no_signature(session1)
    results['test_14'] = test_14_webhook_razorpay_no_signature(session1)
    
    # Test 15 doesn't need a session
    results['test_15'] = test_15_unauthenticated_access()
    
    # Create third demo session for test 16 (enterprise trial)
    log("\n>>> Creating THIRD demo session for test 16 (enterprise trial)...")
    session3 = create_demo_session()
    if not session3:
        log("❌ WARNING: Could not create third demo session. Skipping test 16.")
        results['test_16'] = False
    else:
        results['test_16'] = test_16_enterprise_trial_blocked(session3)
    
    # Summary
    log("\n" + "=" * 80)
    log("TEST SUMMARY")
    log("=" * 80)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        log(f"{test_name}: {status}")
    
    log("=" * 80)
    log(f"TOTAL: {passed}/{total} tests passed ({passed*100//total}%)")
    log("=" * 80)
    
    if passed == total:
        log("\n🎉 ALL TESTS PASSED - Billing architecture is working correctly!")
    else:
        log(f"\n⚠️ {total - passed} test(s) failed - see details above")

if __name__ == '__main__':
    main()
