#!/usr/bin/env python3
"""
Backend test for Razorpay Standard Checkout integration (Sprint 2.7 Phase 4B)
Tests all 8 scenarios specified in the review request.
"""

import requests
import hmac
import hashlib
import json
import sys
import os

# Get base URL from environment
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://nexus-enterprise-ai-2.preview.emergentagent.com')
RAZORPAY_KEY_SECRET = 'kiLZfoAX1MFp1vjVJ90B3oRx'
RAZORPAY_KEY_ID = 'rzp_test_T9NJcBZijywoUJ'

def create_demo_session():
    """Create a demo session using NextAuth demo provider"""
    session = requests.Session()
    
    # Get CSRF token
    csrf_resp = session.get(f'{BASE_URL}/api/auth/csrf', timeout=30)
    if csrf_resp.status_code != 200:
        print(f"❌ Failed to get CSRF token: {csrf_resp.status_code}")
        return None
    
    csrf_token = csrf_resp.json().get('csrfToken')
    if not csrf_token:
        print("❌ No CSRF token in response")
        return None
    
    print(f"✅ Got CSRF token: {csrf_token[:20]}...")
    
    # Create demo session
    demo_resp = session.post(
        f'{BASE_URL}/api/auth/callback/demo',
        data={'csrfToken': csrf_token},
        allow_redirects=False,
        timeout=30
    )
    
    if demo_resp.status_code not in [200, 302, 307]:
        print(f"❌ Failed to create demo session: {demo_resp.status_code}")
        return None
    
    print(f"✅ Demo session created (status {demo_resp.status_code})")
    
    # Verify session
    session_resp = session.get(f'{BASE_URL}/api/auth/session', timeout=30)
    if session_resp.status_code != 200:
        print(f"❌ Failed to verify session: {session_resp.status_code}")
        return None
    
    session_data = session_resp.json()
    if not session_data.get('user'):
        print("❌ No user in session")
        return None
    
    print(f"✅ Session verified: user={session_data['user'].get('email', 'N/A')}, activeOrgId={session_data['user'].get('activeOrgId', 'N/A')[:8]}...")
    
    return session

def test_1_starter_monthly(session):
    """Test 1: POST /api/billing/razorpay/order with starter monthly"""
    print("\n" + "="*80)
    print("TEST 1: Create order for Starter Monthly")
    print("="*80)
    
    try:
        resp = session.post(
            f'{BASE_URL}/api/billing/razorpay/order',
            json={'plan': 'starter', 'interval': 'monthly'},
            timeout=30
        )
        
        print(f"Status: {resp.status_code}")
        data = resp.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return None
        
        # Verify response structure
        if 'orderId' not in data or not data['orderId'].startswith('order_'):
            print(f"❌ FAIL: orderId missing or invalid: {data.get('orderId')}")
            return None
        
        if data.get('amount') != 499900:
            print(f"❌ FAIL: Expected amount=499900 (₹4999), got {data.get('amount')}")
            return None
        
        if data.get('currency') != 'INR':
            print(f"❌ FAIL: Expected currency=INR, got {data.get('currency')}")
            return None
        
        if data.get('keyId') != RAZORPAY_KEY_ID:
            print(f"❌ FAIL: Expected keyId={RAZORPAY_KEY_ID}, got {data.get('keyId')}")
            return None
        
        print(f"✅ PASS: Order created successfully")
        print(f"   - orderId: {data['orderId']}")
        print(f"   - amount: {data['amount']} paise (₹{data['amount']/100})")
        print(f"   - currency: {data['currency']}")
        print(f"   - keyId: {data['keyId']}")
        
        return data['orderId']
        
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return None

def test_2_growth_yearly(session):
    """Test 2: POST /api/billing/razorpay/order with growth yearly"""
    print("\n" + "="*80)
    print("TEST 2: Create order for Growth Yearly")
    print("="*80)
    
    try:
        resp = session.post(
            f'{BASE_URL}/api/billing/razorpay/order',
            json={'plan': 'growth', 'interval': 'yearly'},
            timeout=30
        )
        
        print(f"Status: {resp.status_code}")
        data = resp.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return None
        
        # Expected: 14999 * 12 * 0.8 = 143990.4 rounded = 143990 INR = 14399000 paise
        expected_amount = 14399000
        if data.get('amount') != expected_amount:
            print(f"❌ FAIL: Expected amount={expected_amount} (₹143990), got {data.get('amount')}")
            return None
        
        if data.get('currency') != 'INR':
            print(f"❌ FAIL: Expected currency=INR, got {data.get('currency')}")
            return None
        
        print(f"✅ PASS: Order created successfully")
        print(f"   - orderId: {data['orderId']}")
        print(f"   - amount: {data['amount']} paise (₹{data['amount']/100})")
        print(f"   - currency: {data['currency']}")
        
        return data['orderId']
        
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return None

def test_3_enterprise_monthly(session):
    """Test 3: POST /api/billing/razorpay/order with enterprise monthly (should fail)"""
    print("\n" + "="*80)
    print("TEST 3: Create order for Enterprise Monthly (should fail)")
    print("="*80)
    
    try:
        resp = session.post(
            f'{BASE_URL}/api/billing/razorpay/order',
            json={'plan': 'enterprise', 'interval': 'monthly'},
            timeout=30
        )
        
        print(f"Status: {resp.status_code}")
        data = resp.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        if resp.status_code != 400:
            print(f"❌ FAIL: Expected 400, got {resp.status_code}")
            return False
        
        if 'error' not in data:
            print(f"❌ FAIL: Expected error message in response")
            return False
        
        print(f"✅ PASS: Enterprise plan correctly rejected with 400")
        print(f"   - Error: {data['error']}")
        
        return True
        
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_4_unauthenticated():
    """Test 4: Unauthenticated requests should return 401"""
    print("\n" + "="*80)
    print("TEST 4: Unauthenticated requests (should return 401)")
    print("="*80)
    
    unauth_session = requests.Session()
    
    # Test order endpoint
    print("\n4a. Testing POST /api/billing/razorpay/order without auth...")
    try:
        resp = unauth_session.post(
            f'{BASE_URL}/api/billing/razorpay/order',
            json={'plan': 'starter', 'interval': 'monthly'},
            timeout=30
        )
        
        print(f"Status: {resp.status_code}")
        if resp.status_code != 401:
            print(f"❌ FAIL: Expected 401, got {resp.status_code}")
            return False
        print(f"✅ PASS: Order endpoint returns 401 for unauthenticated request")
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False
    
    # Test verify endpoint
    print("\n4b. Testing POST /api/billing/razorpay/verify without auth...")
    try:
        resp = unauth_session.post(
            f'{BASE_URL}/api/billing/razorpay/verify',
            json={
                'razorpay_payment_id': 'pay_test123',
                'razorpay_order_id': 'order_test123',
                'razorpay_signature': 'fake_signature'
            },
            timeout=30
        )
        
        print(f"Status: {resp.status_code}")
        if resp.status_code != 401:
            print(f"❌ FAIL: Expected 401, got {resp.status_code}")
            return False
        print(f"✅ PASS: Verify endpoint returns 401 for unauthenticated request")
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False
    
    print(f"\n✅ PASS: Both endpoints correctly reject unauthenticated requests")
    return True

def test_5_wrong_signature(session, order_id):
    """Test 5: Wrong signature should return 400 and not activate subscription"""
    print("\n" + "="*80)
    print("TEST 5: Wrong signature verification (should fail)")
    print("="*80)
    
    if not order_id:
        print("❌ SKIP: No order_id from previous test")
        return False
    
    try:
        # Try to verify with wrong signature
        resp = session.post(
            f'{BASE_URL}/api/billing/razorpay/verify',
            json={
                'razorpay_payment_id': 'pay_fake123',
                'razorpay_order_id': order_id,
                'razorpay_signature': '0000000000deadbeef'
            },
            timeout=30
        )
        
        print(f"Status: {resp.status_code}")
        data = resp.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        if resp.status_code != 400:
            print(f"❌ FAIL: Expected 400, got {resp.status_code}")
            return False
        
        if data.get('verified') != False:
            print(f"❌ FAIL: Expected verified=false, got {data.get('verified')}")
            return False
        
        print(f"✅ PASS: Wrong signature correctly rejected with 400")
        print(f"   - Error: {data.get('error')}")
        
        # Verify subscription is still null/unaffected
        print("\nVerifying subscription is still null/unaffected...")
        sub_resp = session.get(f'{BASE_URL}/api/billing/subscription', timeout=30)
        if sub_resp.status_code != 200:
            print(f"❌ FAIL: Failed to get subscription: {sub_resp.status_code}")
            return False
        
        sub_data = sub_resp.json()
        subscription = sub_data.get('subscription')
        
        # Subscription should be null or not active
        if subscription and subscription.get('status') == 'active' and subscription.get('provider') == 'razorpay':
            print(f"❌ FAIL: Subscription was activated despite wrong signature!")
            print(f"   - Subscription: {json.dumps(subscription, indent=2)}")
            return False
        
        print(f"✅ PASS: Subscription is still null/unaffected (status={subscription.get('status') if subscription else 'null'})")
        
        return True
        
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_6_correct_signature(session, order_id):
    """Test 6: Correct signature should activate subscription and create invoice"""
    print("\n" + "="*80)
    print("TEST 6: Correct signature verification (should succeed)")
    print("="*80)
    
    if not order_id:
        print("❌ SKIP: No order_id from previous test")
        return False
    
    try:
        # Compute correct signature
        payment_id = 'pay_test_12345'
        message = f"{order_id}|{payment_id}"
        signature = hmac.new(
            RAZORPAY_KEY_SECRET.encode(),
            message.encode(),
            hashlib.sha256
        ).hexdigest()
        
        print(f"Computing signature for: {message}")
        print(f"Signature: {signature}")
        
        # Verify with correct signature
        resp = session.post(
            f'{BASE_URL}/api/billing/razorpay/verify',
            json={
                'razorpay_payment_id': payment_id,
                'razorpay_order_id': order_id,
                'razorpay_signature': signature
            },
            timeout=30
        )
        
        print(f"Status: {resp.status_code}")
        data = resp.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            print(f"   - Error: {data.get('error')}")
            return False
        
        if data.get('verified') != True:
            print(f"❌ FAIL: Expected verified=true, got {data.get('verified')}")
            return False
        
        if data.get('plan') != 'starter':
            print(f"❌ FAIL: Expected plan=starter, got {data.get('plan')}")
            return False
        
        if data.get('interval') != 'monthly':
            print(f"❌ FAIL: Expected interval=monthly, got {data.get('interval')}")
            return False
        
        print(f"✅ PASS: Payment verified successfully")
        print(f"   - verified: {data['verified']}")
        print(f"   - plan: {data['plan']}")
        print(f"   - interval: {data['interval']}")
        
        # Verify subscription is now active
        print("\nVerifying subscription is now active...")
        sub_resp = session.get(f'{BASE_URL}/api/billing/subscription', timeout=30)
        if sub_resp.status_code != 200:
            print(f"❌ FAIL: Failed to get subscription: {sub_resp.status_code}")
            return False
        
        sub_data = sub_resp.json()
        subscription = sub_data.get('subscription')
        
        if not subscription:
            print(f"❌ FAIL: No subscription found")
            return False
        
        if subscription.get('status') != 'active':
            print(f"❌ FAIL: Expected status=active, got {subscription.get('status')}")
            return False
        
        if subscription.get('provider') != 'razorpay':
            print(f"❌ FAIL: Expected provider=razorpay, got {subscription.get('provider')}")
            return False
        
        if subscription.get('plan') != 'starter':
            print(f"❌ FAIL: Expected plan=starter, got {subscription.get('plan')}")
            return False
        
        print(f"✅ PASS: Subscription is now active")
        print(f"   - status: {subscription['status']}")
        print(f"   - provider: {subscription['provider']}")
        print(f"   - plan: {subscription['plan']}")
        print(f"   - interval: {subscription.get('interval')}")
        
        # Verify invoice was created
        print("\nVerifying invoice was created...")
        inv_resp = session.get(f'{BASE_URL}/api/billing/invoices', timeout=30)
        if inv_resp.status_code != 200:
            print(f"❌ FAIL: Failed to get invoices: {inv_resp.status_code}")
            return False
        
        inv_data = inv_resp.json()
        invoices = inv_data.get('invoices', [])
        
        if not invoices:
            print(f"❌ FAIL: No invoices found")
            return False
        
        # Find the invoice for this payment
        invoice = None
        for inv in invoices:
            if inv.get('provider') == 'razorpay' and inv.get('status') == 'paid':
                invoice = inv
                break
        
        if not invoice:
            print(f"❌ FAIL: No paid Razorpay invoice found")
            print(f"   - Invoices: {json.dumps(invoices, indent=2)}")
            return False
        
        # Verify invoice amount (should be 4999 rupees for starter monthly)
        expected_amount = 4999
        if invoice.get('amount') != expected_amount:
            print(f"❌ FAIL: Expected invoice amount={expected_amount}, got {invoice.get('amount')}")
            return False
        
        print(f"✅ PASS: Invoice created successfully")
        print(f"   - status: {invoice['status']}")
        print(f"   - provider: {invoice['provider']}")
        print(f"   - amount: ₹{invoice['amount']}")
        print(f"   - currency: {invoice.get('currency')}")
        
        return True
        
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_7_missing_fields(session):
    """Test 7: Missing fields should return 400"""
    print("\n" + "="*80)
    print("TEST 7: Missing fields in verify (should return 400)")
    print("="*80)
    
    try:
        resp = session.post(
            f'{BASE_URL}/api/billing/razorpay/verify',
            json={},
            timeout=30
        )
        
        print(f"Status: {resp.status_code}")
        data = resp.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        if resp.status_code != 400:
            print(f"❌ FAIL: Expected 400, got {resp.status_code}")
            return False
        
        if 'error' not in data:
            print(f"❌ FAIL: Expected error message in response")
            return False
        
        print(f"✅ PASS: Missing fields correctly rejected with 400")
        print(f"   - Error: {data['error']}")
        
        return True
        
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_8_cross_org_safety():
    """Test 8: Cross-org safety - order from one org should not be verifiable by another"""
    print("\n" + "="*80)
    print("TEST 8: Cross-org safety (should reject)")
    print("="*80)
    
    # Create first session (session A)
    print("\nCreating session A...")
    session_a = create_demo_session()
    if not session_a:
        print("❌ FAIL: Could not create session A")
        return False
    
    # Create order with session A
    print("\nCreating order with session A...")
    try:
        resp_a = session_a.post(
            f'{BASE_URL}/api/billing/razorpay/order',
            json={'plan': 'starter', 'interval': 'monthly'},
            timeout=30
        )
        
        if resp_a.status_code != 200:
            print(f"❌ FAIL: Failed to create order with session A: {resp_a.status_code}")
            return False
        
        order_id_a = resp_a.json().get('orderId')
        print(f"✅ Order created with session A: {order_id_a}")
        
    except Exception as e:
        print(f"❌ FAIL: Exception creating order: {e}")
        return False
    
    # Create second session (session B)
    print("\nCreating session B (different org)...")
    session_b = create_demo_session()
    if not session_b:
        print("❌ FAIL: Could not create session B")
        return False
    
    # Try to verify session A's order with session B
    print("\nTrying to verify session A's order with session B...")
    try:
        payment_id = 'pay_test_crossorg'
        message = f"{order_id_a}|{payment_id}"
        signature = hmac.new(
            RAZORPAY_KEY_SECRET.encode(),
            message.encode(),
            hashlib.sha256
        ).hexdigest()
        
        print(f"Using valid signature for order: {order_id_a}")
        
        resp_b = session_b.post(
            f'{BASE_URL}/api/billing/razorpay/verify',
            json={
                'razorpay_payment_id': payment_id,
                'razorpay_order_id': order_id_a,
                'razorpay_signature': signature
            },
            timeout=30
        )
        
        print(f"Status: {resp_b.status_code}")
        data = resp_b.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        if resp_b.status_code != 400:
            print(f"❌ FAIL: Expected 400, got {resp_b.status_code}")
            return False
        
        if 'error' not in data or 'organization' not in data['error'].lower():
            print(f"❌ FAIL: Expected error about organization mismatch")
            return False
        
        print(f"✅ PASS: Cross-org verification correctly rejected with 400")
        print(f"   - Error: {data['error']}")
        
        return True
        
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    print("="*80)
    print("RAZORPAY STANDARD CHECKOUT INTEGRATION TEST")
    print("Sprint 2.7 Phase 4B")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Razorpay Key ID: {RAZORPAY_KEY_ID}")
    print("="*80)
    
    results = {}
    
    # Test 4 first (doesn't need session)
    results['test_4_unauthenticated'] = test_4_unauthenticated()
    
    # Create demo session for tests 1-7
    print("\n" + "="*80)
    print("Creating demo session for tests 1-7...")
    print("="*80)
    session = create_demo_session()
    if not session:
        print("❌ FATAL: Could not create demo session")
        sys.exit(1)
    
    # Run tests 1-3
    order_id_starter = test_1_starter_monthly(session)
    results['test_1_starter_monthly'] = order_id_starter is not None
    
    order_id_growth = test_2_growth_yearly(session)
    results['test_2_growth_yearly'] = order_id_growth is not None
    
    results['test_3_enterprise_monthly'] = test_3_enterprise_monthly(session)
    
    # Test 5 and 6 use the order from test 1
    results['test_5_wrong_signature'] = test_5_wrong_signature(session, order_id_starter)
    results['test_6_correct_signature'] = test_6_correct_signature(session, order_id_starter)
    
    # Test 7
    results['test_7_missing_fields'] = test_7_missing_fields(session)
    
    # Test 8 (creates its own sessions)
    results['test_8_cross_org_safety'] = test_8_cross_org_safety()
    
    # Print summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = 0
    failed = 0
    
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {test_name}")
        if result:
            passed += 1
        else:
            failed += 1
    
    print("="*80)
    print(f"Total: {passed + failed} tests")
    print(f"Passed: {passed}")
    print(f"Failed: {failed}")
    print(f"Success Rate: {passed / (passed + failed) * 100:.1f}%")
    print("="*80)
    
    if failed > 0:
        sys.exit(1)
    else:
        print("\n🎉 ALL TESTS PASSED!")
        sys.exit(0)

if __name__ == '__main__':
    main()
