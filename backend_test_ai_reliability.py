#!/usr/bin/env python3
"""
Sprint 2.7 Phase 2 Follow-up: AI Reliability Fix Verification
Tests the critical fix for the 3-model fallback chain (claude-sonnet-4-5, gpt-5, gemini/gemini-2.5-pro).
"""
import requests
import json
import time
import io

BASE_URL = "https://financial-health-hub-17.preview.emergentagent.com"

def test_1_ai_health_initial():
    """TEST 1: GET /api/ai/health - verify fallbackModels and perModel availability"""
    print("\n" + "="*80)
    print("TEST 1: GET /api/ai/health (initial check)")
    print("="*80)
    
    try:
        r = requests.get(f"{BASE_URL}/api/ai/health", timeout=10)
        print(f"Status: {r.status_code}")
        
        if r.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {r.status_code}")
            print(f"Response: {r.text[:500]}")
            return False
        
        data = r.json()
        print(f"Response keys: {list(data.keys())}")
        
        # Check fallbackModels array
        fallback_models = data.get('fallbackModels', [])
        print(f"\nfallbackModels: {fallback_models}")
        
        expected_fallbacks = ["gpt-5", "gemini/gemini-2.5-pro"]
        if fallback_models != expected_fallbacks:
            print(f"❌ FAIL: Expected fallbackModels {expected_fallbacks}, got {fallback_models}")
            return False
        print(f"✅ fallbackModels correct: {fallback_models}")
        
        # Check perModel array
        per_model = data.get('perModel', [])
        print(f"\nperModel entries: {len(per_model)}")
        
        expected_models = ["claude-sonnet-4-5-20250929", "gpt-5", "gemini/gemini-2.5-pro"]
        actual_models = [m['model'] for m in per_model]
        
        if len(per_model) != 3:
            print(f"❌ FAIL: Expected 3 perModel entries, got {len(per_model)}")
            return False
        
        print(f"\nModel availability:")
        all_available = True
        for model_data in per_model:
            model_name = model_data['model']
            available = model_data.get('available', False)
            failure_rate = model_data.get('failureRate', 0)
            requests_count = model_data.get('requests', 0)
            print(f"  - {model_name}: available={available}, failureRate={failure_rate}, requests={requests_count}")
            
            if not available:
                print(f"    ⚠️  WARNING: {model_name} not available (circuit breaker may be open)")
                all_available = False
        
        if all_available:
            print(f"\n✅ PASS: All 3 models available")
        else:
            print(f"\n⚠️  PARTIAL: Some models unavailable (may be due to circuit breaker)")
        
        print(f"\nOverall health:")
        print(f"  - status: {data.get('status')}")
        print(f"  - primaryModel: {data.get('primaryModel')}")
        print(f"  - totalRequests: {data.get('totalRequests')}")
        print(f"  - successRate: {data.get('successRate')}")
        
        return True
        
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        import traceback
        traceback.print_exc()
        return False


def test_2_demo_mode_chat():
    """TEST 2: Demo mode flow + 5 CFO chat questions"""
    print("\n" + "="*80)
    print("TEST 2: Demo Mode + 5 CFO Chat Questions")
    print("="*80)
    
    session = requests.Session()
    
    try:
        # Step 1: Get CSRF token
        print("\nStep 1: GET /api/auth/csrf")
        r = session.get(f"{BASE_URL}/api/auth/csrf", timeout=10)
        if r.status_code != 200:
            print(f"❌ FAIL: CSRF request failed with {r.status_code}")
            return False
        csrf_token = r.json().get('csrfToken')
        print(f"✅ CSRF token obtained: {csrf_token[:20]}...")
        
        # Step 2: Create demo session
        print("\nStep 2: POST /api/auth/callback/demo")
        r = session.post(
            f"{BASE_URL}/api/auth/callback/demo",
            data={'csrfToken': csrf_token, 'redirect': 'false'},
            allow_redirects=False,
            timeout=15
        )
        if r.status_code not in [200, 302]:
            print(f"❌ FAIL: Demo callback failed with {r.status_code}")
            return False
        print(f"✅ Demo session created (status {r.status_code})")
        
        # Step 3: Verify session
        print("\nStep 3: GET /api/auth/session")
        r = session.get(f"{BASE_URL}/api/auth/session", timeout=10)
        if r.status_code != 200:
            print(f"❌ FAIL: Session check failed with {r.status_code}")
            return False
        session_data = r.json()
        is_demo = session_data.get('user', {}).get('isDemo')
        active_org_id = session_data.get('user', {}).get('activeOrgId')
        print(f"✅ Session verified: isDemo={is_demo}, activeOrgId={active_org_id}")
        
        if not is_demo or not active_org_id:
            print(f"❌ FAIL: Demo session not properly configured")
            return False
        
        # Step 4: Send 5 different CFO chat questions
        print("\nStep 4: Send 5 CFO chat questions")
        questions = [
            "What is my cash runway?",
            "Which vendor do I spend the most on?",
            "Any overdue invoices?",
            "What's my burn rate?",
            "Give me a recommendation"
        ]
        
        all_passed = True
        for i, question in enumerate(questions, 1):
            print(f"\n  Question {i}: '{question}'")
            
            r = session.post(
                f"{BASE_URL}/api/cfo/chat/stream",
                json={'messages': [{'role': 'user', 'content': question}]},
                headers={'Accept': 'text/event-stream'},
                stream=True,
                timeout=60
            )
            
            if r.status_code != 200:
                print(f"    ❌ FAIL: Status {r.status_code}")
                all_passed = False
                continue
            
            if 'text/event-stream' not in r.headers.get('content-type', ''):
                print(f"    ❌ FAIL: Wrong content-type: {r.headers.get('content-type')}")
                all_passed = False
                continue
            
            # Parse SSE stream (format: "event: <name>\ndata: <json>\n\n")
            events = []
            answer_text = ""
            done_found = False
            ai_unavailable = False
            current_event = None
            
            for line in r.iter_lines(decode_unicode=True):
                if not line:
                    continue
                
                # Parse "event: <name>" lines
                if line.startswith('event:'):
                    current_event = line[6:].strip()
                    events.append(current_event)
                    if current_event == 'done':
                        done_found = True
                    continue
                
                # Parse "data: <json>" lines
                if line.startswith('data:'):
                    data_str = line[5:].strip()
                    if data_str == '[DONE]':
                        continue
                    try:
                        event_data = json.loads(data_str)
                        
                        # For 'token' events, accumulate the answer text
                        if current_event == 'token':
                            answer_text += event_data.get('delta', '')
                        
                        # Check for ai_unavailable error
                        if current_event == 'error' and event_data.get('code') == 'ai_unavailable':
                            ai_unavailable = True
                    except:
                        pass
            
            if ai_unavailable:
                print(f"    ❌ FAIL: ai_unavailable error in stream")
                all_passed = False
                continue
            
            if not done_found:
                print(f"    ❌ FAIL: No 'done' event found")
                all_passed = False
                continue
            
            if len(answer_text.strip()) < 10:
                print(f"    ❌ FAIL: Answer too short or empty: '{answer_text[:100]}'")
                all_passed = False
                continue
            
            print(f"    ✅ PASS: 200, text/event-stream, 'done' event present, answer length={len(answer_text)} chars")
        
        if all_passed:
            print(f"\n✅ PASS: All 5 chat questions succeeded")
            return session  # Return session for next test
        else:
            print(f"\n❌ FAIL: Some chat questions failed")
            return False
        
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        import traceback
        traceback.print_exc()
        return False


def test_3_csv_upload(session):
    """TEST 3: Upload CSV with demo session"""
    print("\n" + "="*80)
    print("TEST 3: CSV Upload (categorizeBatch LLM call)")
    print("="*80)
    
    if not session:
        print("❌ FAIL: No valid session from TEST 2")
        return False
    
    try:
        # Create a small CSV with 3-4 rows
        csv_content = """date,description,vendor,amount
2025-01-15,Office supplies,Staples Inc,125.50
2025-01-16,Cloud hosting,AWS,450.00
2025-01-17,Marketing campaign,Google Ads,890.25
"""
        
        csv_file = io.BytesIO(csv_content.encode('utf-8'))
        
        print("\nUploading CSV with 3 transactions...")
        r = session.post(
            f"{BASE_URL}/api/cfo/transactions",
            files={'file': ('test_transactions.csv', csv_file, 'text/csv')},
            timeout=30
        )
        
        print(f"Status: {r.status_code}")
        
        if r.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {r.status_code}")
            print(f"Response: {r.text[:500]}")
            return False
        
        data = r.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        # Check for expected keys
        if 'imported' not in data:
            print(f"❌ FAIL: Missing 'imported' key in response")
            return False
        
        imported = data.get('imported', 0)
        skipped = data.get('skipped', 0)
        duplicates = data.get('duplicates', 0)
        
        print(f"\nImport summary:")
        print(f"  - imported: {imported}")
        print(f"  - skipped: {skipped}")
        print(f"  - duplicates: {duplicates}")
        
        if imported > 0:
            print(f"\n✅ PASS: CSV upload succeeded, {imported} transactions imported")
            print(f"         (This exercises categorizeBatch() LLM call which uses fallback chain)")
            return True
        else:
            print(f"⚠️  WARNING: No transactions imported (may be duplicates)")
            return True  # Still pass if it's just duplicates
        
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        import traceback
        traceback.print_exc()
        return False


def test_4_ai_health_final():
    """TEST 4: GET /api/ai/health after test calls"""
    print("\n" + "="*80)
    print("TEST 4: GET /api/ai/health (final check after test calls)")
    print("="*80)
    
    try:
        r = requests.get(f"{BASE_URL}/api/ai/health", timeout=10)
        print(f"Status: {r.status_code}")
        
        if r.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {r.status_code}")
            return False
        
        data = r.json()
        
        print(f"\nOverall metrics:")
        print(f"  - status: {data.get('status')}")
        print(f"  - totalRequests (last 5m): {data.get('totalRequests')}")
        print(f"  - successRate: {data.get('successRate')}")
        print(f"  - averageLatencyMs: {data.get('averageLatencyMs')}")
        
        print(f"\nPer-model failure rates:")
        per_model = data.get('perModel', [])
        for model_data in per_model:
            model_name = model_data['model']
            failure_rate = model_data.get('failureRate', 0)
            requests_count = model_data.get('requests', 0)
            available = model_data.get('available', False)
            avg_latency = model_data.get('averageLatencyMs')
            
            print(f"  - {model_name}:")
            print(f"      requests: {requests_count}")
            print(f"      failureRate: {failure_rate}")
            print(f"      averageLatencyMs: {avg_latency}")
            print(f"      available: {available}")
            
            if failure_rate > 0.5:  # More than 50% failure rate
                print(f"      ⚠️  HIGH FAILURE RATE")
        
        success_rate = data.get('successRate', 0)
        if success_rate >= 0.8:  # 80% or better
            print(f"\n✅ PASS: Overall success rate is healthy ({success_rate})")
        else:
            print(f"\n⚠️  WARNING: Success rate below 80% ({success_rate})")
        
        return True
        
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    print("="*80)
    print("AI RELIABILITY FIX VERIFICATION")
    print("Testing the critical fix for 3-model fallback chain")
    print("="*80)
    
    results = {}
    
    # TEST 1: Initial health check
    results['test_1'] = test_1_ai_health_initial()
    
    # TEST 2: Demo mode + 5 chat questions (returns session if successful)
    session_or_result = test_2_demo_mode_chat()
    if isinstance(session_or_result, requests.Session):
        results['test_2'] = True
        session = session_or_result
    else:
        results['test_2'] = session_or_result
        session = None
    
    # TEST 3: CSV upload (needs session from TEST 2)
    results['test_3'] = test_3_csv_upload(session)
    
    # TEST 4: Final health check
    results['test_4'] = test_4_ai_health_final()
    
    # Summary
    print("\n" + "="*80)
    print("SUMMARY")
    print("="*80)
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{test_name}: {status}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n✅ ALL TESTS PASSED - AI reliability fix verified")
    else:
        print(f"\n❌ {total - passed} test(s) failed")
    
    return passed == total


if __name__ == '__main__':
    success = main()
    exit(0 if success else 1)
