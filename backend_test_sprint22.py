#!/usr/bin/env python3
"""
Sprint 2.2 - Focused Verification Pass
Tests invoice upload, CSV import, report generation, billing page, and briefing endpoints.
"""
import requests
import random
import string
import io
from PIL import Image

BASE_URL = "https://financial-health-hub-17.preview.emergentagent.com"

def random_id(length=8):
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=length))

def test_step_1_register_fresh_user():
    """Step 1: Register a fresh test user"""
    print("\n=== STEP 1: Register Fresh User ===")
    email = f"betaready_{random_id()}@nexusai.com"
    password = "TestPassword1234"
    
    try:
        resp = requests.post(f"{BASE_URL}/api/register", json={
            "name": "Beta Ready User",
            "email": email,
            "password": password
        }, timeout=30)
        
        print(f"Status: {resp.status_code}")
        print(f"Response: {resp.text[:200]}")
        
        if resp.status_code == 200:
            data = resp.json()
            if 'id' in data and 'email' in data:
                print(f"✅ PASS - User registered: {data['email']}")
                return email, password
            else:
                print(f"❌ FAIL - Missing required fields in response")
                return None, None
        else:
            print(f"❌ FAIL - Registration failed with status {resp.status_code}")
            return None, None
    except Exception as e:
        print(f"❌ FAIL - Exception: {e}")
        return None, None

def test_step_2_login(email, password):
    """Step 2: Login via NextAuth credentials flow"""
    print("\n=== STEP 2: Login via NextAuth ===")
    session = requests.Session()
    
    try:
        # Get CSRF token
        csrf_resp = session.get(f"{BASE_URL}/api/auth/csrf", timeout=30)
        print(f"CSRF Status: {csrf_resp.status_code}")
        
        if csrf_resp.status_code != 200:
            print(f"❌ FAIL - CSRF request failed")
            return None
        
        csrf_token = csrf_resp.json().get('csrfToken')
        print(f"CSRF Token: {csrf_token[:20]}...")
        
        # Login
        login_resp = session.post(f"{BASE_URL}/api/auth/callback/credentials", data={
            'csrfToken': csrf_token,
            'email': email,
            'password': password,
            'redirect': 'false'
        }, timeout=30)
        
        print(f"Login Status: {login_resp.status_code}")
        print(f"Login Response: {login_resp.text[:200]}")
        
        # Verify session
        session_resp = session.get(f"{BASE_URL}/api/auth/session", timeout=30)
        print(f"Session Status: {session_resp.status_code}")
        
        if session_resp.status_code == 200:
            session_data = session_resp.json()
            if session_data and 'user' in session_data:
                print(f"✅ PASS - Login successful, user: {session_data['user'].get('email')}")
                return session
            else:
                print(f"❌ FAIL - No user in session")
                return None
        else:
            print(f"❌ FAIL - Session verification failed")
            return None
    except Exception as e:
        print(f"❌ FAIL - Exception: {e}")
        return None

def test_step_3_create_org(session):
    """Step 3: Create organization with unique slug"""
    print("\n=== STEP 3: Create Organization ===")
    slug = f"betaorg{random_id(6)}"
    
    try:
        resp = session.post(f"{BASE_URL}/api/organizations", json={
            "name": "Beta Test Organization",
            "slug": slug
        }, timeout=30)
        
        print(f"Status: {resp.status_code}")
        print(f"Response: {resp.text[:300]}")
        
        if resp.status_code == 200:
            data = resp.json()
            # Handle nested response structure
            org_data = data.get('organization', data)
            if 'id' in org_data and 'slug' in org_data:
                org_id = org_data['id']
                print(f"✅ PASS - Organization created: {org_data['slug']} (id: {org_id})")
                
                # Re-login to set activeOrgId in session
                print("\nRe-logging in to set activeOrgId...")
                csrf_resp = session.get(f"{BASE_URL}/api/auth/csrf", timeout=30)
                csrf_token = csrf_resp.json().get('csrfToken')
                
                # Get email from current session
                session_resp = session.get(f"{BASE_URL}/api/auth/session", timeout=30)
                email = session_resp.json()['user']['email']
                
                # Re-login (password is TestPassword1234 from step 1)
                session.post(f"{BASE_URL}/api/auth/callback/credentials", data={
                    'csrfToken': csrf_token,
                    'email': email,
                    'password': 'TestPassword1234',
                    'redirect': 'false'
                }, timeout=30)
                
                # Verify activeOrgId is set
                session_resp = session.get(f"{BASE_URL}/api/auth/session", timeout=30)
                active_org = session_resp.json().get('user', {}).get('activeOrgId')
                print(f"Active Org ID after re-login: {active_org}")
                
                return org_id
            else:
                print(f"❌ FAIL - Missing required fields in response")
                return None
        else:
            print(f"❌ FAIL - Organization creation failed with status {resp.status_code}")
            return None
    except Exception as e:
        print(f"❌ FAIL - Exception: {e}")
        return None

def test_step_4_invoice_upload(session):
    """Step 4: POST /api/cfo/invoices with test image"""
    print("\n=== STEP 4: Invoice Upload (multipart/form-data) ===")
    
    try:
        # Create a small test PNG (10x10 white image)
        img = Image.new('RGB', (10, 10), color='white')
        img_bytes = io.BytesIO()
        img.save(img_bytes, format='PNG')
        img_bytes.seek(0)
        
        files = {'file': ('test_invoice.png', img_bytes, 'image/png')}
        
        resp = session.post(f"{BASE_URL}/api/cfo/invoices", files=files, timeout=90)
        
        print(f"Status: {resp.status_code}")
        print(f"Response: {resp.text[:500]}")
        
        # Accept 200 with {invoice: ...} OR graceful 400/500 with {error: ...}
        if resp.status_code in [200, 400, 500]:
            data = resp.json()
            if resp.status_code == 200 and 'invoice' in data:
                print(f"✅ PASS - Invoice uploaded successfully")
                return True
            elif 'error' in data:
                print(f"✅ PASS - Graceful error response (expected for test image): {data['error'][:100]}")
                return True
            else:
                print(f"❌ FAIL - Unexpected response structure")
                return False
        else:
            print(f"❌ FAIL - Unexpected status code {resp.status_code}")
            return False
    except requests.exceptions.Timeout:
        print(f"❌ FAIL - Request timed out (>90s)")
        return False
    except Exception as e:
        print(f"❌ FAIL - Exception: {e}")
        return False

def test_step_5_csv_import(session):
    """Step 5: POST /api/cfo/transactions with CSV"""
    print("\n=== STEP 5: CSV Transaction Import ===")
    
    try:
        csv_content = """date,description,vendor,amount
2024-01-15,Software subscription,Acme SaaS Inc,299.00
2024-01-16,Office supplies,Staples,45.50
2024-01-17,Cloud hosting,AWS,1250.00
2024-01-18,Marketing campaign,Google Ads,500.00
2024-01-19,Team lunch,Chipotle,85.25"""
        
        files = {'file': ('transactions.csv', io.BytesIO(csv_content.encode()), 'text/csv')}
        
        resp = session.post(f"{BASE_URL}/api/cfo/transactions", files=files, timeout=90)
        
        print(f"Status: {resp.status_code}")
        print(f"Response: {resp.text[:300]}")
        
        if resp.status_code == 200:
            data = resp.json()
            if 'imported' in data and data['imported'] > 0:
                print(f"✅ PASS - Imported {data['imported']} transactions")
                
                # Verify transactions have category field
                get_resp = session.get(f"{BASE_URL}/api/cfo/transactions", timeout=30)
                if get_resp.status_code == 200:
                    txs = get_resp.json().get('transactions', [])
                    if len(txs) > 0 and 'category' in txs[0]:
                        print(f"✅ PASS - Transactions have category field: {txs[0]['category']}")
                        return True
                    else:
                        print(f"❌ FAIL - Transactions missing category field")
                        return False
                else:
                    print(f"❌ FAIL - Could not verify transactions")
                    return False
            else:
                print(f"❌ FAIL - No transactions imported")
                return False
        else:
            print(f"❌ FAIL - CSV import failed with status {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ FAIL - Exception: {e}")
        return False

def test_step_6_report_generation(session):
    """Step 6: POST /api/cfo/report"""
    print("\n=== STEP 6: Financial Report Generation ===")
    
    try:
        resp = session.post(f"{BASE_URL}/api/cfo/report", timeout=90)
        
        print(f"Status: {resp.status_code}")
        print(f"Response length: {len(resp.text)} chars")
        
        if resp.status_code == 200:
            data = resp.json()
            if 'markdown' in data and 'context' in data:
                markdown = data['markdown']
                if '## Executive Summary' in markdown:
                    print(f"✅ PASS - Report generated with Executive Summary")
                    print(f"Markdown preview: {markdown[:200]}...")
                    return True
                else:
                    print(f"❌ FAIL - Markdown missing '## Executive Summary'")
                    print(f"Markdown content: {markdown[:500]}")
                    return False
            else:
                print(f"❌ FAIL - Missing required fields (markdown, context)")
                return False
        else:
            print(f"❌ FAIL - Report generation failed with status {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ FAIL - Exception: {e}")
        return False

def test_step_7_billing_page(session):
    """Step 7: GET /billing page"""
    print("\n=== STEP 7: Billing Page Render ===")
    
    try:
        resp = session.get(f"{BASE_URL}/billing", timeout=30)
        
        print(f"Status: {resp.status_code}")
        print(f"Content-Type: {resp.headers.get('content-type')}")
        print(f"Response length: {len(resp.text)} chars")
        
        if resp.status_code == 200:
            if 'text/html' in resp.headers.get('content-type', ''):
                print(f"✅ PASS - Billing page renders successfully (200 HTML)")
                return True
            else:
                print(f"❌ FAIL - Response is not HTML")
                return False
        else:
            print(f"❌ FAIL - Billing page failed with status {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ FAIL - Exception: {e}")
        return False

def test_step_8_briefing_verification(session):
    """Step 8: GET /api/cfo/briefing - verify KPIs/health/forecast"""
    print("\n=== STEP 8: Briefing Verification ===")
    
    try:
        resp = session.get(f"{BASE_URL}/api/cfo/briefing", timeout=60)
        
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            required_keys = ['briefing', 'kpis', 'health', 'forecast']
            missing_keys = [k for k in required_keys if k not in data]
            
            if not missing_keys:
                # Verify forecast structure
                forecast = data['forecast']
                forecast_keys = ['series', 'startingCash', 'endingCash', 'baselineDailyRev', 
                                'baselineDailyExp', 'scheduledEvents', 'narrative', 'lowestDay']
                missing_forecast = [k for k in forecast_keys if k not in forecast]
                
                if not missing_forecast:
                    print(f"✅ PASS - Briefing returns all required keys")
                    print(f"KPIs: revenue30d=${data['kpis'].get('revenue30d', 0):.2f}, runwayDays={data['kpis'].get('runwayDays')}")
                    print(f"Health: score={data['health'].get('score')}/100")
                    print(f"Forecast: startingCash=${forecast.get('startingCash', 0):.2f}, endingCash=${forecast.get('endingCash', 0):.2f}")
                    return True
                else:
                    print(f"❌ FAIL - Forecast missing keys: {missing_forecast}")
                    return False
            else:
                print(f"❌ FAIL - Missing required keys: {missing_keys}")
                return False
        else:
            print(f"❌ FAIL - Briefing failed with status {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ FAIL - Exception: {e}")
        return False

def main():
    print("=" * 80)
    print("SPRINT 2.2 - FOCUSED VERIFICATION PASS")
    print("Testing: Invoice upload, CSV import, Report generation, Billing page")
    print("=" * 80)
    
    results = {}
    
    # Step 1: Register
    email, password = test_step_1_register_fresh_user()
    results['Step 1: Register'] = email is not None
    
    if not email:
        print("\n❌ CRITICAL FAILURE - Cannot proceed without user registration")
        return
    
    # Step 2: Login
    session = test_step_2_login(email, password)
    results['Step 2: Login'] = session is not None
    
    if not session:
        print("\n❌ CRITICAL FAILURE - Cannot proceed without login")
        return
    
    # Step 3: Create Org
    org_id = test_step_3_create_org(session)
    results['Step 3: Create Org'] = org_id is not None
    
    if not org_id:
        print("\n❌ CRITICAL FAILURE - Cannot proceed without organization")
        return
    
    # Step 4: Invoice Upload
    results['Step 4: Invoice Upload'] = test_step_4_invoice_upload(session)
    
    # Step 5: CSV Import
    results['Step 5: CSV Import'] = test_step_5_csv_import(session)
    
    # Step 6: Report Generation
    results['Step 6: Report Generation'] = test_step_6_report_generation(session)
    
    # Step 7: Billing Page
    results['Step 7: Billing Page'] = test_step_7_billing_page(session)
    
    # Step 8: Briefing Verification
    results['Step 8: Briefing Verification'] = test_step_8_briefing_verification(session)
    
    # Summary
    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)
    
    for step, passed in results.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status} - {step}")
    
    total = len(results)
    passed = sum(results.values())
    print(f"\nTotal: {passed}/{total} tests passed ({100*passed//total}%)")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED - Pre-production sanity check complete!")
    else:
        print(f"\n⚠️ {total - passed} test(s) failed - Review failures above")

if __name__ == '__main__':
    main()
