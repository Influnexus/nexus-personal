#!/usr/bin/env python3
"""
Demo Mode Feature Test - NexusAI
Tests the new demo mode flow with NextAuth credentials provider id='demo'
"""
import requests
import json
import time
import random
import string
from io import StringIO

BASE_URL = "https://financial-health-hub-17.preview.emergentagent.com"

def random_id(length=8):
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=length))

def print_step(step_num, description):
    print(f"\n{'='*80}")
    print(f"STEP {step_num}: {description}")
    print('='*80)

def print_result(passed, message, response=None):
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"{status}: {message}")
    if response:
        print(f"  Status: {response.status_code}")
        if response.headers.get('content-type', '').startswith('application/json'):
            try:
                print(f"  Body: {json.dumps(response.json(), indent=2)[:500]}")
            except:
                print(f"  Body: {response.text[:500]}")
        else:
            print(f"  Body preview: {response.text[:200]}")

def test_demo_mode():
    print(f"\n🧪 DEMO MODE FEATURE TEST")
    print(f"Base URL: {BASE_URL}\n")
    
    results = []
    
    # ========================================================================
    # STEP 1: GET CSRF Token
    # ========================================================================
    print_step(1, "GET /api/auth/csrf - Get CSRF token")
    
    session = requests.Session()
    try:
        resp = session.get(f"{BASE_URL}/api/auth/csrf")
        csrf_data = resp.json()
        csrf_token = csrf_data.get('csrfToken')
        
        if resp.status_code == 200 and csrf_token:
            print_result(True, f"CSRF token obtained: {csrf_token[:20]}...", resp)
            results.append(("Step 1: GET CSRF", True, "CSRF token obtained"))
        else:
            print_result(False, "Failed to get CSRF token", resp)
            results.append(("Step 1: GET CSRF", False, f"Status {resp.status_code}, no token"))
            return results
    except Exception as e:
        print_result(False, f"Exception: {e}")
        results.append(("Step 1: GET CSRF", False, str(e)))
        return results
    
    # ========================================================================
    # STEP 2: POST /api/auth/callback/demo - Create demo session
    # ========================================================================
    print_step(2, "POST /api/auth/callback/demo - Create demo workspace")
    
    try:
        # NextAuth expects form-urlencoded data
        demo_data = {
            'csrfToken': csrf_token,
            'callbackUrl': f"{BASE_URL}/dashboard",
            'json': 'true'
        }
        
        resp = session.post(
            f"{BASE_URL}/api/auth/callback/demo",
            data=demo_data,
            headers={'Content-Type': 'application/x-www-form-urlencoded'},
            allow_redirects=False
        )
        
        # NextAuth may return 200 with JSON or 302 redirect - both are valid if session cookie is set
        has_session_cookie = any('next-auth.session-token' in cookie or 'authjs.session-token' in cookie 
                                  for cookie in session.cookies.keys())
        
        if (resp.status_code in [200, 302]) and has_session_cookie:
            print_result(True, f"Demo session created (status {resp.status_code}), session cookie set", resp)
            results.append(("Step 2: Create demo session", True, f"Session cookie set, status {resp.status_code}"))
        else:
            print_result(False, f"Demo session creation failed or no session cookie", resp)
            print(f"  Cookies: {list(session.cookies.keys())}")
            results.append(("Step 2: Create demo session", False, f"Status {resp.status_code}, cookies: {list(session.cookies.keys())}"))
            return results
    except Exception as e:
        print_result(False, f"Exception: {e}")
        results.append(("Step 2: Create demo session", False, str(e)))
        return results
    
    # ========================================================================
    # STEP 3: GET /api/auth/session - Verify demo session
    # ========================================================================
    print_step(3, "GET /api/auth/session - Verify isDemo=true, activeOrgId, demoExpiresAt")
    
    try:
        resp = session.get(f"{BASE_URL}/api/auth/session")
        session_data = resp.json()
        
        user = session_data.get('user', {})
        is_demo = user.get('isDemo')
        active_org_id = user.get('activeOrgId')
        demo_expires_at = user.get('demoExpiresAt')
        
        checks = []
        checks.append(("isDemo === true", is_demo is True))
        checks.append(("activeOrgId is set", active_org_id is not None and active_org_id != ""))
        checks.append(("demoExpiresAt is set", demo_expires_at is not None and demo_expires_at != ""))
        
        # Verify demoExpiresAt is a future date (roughly 24h from now)
        if demo_expires_at:
            try:
                from datetime import datetime, timedelta
                expires = datetime.fromisoformat(demo_expires_at.replace('Z', '+00:00'))
                now = datetime.now(expires.tzinfo)
                time_diff = (expires - now).total_seconds() / 3600  # hours
                checks.append(("demoExpiresAt is ~24h in future", 20 < time_diff < 28))
            except:
                checks.append(("demoExpiresAt is valid ISO date", False))
        
        all_passed = all(check[1] for check in checks)
        
        print_result(all_passed, "Session validation", resp)
        for check_name, check_result in checks:
            print(f"  {'✅' if check_result else '❌'} {check_name}")
        
        if all_passed:
            results.append(("Step 3: Verify demo session", True, "All session fields correct"))
        else:
            failed_checks = [c[0] for c in checks if not c[1]]
            results.append(("Step 3: Verify demo session", False, f"Failed: {', '.join(failed_checks)}"))
            return results
    except Exception as e:
        print_result(False, f"Exception: {e}")
        results.append(("Step 3: Verify demo session", False, str(e)))
        return results
    
    # ========================================================================
    # STEP 4: GET /api/cfo/briefing - Verify seeded data
    # ========================================================================
    print_step(4, "GET /api/cfo/briefing - Verify seeded demo org has data")
    
    try:
        resp = session.get(f"{BASE_URL}/api/cfo/briefing")
        
        if resp.status_code != 200:
            print_result(False, f"Briefing request failed", resp)
            results.append(("Step 4: CFO briefing", False, f"Status {resp.status_code}"))
            return results
        
        briefing_data = resp.json()
        
        required_keys = ['kpis', 'health', 'forecast', 'briefing']
        checks = []
        for key in required_keys:
            checks.append((f"Has '{key}' key", key in briefing_data and briefing_data[key] is not None))
        
        # Verify forecast has data
        forecast = briefing_data.get('forecast', {})
        checks.append(("Forecast has series", isinstance(forecast.get('series'), list) and len(forecast.get('series', [])) > 0))
        
        # Verify briefing has content
        briefing_text = briefing_data.get('briefing', '')
        checks.append(("Briefing has content", len(briefing_text) > 100))
        
        all_passed = all(check[1] for check in checks)
        
        print_result(all_passed, "Briefing data validation")
        for check_name, check_result in checks:
            print(f"  {'✅' if check_result else '❌'} {check_name}")
        
        if all_passed:
            results.append(("Step 4: CFO briefing", True, "All required data populated"))
        else:
            failed_checks = [c[0] for c in checks if not c[1]]
            results.append(("Step 4: CFO briefing", False, f"Failed: {', '.join(failed_checks)}"))
    except Exception as e:
        print_result(False, f"Exception: {e}")
        results.append(("Step 4: CFO briefing", False, str(e)))
    
    # ========================================================================
    # STEP 5: POST /api/cfo/chat/stream - Verify AI chat works
    # ========================================================================
    print_step(5, "POST /api/cfo/chat/stream - Test AI chat in demo mode")
    
    try:
        chat_payload = {
            "messages": [
                {"role": "user", "content": "What is my cash runway?"}
            ]
        }
        
        resp = session.post(
            f"{BASE_URL}/api/cfo/chat/stream",
            json=chat_payload,
            stream=True,
            timeout=60
        )
        
        if resp.status_code != 200:
            print_result(False, f"Chat stream request failed", resp)
            results.append(("Step 5: AI chat stream", False, f"Status {resp.status_code}"))
        else:
            content_type = resp.headers.get('content-type', '')
            is_sse = 'text/event-stream' in content_type
            
            # Read SSE events (format: "event: <name>\ndata: <json>\n\n")
            events = []
            current_event = None
            for line in resp.iter_lines(decode_unicode=True):
                if line.startswith('event: '):
                    current_event = line[7:].strip()
                elif line.startswith('data: '):
                    try:
                        event_data = json.loads(line[6:])
                        events.append({'event': current_event, 'data': event_data})
                        current_event = None
                    except:
                        pass
            
            # Debug: print event names
            event_names = [e.get('event') for e in events]
            print(f"  Event names received: {event_names}")
            
            has_done = any(e.get('event') == 'done' for e in events)
            
            checks = []
            checks.append(("Content-Type is text/event-stream", is_sse))
            checks.append(("Received 'done' event", has_done))
            checks.append(("Received events", len(events) > 0))
            
            all_passed = all(check[1] for check in checks)
            
            print_result(all_passed, "AI chat stream validation")
            for check_name, check_result in checks:
                print(f"  {'✅' if check_result else '❌'} {check_name}")
            print(f"  Total events received: {len(events)}")
            
            if all_passed:
                results.append(("Step 5: AI chat stream", True, f"Stream working, {len(events)} events, 'done' received"))
            else:
                failed_checks = [c[0] for c in checks if not c[1]]
                results.append(("Step 5: AI chat stream", False, f"Failed: {', '.join(failed_checks)}"))
    except Exception as e:
        print_result(False, f"Exception: {e}")
        results.append(("Step 5: AI chat stream", False, str(e)))
    
    # ========================================================================
    # STEP 6: POST /api/cfo/transactions - Test CSV import
    # ========================================================================
    print_step(6, "POST /api/cfo/transactions - Test CSV import in demo org")
    
    try:
        csv_content = """date,description,vendor,amount
2024-01-15,Office supplies,Staples,-125.50
2024-01-16,Client payment,Acme Corp,5000.00
2024-01-17,Software subscription,Adobe,-49.99"""
        
        files = {
            'file': ('transactions.csv', csv_content, 'text/csv')
        }
        
        resp = session.post(
            f"{BASE_URL}/api/cfo/transactions",
            files=files,
            timeout=30
        )
        
        if resp.status_code != 200:
            print_result(False, f"CSV import failed", resp)
            results.append(("Step 6: CSV import", False, f"Status {resp.status_code}"))
        else:
            import_result = resp.json()
            imported_count = import_result.get('imported', 0)
            
            if imported_count == 3:
                print_result(True, f"CSV import successful: {imported_count} rows imported", resp)
                results.append(("Step 6: CSV import", True, f"{imported_count} transactions imported"))
            else:
                print_result(False, f"Expected 3 imports, got {imported_count}", resp)
                results.append(("Step 6: CSV import", False, f"Expected 3, got {imported_count}"))
    except Exception as e:
        print_result(False, f"Exception: {e}")
        results.append(("Step 6: CSV import", False, str(e)))
    
    # ========================================================================
    # STEP 7: POST /api/demo/convert - Convert to real account
    # ========================================================================
    print_step(7, "POST /api/demo/convert - Convert demo to real account")
    
    try:
        convert_email = f"converted_{random_id()}@nexusai.com"
        convert_payload = {
            "name": "Real User",
            "email": convert_email,
            "password": "TestPassword1234"
        }
        
        resp = session.post(
            f"{BASE_URL}/api/demo/convert",
            json=convert_payload,
            timeout=30
        )
        
        if resp.status_code != 200:
            print_result(False, f"Conversion failed", resp)
            results.append(("Step 7: Convert to real", False, f"Status {resp.status_code}"))
        else:
            convert_result = resp.json()
            returned_email = convert_result.get('email')
            
            if returned_email == convert_email:
                print_result(True, f"Conversion successful: {returned_email}", resp)
                results.append(("Step 7: Convert to real", True, f"Converted to {returned_email}"))
                
                # Verify session (may still show isDemo=true until client-side update)
                session_resp = session.get(f"{BASE_URL}/api/auth/session")
                session_data = session_resp.json()
                print(f"  Note: Session after convert: isDemo={session_data.get('user', {}).get('isDemo')} (may still be true until client update)")
            else:
                print_result(False, f"Email mismatch: expected {convert_email}, got {returned_email}", resp)
                results.append(("Step 7: Convert to real", False, f"Email mismatch"))
    except Exception as e:
        print_result(False, f"Exception: {e}")
        results.append(("Step 7: Convert to real", False, str(e)))
    
    # ========================================================================
    # STEP 8: Test duplicate email protection
    # ========================================================================
    print_step(8, "Test duplicate email protection")
    
    try:
        # First, register a normal user with a fixed email
        fixed_email = f"dupcheck_{random_id()}@nexusai.com"
        
        print(f"  8a. Registering normal user: {fixed_email}")
        register_payload = {
            "name": "Duplicate Test User",
            "email": fixed_email,
            "password": "TestPassword1234"
        }
        
        register_resp = requests.post(f"{BASE_URL}/api/register", json=register_payload)
        
        if register_resp.status_code != 200:
            print_result(False, f"Failed to register test user", register_resp)
            results.append(("Step 8: Duplicate email check", False, f"Setup failed: status {register_resp.status_code}"))
        else:
            print(f"  ✅ Test user registered: {fixed_email}")
            
            # Now start a NEW demo session
            print(f"  8b. Starting fresh demo session")
            demo_session = requests.Session()
            
            # Get CSRF
            csrf_resp = demo_session.get(f"{BASE_URL}/api/auth/csrf")
            csrf_token2 = csrf_resp.json().get('csrfToken')
            
            # Create demo session
            demo_data2 = {
                'csrfToken': csrf_token2,
                'callbackUrl': f"{BASE_URL}/dashboard",
                'json': 'true'
            }
            demo_resp = demo_session.post(
                f"{BASE_URL}/api/auth/callback/demo",
                data=demo_data2,
                headers={'Content-Type': 'application/x-www-form-urlencoded'},
                allow_redirects=False
            )
            
            has_session = any('next-auth.session-token' in cookie or 'authjs.session-token' in cookie 
                              for cookie in demo_session.cookies.keys())
            
            if not has_session:
                print_result(False, "Failed to create second demo session")
                results.append(("Step 8: Duplicate email check", False, "Failed to create demo session"))
            else:
                print(f"  ✅ Second demo session created")
                
                # Try to convert with duplicate email
                print(f"  8c. Attempting convert with duplicate email: {fixed_email}")
                dup_payload = {
                    "name": "Should Fail",
                    "email": fixed_email,
                    "password": "TestPassword1234"
                }
                
                dup_resp = demo_session.post(f"{BASE_URL}/api/demo/convert", json=dup_payload)
                
                if dup_resp.status_code == 400:
                    error_msg = dup_resp.json().get('error', '')
                    if 'already exists' in error_msg.lower():
                        print_result(True, f"Duplicate email correctly rejected: {error_msg}", dup_resp)
                        results.append(("Step 8: Duplicate email check", True, "400 with 'already exists' message"))
                    else:
                        print_result(False, f"Got 400 but wrong error message: {error_msg}", dup_resp)
                        results.append(("Step 8: Duplicate email check", False, f"Wrong error: {error_msg}"))
                else:
                    print_result(False, f"Expected 400, got {dup_resp.status_code}", dup_resp)
                    results.append(("Step 8: Duplicate email check", False, f"Status {dup_resp.status_code}"))
    except Exception as e:
        print_result(False, f"Exception: {e}")
        results.append(("Step 8: Duplicate email check", False, str(e)))
    
    # ========================================================================
    # STEP 9: Test unauthenticated access
    # ========================================================================
    print_step(9, "Test unauthenticated POST /api/demo/convert returns 401")
    
    try:
        unauth_session = requests.Session()
        unauth_payload = {
            "name": "Should Fail",
            "email": "unauth@test.com",
            "password": "TestPassword1234"
        }
        
        resp = unauth_session.post(f"{BASE_URL}/api/demo/convert", json=unauth_payload)
        
        if resp.status_code == 401:
            print_result(True, "Unauthenticated request correctly rejected with 401", resp)
            results.append(("Step 9: Unauth access check", True, "401 returned"))
        else:
            print_result(False, f"Expected 401, got {resp.status_code}", resp)
            results.append(("Step 9: Unauth access check", False, f"Status {resp.status_code}"))
    except Exception as e:
        print_result(False, f"Exception: {e}")
        results.append(("Step 9: Unauth access check", False, str(e)))
    
    return results

def main():
    results = test_demo_mode()
    
    # Print summary
    print(f"\n{'='*80}")
    print("TEST SUMMARY")
    print('='*80)
    
    passed = sum(1 for r in results if r[1])
    total = len(results)
    
    for step_name, passed_flag, details in results:
        status = "✅ PASS" if passed_flag else "❌ FAIL"
        print(f"{status} | {step_name}: {details}")
    
    print(f"\n{'='*80}")
    print(f"FINAL RESULT: {passed}/{total} tests passed ({100*passed//total if total > 0 else 0}%)")
    print('='*80)
    
    return 0 if passed == total else 1

if __name__ == "__main__":
    exit(main())
