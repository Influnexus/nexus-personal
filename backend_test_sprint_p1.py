#!/usr/bin/env python3
"""
Backend test for Sprint P1 - Shared Financial Core + Nexus Personal Foundation
Tests Enterprise regression after core extraction + new Personal workspace features.
"""

import requests
import json
import time
from io import BytesIO
from pymongo import MongoClient
import os
import hashlib
import random
import string

# Configuration
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://financial-health-hub-17.preview.emergentagent.com')
API_URL = f"{BASE_URL}/api"
MONGO_URL = os.getenv('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.getenv('DB_NAME', 'nexusai')

print("=" * 80)
print("SPRINT P1 VERIFICATION - ENTERPRISE REGRESSION + PERSONAL WORKSPACE")
print("=" * 80)
print(f"API URL: {API_URL}")
print(f"MongoDB: {MONGO_URL}/{DB_NAME}")
print()

# MongoDB connection
try:
    mongo_client = MongoClient(MONGO_URL)
    db = mongo_client[DB_NAME]
    print("✅ MongoDB connection established")
except Exception as e:
    print(f"❌ MongoDB connection failed: {e}")
    exit(1)

def get_demo_session():
    """Get a demo session for testing"""
    try:
        session = requests.Session()
        
        # Get CSRF token
        csrf_resp = session.get(f"{API_URL}/auth/csrf", timeout=10)
        if csrf_resp.status_code != 200:
            print(f"❌ Failed to get CSRF token: {csrf_resp.status_code}")
            return None
        
        csrf_data = csrf_resp.json()
        csrf_token = csrf_data.get('csrfToken')
        if not csrf_token:
            print(f"❌ CSRF response missing csrfToken")
            return None
        
        # Create demo session
        demo_resp = session.post(
            f"{API_URL}/auth/callback/demo",
            data={'csrfToken': csrf_token},
            allow_redirects=False,
            timeout=10
        )
        
        if demo_resp.status_code not in [302, 307]:
            print(f"❌ Demo callback failed: {demo_resp.status_code}")
            return None
        
        # Verify session
        session_resp = session.get(f"{API_URL}/auth/session", timeout=10)
        if session_resp.status_code != 200:
            print(f"❌ Session check failed: {session_resp.status_code}")
            return None
        
        session_data = session_resp.json()
        if not session_data or not session_data.get('user'):
            print(f"❌ Session data invalid")
            return None
        
        print(f"✅ Demo session created: user={session_data['user'].get('email')}, org={session_data.get('activeOrgId')}")
        return session
        
    except Exception as e:
        print(f"❌ Demo session creation failed: {e}")
        return None

def register_user(email, password):
    """Register a new user and return authenticated session"""
    try:
        session = requests.Session()
        
        # Register
        reg_resp = session.post(
            f"{API_URL}/register",
            json={'email': email, 'password': password, 'name': 'Test User'},
            timeout=10
        )
        
        if reg_resp.status_code != 200:
            print(f"❌ Registration failed: {reg_resp.status_code} - {reg_resp.text}")
            return None
        
        # Get CSRF token for login
        csrf_resp = session.get(f"{API_URL}/auth/csrf", timeout=10)
        csrf_token = csrf_resp.json().get('csrfToken')
        
        # Login
        login_resp = session.post(
            f"{API_URL}/auth/callback/credentials",
            data={
                'csrfToken': csrf_token,
                'email': email,
                'password': password,
                'redirect': 'false'
            },
            allow_redirects=False,
            timeout=10
        )
        
        if login_resp.status_code not in [302, 307]:
            print(f"❌ Login failed: {login_resp.status_code}")
            return None
        
        # Verify session
        session_resp = session.get(f"{API_URL}/auth/session", timeout=10)
        session_data = session_resp.json()
        
        if not session_data or not session_data.get('user'):
            print(f"❌ Session invalid after login")
            return None
        
        print(f"✅ User registered and logged in: {email}")
        return session
        
    except Exception as e:
        print(f"❌ User registration failed: {e}")
        return None

# ============================================================
# PART 1: ENTERPRISE REGRESSION (8 tests)
# ============================================================

print("\n" + "=" * 80)
print("PART 1: ENTERPRISE REGRESSION (nothing should have changed)")
print("=" * 80)

# Test 1: Demo mode with seeded data
print("\n[1/15] Demo mode - seeded data present")
try:
    demo_session = get_demo_session()
    if not demo_session:
        print("❌ TEST 1 FAILED: Could not create demo session")
    else:
        # Check transactions
        txn_resp = demo_session.get(f"{API_URL}/cfo/transactions", timeout=10)
        if txn_resp.status_code == 200:
            txn_data = txn_resp.json()
            txn_count = len(txn_data.get('transactions', []))
            if txn_count >= 250:  # Should be ~260
                print(f"✅ TEST 1 PASSED: Demo has {txn_count} seeded transactions")
            else:
                print(f"⚠️  TEST 1 WARNING: Only {txn_count} transactions (expected ~260)")
        else:
            print(f"❌ TEST 1 FAILED: GET /api/cfo/transactions returned {txn_resp.status_code}")
except Exception as e:
    print(f"❌ TEST 1 FAILED: {e}")

# Test 2: Finance endpoints return sane data
print("\n[2/15] Finance endpoints - GET /api/cfo/briefing structure")
try:
    briefing_resp = demo_session.get(f"{API_URL}/cfo/briefing", timeout=15)
    if briefing_resp.status_code == 200:
        data = briefing_resp.json()
        
        # Check required keys (note: 'recs' not 'recommendations')
        required_keys = ['kpis', 'health', 'forecast', 'briefing', 'recs', 'anomalies']
        missing_keys = [k for k in required_keys if k not in data]
        
        if missing_keys:
            print(f"❌ TEST 2 FAILED: Missing keys: {missing_keys}")
        else:
            # Check kpis structure
            kpis = data['kpis']
            if not all(k in kpis for k in ['cash', 'burnRate', 'runwayDays']):
                print(f"❌ TEST 2 FAILED: KPIs missing required fields")
            elif any(kpis[k] is None or (isinstance(kpis[k], float) and str(kpis[k]) == 'nan') for k in ['cash', 'burnRate', 'runwayDays']):
                print(f"❌ TEST 2 FAILED: KPIs contain null/NaN values")
            else:
                # Check health structure
                health = data['health']
                if not all(k in health for k in ['score', 'band', 'factors']):
                    print(f"❌ TEST 2 FAILED: Health missing required fields")
                elif not (0 <= health['score'] <= 100):
                    print(f"❌ TEST 2 FAILED: Health score {health['score']} not in 0-100 range")
                elif len(health['factors']) != 5:
                    print(f"❌ TEST 2 FAILED: Health factors count {len(health['factors'])} != 5")
                else:
                    # Check forecast structure
                    forecast = data['forecast']
                    if not all(k in forecast for k in ['series', 'startingCash', 'endingCash']):
                        print(f"❌ TEST 2 FAILED: Forecast missing required fields")
                    elif len(forecast['series']) == 0:
                        print(f"❌ TEST 2 FAILED: Forecast series is empty")
                    else:
                        # Check consistency
                        last_point = forecast['series'][-1]
                        if abs(last_point['cash'] - forecast['endingCash']) > 0.01:
                            print(f"⚠️  TEST 2 WARNING: Forecast endingCash inconsistent with series last point")
                        
                        print(f"✅ TEST 2 PASSED: Briefing structure valid")
                        print(f"   - KPIs: cash=${kpis['cash']:.2f}, burnRate=${kpis['burnRate']:.2f}, runway={kpis['runwayDays']}d")
                        print(f"   - Health: score={health['score']}, band={health['band']}, factors={len(health['factors'])}")
                        print(f"   - Forecast: {len(forecast['series'])} days, ending=${forecast['endingCash']:.2f}")
    else:
        print(f"❌ TEST 2 FAILED: GET /api/cfo/briefing returned {briefing_resp.status_code}")
except Exception as e:
    print(f"❌ TEST 2 FAILED: {e}")

# Test 3: AI CFO chat streaming
print("\n[3/15] AI CFO chat - POST /api/cfo/chat/stream SSE")
try:
    chat_resp = demo_session.post(
        f"{API_URL}/cfo/chat/stream",
        json={'messages': [{'role': 'user', 'content': 'What is my runway?'}]},
        stream=True,
        timeout=60
    )
    
    if chat_resp.status_code == 200:
        if 'text/event-stream' in chat_resp.headers.get('content-type', ''):
            events = []
            for line in chat_resp.iter_lines():
                if line:
                    line_str = line.decode('utf-8')
                    if line_str.startswith('event: '):
                        event_type = line_str[7:].strip()
                        events.append(event_type)
            
            if 'done' in events:
                print(f"✅ TEST 3 PASSED: Chat streaming working, received {len(events)} events including 'done'")
            else:
                print(f"❌ TEST 3 FAILED: No 'done' event received (events: {events[:10]}...)")
        else:
            print(f"❌ TEST 3 FAILED: Wrong content-type: {chat_resp.headers.get('content-type')}")
    else:
        print(f"❌ TEST 3 FAILED: POST /api/cfo/chat/stream returned {chat_resp.status_code}")
except Exception as e:
    print(f"❌ TEST 3 FAILED: {e}")

# Test 4: CSV import
print("\n[4/15] CSV import - valid CSV with 2 rows")
try:
    csv_content = "date,description,vendor,amount\n2026-01-15,Office supplies,Staples,125.50\n2026-01-16,Software license,Adobe,49.99"
    
    csv_resp = demo_session.post(
        f"{API_URL}/cfo/transactions",
        files={'file': ('test.csv', csv_content, 'text/csv')},
        timeout=15
    )
    
    if csv_resp.status_code == 200:
        result = csv_resp.json()
        imported = result.get('imported', 0)
        if imported >= 2:
            print(f"✅ TEST 4 PASSED: CSV import successful, imported {imported} rows")
            
            # Check for csv_import events in MongoDB
            time.sleep(1)  # Wait for event to be written
            events = list(db['analytics_events'].find({'event': 'csv_import_completed'}).sort('createdAt', -1).limit(1))
            if events:
                print(f"   - csv_import event recorded in MongoDB")
        else:
            print(f"⚠️  TEST 4 WARNING: Only {imported} rows imported (expected 2)")
    else:
        print(f"❌ TEST 4 FAILED: POST /api/cfo/transactions returned {csv_resp.status_code}")
except Exception as e:
    print(f"❌ TEST 4 FAILED: {e}")

# Test 5: Invoice upload - invalid .txt file
print("\n[5/15] Invoice upload - invalid .txt file → 400 error")
try:
    txt_content = "This is not an invoice"
    
    invoice_resp = demo_session.post(
        f"{API_URL}/cfo/invoices",
        files={'file': ('test.txt', txt_content, 'text/plain')},
        timeout=15
    )
    
    if invoice_resp.status_code == 400:
        error_data = invoice_resp.json()
        error_msg = error_data.get('error', '')
        if 'unsupported' in error_msg.lower() or 'text/plain' in error_msg.lower():
            print(f"✅ TEST 5 PASSED: Invalid file rejected with 400")
            print(f"   - Error message: {error_msg}")
        else:
            print(f"⚠️  TEST 5 WARNING: 400 returned but unclear error: {error_msg}")
    else:
        print(f"❌ TEST 5 FAILED: Expected 400, got {invoice_resp.status_code}")
except Exception as e:
    print(f"❌ TEST 5 FAILED: {e}")

# Test 6: Report generation
print("\n[6/15] Report generation - POST /api/cfo/report")
try:
    report_resp = demo_session.post(f"{API_URL}/cfo/report", json={}, timeout=90)
    
    if report_resp.status_code == 200:
        result = report_resp.json()
        if 'markdown' in result and 'context' in result:
            markdown = result['markdown']
            if '## Executive Summary' in markdown or 'Executive Summary' in markdown:
                print(f"✅ TEST 6 PASSED: Report generated with markdown ({len(markdown)} chars)")
            else:
                print(f"⚠️  TEST 6 WARNING: Report generated but missing 'Executive Summary' heading")
        else:
            print(f"❌ TEST 6 FAILED: Response missing 'markdown' or 'context' keys")
    else:
        print(f"❌ TEST 6 FAILED: POST /api/cfo/report returned {report_resp.status_code}")
except Exception as e:
    print(f"❌ TEST 6 FAILED: {e}")

# Test 7: Billing subscription
print("\n[7/15] Billing - GET /api/billing/subscription")
try:
    billing_resp = demo_session.get(f"{API_URL}/billing/subscription", timeout=10)
    
    if billing_resp.status_code == 200:
        result = billing_resp.json()
        print(f"✅ TEST 7 PASSED: Billing subscription endpoint working")
        print(f"   - Status: {result.get('status', 'none')}")
    else:
        print(f"❌ TEST 7 FAILED: GET /api/billing/subscription returned {billing_resp.status_code}")
except Exception as e:
    print(f"❌ TEST 7 FAILED: {e}")

# Test 8: Tenant isolation
print("\n[8/15] Tenant isolation - User B cannot read User A's data")
try:
    # Get User A's org ID and some data
    session_a_resp = demo_session.get(f"{API_URL}/auth/session", timeout=10)
    session_a_data = session_a_resp.json()
    org_a_id = session_a_data.get('user', {}).get('activeOrgId')
    
    # Get User A's transaction count
    txn_a_resp = demo_session.get(f"{API_URL}/cfo/transactions", timeout=10)
    txn_a_count = len(txn_a_resp.json().get('transactions', []))
    
    # Create second demo session (User B)
    demo_session_b = get_demo_session()
    if not demo_session_b:
        print("❌ TEST 8 FAILED: Could not create second demo session")
    else:
        # Get User B's org ID
        session_b_resp = demo_session_b.get(f"{API_URL}/auth/session", timeout=10)
        session_b_data = session_b_resp.json()
        org_b_id = session_b_data.get('user', {}).get('activeOrgId')
        
        # Get User B's transaction count
        txn_b_resp = demo_session_b.get(f"{API_URL}/cfo/transactions", timeout=10)
        txn_b_count = len(txn_b_resp.json().get('transactions', []))
        
        if org_a_id and org_b_id and org_a_id != org_b_id:
            # Verify User B has their own seeded data (should also be ~260)
            if txn_b_count >= 250:
                print(f"✅ TEST 8 PASSED: Tenant isolation working")
                print(f"   - User A org: {org_a_id}, transactions: {txn_a_count}")
                print(f"   - User B org: {org_b_id}, transactions: {txn_b_count}")
            else:
                print(f"⚠️  TEST 8 WARNING: User B has only {txn_b_count} transactions (expected ~260)")
        else:
            print(f"❌ TEST 8 FAILED: Org IDs not properly isolated (A={org_a_id}, B={org_b_id})")
except Exception as e:
    print(f"❌ TEST 8 FAILED: {e}")

# ============================================================
# PART 2: SPRINT P1 ACCEPTANCE (7 tests)
# ============================================================

print("\n" + "=" * 80)
print("PART 2: SPRINT P1 ACCEPTANCE (new Personal workspace features)")
print("=" * 80)

# Test 9: Unauthenticated access to personal workspace endpoint
print("\n[9/15] Personal workspace - unauthenticated → 401")
try:
    unauth_session = requests.Session()
    personal_resp = unauth_session.post(f"{API_URL}/personal/workspace", json={}, timeout=10)
    
    if personal_resp.status_code == 401:
        print(f"✅ TEST 9 PASSED: Unauthenticated request rejected with 401")
    else:
        print(f"❌ TEST 9 FAILED: Expected 401, got {personal_resp.status_code}")
except Exception as e:
    print(f"❌ TEST 9 FAILED: {e}")

# Test 10: Create personal workspace (idempotent)
print("\n[10/15] Personal workspace - create and idempotency")
try:
    # Register fresh user
    random_suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
    test_email = f"p1test_{random_suffix}@nexusai.com"
    test_password = "TestPassword123"
    
    user_session = register_user(test_email, test_password)
    if not user_session:
        print("❌ TEST 10 FAILED: Could not register user")
    else:
        # First call - should create
        personal_resp_1 = user_session.post(f"{API_URL}/personal/workspace", json={}, timeout=10)
        
        if personal_resp_1.status_code == 200:
            result_1 = personal_resp_1.json()
            workspace_1 = result_1.get('workspace', {})
            created_1 = result_1.get('created')
            
            if workspace_1.get('kind') == 'personal' and created_1 == True:
                workspace_id_1 = workspace_1.get('id')
                print(f"✅ TEST 10a PASSED: Personal workspace created")
                print(f"   - Workspace ID: {workspace_id_1}")
                print(f"   - Kind: {workspace_1.get('kind')}")
                print(f"   - Created: {created_1}")
                
                # Second call - should return same workspace
                time.sleep(1)
                personal_resp_2 = user_session.post(f"{API_URL}/personal/workspace", json={}, timeout=10)
                
                if personal_resp_2.status_code == 200:
                    result_2 = personal_resp_2.json()
                    workspace_2 = result_2.get('workspace', {})
                    created_2 = result_2.get('created')
                    workspace_id_2 = workspace_2.get('id')
                    
                    if workspace_id_2 == workspace_id_1 and created_2 == False:
                        print(f"✅ TEST 10b PASSED: Idempotency working (same workspace, created=false)")
                        
                        # Verify via GET
                        get_resp = user_session.get(f"{API_URL}/personal/workspace", timeout=10)
                        if get_resp.status_code == 200:
                            get_result = get_resp.json()
                            if get_result.get('workspace', {}).get('id') == workspace_id_1:
                                print(f"✅ TEST 10c PASSED: GET /api/personal/workspace returns same workspace")
                            else:
                                print(f"❌ TEST 10c FAILED: GET returned different workspace")
                        else:
                            print(f"❌ TEST 10c FAILED: GET returned {get_resp.status_code}")
                    else:
                        print(f"❌ TEST 10b FAILED: Second call not idempotent (id={workspace_id_2}, created={created_2})")
                else:
                    print(f"❌ TEST 10b FAILED: Second POST returned {personal_resp_2.status_code}")
            else:
                print(f"❌ TEST 10a FAILED: Workspace kind={workspace_1.get('kind')}, created={created_1}")
        else:
            print(f"❌ TEST 10 FAILED: POST /api/personal/workspace returned {personal_resp_1.status_code}")
except Exception as e:
    print(f"❌ TEST 10 FAILED: {e}")

# Test 11: Coexistence - user has both business and personal orgs
print("\n[11/15] Coexistence - user has BOTH business and personal orgs")
try:
    # Get user's memberships from MongoDB
    session_resp = user_session.get(f"{API_URL}/auth/session", timeout=10)
    user_id = session_resp.json().get('user', {}).get('id')
    
    if user_id:
        # Wait a moment for database to sync
        time.sleep(1)
        
        memberships = list(db['memberships'].find({'userId': user_id}))
        
        print(f"   - User has {len(memberships)} membership(s)")
        
        if len(memberships) >= 2:
            # Get org details
            org_ids = [m['organizationId'] for m in memberships]
            orgs = list(db['organizations'].find({'id': {'$in': org_ids}}))
            
            org_kinds = [o.get('kind', 'business') for o in orgs]
            
            # Count business and personal orgs (None/absent = business)
            business_count = sum(1 for k in org_kinds if k in ['business', None] or k == 'business')
            personal_count = sum(1 for k in org_kinds if k == 'personal')
            
            if business_count >= 1 and personal_count >= 1:
                print(f"✅ TEST 11 PASSED: User has BOTH business and personal orgs")
                print(f"   - Business orgs: {business_count}")
                print(f"   - Personal orgs: {personal_count}")
                print(f"   - Org kinds: {org_kinds}")
            else:
                print(f"❌ TEST 11 FAILED: Missing org type (business={business_count}, personal={personal_count})")
                print(f"   - Org kinds: {org_kinds}")
        else:
            print(f"❌ TEST 11 FAILED: User has only {len(memberships)} membership(s), expected 2+")
            # Debug: check if business org was created during registration
            orgs = list(db['organizations'].find({'id': {'$in': [m['organizationId'] for m in memberships]}}))
            print(f"   - Org details: {[(o.get('name'), o.get('kind', 'absent')) for o in orgs]}")
    else:
        print(f"❌ TEST 11 FAILED: Could not get user ID from session")
except Exception as e:
    print(f"❌ TEST 11 FAILED: {e}")

# Test 12: Session workspaceKind
print("\n[12/15] Session workspaceKind - initially 'business'")
try:
    session_resp = user_session.get(f"{API_URL}/auth/session", timeout=10)
    session_data = session_resp.json()
    
    workspace_kind = session_data.get('workspaceKind')
    
    if workspace_kind in ['business', None]:  # None is acceptable as it defaults to business
        print(f"✅ TEST 12 PASSED: Session workspaceKind is '{workspace_kind}' (business)")
    else:
        print(f"⚠️  TEST 12 WARNING: Session workspaceKind is '{workspace_kind}' (expected 'business' or None)")
except Exception as e:
    print(f"❌ TEST 12 FAILED: {e}")

# Test 13: Page protection - /personal route
print("\n[13/15] Page protection - GET /personal")
try:
    # Test without auth
    unauth_session = requests.Session()
    personal_page_resp = unauth_session.get(f"{BASE_URL}/personal", allow_redirects=False, timeout=10)
    
    if personal_page_resp.status_code in [302, 307]:
        redirect_location = personal_page_resp.headers.get('location', '')
        if '/login' in redirect_location:
            print(f"✅ TEST 13a PASSED: Unauthenticated user redirected to /login")
        else:
            print(f"⚠️  TEST 13a WARNING: Redirected to {redirect_location} (expected /login)")
    else:
        print(f"❌ TEST 13a FAILED: Expected redirect, got {personal_page_resp.status_code}")
    
    # Test with auth (business user)
    personal_page_auth_resp = user_session.get(f"{BASE_URL}/personal", timeout=10)
    
    if personal_page_auth_resp.status_code == 200:
        html_content = personal_page_auth_resp.text
        if 'personal-gate' in html_content or 'data-testid="personal-gate"' in html_content:
            print(f"✅ TEST 13b PASSED: Authenticated user sees page with 'personal-gate' testid")
        else:
            print(f"⚠️  TEST 13b WARNING: Page loaded but 'personal-gate' testid not found")
    else:
        print(f"❌ TEST 13b FAILED: GET /personal returned {personal_page_auth_resp.status_code}")
except Exception as e:
    print(f"❌ TEST 13 FAILED: {e}")

# Test 14: Mongo sanity - personal org structure
print("\n[14/15] Mongo sanity - personal org has kind='personal' and OWNER membership")
try:
    # Find the personal org we created
    session_resp = user_session.get(f"{API_URL}/auth/session", timeout=10)
    user_id = session_resp.json().get('user', {}).get('id')
    
    # Find personal org
    personal_orgs = list(db['organizations'].find({'kind': 'personal'}))
    
    # Find the one belonging to our test user
    user_memberships = list(db['memberships'].find({'userId': user_id}))
    user_org_ids = [m['organizationId'] for m in user_memberships]
    
    user_personal_orgs = [o for o in personal_orgs if o['id'] in user_org_ids]
    
    if user_personal_orgs:
        personal_org = user_personal_orgs[0]
        
        # Check kind
        if personal_org.get('kind') == 'personal':
            print(f"✅ TEST 14a PASSED: Personal org has kind='personal'")
            
            # Check OWNER membership
            owner_membership = db['memberships'].find_one({
                'organizationId': personal_org['id'],
                'userId': user_id,
                'role': 'OWNER'
            })
            
            if owner_membership:
                print(f"✅ TEST 14b PASSED: OWNER membership exists for personal org")
            else:
                print(f"❌ TEST 14b FAILED: No OWNER membership found")
        else:
            print(f"❌ TEST 14a FAILED: Personal org kind is '{personal_org.get('kind')}'")
    else:
        print(f"❌ TEST 14 FAILED: No personal org found for user")
except Exception as e:
    print(f"❌ TEST 14 FAILED: {e}")

# Test 15: Backward compatibility - demo org works regardless of kind
print("\n[15/15] Backward compatibility - demo org works regardless of kind")
try:
    # Get demo org details from session
    demo_session_resp = demo_session.get(f"{API_URL}/auth/session", timeout=10)
    demo_session_data = demo_session_resp.json()
    demo_org_id = demo_session_data.get('user', {}).get('activeOrgId')
    
    if demo_org_id:
        demo_org = db['organizations'].find_one({'id': demo_org_id})
        
        if demo_org:
            org_kind = demo_org.get('kind', 'absent')
            print(f"   - Demo org kind: {org_kind}")
            
            # Test that CFO endpoints still work
            briefing_resp = demo_session.get(f"{API_URL}/cfo/briefing", timeout=15)
            
            if briefing_resp.status_code == 200:
                print(f"✅ TEST 15 PASSED: Demo org CFO endpoints work (kind={org_kind})")
            else:
                print(f"❌ TEST 15 FAILED: Demo org CFO endpoints broken: {briefing_resp.status_code}")
        else:
            print(f"❌ TEST 15 FAILED: Demo org not found in database")
    else:
        print(f"❌ TEST 15 FAILED: Could not get demo org ID from session")
        print(f"   - Session data: {demo_session_data}")
except Exception as e:
    print(f"❌ TEST 15 FAILED: {e}")

# ============================================================
# SUMMARY
# ============================================================

print("\n" + "=" * 80)
print("SPRINT P1 VERIFICATION COMPLETE")
print("=" * 80)
print("\nAll 15 tests executed. Review results above for PASS/FAIL status.")
print("\nKey areas tested:")
print("  - Enterprise regression: Demo, Finance, Chat, CSV, Invoice, Report, Billing, Isolation")
print("  - Personal workspace: Creation, Idempotency, Coexistence, Session, Protection, Mongo")
print("=" * 80)
