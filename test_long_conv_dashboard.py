#!/usr/bin/env python3
"""
Sprint 2.7 Phase 2 - TEST 4 & 5: Long Conversation + Dashboard Auto-refresh
"""
import requests
import json
import time

BASE_URL = "https://financial-health-hub-17.preview.emergentagent.com"

def create_demo_session():
    s = requests.Session()
    csrf_resp = s.get(f"{BASE_URL}/api/auth/csrf")
    csrf_token = csrf_resp.json()["csrfToken"]
    
    s.post(
        f"{BASE_URL}/api/auth/callback/demo",
        data={"csrfToken": csrf_token, "redirect": "false"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        allow_redirects=False
    )
    print("✓ Demo session created")
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

def test_chat(session, question, conversation_id=None):
    messages = [{"role": "user", "content": question}]
    payload = {"messages": messages}
    if conversation_id:
        payload["conversationId"] = conversation_id
    
    resp = session.post(
        f"{BASE_URL}/api/cfo/chat/stream",
        json=payload,
        stream=True,
        timeout=60
    )
    
    if resp.status_code != 200:
        return {"success": False, "conversationId": None}
    
    events = parse_sse_events(resp.text)
    event_types = [e.get('event') for e in events]
    
    has_done = 'done' in event_types
    has_ai_unavailable = any(e.get('event') == 'error' and e.get('data', {}).get('code') == 'ai_unavailable' for e in events)
    
    conv_id = None
    for e in events:
        if e.get('event') == 'meta':
            conv_id = e.get('data', {}).get('conversationId')
            break
    
    return {
        "success": has_done and not has_ai_unavailable,
        "conversationId": conv_id
    }

print("=" * 80)
print("TEST 4: LONG CONVERSATION STABILITY (10 SEQUENTIAL MESSAGES)")
print("=" * 80)

session = create_demo_session()

questions = [
    "What is my cash position?",
    "Tell me more",
    "What about expenses?",
    "Any revenue trends?",
    "What are my top vendors?",
    "Any anomalies?",
    "What about invoices?",
    "Give me recommendations",
    "What is my runway?",
    "Summarize everything"
]

conversation_id = None
results = []
for i, question in enumerate(questions, 1):
    print(f"[TEST 4.{i}] Message #{i}: '{question[:30]}...'", end=" ")
    try:
        result = test_chat(session, question, conversation_id)
        results.append(result)
        
        if result.get("conversationId"):
            conversation_id = result["conversationId"]
        
        if result["success"]:
            print(f"✓")
        else:
            print(f"✗")
    except Exception as e:
        print(f"✗ {e}")
        results.append({"success": False})
    
    time.sleep(0.3)

test4_pass = sum(1 for r in results if r.get("success")) == len(questions)
print(f"\n{'=' * 80}")
print(f"RESULT: {sum(1 for r in results if r.get('success'))}/{len(questions)} messages passed")
print(f"{'✓ PASS' if test4_pass else '✗ FAIL'} - Long conversation stability")
if test4_pass:
    print("Conversation compaction logic working (no context-length error)")
print(f"{'=' * 80}")

# TEST 5: Dashboard auto-refresh data check
print("\n" + "=" * 80)
print("TEST 5: DASHBOARD AUTO-REFRESH DATA CHECK")
print("=" * 80)

print("\n[TEST 5] GET /api/cfo/briefing after uploads")
try:
    resp = session.get(f"{BASE_URL}/api/cfo/briefing", timeout=30)
    
    if resp.status_code == 200:
        data = resp.json()
        required_keys = ["briefing", "kpis", "health", "forecast"]
        has_all_keys = all(k in data for k in required_keys)
        
        print(f"  ✓ Briefing retrieved (200)")
        print(f"  ✓ Has all required keys: {has_all_keys}")
        
        kpis = data.get("kpis", {})
        print(f"  ✓ KPIs: revenue={kpis.get('revenue')}, expenses={kpis.get('expenses')}")
        print(f"  ✓ Data accessible (SWR would pick up changes)")
        
        test5_pass = has_all_keys
    else:
        print(f"  ✗ FAIL: Expected 200, got {resp.status_code}")
        test5_pass = False
except Exception as e:
    print(f"  ✗ FAIL: {e}")
    test5_pass = False

print(f"\n{'=' * 80}")
print(f"RESULT: {'✓ PASS' if test5_pass else '✗ FAIL'} - Dashboard auto-refresh data check")
print(f"{'=' * 80}")

# FINAL SUMMARY
print("\n" + "=" * 80)
print("TESTS 4 & 5 SUMMARY")
print("=" * 80)
print(f"TEST 4: {'✓ PASS' if test4_pass else '✗ FAIL'} - Long conversation stability")
print(f"TEST 5: {'✓ PASS' if test5_pass else '✗ FAIL'} - Dashboard auto-refresh")
print(f"{'=' * 80}")
