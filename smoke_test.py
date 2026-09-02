#!/usr/bin/env python3
"""
NexusAI Deployment Smoke Test
Quick 5-check verification for deployment readiness
"""

import requests
import random
import string
import json
import sys
from datetime import datetime

BASE_URL = "https://financial-health-hub-17.preview.emergentagent.com"

def random_string(length=8):
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=length))

def print_result(check_num, name, passed, details=""):
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"\n{'='*80}")
    print(f"CHECK {check_num}: {name}")
    print(f"Status: {status}")
    if details:
        print(f"Details: {details}")
    print('='*80)
    return passed

def main():
    session = requests.Session()
    results = []
    
    print(f"\n🚀 NexusAI Deployment Smoke Test")
    print(f"Base URL: {BASE_URL}")
    print(f"Time: {datetime.now().isoformat()}")
    print(f"\n{'='*80}\n")
    
    # CHECK 1: Health check
    try:
        resp = session.get(f"{BASE_URL}/api/health", timeout=10)
        passed = resp.status_code == 200 and resp.json().get("status") == "ok"
        details = f"Status: {resp.status_code}, Body: {resp.text[:200]}"
        results.append(print_result(1, "Health Check", passed, details))
    except Exception as e:
        results.append(print_result(1, "Health Check", False, f"Error: {str(e)}"))
    
    # CHECK 2: Database connectivity (Register new user)
    try:
        random_id = random_string(8)
        user_data = {
            "name": f"SmokeTest User {random_id}",
            "email": f"smoketest_{random_id}@nexusai.com",
            "password": "TestPassword1234"
        }
        resp = session.post(f"{BASE_URL}/api/register", json=user_data, timeout=10)
        passed = resp.status_code == 200 and "id" in resp.json()
        details = f"Status: {resp.status_code}, User: {user_data['email']}, Response: {resp.text[:200]}"
        results.append(print_result(2, "Database Connectivity (Register)", passed, details))
        
        if not passed:
            print("\n⚠️  Cannot continue without successful registration. Stopping.")
            sys.exit(1)
        
        registered_email = user_data['email']
        registered_password = user_data['password']
        user_id = resp.json().get('id')
        print(f"✓ Registered user ID: {user_id}")
        
    except Exception as e:
        results.append(print_result(2, "Database Connectivity (Register)", False, f"Error: {str(e)}"))
        sys.exit(1)
    
    # CHECK 3: Authentication (NextAuth flow)
    try:
        # Step 3a: Get CSRF token
        csrf_resp = session.get(f"{BASE_URL}/api/auth/csrf", timeout=10)
        csrf_token = csrf_resp.json().get("csrfToken")
        
        if not csrf_token:
            results.append(print_result(3, "Authentication (NextAuth)", False, "Failed to get CSRF token"))
        else:
            # Step 3b: Login
            login_data = {
                "csrfToken": csrf_token,
                "email": registered_email,
                "password": registered_password,
                "redirect": "false"
            }
            login_resp = session.post(
                f"{BASE_URL}/api/auth/callback/credentials",
                data=login_data,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=10,
                allow_redirects=False
            )
            
            # Step 3c: Check session
            session_resp = session.get(f"{BASE_URL}/api/auth/session", timeout=10)
            session_data = session_resp.json()
            
            passed = (
                session_resp.status_code == 200 and
                session_data.get("user") is not None and
                session_data["user"].get("email") == registered_email
            )
            details = f"CSRF: {csrf_token[:20]}..., Login status: {login_resp.status_code}, Session: {json.dumps(session_data)[:200]}"
            results.append(print_result(3, "Authentication (NextAuth)", passed, details))
            
            if not passed:
                print("\n⚠️  Cannot continue without successful authentication. Stopping.")
                sys.exit(1)
    
    except Exception as e:
        results.append(print_result(3, "Authentication (NextAuth)", False, f"Error: {str(e)}"))
        sys.exit(1)
    
    # CHECK 4: Organization + Dashboard data path
    try:
        # Step 4a: Create organization
        org_slug = f"smoketest-{random_string(6)}"
        org_data = {
            "name": f"Smoke Test Org {random_string(4)}",
            "slug": org_slug
        }
        org_resp = session.post(f"{BASE_URL}/api/organizations", json=org_data, timeout=10)
        
        if org_resp.status_code != 200:
            results.append(print_result(4, "Organization + Dashboard", False, f"Org creation failed: {org_resp.status_code}, {org_resp.text[:200]}"))
        else:
            org_data_resp = org_resp.json()
            org_id = org_data_resp.get("organization", {}).get("id")
            print(f"✓ Created org ID: {org_id}, slug: {org_slug}")
            
            # Step 4b: Re-login to refresh session (JWT callback will set activeOrgId from membership)
            # This simulates what happens when a user refreshes the page after creating an org
            csrf_resp2 = session.get(f"{BASE_URL}/api/auth/csrf", timeout=10)
            csrf_token2 = csrf_resp2.json().get("csrfToken")
            
            login_data2 = {
                "csrfToken": csrf_token2,
                "email": registered_email,
                "password": registered_password,
                "redirect": "false"
            }
            session.post(
                f"{BASE_URL}/api/auth/callback/credentials",
                data=login_data2,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=10,
                allow_redirects=False
            )
            
            # Verify session now has activeOrgId
            session_check = session.get(f"{BASE_URL}/api/auth/session", timeout=10)
            session_data = session_check.json()
            active_org = session_data.get('user', {}).get('activeOrgId')
            print(f"✓ Session after re-login: activeOrgId={active_org}")
            
            # Step 4c: Get CFO briefing (seeds demo data)
            briefing_resp = session.get(f"{BASE_URL}/api/cfo/briefing", timeout=30)
            
            if briefing_resp.status_code != 200:
                passed = False
                details = f"Briefing failed: {briefing_resp.status_code}, {briefing_resp.text[:200]}"
            else:
                briefing_data = briefing_resp.json()
                required_keys = ["briefing", "kpis", "health", "forecast"]
                has_all_keys = all(key in briefing_data for key in required_keys)
                passed = has_all_keys
                details = f"Org created: {org_resp.status_code}, Briefing: {briefing_resp.status_code}, Keys present: {list(briefing_data.keys())}"
            
            results.append(print_result(4, "Organization + Dashboard", passed, details))
            
            if not passed:
                print("\n⚠️  Dashboard data path failed. Stopping.")
                sys.exit(1)
    
    except Exception as e:
        results.append(print_result(4, "Organization + Dashboard", False, f"Error: {str(e)}"))
        sys.exit(1)
    
    # CHECK 5: AI CFO chat endpoint (streaming)
    try:
        chat_data = {
            "messages": [
                {"role": "user", "content": "What is my current cash balance?"}
            ]
        }
        chat_resp = session.post(
            f"{BASE_URL}/api/cfo/chat/stream",
            json=chat_data,
            timeout=60,
            stream=True
        )
        
        if chat_resp.status_code != 200:
            passed = False
            details = f"Chat failed: {chat_resp.status_code}, {chat_resp.text[:200]}"
        else:
            # Check if it's SSE stream
            content_type = chat_resp.headers.get("content-type", "")
            is_sse = "text/event-stream" in content_type
            
            # Read stream and look for 'done' event
            found_done = False
            event_count = 0
            for line in chat_resp.iter_lines(decode_unicode=True):
                if line.startswith("event:"):
                    event_count += 1
                    if "done" in line:
                        found_done = True
                        break
                # Safety: stop after 100 events
                if event_count > 100:
                    break
            
            passed = is_sse and found_done
            details = f"Status: {chat_resp.status_code}, Content-Type: {content_type}, Events: {event_count}, Done event: {found_done}"
        
        results.append(print_result(5, "AI CFO Chat Endpoint", passed, details))
    
    except Exception as e:
        results.append(print_result(5, "AI CFO Chat Endpoint", False, f"Error: {str(e)}"))
    
    # FINAL SUMMARY
    print(f"\n\n{'='*80}")
    print("📊 SMOKE TEST SUMMARY")
    print('='*80)
    
    for i, (check_name, passed) in enumerate([
        ("Health Check", results[0]),
        ("Database Connectivity", results[1]),
        ("Authentication", results[2]),
        ("Organization + Dashboard", results[3]),
        ("AI CFO Chat", results[4])
    ], 1):
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{i}. {check_name}: {status}")
    
    print('='*80)
    
    total_passed = sum(results)
    total_checks = len(results)
    print(f"\nResult: {total_passed}/{total_checks} checks passed")
    
    if total_passed == total_checks:
        print("\n🎉 ALL CHECKS PASSED - Deployment ready!")
        sys.exit(0)
    else:
        print(f"\n⚠️  {total_checks - total_passed} check(s) failed - Review required")
        sys.exit(1)

if __name__ == "__main__":
    main()
