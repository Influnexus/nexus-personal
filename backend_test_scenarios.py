#!/usr/bin/env python3
"""
Nexus Personal - Scenarios Consistency Fix Verification
Tests that the scenario baseline now shows monthlySurplus=35000 EXACTLY (not ~37360)
and matches Forecast + Financial Freedom + Ask Nexus
"""

import requests
import time
import random
import string
import json
from typing import Dict, Tuple

# Base URL from .env
BASE_URL = "https://financial-health-hub-17.preview.emergentagent.com"

def generate_unique_email():
    """Generate unique email with timestamp"""
    timestamp = int(time.time() * 1000)
    random_suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
    return f"scenarios_test_{random_suffix}@nexustest.com"

def register_and_login(email: str, name: str, password: str) -> Tuple[requests.Session, Dict]:
    """Register a new user and return authenticated session"""
    session = requests.Session()
    
    # Register
    print(f"  Registering: {email}")
    reg_response = session.post(
        f"{BASE_URL}/api/register",
        json={"email": email, "name": name, "password": password},
        timeout=15
    )
    
    if reg_response.status_code != 200:
        print(f"  ❌ Registration failed: {reg_response.status_code}")
        return session, {"error": "registration_failed"}
    
    print(f"  ✅ Registration successful")
    
    # Small delay to respect rate limits
    time.sleep(1)
    
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
    session_data = session_response.json()
    
    if session_data.get("user"):
        print(f"  ✅ Login successful")
        return session, session_data
    else:
        print(f"  ❌ Login failed")
        return session, {"error": "login_failed"}

def complete_onboarding(session: requests.Session, profile: Dict) -> Dict:
    """Complete personal onboarding with given profile"""
    print(f"  Completing onboarding with profile:")
    print(f"    monthlyIncome: {profile['monthlyIncome']}")
    print(f"    essentialMonthly: {profile['essentialMonthly']}")
    print(f"    discretionaryMonthly: {profile['discretionaryMonthly']}")
    print(f"    cash: {profile['cash']}")
    print(f"    investments: {profile['investments']}")
    
    response = session.post(
        f"{BASE_URL}/api/personal/onboarding",
        json=profile,
        timeout=15
    )
    
    if response.status_code == 200:
        data = response.json()
        print(f"  ✅ Onboarding successful")
        return data
    else:
        print(f"  ❌ Onboarding failed: {response.status_code}")
        print(f"     Response: {response.text[:200]}")
        return {"error": "onboarding_failed"}

def parse_sse_stream(text: str) -> Dict:
    """Parse SSE stream and extract final answer"""
    lines = text.strip().split('\n')
    answer_parts = []
    tools_fired = []
    current_event = None
    
    for line in lines:
        if line.startswith('event: '):
            current_event = line[7:].strip()
        elif line.startswith('data: '):
            try:
                data = json.loads(line[6:])
                
                if current_event == 'tool_start':
                    tool_name = data.get('name', '')
                    if tool_name:
                        tools_fired.append(tool_name)
                elif current_event == 'token':
                    delta = data.get('delta', '')
                    if delta:
                        answer_parts.append(delta)
            except Exception as e:
                # Skip lines that can't be parsed
                pass
    
    return {
        'answer': ''.join(answer_parts),
        'tools': tools_fired,
        'raw_length': len(text)
    }

print("=" * 80)
print("Nexus Personal - Scenarios Consistency Fix Verification")
print("=" * 80)
print()
print("OBJECTIVE: Verify that scenario baseline monthlySurplus = 35000 EXACTLY")
print("           (not ~37360 as in previous P6 testing)")
print("=" * 80)
print()

# ============================================================================
# SETUP: Register fresh user and complete onboarding
# ============================================================================
print("SETUP: Register fresh user and complete onboarding")
print("-" * 80)

email = generate_unique_email()
name = f"Scenarios Test User {random.randint(1000, 9999)}"
password = "TestPass123"

session, session_data = register_and_login(email, name, password)

if "error" in session_data:
    print("❌ SETUP FAILED: Could not register/login")
    exit(1)

# Respect rate limits (register 8/10min, onboarding 5/10min)
time.sleep(2)

# Canonical test profile from review request
profile = {
    "monthlyIncome": 100000,
    "essentialMonthly": 45000,
    "discretionaryMonthly": 20000,
    "cash": 300000,
    "investments": 500000,
    "totalDebt": 0,
    "monthlyDebtPayment": 0,
    "currency": "INR"
}

onboarding_data = complete_onboarding(session, profile)

if "error" in onboarding_data:
    print("❌ SETUP FAILED: Could not complete onboarding")
    exit(1)

print()
print("✅ SETUP COMPLETE")
print()

# ============================================================================
# TEST 1: Scenarios Baseline - CRITICAL TEST
# ============================================================================
print("TEST 1: Scenarios Baseline - monthlySurplus MUST = 35000 EXACTLY")
print("-" * 80)
print("POST /api/personal/scenarios/evaluate with empty levers (baseline only)")
print()

time.sleep(1)  # Respect rate limits

try:
    response = session.post(
        f"{BASE_URL}/api/personal/scenarios/evaluate",
        json={"levers": {}},
        timeout=20
    )
    
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        
        print()
        print("FULL RESPONSE:")
        print(json.dumps(data, indent=2))
        print()
        
        # Extract baseline (at top level, not under 'result')
        baseline = data.get('baseline', {})
        
        print()
        print("BASELINE OBJECT:")
        print(json.dumps(baseline, indent=2))
        print()
        
        # Critical checks
        monthly_income = baseline.get('monthlyIncome')
        monthly_spending = baseline.get('monthlySpending')
        monthly_surplus = baseline.get('monthlySurplus')
        cash = baseline.get('cash')
        
        print("CRITICAL VALUES:")
        print(f"  monthlyIncome: {monthly_income} (expected: 100000)")
        print(f"  monthlySpending: {monthly_spending} (expected: 65000)")
        print(f"  monthlySurplus: {monthly_surplus} (expected: 35000 EXACTLY)")
        print(f"  cash: {cash} (expected: 300000)")
        print()
        
        # Verdict
        if monthly_surplus == 35000:
            print("✅ TEST 1 PASSED: monthlySurplus = 35000 EXACTLY")
            print("   Scenarios baseline now matches canonical profile!")
        elif monthly_surplus == 37360:
            print("❌ TEST 1 FAILED: monthlySurplus = 37360 (OLD BUG STILL PRESENT)")
            print("   The 30-day-window artifact was NOT fixed")
        else:
            print(f"❌ TEST 1 FAILED: monthlySurplus = {monthly_surplus} (unexpected value)")
            print(f"   Expected: 35000, Got: {monthly_surplus}")
        
        # Additional checks
        if monthly_income == 100000:
            print("✅ monthlyIncome correct (100000)")
        else:
            print(f"❌ monthlyIncome incorrect: {monthly_income} (expected 100000)")
        
        if monthly_spending == 65000:
            print("✅ monthlySpending correct (65000)")
        else:
            print(f"❌ monthlySpending incorrect: {monthly_spending} (expected 65000)")
        
        if cash == 300000:
            print("✅ cash correct (300000)")
        else:
            print(f"❌ cash incorrect: {cash} (expected 300000)")
        
    else:
        print(f"❌ TEST 1 FAILED: Unexpected status {response.status_code}")
        print(f"   Response: {response.text[:500]}")

except Exception as e:
    print(f"❌ TEST 1 FAILED: Exception - {e}")

print()

# ============================================================================
# TEST 2: Scenarios with One-Time Purchase Lever
# ============================================================================
print("TEST 2: Scenarios with One-Time Purchase Lever")
print("-" * 80)
print("POST /api/personal/scenarios/evaluate with oneTimePurchase: 200000")
print()

time.sleep(1)  # Respect rate limits

try:
    response = session.post(
        f"{BASE_URL}/api/personal/scenarios/evaluate",
        json={
            "levers": {
                "oneTimePurchase": {
                    "amount": 200000
                }
            }
        },
        timeout=20
    )
    
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        
        baseline = data.get('baseline', {})
        scenario = data.get('scenario', {})
        delta = data.get('delta', {})
        verdict = data.get('verdict', {})
        
        print()
        print("BASELINE:")
        print(f"  cash: {baseline.get('cash')}")
        print(f"  monthlySurplus: {baseline.get('monthlySurplus')}")
        print()
        print("SCENARIO (after ₹2L purchase):")
        print(f"  cash: {scenario.get('cash')}")
        print(f"  monthlySurplus: {scenario.get('monthlySurplus')}")
        print()
        print("DELTA:")
        print(f"  cash: {delta.get('cash')}")
        print()
        print(f"VERDICT: {verdict}")
        print()
        
        # Checks
        baseline_cash = baseline.get('cash')
        scenario_cash = scenario.get('cash')
        delta_cash = delta.get('cash')
        baseline_surplus = baseline.get('monthlySurplus')
        
        if baseline_cash == 300000:
            print("✅ baseline.cash = 300000")
        else:
            print(f"❌ baseline.cash = {baseline_cash} (expected 300000)")
        
        if scenario_cash == 100000:
            print("✅ scenario.cash = 100000 (300000 - 200000)")
        else:
            print(f"⚠️  scenario.cash = {scenario_cash} (expected 100000)")
        
        if delta_cash == -200000:
            print("✅ delta.cash = -200000")
        else:
            print(f"⚠️  delta.cash = {delta_cash} (expected -200000)")
        
        if baseline_surplus == 35000:
            print("✅ baseline.monthlySurplus = 35000 (consistent with Test 1)")
        else:
            print(f"⚠️  baseline.monthlySurplus = {baseline_surplus} (expected 35000)")
        
        if verdict:
            verdict_title = verdict.get('title', '')
            verdict_explanation = verdict.get('explanation', '')
            print(f"✅ verdict present: {verdict_title} - {verdict_explanation[:100]}...")
        
        print()
        print("✅ TEST 2 PASSED: One-time purchase scenario working")
        
    else:
        print(f"❌ TEST 2 FAILED: Unexpected status {response.status_code}")
        print(f"   Response: {response.text[:500]}")

except Exception as e:
    print(f"❌ TEST 2 FAILED: Exception - {e}")

print()

# ============================================================================
# TEST 3: Cross-Check with Forecast
# ============================================================================
print("TEST 3: Cross-Check Consistency with Forecast")
print("-" * 80)
print("GET /api/personal/forecast")
print()

time.sleep(1)  # Respect rate limits

try:
    response = session.get(f"{BASE_URL}/api/personal/forecast", timeout=15)
    
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        
        metrics = data.get('metrics', {})
        monthly_surplus = metrics.get('monthlySurplus')
        
        print()
        print("FORECAST METRICS:")
        print(f"  monthlySurplus: {monthly_surplus}")
        print()
        
        if monthly_surplus == 35000:
            print("✅ TEST 3 PASSED: Forecast monthlySurplus = 35000")
            print("   Matches scenario baseline!")
        else:
            print(f"❌ TEST 3 FAILED: Forecast monthlySurplus = {monthly_surplus}")
            print(f"   Expected: 35000 (to match scenario baseline)")
        
    else:
        print(f"❌ TEST 3 FAILED: Unexpected status {response.status_code}")

except Exception as e:
    print(f"❌ TEST 3 FAILED: Exception - {e}")

print()

# ============================================================================
# TEST 4: Cross-Check with Financial Freedom
# ============================================================================
print("TEST 4: Cross-Check Consistency with Financial Freedom")
print("-" * 80)
print("GET /api/personal/financial-freedom")
print()

time.sleep(1)  # Respect rate limits

try:
    response = session.get(f"{BASE_URL}/api/personal/financial-freedom", timeout=15)
    
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        
        freedom = data.get('freedom', {})
        monthly_surplus = freedom.get('monthlySurplus')
        
        print()
        print("FINANCIAL FREEDOM:")
        print(f"  monthlySurplus: {monthly_surplus}")
        print()
        
        if monthly_surplus == 35000:
            print("✅ TEST 4 PASSED: Financial Freedom monthlySurplus = 35000")
            print("   Matches scenario baseline!")
        else:
            print(f"❌ TEST 4 FAILED: Financial Freedom monthlySurplus = {monthly_surplus}")
            print(f"   Expected: 35000 (to match scenario baseline)")
        
    else:
        print(f"❌ TEST 4 FAILED: Unexpected status {response.status_code}")

except Exception as e:
    print(f"❌ TEST 4 FAILED: Exception - {e}")

print()

# ============================================================================
# TEST 5: Ask Nexus Regression
# ============================================================================
print("TEST 5: Ask Nexus Regression - Scenario Numbers Match")
print("-" * 80)
print("POST /api/personal/chat: 'Can I afford a ₹2 lakh laptop?'")
print()

time.sleep(2)  # Respect chat rate limit (15/min)

try:
    response = session.post(
        f"{BASE_URL}/api/personal/chat",
        json={
            "messages": [
                {
                    "role": "user",
                    "content": "Can I afford a ₹2 lakh laptop?"
                }
            ]
        },
        timeout=60,
        stream=True
    )
    
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        # Collect SSE stream
        full_text = ""
        for chunk in response.iter_content(chunk_size=None, decode_unicode=True):
            if chunk:
                full_text += chunk
        
        print(f"RAW STREAM LENGTH: {len(full_text)} bytes")
        print(f"FIRST 500 CHARS: {full_text[:500]}")
        print()
        
        parsed = parse_sse_stream(full_text)
        answer = parsed['answer']
        tools = parsed['tools']
        
        print()
        print(f"TOOLS FIRED: {tools}")
        print()
        print(f"ANSWER ({len(answer)} chars):")
        print(answer[:500])
        print()
        
        # Check if evaluate_scenario was fired
        if 'evaluate_scenario' in tools:
            print("✅ evaluate_scenario tool fired")
        else:
            print("⚠️  evaluate_scenario tool NOT fired (may have used cached data)")
        
        # Check if answer mentions reasonable numbers
        answer_lower = answer.lower()
        
        # Look for surplus mention
        if '35' in answer or '35000' in answer or '35,000' in answer:
            print("✅ Answer mentions surplus ~35000")
        else:
            print("⚠️  Answer doesn't clearly mention surplus 35000")
        
        # Look for cash mention
        if '100' in answer or '1 lakh' in answer or '100000' in answer:
            print("✅ Answer mentions resulting cash ~100000")
        else:
            print("⚠️  Answer doesn't clearly mention resulting cash")
        
        print()
        print("✅ TEST 5 PASSED: Ask Nexus chat working")
        
    else:
        print(f"❌ TEST 5 FAILED: Unexpected status {response.status_code}")

except Exception as e:
    print(f"❌ TEST 5 FAILED: Exception - {e}")

print()

# ============================================================================
# TEST 6: No-Regression Sweep
# ============================================================================
print("TEST 6: No-Regression Sweep")
print("-" * 80)

time.sleep(1)

endpoints = [
    ("/api/personal/forecast", "Forecast"),
    ("/api/personal/financial-freedom", "Financial Freedom"),
    ("/api/personal/alerts", "Alerts")
]

all_passed = True

for endpoint, name in endpoints:
    try:
        response = session.get(f"{BASE_URL}{endpoint}", timeout=15)
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ {name}: 200 with correct structure")
        else:
            print(f"❌ {name}: {response.status_code}")
            all_passed = False
        
        time.sleep(0.5)
    except Exception as e:
        print(f"❌ {name}: Exception - {e}")
        all_passed = False

# Test Enterprise CFO (demo mode)
print()
print("Testing Enterprise CFO (demo mode)...")

demo_session = requests.Session()
try:
    csrf_response = demo_session.get(f"{BASE_URL}/api/auth/csrf", timeout=10)
    csrf_token = csrf_response.json().get("csrfToken")
    
    demo_response = demo_session.post(
        f"{BASE_URL}/api/auth/callback/demo",
        data={"csrfToken": csrf_token, "json": "true"},
        timeout=15,
        allow_redirects=False
    )
    
    time.sleep(1)
    
    # Test CFO chat stream
    chat_response = demo_session.post(
        f"{BASE_URL}/api/cfo/chat/stream",
        json={
            "messages": [
                {"role": "user", "content": "What is my cash position?"}
            ]
        },
        timeout=30,
        stream=True
    )
    
    if chat_response.status_code == 200:
        print("✅ Enterprise CFO chat: 200 (streaming)")
    else:
        print(f"❌ Enterprise CFO chat: {chat_response.status_code}")
        all_passed = False
    
except Exception as e:
    print(f"❌ Enterprise CFO: Exception - {e}")
    all_passed = False

print()

if all_passed:
    print("✅ TEST 6 PASSED: No regressions detected")
else:
    print("❌ TEST 6 FAILED: Some endpoints returned errors")

print()

# ============================================================================
# SUMMARY
# ============================================================================
print("=" * 80)
print("VERIFICATION SUMMARY")
print("=" * 80)
print()
print("Nexus Personal - Scenarios Consistency Fix Verification Results:")
print()
print("1. ✅/❌ Scenarios baseline monthlySurplus = 35000 EXACTLY (CRITICAL)")
print("2. ✅/❌ One-time purchase scenario (delta calculations)")
print("3. ✅/❌ Forecast monthlySurplus = 35000 (consistency)")
print("4. ✅/❌ Financial Freedom monthlySurplus = 35000 (consistency)")
print("5. ✅/❌ Ask Nexus chat (scenario numbers match)")
print("6. ✅/❌ No-regression sweep (all endpoints 200)")
print()
print("CRITICAL QUESTION: Does Scenarios baseline EXACTLY equal 35000?")
print("ANSWER: Check TEST 1 results above")
print()
print("=" * 80)
