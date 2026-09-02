#!/usr/bin/env python3
"""
P6 DATA-INTEGRITY OVERHAUL + FINANCIAL FREEDOM VERIFICATION
Tests the production-reported bugs fixes for Nexus Personal:
- Bug #1: Profile values must persist exactly (no ~30000/2000 demo numbers)
- Bug #2: No fabricated transactions for real users (empty state when no imports)
- Bug #3: Single source of truth across all features
- Bug #7: Data isolation between users
- Bug #8: Profile updates propagate everywhere
- Bug #9: Financial Freedom feature working correctly
- Bug #11: Cross-user data isolation
"""

import requests
import time
import random
import string
import json
from typing import Dict, Tuple

# Base URL from .env
BASE_URL = "https://financial-health-hub-17.preview.emergentagent.com"

# Rate limits: register 8/10min/IP, onboarding 5/10min, chat 15/min
# We'll pace requests to stay under limits

def generate_unique_email():
    """Generate unique email with timestamp for P6 testing"""
    timestamp = int(time.time() * 1000)
    random_suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=4))
    return f"p6user_{random_suffix}_{timestamp}@nexustest.com"

def generate_name():
    """Generate a realistic name"""
    first_names = ["Priya", "Rahul", "Ananya", "Arjun", "Sneha", "Vikram", "Meera", "Rohan"]
    last_names = ["Sharma", "Patel", "Kumar", "Singh", "Reddy", "Iyer", "Gupta", "Mehta"]
    return f"{random.choice(first_names)} {random.choice(last_names)}"

def register_user(email: str, name: str, password: str) -> Tuple[int, Dict]:
    """Register a new user"""
    try:
        response = requests.post(
            f"{BASE_URL}/api/register",
            json={"email": email, "name": name, "password": password},
            timeout=15
        )
        return response.status_code, response.json() if response.headers.get('content-type', '').startswith('application/json') else {"text": response.text}
    except Exception as e:
        return 0, {"error": str(e)}

def signin_user(email: str, password: str) -> Tuple[int, Dict, requests.Session]:
    """Sign in and return authenticated session"""
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

def onboard_personal(session: requests.Session, profile: Dict) -> Tuple[int, Dict]:
    """POST /api/personal/onboarding"""
    try:
        response = session.post(
            f"{BASE_URL}/api/personal/onboarding",
            json=profile,
            timeout=15
        )
        return response.status_code, response.json() if response.headers.get('content-type', '').startswith('application/json') else {"text": response.text}
    except Exception as e:
        return 0, {"error": str(e)}

def get_onboarding_profile(session: requests.Session) -> Tuple[int, Dict]:
    """GET /api/personal/onboarding"""
    try:
        response = session.get(f"{BASE_URL}/api/personal/onboarding", timeout=10)
        return response.status_code, response.json() if response.headers.get('content-type', '').startswith('application/json') else {"text": response.text}
    except Exception as e:
        return 0, {"error": str(e)}

def get_financial_freedom(session: requests.Session) -> Tuple[int, Dict]:
    """GET /api/personal/financial-freedom"""
    try:
        response = session.get(f"{BASE_URL}/api/personal/financial-freedom", timeout=10)
        return response.status_code, response.json() if response.headers.get('content-type', '').startswith('application/json') else {"text": response.text}
    except Exception as e:
        return 0, {"error": str(e)}

def get_forecast(session: requests.Session) -> Tuple[int, Dict]:
    """GET /api/personal/forecast"""
    try:
        response = session.get(f"{BASE_URL}/api/personal/forecast", timeout=10)
        return response.status_code, response.json() if response.headers.get('content-type', '').startswith('application/json') else {"text": response.text}
    except Exception as e:
        return 0, {"error": str(e)}

def evaluate_scenarios(session: requests.Session, levers: Dict = None) -> Tuple[int, Dict]:
    """POST /api/personal/scenarios/evaluate"""
    try:
        response = session.post(
            f"{BASE_URL}/api/personal/scenarios/evaluate",
            json={"levers": levers or {}},
            timeout=15
        )
        return response.status_code, response.json() if response.headers.get('content-type', '').startswith('application/json') else {"text": response.text}
    except Exception as e:
        return 0, {"error": str(e)}

def chat_personal(session: requests.Session, message: str) -> Tuple[int, str]:
    """POST /api/personal/chat - SSE streaming"""
    try:
        response = session.post(
            f"{BASE_URL}/api/personal/chat",
            json={"messages": [{"role": "user", "content": message}]},
            timeout=60,
            stream=True
        )
        
        if response.status_code != 200:
            return response.status_code, response.text
        
        # Parse SSE events (with named events: event: token, event: tool_start, etc.)
        full_text = ""
        current_event = None
        for line in response.iter_lines():
            if line:
                line_str = line.decode('utf-8')
                if line_str.startswith('event: '):
                    current_event = line_str[7:].strip()
                elif line_str.startswith('data: '):
                    try:
                        data = json.loads(line_str[6:])
                        # For 'token' events, accumulate the delta
                        if current_event == 'token' and 'delta' in data:
                            full_text += data['delta']
                    except:
                        pass
        
        return response.status_code, full_text
    except Exception as e:
        return 0, str(e)

print("=" * 100)
print("P6 DATA-INTEGRITY OVERHAUL + FINANCIAL FREEDOM VERIFICATION")
print("=" * 100)
print()
print("Testing production-reported bugs fixes:")
print("  - Bug #1: Profile values persist exactly (no demo numbers)")
print("  - Bug #2: No fabricated transactions (empty state)")
print("  - Bug #3: Single source of truth across all features")
print("  - Bug #7: Data isolation between users")
print("  - Bug #8: Profile updates propagate")
print("  - Bug #9: Financial Freedom working")
print("  - Bug #11: Cross-user isolation")
print()
print("=" * 100)
print()

# ============================================================================
# TEST 1: ARBITRARY NEW REGISTRATION + PERSISTENCE (Bug #3, #8)
# ============================================================================
print("TEST 1: ARBITRARY NEW REGISTRATION + PERSISTENCE (Bug #3, #8)")
print("-" * 100)
print()

# User A profile - CANONICAL TEST PROFILE
user_a_profile = {
    "monthlyIncome": 100000,
    "essentialMonthly": 45000,
    "discretionaryMonthly": 20000,
    "cash": 300000,
    "investments": 500000,
    "totalDebt": 0,
    "monthlyDebtPayment": 0,
    "currency": "INR"
}

# Expected computed values
expected_a = {
    "monthlyExpenses": 65000,  # 45000 + 20000
    "monthlySurplus": 35000,   # 100000 - 65000
    "savingsRate": 0.35,       # 35000 / 100000
    "cash": 300000,
    "investments": 500000,
    "financialAssets": 800000  # 300000 + 500000
}

print("Step 1a: Register User A with arbitrary new email")
user_a_email = generate_unique_email()
user_a_name = generate_name()
user_a_password = "SecurePass123!"

print(f"  Email: {user_a_email}")
print(f"  Name: {user_a_name}")

status, data = register_user(user_a_email, user_a_name, user_a_password)
print(f"  Status: {status}")

if status == 200 and "id" in data and "email" in data:
    print("  ✅ Registration successful")
    user_a_id = data["id"]
else:
    print(f"  ❌ Registration failed: {data}")
    exit(1)

print()
time.sleep(1)  # Rate limit pacing

print("Step 1b: Login User A")
status, session_data, user_a_session = signin_user(user_a_email, user_a_password)
print(f"  Status: {status}")

if status == 200 and session_data.get("user"):
    print(f"  ✅ Login successful")
    print(f"     User ID: {session_data['user'].get('id')}")
else:
    print(f"  ❌ Login failed: {session_data}")
    exit(1)

print()
time.sleep(1)

print("Step 1c: POST /api/personal/onboarding with User A profile")
print(f"  Profile: {json.dumps(user_a_profile, indent=4)}")

status, onboard_data = onboard_personal(user_a_session, user_a_profile)
print(f"  Status: {status}")

if status == 200:
    print("  ✅ Onboarding successful")
    print(f"  Response: {json.dumps(onboard_data, indent=4)}")
    
    # Verify summary metrics
    if "summary" in onboard_data and "metrics" in onboard_data["summary"]:
        metrics = onboard_data["summary"]["metrics"]
        print()
        print("  Verifying computed metrics:")
        
        checks = [
            ("monthlyExpenses", expected_a["monthlyExpenses"], metrics.get("monthlyExpenses")),
            ("monthlySurplus", expected_a["monthlySurplus"], metrics.get("monthlySurplus")),
            ("savingsRate", expected_a["savingsRate"], metrics.get("savingsRate")),
            ("cash", expected_a["cash"], metrics.get("cash")),
            ("investments", expected_a["investments"], metrics.get("investments")),
            ("financialAssets", expected_a["financialAssets"], metrics.get("financialAssets"))
        ]
        
        all_correct = True
        for field, expected, actual in checks:
            match = expected == actual
            symbol = "✅" if match else "❌"
            print(f"    {symbol} {field}: expected {expected}, got {actual}")
            if not match:
                all_correct = False
        
        if all_correct:
            print("  ✅ All computed metrics match expected values")
        else:
            print("  ❌ Some metrics don't match - POTENTIAL BUG")
    else:
        print("  ⚠️  No summary.metrics in response")
else:
    print(f"  ❌ Onboarding failed: {onboard_data}")
    exit(1)

print()
time.sleep(2)  # Rate limit pacing

print("Step 1d: GET /api/personal/onboarding - Verify persistence")
status, profile_data = get_onboarding_profile(user_a_session)
print(f"  Status: {status}")

if status == 200:
    print("  ✅ Profile retrieved")
    
    if "profile" in profile_data:
        profile = profile_data["profile"]
        print()
        print("  Verifying profile persistence (input == stored):")
        
        profile_checks = [
            ("monthlyIncome", user_a_profile["monthlyIncome"], profile.get("monthlyIncome")),
            ("essentialMonthly", user_a_profile["essentialMonthly"], profile.get("essentialMonthly")),
            ("discretionaryMonthly", user_a_profile["discretionaryMonthly"], profile.get("discretionaryMonthly")),
            ("cash", user_a_profile["cash"], profile.get("cash")),
            ("investments", user_a_profile["investments"], profile.get("investments")),
            ("totalDebt", user_a_profile["totalDebt"], profile.get("totalDebt")),
            ("monthlyDebtPayment", user_a_profile["monthlyDebtPayment"], profile.get("monthlyDebtPayment"))
        ]
        
        all_persisted = True
        for field, expected, actual in profile_checks:
            match = expected == actual
            symbol = "✅" if match else "❌"
            print(f"    {symbol} {field}: expected {expected}, got {actual}")
            if not match:
                all_persisted = False
        
        if all_persisted:
            print("  ✅ TEST 1 PASSED: Profile persists EXACTLY (Bug #3, #8 fixed)")
        else:
            print("  ❌ TEST 1 FAILED: Profile values don't match input (Bug #3, #8 NOT fixed)")
    else:
        print("  ❌ No profile in response")
else:
    print(f"  ❌ Failed to retrieve profile: {profile_data}")

print()
print("=" * 100)
print()

# ============================================================================
# TEST 2: ONE SOURCE OF TRUTH - All features use same values (Bug #1, #7)
# ============================================================================
print("TEST 2: ONE SOURCE OF TRUTH - All features use same values (Bug #1, #7)")
print("-" * 100)
print()

print("Testing that ALL endpoints reflect User A's profile values:")
print(f"  Expected: income=100000, essential=45000, lifestyle=20000, surplus=35000, assets=800000")
print()

# Test 2a: GET /api/personal/forecast
print("Test 2a: GET /api/personal/forecast")
status, forecast_data = get_forecast(user_a_session)
print(f"  Status: {status}")

if status == 200:
    print("  ✅ Forecast retrieved")
    
    if "metrics" in forecast_data:
        metrics = forecast_data["metrics"]
        print(f"  Metrics:")
        print(f"    monthlyIncome: {metrics.get('monthlyIncome')} (expected 100000)")
        print(f"    monthlyExpenses: {metrics.get('monthlyExpenses')} (expected 65000)")
        print(f"    monthlySurplus: {metrics.get('monthlySurplus')} (expected 35000)")
        print(f"    savingsRate: {metrics.get('savingsRate')} (expected 0.35)")
        
        forecast_correct = (
            metrics.get('monthlyIncome') == 100000 and
            metrics.get('monthlyExpenses') == 65000 and
            metrics.get('monthlySurplus') == 35000 and
            abs(metrics.get('savingsRate', 0) - 0.35) < 0.01
        )
        
        if forecast_correct:
            print("  ✅ Forecast metrics match User A's profile")
        else:
            print("  ❌ Forecast metrics DON'T match (Bug #1, #7 NOT fixed)")
    
    if "projections" in forecast_data:
        proj = forecast_data["projections"]
        print(f"  Projections:")
        print(f"    startingCash: {proj.get('startingCash')} (expected 300000)")
        expected_day90 = 300000 + 35000 * 3  # 405000
        print(f"    day90: {proj.get('day90')} (expected {expected_day90})")
        
        if proj.get('startingCash') == 300000 and proj.get('day90') == expected_day90:
            print("  ✅ Projections match User A's profile")
        else:
            print("  ❌ Projections DON'T match")
    
    if "sensitivities" in forecast_data:
        print(f"  Sensitivities: {len(forecast_data['sensitivities'])} scenarios present")
    
    print(f"  hasTransactions: {forecast_data.get('hasTransactions')} (expected False)")
    
    if forecast_data.get('hasTransactions') == False:
        print("  ✅ hasTransactions=False (no fabricated transactions)")
    else:
        print("  ⚠️  hasTransactions should be False for new user")
else:
    print(f"  ❌ Forecast failed: {forecast_data}")

print()
time.sleep(1)

# Test 2b: GET /api/personal/financial-freedom
print("Test 2b: GET /api/personal/financial-freedom")
status, fi_data = get_financial_freedom(user_a_session)
print(f"  Status: {status}")

if status == 200:
    print("  ✅ Financial Freedom retrieved")
    
    if "freedom" in fi_data:
        freedom = fi_data["freedom"]
        print(f"  Financial Freedom data:")
        print(f"    essentialAnnual: {freedom.get('essentialAnnual')} (expected 540000 = 45000*12)")
        print(f"    fiTarget: {freedom.get('fiTarget')} (expected 13500000 = 540000*25)")
        print(f"    currentAssets: {freedom.get('currentAssets')} (expected 800000)")
        print(f"    fiGap: {freedom.get('fiGap')} (expected 12700000)")
        print(f"    fiProgressPct: {freedom.get('fiProgressPct')} (expected ~5.93)")
        print(f"    monthlySurplus: {freedom.get('monthlySurplus')} (expected 35000)")
        print(f"    savingsRate: {freedom.get('savingsRate')} (expected 0.35)")
        print(f"    monthsToFI: {freedom.get('monthsToFI')} (expected ~363)")
        
        fi_correct = (
            freedom.get('essentialAnnual') == 540000 and
            freedom.get('fiTarget') == 13500000 and
            freedom.get('currentAssets') == 800000 and
            freedom.get('fiGap') == 12700000 and
            abs(freedom.get('fiProgressPct', 0) - 5.93) < 0.1 and
            freedom.get('monthlySurplus') == 35000 and
            abs(freedom.get('savingsRate', 0) - 0.35) < 0.01
        )
        
        if fi_correct:
            print("  ✅ Financial Freedom values match User A's profile EXACTLY")
        else:
            print("  ❌ Financial Freedom values DON'T match (Bug #1, #7 NOT fixed)")
    else:
        print("  ❌ No freedom data in response")
else:
    print(f"  ❌ Financial Freedom failed: {fi_data}")

print()
time.sleep(1)

# Test 2c: POST /api/personal/scenarios/evaluate (baseline)
print("Test 2c: POST /api/personal/scenarios/evaluate (baseline)")
status, scenario_data = evaluate_scenarios(user_a_session, {})
print(f"  Status: {status}")

if status == 200:
    print("  ✅ Scenarios retrieved")
    
    if "baseline" in scenario_data:
        baseline = scenario_data["baseline"]
        print(f"  Baseline scenario:")
        print(f"    monthlySurplus: {baseline.get('monthlySurplus')} (expected ~35000)")
        
        if abs(baseline.get('monthlySurplus', 0) - 35000) < 1000:
            print("  ✅ Baseline scenario reflects User A's data")
        else:
            print("  ❌ Baseline scenario doesn't match (Bug #1, #7 NOT fixed)")
    else:
        print("  ⚠️  No baseline in response")
else:
    print(f"  ❌ Scenarios failed: {scenario_data}")

print()
time.sleep(2)

# Test 2d: POST /api/personal/chat - Ask Nexus
print("Test 2d: POST /api/personal/chat - Ask Nexus")
print("  Message: 'What is my monthly surplus and how financially free am I?'")

status, chat_response = chat_personal(user_a_session, "What is my monthly surplus and how financially free am I?")
print(f"  Status: {status}")

if status == 200:
    print("  ✅ Chat response received")
    print(f"  Response length: {len(chat_response)} chars")
    print(f"  Response preview: {chat_response[:300]}...")
    
    # Check if response mentions the correct numbers
    has_surplus = "35,000" in chat_response or "35000" in chat_response or "₹35,000" in chat_response
    has_fi_target = "1,35,00,000" in chat_response or "13,500,000" in chat_response or "13.5" in chat_response
    has_progress = "5.9" in chat_response or "6%" in chat_response
    
    print()
    print("  Checking if response cites correct numbers:")
    print(f"    {'✅' if has_surplus else '❌'} Mentions surplus ₹35,000")
    print(f"    {'✅' if has_fi_target else '❌'} Mentions FI target ₹1,35,00,000")
    print(f"    {'✅' if has_progress else '❌'} Mentions progress ~5.9%")
    
    if has_surplus and (has_fi_target or has_progress):
        print("  ✅ Chat response cites User A's actual numbers (Bug #1, #7 fixed)")
    else:
        print("  ❌ Chat response doesn't cite correct numbers (Bug #1, #7 NOT fixed)")
else:
    print(f"  ❌ Chat failed: {chat_response}")

print()
print("=" * 100)
print()

# ============================================================================
# TEST 3: NO FABRICATED TRANSACTIONS / EMPTY STATE (Bug #2, #9)
# ============================================================================
print("TEST 3: NO FABRICATED TRANSACTIONS / EMPTY STATE (Bug #2, #9)")
print("-" * 100)
print()

print("User A has imported NO transactions - verifying empty state:")
print()

# Test 3a: Verify hasTransactions=false in forecast
print("Test 3a: Verify hasTransactions=false in forecast")
status, forecast_data = get_forecast(user_a_session)

if status == 200 and forecast_data.get('hasTransactions') == False:
    print("  ✅ Forecast confirms hasTransactions=false")
else:
    print(f"  ❌ hasTransactions should be false, got: {forecast_data.get('hasTransactions')}")

print()
time.sleep(2)

# Test 3b: Chat about spending breakdown
print("Test 3b: POST /api/personal/chat - Ask about spending breakdown")
print("  Message: 'Where am I spending the most? Break down my spending by category.'")

status, chat_response = chat_personal(user_a_session, "Where am I spending the most? Break down my spending by category.")
print(f"  Status: {status}")

if status == 200:
    print("  ✅ Chat response received")
    print(f"  Response length: {len(chat_response)} chars")
    print(f"  Response preview: {chat_response[:400]}...")
    
    # Check that response does NOT list fabricated categories
    fabricated_categories = ["Housing", "Groceries", "Transportation", "Utilities", "Insurance"]
    has_fabricated = any(cat in chat_response for cat in fabricated_categories)
    has_no_data_message = any(phrase in chat_response.lower() for phrase in [
        "no transaction", "haven't imported", "no data", "no spending data", 
        "import your transactions", "upload", "no records"
    ])
    
    print()
    print("  Checking response:")
    print(f"    {'❌' if has_fabricated else '✅'} Does NOT list Housing/Groceries/Transportation/Utilities/Insurance")
    print(f"    {'✅' if has_no_data_message else '❌'} Says there is no transaction data yet")
    
    if not has_fabricated and has_no_data_message:
        print("  ✅ TEST 3b PASSED: No fabricated spending categories (Bug #2, #9 fixed)")
    else:
        print("  ❌ TEST 3b FAILED: Either fabricated categories present or no empty state message")
else:
    print(f"  ❌ Chat failed: {chat_response}")

print()
time.sleep(2)

# Test 3c: Chat about recurring bills
print("Test 3c: POST /api/personal/chat - Ask about recurring bills")
print("  Message: 'What are my recurring bills?'")

status, chat_response = chat_personal(user_a_session, "What are my recurring bills?")
print(f"  Status: {status}")

if status == 200:
    print("  ✅ Chat response received")
    print(f"  Response preview: {chat_response[:300]}...")
    
    has_no_data = any(phrase in chat_response.lower() for phrase in [
        "no transaction", "no data", "no recurring", "haven't imported", "no records"
    ])
    
    if has_no_data:
        print("  ✅ TEST 3c PASSED: No fabricated recurring bills (Bug #2, #9 fixed)")
    else:
        print("  ⚠️  Response doesn't clearly indicate no data")
else:
    print(f"  ❌ Chat failed: {chat_response}")

print()
print("=" * 100)
print()

# ============================================================================
# TEST 4: DATA ISOLATION A ≠ B (Bug #11)
# ============================================================================
print("TEST 4: DATA ISOLATION A ≠ B (Bug #11)")
print("-" * 100)
print()

print("Step 4a: Register User B with DIFFERENT profile")

user_b_profile = {
    "monthlyIncome": 250000,
    "essentialMonthly": 90000,
    "discretionaryMonthly": 40000,
    "cash": 1200000,
    "investments": 2000000,
    "totalDebt": 0,
    "monthlyDebtPayment": 0,
    "currency": "INR"
}

expected_b = {
    "currentAssets": 3200000,  # 1200000 + 2000000
    "essentialAnnual": 1080000,  # 90000 * 12
    "fiTarget": 27000000,  # 1080000 * 25
    "monthlySurplus": 120000  # 250000 - 130000
}

user_b_email = generate_unique_email()
user_b_name = generate_name()
user_b_password = "SecurePass456!"

print(f"  Email: {user_b_email}")
print(f"  Name: {user_b_name}")

status, data = register_user(user_b_email, user_b_name, user_b_password)
print(f"  Status: {status}")

if status == 200:
    print("  ✅ User B registered")
else:
    print(f"  ❌ Registration failed: {data}")
    # Continue anyway to test other scenarios

print()
time.sleep(1)

print("Step 4b: Login User B")
status, session_data, user_b_session = signin_user(user_b_email, user_b_password)

if status == 200 and session_data.get("user"):
    print("  ✅ User B logged in")
else:
    print(f"  ❌ Login failed: {session_data}")

print()
time.sleep(1)

print("Step 4c: Onboard User B with different values")
print(f"  Profile: income=250000, essential=90000, lifestyle=40000, cash=1200000, investments=2000000")

status, onboard_data = onboard_personal(user_b_session, user_b_profile)

if status == 200:
    print("  ✅ User B onboarded")
else:
    print(f"  ❌ Onboarding failed: {onboard_data}")

print()
time.sleep(2)

print("Step 4d: GET /api/personal/financial-freedom as User B")
status, fi_data_b = get_financial_freedom(user_b_session)

if status == 200 and "freedom" in fi_data_b:
    freedom_b = fi_data_b["freedom"]
    print("  ✅ User B Financial Freedom retrieved")
    print(f"  User B data:")
    print(f"    currentAssets: {freedom_b.get('currentAssets')} (expected 3200000)")
    print(f"    essentialAnnual: {freedom_b.get('essentialAnnual')} (expected 1080000)")
    print(f"    fiTarget: {freedom_b.get('fiTarget')} (expected 27000000)")
    print(f"    monthlySurplus: {freedom_b.get('monthlySurplus')} (expected 120000)")
    
    b_correct = (
        freedom_b.get('currentAssets') == 3200000 and
        freedom_b.get('essentialAnnual') == 1080000 and
        freedom_b.get('fiTarget') == 27000000 and
        freedom_b.get('monthlySurplus') == 120000
    )
    
    if b_correct:
        print("  ✅ User B sees B's numbers")
    else:
        print("  ❌ User B's numbers don't match expected")
else:
    print(f"  ❌ Failed to get User B's FI data: {fi_data_b}")

print()
time.sleep(1)

print("Step 4e: Re-auth as User A and verify A still sees A's data")
status, session_data, user_a_session_2 = signin_user(user_a_email, user_a_password)

if status == 200:
    print("  ✅ User A re-authenticated")
    
    status, fi_data_a = get_financial_freedom(user_a_session_2)
    
    if status == 200 and "freedom" in fi_data_a:
        freedom_a = fi_data_a["freedom"]
        print(f"  User A data (should still be A's):")
        print(f"    currentAssets: {freedom_a.get('currentAssets')} (expected 800000, NOT 3200000)")
        print(f"    fiTarget: {freedom_a.get('fiTarget')} (expected 13500000, NOT 27000000)")
        
        a_still_correct = (
            freedom_a.get('currentAssets') == 800000 and
            freedom_a.get('fiTarget') == 13500000
        )
        
        if a_still_correct:
            print("  ✅ TEST 4 PASSED: User A never sees User B's data (Bug #11 fixed)")
        else:
            print("  ❌ TEST 4 FAILED: User A's data contaminated with B's data (Bug #11 NOT fixed)")
    else:
        print(f"  ❌ Failed to get User A's FI data")
else:
    print(f"  ❌ Re-auth failed")

print()
print("=" * 100)
print()

# ============================================================================
# TEST 5: PROFILE UPDATE PROPAGATION (Bug #8)
# ============================================================================
print("TEST 5: PROFILE UPDATE PROPAGATION (Bug #8)")
print("-" * 100)
print()

print("Step 5a: Update User A's profile with new values")

updated_profile = {
    "monthlyIncome": 120000,
    "essentialMonthly": 50000,
    "discretionaryMonthly": 25000,
    "cash": 400000,
    "investments": 600000,
    "totalDebt": 0,
    "monthlyDebtPayment": 0,
    "currency": "INR"
}

expected_updated = {
    "monthlySurplus": 45000,  # 120000 - 75000
    "currentAssets": 1000000,  # 400000 + 600000
    "essentialAnnual": 600000,  # 50000 * 12
    "fiTarget": 15000000  # 600000 * 25
}

print(f"  New profile: income=120000, essential=50000, lifestyle=25000, cash=400000, investments=600000")

status, update_data = onboard_personal(user_a_session_2, updated_profile)

if status == 200:
    print("  ✅ Profile updated")
    
    if "summary" in update_data and "metrics" in update_data["summary"]:
        metrics = update_data["summary"]["metrics"]
        print(f"  Updated metrics:")
        print(f"    monthlySurplus: {metrics.get('monthlySurplus')} (expected 45000)")
        
        if metrics.get('monthlySurplus') == 45000:
            print("  ✅ Summary reflects updated values")
        else:
            print("  ❌ Summary doesn't reflect update")
else:
    print(f"  ❌ Update failed: {update_data}")

print()
time.sleep(2)

print("Step 5b: Verify GET /api/personal/forecast reflects update")
status, forecast_data = get_forecast(user_a_session_2)

if status == 200 and "metrics" in forecast_data:
    metrics = forecast_data["metrics"]
    print(f"  Forecast metrics:")
    print(f"    monthlySurplus: {metrics.get('monthlySurplus')} (expected 45000)")
    
    if metrics.get('monthlySurplus') == 45000:
        print("  ✅ Forecast reflects update")
    else:
        print("  ❌ Forecast doesn't reflect update")
else:
    print(f"  ❌ Forecast failed")

print()
time.sleep(1)

print("Step 5c: Verify GET /api/personal/financial-freedom reflects update")
status, fi_data = get_financial_freedom(user_a_session_2)

if status == 200 and "freedom" in fi_data:
    freedom = fi_data["freedom"]
    print(f"  Financial Freedom:")
    print(f"    currentAssets: {freedom.get('currentAssets')} (expected 1000000)")
    print(f"    essentialAnnual: {freedom.get('essentialAnnual')} (expected 600000)")
    print(f"    fiTarget: {freedom.get('fiTarget')} (expected 15000000)")
    
    update_correct = (
        freedom.get('currentAssets') == 1000000 and
        freedom.get('essentialAnnual') == 600000 and
        freedom.get('fiTarget') == 15000000
    )
    
    if update_correct:
        print("  ✅ TEST 5 PASSED: Updates propagate to ALL features (Bug #8 fixed)")
    else:
        print("  ❌ TEST 5 FAILED: Updates don't propagate (Bug #8 NOT fixed)")
else:
    print(f"  ❌ FI failed")

print()
print("=" * 100)
print()

# ============================================================================
# TEST 6: DUPLICATE REGISTRATION
# ============================================================================
print("TEST 6: DUPLICATE REGISTRATION")
print("-" * 100)
print()

print(f"Attempting to register with User A's email again: {user_a_email}")
status, data = register_user(user_a_email, "Another Name", "AnotherPass123!")
print(f"  Status: {status}")

if status == 400:
    print("  ✅ TEST 6 PASSED: Duplicate registration rejected with 400")
else:
    print(f"  ❌ TEST 6 FAILED: Expected 400, got {status}")

print()
print("=" * 100)
print()

# ============================================================================
# TEST 7: REGRESSION - Enterprise CFO unaffected
# ============================================================================
print("TEST 7: REGRESSION - Enterprise CFO unaffected")
print("-" * 100)
print()

print("Creating demo session to test Enterprise CFO endpoints")

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
            print("  ✅ Demo session created")
            
            # Test CFO chat
            print()
            print("  Testing POST /api/cfo/chat/stream")
            
            chat_response = demo_session.post(
                f"{BASE_URL}/api/cfo/chat/stream",
                json={"messages": [{"role": "user", "content": "What is my current cash position?"}]},
                timeout=30,
                stream=True
            )
            
            print(f"    Status: {chat_response.status_code}")
            
            if chat_response.status_code == 200:
                # Check for $ in response (SSE with named events)
                response_text = ""
                current_event = None
                for line in chat_response.iter_lines():
                    if line:
                        line_str = line.decode('utf-8')
                        if line_str.startswith('event: '):
                            current_event = line_str[7:].strip()
                        elif line_str.startswith('data: '):
                            try:
                                data = json.loads(line_str[6:])
                                if current_event == 'token' and 'delta' in data:
                                    response_text += data['delta']
                            except:
                                pass
                
                has_dollar = "$" in response_text
                print(f"    Response contains $: {has_dollar}")
                
                if has_dollar:
                    print("  ✅ TEST 7 PASSED: Enterprise CFO chat still works (no regression)")
                else:
                    print("  ⚠️  Enterprise CFO chat works but no $ found in response")
            else:
                print(f"  ❌ TEST 7 FAILED: CFO chat returned {chat_response.status_code}")
        else:
            print("  ❌ Demo session not created properly")
    else:
        print(f"  ❌ Failed to create demo session: {session_response.status_code}")
except Exception as e:
    print(f"  ❌ TEST 7 FAILED: {e}")

print()
print("=" * 100)
print()

# ============================================================================
# SUMMARY
# ============================================================================
print("=" * 100)
print("P6 DATA-INTEGRITY VERIFICATION SUMMARY")
print("=" * 100)
print()
print("Test Results:")
print()
print("TEST 1: ✅/❌ Arbitrary new registration + persistence (Bug #3, #8)")
print("  - Profile values persist EXACTLY as input")
print("  - Computed metrics match expected values")
print()
print("TEST 2: ✅/❌ One source of truth across all features (Bug #1, #7)")
print("  - Forecast metrics match profile")
print("  - Financial Freedom values match profile")
print("  - Scenarios baseline matches profile")
print("  - Ask Nexus cites correct numbers")
print()
print("TEST 3: ✅/❌ No fabricated transactions / empty state (Bug #2, #9)")
print("  - hasTransactions=false for new user")
print("  - Chat doesn't list fabricated spending categories")
print("  - Chat says no transaction data when asked about spending/bills")
print()
print("TEST 4: ✅/❌ Data isolation A ≠ B (Bug #11)")
print("  - User B sees only B's data")
print("  - User A never sees B's data")
print()
print("TEST 5: ✅/❌ Profile update propagation (Bug #8)")
print("  - Updates propagate to Forecast")
print("  - Updates propagate to Financial Freedom")
print()
print("TEST 6: ✅/❌ Duplicate registration rejected")
print()
print("TEST 7: ✅/❌ Enterprise CFO regression check")
print("  - Demo mode still works")
print("  - CFO chat streams responses")
print()
print("=" * 100)
print()
print("CRITICAL QUESTIONS:")
print("1. Do onboarding values persist & re-fetch exactly? (TEST 1)")
print("2. Do Overview/Forecast/FinancialFreedom/Scenarios/Alerts/AskNexus ALL use same canonical profile? (TEST 2)")
print("3. Does no-transaction user get ZERO fabricated spending categories? (TEST 3)")
print("4. Is User A fully isolated from User B? (TEST 4)")
print("5. Do profile edits propagate everywhere? (TEST 5)")
print("6. Does arbitrary new registration work? (TEST 6)")
print("7. Enterprise regression OK? (TEST 7)")
print()
print("=" * 100)
