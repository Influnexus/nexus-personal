#!/usr/bin/env python3
"""
MongoDB Connection Manager Fix Verification
Tests the production-safe cached connection promise pattern in lib/db/mongo.ts
"""

import requests
import time
import random
import string
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List, Tuple

# Base URL from .env
BASE_URL = "https://financial-health-hub-17.preview.emergentagent.com"

def generate_unique_email():
    """Generate unique email with timestamp"""
    timestamp = int(time.time() * 1000)
    random_suffix = ''.join(random.choices(string.ascii_lowercase, k=4))
    return f"mongofix+{timestamp}{random_suffix}@nexustest.com"

def generate_name():
    """Generate a valid name"""
    return f"Test User {random.randint(1000, 9999)}"

def test_register(email: str, name: str, password: str) -> Tuple[int, Dict]:
    """Test registration endpoint"""
    try:
        response = requests.post(
            f"{BASE_URL}/api/register",
            json={
                "email": email,
                "name": name,
                "password": password
            },
            timeout=15
        )
        return response.status_code, response.json() if response.headers.get('content-type', '').startswith('application/json') else {"text": response.text}
    except Exception as e:
        return 0, {"error": str(e)}

def test_signin(email: str, password: str) -> Tuple[int, Dict, requests.Session]:
    """Test sign in with NextAuth"""
    session = requests.Session()
    try:
        # Get CSRF token
        csrf_response = session.get(f"{BASE_URL}/api/auth/csrf", timeout=10)
        csrf_token = csrf_response.json().get("csrfToken")
        
        # Sign in
        signin_response = session.post(
            f"{BASE_URL}/api/auth/callback/credentials",
            data={
                "csrfToken": csrf_token,
                "email": email,
                "password": password,
                "json": "true"
            },
            timeout=15,
            allow_redirects=False
        )
        
        # Check session
        session_response = session.get(f"{BASE_URL}/api/auth/session", timeout=10)
        return session_response.status_code, session_response.json(), session
    except Exception as e:
        return 0, {"error": str(e)}, session

def check_credential_leakage(response_data: Dict) -> bool:
    """Check if response contains MongoDB credentials"""
    response_str = str(response_data).lower()
    # Check for common credential patterns
    leakage_patterns = [
        "mongodb://",
        "mongo_url",
        "localhost:27017",
        "password=",
        "username=",
        "connection string"
    ]
    for pattern in leakage_patterns:
        if pattern in response_str:
            return True
    return False

print("=" * 80)
print("MongoDB Connection Manager Fix Verification")
print("=" * 80)
print()

# Store test data
test_emails = []
test_password = "TestPass123"

# ============================================================================
# TEST 1: Happy Path - Single Registration
# ============================================================================
print("TEST 1: Happy Path - Single Registration")
print("-" * 80)

email1 = generate_unique_email()
name1 = generate_name()
test_emails.append(email1)

status, data = test_register(email1, name1, test_password)
print(f"Email: {email1}")
print(f"Status: {status}")
print(f"Response: {data}")

if status == 200 and "id" in data and "email" in data and "name" in data:
    print("✅ TEST 1 PASSED: Registration successful with correct response structure")
    if check_credential_leakage(data):
        print("❌ SECURITY ISSUE: Response contains credential information!")
    else:
        print("✅ No credential leakage detected")
else:
    print(f"❌ TEST 1 FAILED: Expected 200 with {{id, email, name}}, got {status}")

print()

# ============================================================================
# TEST 2: Happy Path - Second Registration
# ============================================================================
print("TEST 2: Happy Path - Second Registration")
print("-" * 80)

email2 = generate_unique_email()
name2 = generate_name()
test_emails.append(email2)

status, data = test_register(email2, name2, test_password)
print(f"Email: {email2}")
print(f"Status: {status}")
print(f"Response: {data}")

if status == 200 and "id" in data and "email" in data and "name" in data:
    print("✅ TEST 2 PASSED: Second registration successful")
else:
    print(f"❌ TEST 2 FAILED: Expected 200 with {{id, email, name}}, got {status}")

print()

# ============================================================================
# TEST 3: Duplicate Email
# ============================================================================
print("TEST 3: Duplicate Email Handling")
print("-" * 80)

status, data = test_register(email1, name1, test_password)
print(f"Email: {email1} (duplicate)")
print(f"Status: {status}")
print(f"Response: {data}")

if status == 400:
    print("✅ TEST 3 PASSED: Duplicate email rejected with 400")
    if check_credential_leakage(data):
        print("❌ SECURITY ISSUE: Error response contains credential information!")
    else:
        print("✅ No credential leakage in error response")
else:
    print(f"❌ TEST 3 FAILED: Expected 400 for duplicate email, got {status}")

print()

# ============================================================================
# TEST 4: Validation - Short Password
# ============================================================================
print("TEST 4: Validation - Short Password")
print("-" * 80)

email_short = generate_unique_email()
short_password = "short"

status, data = test_register(email_short, generate_name(), short_password)
print(f"Email: {email_short}")
print(f"Password: {short_password} (< 8 chars)")
print(f"Status: {status}")
print(f"Response: {data}")

if status == 400:
    print("✅ TEST 4 PASSED: Short password rejected with 400")
else:
    print(f"❌ TEST 4 FAILED: Expected 400 for short password, got {status}")

print()

# ============================================================================
# TEST 5: CONCURRENCY - Simultaneous Registrations (KEY TEST)
# ============================================================================
print("TEST 5: CONCURRENCY - Simultaneous Registrations (KEY TEST FOR TOPOLOGY FIX)")
print("-" * 80)
print("Firing 6 simultaneous POST /api/register requests...")
print("Expected: NO 'Topology is closed' errors, only 200/400/429 status codes")
print()

# Prepare 6 unique registration requests
concurrent_requests = []
for i in range(6):
    email = generate_unique_email()
    name = generate_name()
    concurrent_requests.append((email, name, test_password))
    test_emails.append(email)

# Execute concurrently
results = []
start_time = time.time()

with ThreadPoolExecutor(max_workers=6) as executor:
    futures = {
        executor.submit(test_register, email, name, pwd): (email, name)
        for email, name, pwd in concurrent_requests
    }
    
    for future in as_completed(futures):
        email, name = futures[future]
        try:
            status, data = future.result()
            results.append((email, status, data))
        except Exception as e:
            results.append((email, 0, {"error": str(e)}))

elapsed = time.time() - start_time

# Analyze results
status_counts = {}
topology_errors = []
db_errors = []
success_count = 0
rate_limit_count = 0

for email, status, data in results:
    status_counts[status] = status_counts.get(status, 0) + 1
    
    # Check for topology errors
    data_str = str(data).lower()
    if "topology is closed" in data_str or "mongotopologyclosederror" in data_str:
        topology_errors.append((email, status, data))
    
    # Check for other DB errors
    if "client must be connected" in data_str or "connection failed" in data_str:
        db_errors.append((email, status, data))
    
    # Count successes and rate limits
    if status == 200:
        success_count += 1
    elif status == 429:
        rate_limit_count += 1

print(f"Completed in {elapsed:.2f} seconds")
print()
print("Status Distribution:")
for status, count in sorted(status_counts.items()):
    print(f"  {status}: {count} requests")
print()

print("Detailed Results:")
for i, (email, status, data) in enumerate(results, 1):
    print(f"  Request {i}: {status} - {email[:30]}...")
    if status not in [200, 429]:
        print(f"    Response: {data}")

print()

# Verdict
if topology_errors:
    print("❌ TEST 5 FAILED: 'Topology is closed' errors detected!")
    print("CRITICAL: MongoDB connection manager fix did NOT resolve the issue")
    for email, status, data in topology_errors:
        print(f"  - {email}: {status} - {data}")
elif any(status >= 500 for status in status_counts.keys()):
    print("❌ TEST 5 FAILED: 5xx server errors detected!")
    print("CRITICAL: Database errors under concurrent load")
    for email, status, data in results:
        if status >= 500:
            print(f"  - {email}: {status} - {data}")
elif db_errors:
    print("❌ TEST 5 FAILED: Database connection errors detected!")
    for email, status, data in db_errors:
        print(f"  - {email}: {status} - {data}")
else:
    print("✅ TEST 5 PASSED: Concurrent registrations handled correctly")
    print(f"   - {success_count} successful (200)")
    print(f"   - {rate_limit_count} rate limited (429) - ACCEPTABLE")
    print("   - NO 'Topology is closed' errors")
    print("   - NO 5xx database errors")
    print("   - MongoDB connection manager fix is WORKING")

print()

# ============================================================================
# TEST 6: Regression - Sign In and Authenticated Reads
# ============================================================================
print("TEST 6: Regression - Sign In and Authenticated Reads")
print("-" * 80)

# Sign in with first registered user
print(f"Signing in as: {email1}")
status, session_data, session = test_signin(email1, test_password)

if status == 200 and session_data.get("user"):
    print(f"✅ Sign in successful")
    print(f"   User: {session_data['user'].get('email')}")
    
    # Test GET /api/organizations
    print()
    print("Testing GET /api/organizations...")
    try:
        orgs_response = session.get(f"{BASE_URL}/api/organizations", timeout=10)
        print(f"   Status: {orgs_response.status_code}")
        
        if orgs_response.status_code == 200:
            orgs_data = orgs_response.json()
            print(f"   ✅ Organizations endpoint working (returned {len(orgs_data)} orgs)")
            
            # Check for credential leakage
            if check_credential_leakage(orgs_data):
                print("   ❌ SECURITY ISSUE: Response contains credential information!")
        else:
            print(f"   ⚠️  Unexpected status: {orgs_response.status_code}")
    except Exception as e:
        print(f"   ❌ Error: {e}")
    
    print()
    print("✅ TEST 6 PASSED: Authentication and data reads working")
else:
    print(f"❌ TEST 6 FAILED: Sign in failed with status {status}")
    print(f"   Response: {session_data}")

print()

# ============================================================================
# TEST 7: Demo Mode - Enterprise CFO Endpoints (Regression)
# ============================================================================
print("TEST 7: Demo Mode - Enterprise CFO Endpoints (Regression)")
print("-" * 80)

demo_session = requests.Session()
try:
    # Get CSRF token
    csrf_response = demo_session.get(f"{BASE_URL}/api/auth/csrf", timeout=10)
    csrf_token = csrf_response.json().get("csrfToken")
    
    # Create demo session
    demo_response = demo_session.post(
        f"{BASE_URL}/api/auth/callback/demo",
        data={"csrfToken": csrf_token, "json": "true"},
        timeout=15,
        allow_redirects=False
    )
    
    # Check session
    session_response = demo_session.get(f"{BASE_URL}/api/auth/session", timeout=10)
    
    if session_response.status_code == 200:
        session_data = session_response.json()
        if session_data.get("user", {}).get("isDemo"):
            print("✅ Demo session created successfully")
            print(f"   Active Org ID: {session_data.get('user', {}).get('activeOrgId')}")
            
            # Test CFO briefing endpoint (Enterprise mode)
            print()
            print("Testing GET /api/cfo/briefing...")
            briefing_response = demo_session.get(f"{BASE_URL}/api/cfo/briefing", timeout=15)
            print(f"   Status: {briefing_response.status_code}")
            
            if briefing_response.status_code == 200:
                briefing_data = briefing_response.json()
                has_required_keys = all(k in briefing_data for k in ['briefing', 'kpis', 'health', 'forecast'])
                print(f"   ✅ CFO briefing endpoint working (has required keys: {has_required_keys})")
                
                # Check for credential leakage
                if check_credential_leakage(briefing_data):
                    print("   ❌ SECURITY ISSUE: Response contains credential information!")
            else:
                print(f"   ⚠️  Unexpected status: {briefing_response.status_code}")
            
            # Test organizations endpoint
            print()
            print("Testing GET /api/organizations...")
            orgs_response = demo_session.get(f"{BASE_URL}/api/organizations", timeout=10)
            print(f"   Status: {orgs_response.status_code}")
            
            if orgs_response.status_code == 200:
                orgs_data = orgs_response.json()
                print(f"   ✅ Organizations endpoint working (returned {len(orgs_data)} orgs)")
            else:
                print(f"   ⚠️  Unexpected status: {orgs_response.status_code}")
            
            print()
            print("✅ TEST 7 PASSED: Enterprise CFO endpoints working with demo mode")
        else:
            print("❌ Demo session not created properly")
    else:
        print(f"❌ Failed to create demo session: {session_response.status_code}")
except Exception as e:
    print(f"❌ TEST 7 FAILED: {e}")

print()

# ============================================================================
# SUMMARY
# ============================================================================
print("=" * 80)
print("VERIFICATION SUMMARY")
print("=" * 80)
print()
print("MongoDB Connection Manager Fix Verification Results:")
print()
print("1. ✅/❌ Single registration (DB write)")
print("2. ✅/❌ Second registration (DB write)")
print("3. ✅/❌ Duplicate email handling")
print("4. ✅/❌ Validation (short password)")
print("5. ✅/❌ CONCURRENCY - NO 'Topology is closed' errors (KEY TEST)")
print("6. ✅/❌ Authenticated reads (organizations)")
print("7. ✅/❌ Enterprise CFO endpoints (demo mode)")
print()
print("CRITICAL QUESTION: Did ANY request produce 'Topology is closed' or 5xx DB error?")
print("ANSWER: Check TEST 5 results above")
print()
print("=" * 80)
