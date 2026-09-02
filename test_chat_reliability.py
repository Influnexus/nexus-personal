#!/usr/bin/env python3
"""
Sprint 2.7 Phase 2 - TEST 1: First Chat Reliability
Test 5 different financial questions to validate the critical fix
"""
import requests
import json

BASE_URL = "https://financial-health-hub-17.preview.emergentagent.com"

def create_demo_session():
    s = requests.Session()
    csrf_resp = s.get(f"{BASE_URL}/api/auth/csrf")
    csrf_token = csrf_resp.json()["csrfToken"]
    print(f"✓ CSRF token: {csrf_token[:20]}...")
    
    demo_resp = s.post(
        f"{BASE_URL}/api/auth/callback/demo",
        data={"csrfToken": csrf_token, "redirect": "false"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        allow_redirects=False
    )
    print(f"✓ Demo session created: {demo_resp.status_code}")
    
    session_resp = s.get(f"{BASE_URL}/api/auth/session")
    session_data = session_resp.json()
    print(f"✓ Session verified: isDemo={session_data['user']['isDemo']}")
    return s

def parse_sse_events(text):
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
            current_event['event'] = line.split(':', 1)[1].strip()
        elif line.startswith('data:'):
            data_str = line.split(':', 1)[1].strip()
            try:
                current_event['data'] = json.loads(data_str)
            except:
                current_event['data'] = data_str
    
    if current_event:
        events.append(current_event)
    
    return events

def test_chat(session, question):
    messages = [{"role": "user", "content": question}]
    resp = session.post(
        f"{BASE_URL}/api/cfo/chat/stream",
        json={"messages": messages},
        stream=True,
        timeout=60
    )
    
    if resp.status_code != 200:
        return {"success": False, "error": f"Status {resp.status_code}"}
    
    if "text/event-stream" not in resp.headers.get("Content-Type", ""):
        return {"success": False, "error": "Not SSE stream"}
    
    events = parse_sse_events(resp.text)
    event_types = [e.get('event') for e in events]
    
    has_done = 'done' in event_types
    has_ai_unavailable = any(e.get('event') == 'error' and e.get('data', {}).get('code') == 'ai_unavailable' for e in events)
    
    final_answer = ""
    for e in events:
        if e.get('event') == 'token':
            final_answer += e.get('data', {}).get('delta', '')
    
    return {
        "success": has_done and not has_ai_unavailable and len(final_answer) > 0,
        "has_done": has_done,
        "has_ai_unavailable": has_ai_unavailable,
        "events": event_types,
        "answer_length": len(final_answer)
    }

print("=" * 80)
print("TEST 1: FIRST CHAT RELIABILITY (5 DIFFERENT QUESTIONS)")
print("=" * 80)

session = create_demo_session()

questions = [
    "What is my cash runway?",
    "Which expenses grew the most this month?",
    "Are there any overdue invoices?",
    "What anomalies do you see in my spending?",
    "Give me 3 recommendations to improve cash flow."
]

results = []
for i, question in enumerate(questions, 1):
    print(f"\n[TEST 1.{i}] '{question}'")
    try:
        result = test_chat(session, question)
        results.append(result)
        
        if result["success"]:
            print(f"  ✓ PASS: done={result['has_done']}, answer_length={result['answer_length']}")
            print(f"  Events: {', '.join(result['events'][:5])}...")
        else:
            print(f"  ✗ FAIL: done={result['has_done']}, ai_unavailable={result['has_ai_unavailable']}")
            print(f"  Events: {result['events']}")
    except Exception as e:
        print(f"  ✗ EXCEPTION: {e}")
        results.append({"success": False})

passed = sum(1 for r in results if r.get("success"))
print(f"\n{'=' * 80}")
print(f"RESULT: {passed}/{len(questions)} questions passed")
print(f"{'✓ PASS' if passed == len(questions) else '✗ FAIL'}")
print(f"{'=' * 80}")
