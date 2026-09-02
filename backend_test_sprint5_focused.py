#!/usr/bin/env python3
"""
Focused test for remaining Sprint 5 security audit issues
"""

import requests
import time
import json

BASE_URL = "https://financial-health-hub-17.preview.emergentagent.com"

def create_demo_session():
    """Create a demo session"""
    session = requests.Session()
    
    csrf_resp = session.get(f"{BASE_URL}/api/auth/csrf")
    if csrf_resp.status_code != 200:
        return None
    
    csrf_token = csrf_resp.json().get("csrfToken")
    if not csrf_token:
        return None
    
    demo_resp = session.post(
        f"{BASE_URL}/api/auth/callback/demo",
        data={"csrfToken": csrf_token},
        allow_redirects=False
    )
    
    if demo_resp.status_code not in [200, 302]:
        print(f"Demo creation failed: {demo_resp.status_code}")
        return None
    
    session_resp = session.get(f"{BASE_URL}/api/auth/session")
    if session_resp.status_code != 200:
        return None
    
    try:
        session_data = session_resp.json()
    except:
        return None
    
    if not session_data or not session_data.get("user"):
        return None
    
    print(f"✅ Demo session created: {session_data['user']['email']}")
    return session

def test_billing_cross_tenant():
    """Test 2: Cross-tenant isolation - Billing (with region field)"""
    print("\n" + "="*80)
    print("TEST 2: Cross-tenant isolation - Billing (RETRY)")
    print("="*80)
    
    print("\n[Org A] Creating demo session...")
    session_a = create_demo_session()
    if not session_a:
        print("❌ Could not create Org A session")
        return False
    
    time.sleep(2)  # Delay between sessions
    
    print("\n[Org A] Starting trial...")
    trial_data = {
        "plan": "starter",
        "interval": "monthly",
        "region": "international"
    }
    trial_resp = session_a.post(f"{BASE_URL}/api/billing/trial", json=trial_data)
    
    if trial_resp.status_code != 200:
        print(f"❌ Trial failed: {trial_resp.status_code}")
        print(f"Response: {trial_resp.text}")
        return False
    
    print(f"✅ [Org A] Trial started")
    
    # Verify subscription in Org A
    sub_resp_a = session_a.get(f"{BASE_URL}/api/billing/subscription")
    if sub_resp_a.status_code != 200:
        print(f"❌ Could not get subscription: {sub_resp_a.status_code}")
        return False
    
    sub_a = sub_resp_a.json()
    print(f"✅ [Org A] Subscription: plan={sub_a.get('plan')}")
    
    time.sleep(2)  # Delay between sessions
    
    print("\n[Org B] Creating demo session...")
    session_b = create_demo_session()
    if not session_b:
        print("❌ Could not create Org B session")
        return False
    
    print("\n[Org B] Getting subscription...")
    sub_resp_b = session_b.get(f"{BASE_URL}/api/billing/subscription")
    if sub_resp_b.status_code != 200:
        print(f"❌ Could not get subscription: {sub_resp_b.status_code}")
        return False
    
    sub_b = sub_resp_b.json()
    
    if sub_b and sub_b.get("plan"):
        print(f"❌ Org B has a subscription: {sub_b}")
        return False
    
    print(f"✅ [Org B] Subscription: {sub_b} (null as expected)")
    print("✅ TEST 2 PASSED")
    return True

def test_sequential_chat():
    """Test 9: Sequential chat messages with proper SSE parsing"""
    print("\n" + "="*80)
    print("TEST 9: Sequential chat messages (RETRY)")
    print("="*80)
    
    session = create_demo_session()
    if not session:
        print("❌ Could not create session")
        return False
    
    messages = [
        "What is my cash balance?",
        "What are my top expenses?",
        "What is my runway?"
    ]
    
    all_passed = True
    for i, message in enumerate(messages, 1):
        print(f"\n[Message {i}] Sending: {message}")
        
        data = {"messages": [{"role": "user", "content": message}]}
        resp = session.post(f"{BASE_URL}/api/cfo/chat/stream", json=data, stream=True, timeout=60)
        
        if resp.status_code != 200:
            print(f"❌ Message {i} failed: {resp.status_code}")
            all_passed = False
            continue
        
        done_found = False
        event_count = 0
        
        try:
            for line in resp.iter_lines(decode_unicode=True):
                if line and line.startswith("data: "):
                    data_str = line[6:].strip()
                    if data_str:
                        try:
                            event_data = json.loads(data_str)
                            event_type = event_data.get("type")
                            event_count += 1
                            
                            if event_type == "done":
                                done_found = True
                                break
                        except json.JSONDecodeError:
                            pass
        except Exception as e:
            print(f"⚠️ Error reading stream: {e}")
        
        if done_found:
            print(f"✅ Message {i} completed ({event_count} events)")
        else:
            print(f"❌ Message {i} did not complete (got {event_count} events)")
            all_passed = False
        
        time.sleep(2)
    
    if all_passed:
        print("\n✅ TEST 9 PASSED")
    else:
        print("\n❌ TEST 9 FAILED")
    
    return all_passed

def main():
    print("="*80)
    print("SPRINT 5 FOCUSED TESTS")
    print("="*80)
    
    results = {}
    
    results["Test 2: Billing cross-tenant"] = test_billing_cross_tenant()
    
    time.sleep(5)  # Delay between major tests
    
    results["Test 9: Sequential chat"] = test_sequential_chat()
    
    print("\n" + "="*80)
    print("FOCUSED TEST SUMMARY")
    print("="*80)
    
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    print(f"\nTOTAL: {passed}/{total} tests passed")
    
    return passed == total

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
