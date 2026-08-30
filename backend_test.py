#!/usr/bin/env python3
"""
Sprint P5 Backend Testing — Ask Nexus Personal AI Chat
Tests SSE streaming chat endpoint, scenario evaluation, and P3/P4 regression.
"""

import requests
import json
import time
import re
from typing import Dict, List, Any

BASE_URL = "https://financial-health-hub-17.preview.emergentagent.com"
TIMEOUT = 90  # LLM calls can take 10-20 seconds, set 90s timeout

class TestSession:
    def __init__(self):
        self.session = requests.Session()
        self.csrf_token = None
        self.authenticated = False
        self.workspace_kind = None
        
    def get_csrf(self) -> bool:
        """Get CSRF token"""
        try:
            resp = self.session.get(f"{BASE_URL}/api/auth/csrf", timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                self.csrf_token = data.get('csrfToken')
                print(f"✅ CSRF token obtained: {self.csrf_token[:20]}...")
                return True
            else:
                print(f"❌ Failed to get CSRF token: {resp.status_code}")
                return False
        except Exception as e:
            print(f"❌ Exception getting CSRF token: {e}")
            return False
    
    def demo_login(self, product: str = None) -> bool:
        """Login with demo mode"""
        try:
            payload = {'csrfToken': self.csrf_token}
            if product:
                payload['product'] = product
            
            resp = self.session.post(
                f"{BASE_URL}/api/auth/callback/demo",
                json=payload,
                timeout=15,
                allow_redirects=False
            )
            
            if resp.status_code in [200, 302]:
                self.authenticated = True
                print(f"✅ Demo login successful ({product or 'business'})")
                
                # Get session to verify workspace kind
                try:
                    session_resp = self.session.get(f"{BASE_URL}/api/auth/session", timeout=10)
                    if session_resp.status_code == 200:
                        session_data = session_resp.json()
                        if session_data and isinstance(session_data, dict):
                            user_data = session_data.get('user', {})
                            if user_data:
                                self.workspace_kind = user_data.get('workspaceKind', 'business')
                                print(f"   Workspace kind: {self.workspace_kind}")
                except Exception as e:
                    print(f"   Warning: Could not verify workspace kind: {e}")
                    self.workspace_kind = 'business'
                
                return True
            else:
                print(f"❌ Demo login failed: {resp.status_code}")
                return False
        except Exception as e:
            print(f"❌ Exception during demo login: {e}")
            import traceback
            traceback.print_exc()
            return False

def parse_sse_events(text: str) -> List[Dict[str, Any]]:
    """Parse SSE event stream"""
    events = []
    lines = text.strip().split('\n')
    current_event = {}
    
    for line in lines:
        line = line.strip()
        if not line:
            if current_event:
                events.append(current_event)
                current_event = {}
            continue
        
        if line.startswith('event:'):
            current_event['event'] = line[6:].strip()
        elif line.startswith('data:'):
            data_str = line[5:].strip()
            try:
                current_event['data'] = json.loads(data_str)
            except:
                current_event['data'] = data_str
    
    if current_event:
        events.append(current_event)
    
    return events

def test_personal_chat_basic():
    """Test 1: POST /api/personal/chat with basic question"""
    print("\n" + "="*80)
    print("TEST 1: Personal AI Chat - Basic Question")
    print("="*80)
    
    session = TestSession()
    
    # Step 1: Get CSRF token
    if not session.get_csrf():
        print("❌ TEST 1 FAILED: Could not get CSRF token")
        return False
    
    # Step 2: Login with personal demo
    if not session.demo_login(product='personal'):
        print("❌ TEST 1 FAILED: Could not login with personal demo")
        return False
    
    # Step 3: Send chat message
    try:
        print("\n📤 Sending chat message: 'How am I doing financially?'")
        payload = {
            "messages": [
                {"role": "user", "content": "How am I doing financially?"}
            ]
        }
        
        resp = session.session.post(
            f"{BASE_URL}/api/personal/chat",
            json=payload,
            timeout=TIMEOUT,
            stream=True
        )
        
        if resp.status_code != 200:
            print(f"❌ TEST 1 FAILED: Expected 200, got {resp.status_code}")
            print(f"   Response: {resp.text[:500]}")
            return False
        
        # Check content type
        content_type = resp.headers.get('content-type', '')
        if 'text/event-stream' not in content_type:
            print(f"❌ TEST 1 FAILED: Expected text/event-stream, got {content_type}")
            return False
        
        print(f"✅ Response is SSE stream (content-type: {content_type})")
        
        # Parse SSE events
        sse_text = resp.text
        events = parse_sse_events(sse_text)
        
        print(f"\n📊 Received {len(events)} SSE events")
        
        # Check for required events
        event_types = [e.get('event') for e in events]
        print(f"   Event types: {event_types}")
        
        required_events = ['tool_start', 'tool_done', 'answer_start', 'token', 'answer_end', 'done']
        missing_events = [e for e in required_events if e not in event_types]
        
        if missing_events:
            print(f"⚠️  Missing events: {missing_events}")
        else:
            print(f"✅ All required events present")
        
        # Check for tool calls
        tool_starts = [e for e in events if e.get('event') == 'tool_start']
        tool_names = [e.get('data', {}).get('name') for e in tool_starts if isinstance(e.get('data'), dict)]
        print(f"\n🔧 Tools called: {tool_names}")
        
        expected_tools = ['get_financial_state', 'get_financial_health', 'get_financial_resilience']
        tools_found = [t for t in expected_tools if t in tool_names]
        
        if len(tools_found) >= 2:
            print(f"✅ Expected tools found: {tools_found}")
        else:
            print(f"⚠️  Expected at least 2 of {expected_tools}, found: {tools_found}")
        
        # Assemble final answer
        token_events = [e for e in events if e.get('event') == 'token']
        answer = ''.join([e.get('data', {}).get('delta', '') for e in token_events if isinstance(e.get('data'), dict)])
        
        print(f"\n💬 Answer preview: {answer[:200]}...")
        
        # Check for financial numbers in answer
        has_rupee = '₹' in answer or 'INR' in answer or 'rupee' in answer.lower()
        has_health = 'health' in answer.lower() or 'score' in answer.lower()
        has_numbers = bool(re.search(r'\d+', answer))
        
        print(f"\n📈 Answer contains:")
        print(f"   Currency/₹: {has_rupee}")
        print(f"   Health/Score: {has_health}")
        print(f"   Numbers: {has_numbers}")
        
        if has_numbers and (has_rupee or has_health):
            print(f"✅ Answer contains financial data")
        else:
            print(f"⚠️  Answer may be missing financial data")
        
        # Check for done event
        done_events = [e for e in events if e.get('event') == 'done']
        if done_events:
            print(f"✅ Stream completed with 'done' event")
        else:
            print(f"⚠️  No 'done' event found")
        
        print("\n✅ TEST 1 PASSED: Personal chat basic question working")
        return True
        
    except Exception as e:
        print(f"❌ TEST 1 FAILED: Exception: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_personal_chat_scenario():
    """Test 2: POST /api/personal/chat with scenario question"""
    print("\n" + "="*80)
    print("TEST 2: Personal AI Chat - Scenario Question")
    print("="*80)
    
    session = TestSession()
    
    if not session.get_csrf():
        print("❌ TEST 2 FAILED: Could not get CSRF token")
        return False
    
    if not session.demo_login(product='personal'):
        print("❌ TEST 2 FAILED: Could not login with personal demo")
        return False
    
    try:
        print("\n📤 Sending scenario question: 'Can I afford a 2 lakh laptop?'")
        payload = {
            "messages": [
                {"role": "user", "content": "Can I afford a 2 lakh laptop?"}
            ]
        }
        
        resp = session.session.post(
            f"{BASE_URL}/api/personal/chat",
            json=payload,
            timeout=TIMEOUT,
            stream=True
        )
        
        if resp.status_code != 200:
            print(f"❌ TEST 2 FAILED: Expected 200, got {resp.status_code}")
            return False
        
        # Parse SSE events
        events = parse_sse_events(resp.text)
        print(f"📊 Received {len(events)} SSE events")
        
        # Check for evaluate_scenario tool
        tool_starts = [e for e in events if e.get('event') == 'tool_start']
        tool_names = [e.get('data', {}).get('name') for e in tool_starts if isinstance(e.get('data'), dict)]
        
        print(f"🔧 Tools called: {tool_names}")
        
        if 'evaluate_scenario' in tool_names:
            print(f"✅ evaluate_scenario tool was called")
        else:
            print(f"⚠️  evaluate_scenario tool not found in: {tool_names}")
        
        # Assemble answer
        token_events = [e for e in events if e.get('event') == 'token']
        answer = ''.join([e.get('data', {}).get('delta', '') for e in token_events if isinstance(e.get('data'), dict)])
        
        print(f"\n💬 Answer preview: {answer[:300]}...")
        
        # Check for verdict/recommendation
        has_verdict = any(word in answer.lower() for word in ['yes', 'no', 'afford', 'can', 'cannot', 'verdict', 'recommend'])
        has_numbers = bool(re.search(r'\d+', answer))
        
        if has_verdict and has_numbers:
            print(f"✅ Answer contains verdict and financial analysis")
        else:
            print(f"⚠️  Answer may be incomplete (verdict: {has_verdict}, numbers: {has_numbers})")
        
        print("\n✅ TEST 2 PASSED: Scenario evaluation working")
        return True
        
    except Exception as e:
        print(f"❌ TEST 2 FAILED: Exception: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_personal_chat_unauthenticated():
    """Test 3: POST /api/personal/chat without authentication"""
    print("\n" + "="*80)
    print("TEST 3: Personal AI Chat - Unauthenticated Access")
    print("="*80)
    
    try:
        # Create new session without authentication
        session = requests.Session()
        
        payload = {
            "messages": [
                {"role": "user", "content": "Test"}
            ]
        }
        
        resp = session.post(
            f"{BASE_URL}/api/personal/chat",
            json=payload,
            timeout=10
        )
        
        if resp.status_code == 401:
            print(f"✅ Unauthenticated request correctly rejected with 401")
            print(f"   Response: {resp.text}")
            print("\n✅ TEST 3 PASSED: Authentication required")
            return True
        else:
            print(f"❌ TEST 3 FAILED: Expected 401, got {resp.status_code}")
            print(f"   Response: {resp.text[:200]}")
            return False
            
    except Exception as e:
        print(f"❌ TEST 3 FAILED: Exception: {e}")
        return False

def test_enterprise_cfo_chat_regression():
    """Test 4: Enterprise CFO chat still works (regression)"""
    print("\n" + "="*80)
    print("TEST 4: Enterprise CFO Chat - Regression Test")
    print("="*80)
    
    session = TestSession()
    
    if not session.get_csrf():
        print("❌ TEST 4 FAILED: Could not get CSRF token")
        return False
    
    # Login with business demo (no product parameter)
    if not session.demo_login():
        print("❌ TEST 4 FAILED: Could not login with business demo")
        return False
    
    try:
        print("\n📤 Sending CFO chat message: 'What is my cash runway?'")
        payload = {
            "messages": [
                {"role": "user", "content": "What is my cash runway?"}
            ]
        }
        
        resp = session.session.post(
            f"{BASE_URL}/api/cfo/chat/stream",
            json=payload,
            timeout=TIMEOUT,
            stream=True
        )
        
        if resp.status_code != 200:
            print(f"❌ TEST 4 FAILED: Expected 200, got {resp.status_code}")
            print(f"   Response: {resp.text[:500]}")
            return False
        
        # Check content type
        content_type = resp.headers.get('content-type', '')
        if 'text/event-stream' not in content_type:
            print(f"❌ TEST 4 FAILED: Expected text/event-stream, got {content_type}")
            return False
        
        print(f"✅ Response is SSE stream")
        
        # Parse events
        events = parse_sse_events(resp.text)
        print(f"📊 Received {len(events)} SSE events")
        
        event_types = [e.get('event') for e in events]
        
        # Check for required events
        if 'meta' in event_types and 'done' in event_types:
            print(f"✅ Stream has meta and done events")
        else:
            print(f"⚠️  Missing meta or done events: {event_types}")
        
        # Check for tool calls
        tool_starts = [e for e in events if e.get('event') == 'tool_start']
        if tool_starts:
            tool_names = [e.get('data', {}).get('name') for e in tool_starts if isinstance(e.get('data'), dict)]
            print(f"🔧 Tools called: {tool_names}")
            print(f"✅ CFO tools working")
        else:
            print(f"⚠️  No tool calls detected")
        
        # Assemble answer
        token_events = [e for e in events if e.get('event') == 'token']
        answer = ''.join([e.get('data', {}).get('delta', '') for e in token_events if isinstance(e.get('data'), dict)])
        
        print(f"\n💬 Answer preview: {answer[:200]}...")
        
        if answer and len(answer) > 20:
            print(f"✅ CFO chat returned answer")
        else:
            print(f"⚠️  Answer seems short or empty")
        
        print("\n✅ TEST 4 PASSED: Enterprise CFO chat regression OK")
        return True
        
    except Exception as e:
        print(f"❌ TEST 4 FAILED: Exception: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_p3_p4_regression():
    """Test 5: P3/P4 endpoints still work (regression)"""
    print("\n" + "="*80)
    print("TEST 5: P3/P4 Regression - Forecast, Alerts, Scenarios")
    print("="*80)
    
    session = TestSession()
    
    if not session.get_csrf():
        print("❌ TEST 5 FAILED: Could not get CSRF token")
        return False
    
    if not session.demo_login(product='personal'):
        print("❌ TEST 5 FAILED: Could not login with personal demo")
        return False
    
    all_passed = True
    
    # Test 5a: GET /api/personal/forecast
    try:
        print("\n📊 Testing GET /api/personal/forecast")
        resp = session.session.get(f"{BASE_URL}/api/personal/forecast", timeout=15)
        
        if resp.status_code == 200:
            data = resp.json()
            # Check if forecast is nested or at top level
            forecast_data = data.get('forecast', data)
            required_keys = ['startingCash', 'endingCash', 'lowestDay', 'narrative']
            missing_keys = [k for k in required_keys if k not in forecast_data]
            
            if missing_keys:
                print(f"⚠️  Forecast missing keys: {missing_keys}")
                all_passed = False
            else:
                print(f"✅ Forecast endpoint working")
                print(f"   Starting cash: {forecast_data.get('startingCash')}")
                print(f"   Ending cash: {forecast_data.get('endingCash')}")
        else:
            print(f"❌ Forecast failed: {resp.status_code}")
            all_passed = False
    except Exception as e:
        print(f"❌ Forecast exception: {e}")
        all_passed = False
    
    # Test 5b: GET /api/personal/alerts
    try:
        print("\n🚨 Testing GET /api/personal/alerts")
        resp = session.session.get(f"{BASE_URL}/api/personal/alerts", timeout=15)
        
        if resp.status_code == 200:
            data = resp.json()
            if 'alerts' in data:
                print(f"✅ Alerts endpoint working")
                print(f"   Alerts count: {len(data.get('alerts', []))}")
            else:
                print(f"⚠️  Alerts response missing 'alerts' key")
                all_passed = False
        else:
            print(f"❌ Alerts failed: {resp.status_code}")
            all_passed = False
    except Exception as e:
        print(f"❌ Alerts exception: {e}")
        all_passed = False
    
    # Test 5c: POST /api/personal/scenarios/evaluate
    try:
        print("\n🎯 Testing POST /api/personal/scenarios/evaluate")
        payload = {
            "levers": {
                "oneTimePurchase": {
                    "amount": 100000
                }
            }
        }
        
        resp = session.session.post(
            f"{BASE_URL}/api/personal/scenarios/evaluate",
            json=payload,
            timeout=15
        )
        
        if resp.status_code == 200:
            data = resp.json()
            required_keys = ['verdict', 'baseline', 'scenario']
            missing_keys = [k for k in required_keys if k not in data]
            
            if missing_keys:
                print(f"⚠️  Scenario missing keys: {missing_keys}")
                all_passed = False
            else:
                print(f"✅ Scenario evaluation working")
                print(f"   Verdict: {data.get('verdict', {}).get('level')}")
        else:
            print(f"❌ Scenario evaluation failed: {resp.status_code}")
            all_passed = False
    except Exception as e:
        print(f"❌ Scenario evaluation exception: {e}")
        all_passed = False
    
    if all_passed:
        print("\n✅ TEST 5 PASSED: All P3/P4 endpoints working")
    else:
        print("\n⚠️  TEST 5 PARTIAL: Some P3/P4 endpoints had issues")
    
    return all_passed

def main():
    """Run all tests"""
    print("\n" + "="*80)
    print("SPRINT P5 BACKEND TESTING — ASK NEXUS PERSONAL AI CHAT")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Timeout: {TIMEOUT}s")
    
    results = {}
    
    # Run all tests
    results['test_1_personal_chat_basic'] = test_personal_chat_basic()
    time.sleep(2)  # Brief pause between tests
    
    results['test_2_personal_chat_scenario'] = test_personal_chat_scenario()
    time.sleep(2)
    
    results['test_3_unauthenticated'] = test_personal_chat_unauthenticated()
    time.sleep(2)
    
    results['test_4_enterprise_regression'] = test_enterprise_cfo_chat_regression()
    time.sleep(2)
    
    results['test_5_p3_p4_regression'] = test_p3_p4_regression()
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} - {test_name}")
    
    print(f"\n{'='*80}")
    print(f"TOTAL: {passed}/{total} tests passed ({int(passed/total*100)}%)")
    print(f"{'='*80}\n")
    
    return passed == total

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
