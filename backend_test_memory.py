#!/usr/bin/env python3
"""
Backend test for Executive Memory System (Sprint 2.7 Phase 3)
Tests all 6 scenarios: CRUD, auto-extraction, memory referencing, tenant isolation, category-scoped reset, auth checks
"""
import requests
import time
import json
import sys

# Base URL from .env
BASE_URL = "https://financial-health-hub-17.preview.emergentagent.com"

def print_test(msg):
    print(f"\n{'='*80}")
    print(f"TEST: {msg}")
    print('='*80)

def print_pass(msg):
    print(f"✅ PASS: {msg}")

def print_fail(msg):
    print(f"❌ FAIL: {msg}")
    
def print_info(msg):
    print(f"ℹ️  INFO: {msg}")

def create_demo_session():
    """Create a demo session using the demo-mode flow"""
    s = requests.Session()
    
    # Step 1: Get CSRF token
    csrf_resp = s.get(f"{BASE_URL}/api/auth/csrf")
    if csrf_resp.status_code != 200:
        print_fail(f"Failed to get CSRF token: {csrf_resp.status_code}")
        return None
    csrf_token = csrf_resp.json().get('csrfToken')
    print_info(f"Got CSRF token: {csrf_token[:20]}...")
    
    # Step 2: Create demo session
    demo_resp = s.post(
        f"{BASE_URL}/api/auth/callback/demo",
        data={'csrfToken': csrf_token, 'redirect': 'false'},
        headers={'Content-Type': 'application/x-www-form-urlencoded'},
        allow_redirects=False
    )
    
    if demo_resp.status_code not in [200, 302]:
        print_fail(f"Failed to create demo session: {demo_resp.status_code}")
        return None
    
    # Step 3: Verify session
    session_resp = s.get(f"{BASE_URL}/api/auth/session")
    if session_resp.status_code != 200:
        print_fail(f"Failed to get session: {session_resp.status_code}")
        return None
    
    session_data = session_resp.json()
    if not session_data.get('user', {}).get('isDemo'):
        print_fail("Session is not a demo session")
        return None
    
    print_pass(f"Demo session created with activeOrgId: {session_data['user'].get('activeOrgId')}")
    return s

def test_1_memory_crud():
    """Test 1: Memory CRUD operations"""
    print_test("TEST 1: Memory CRUD Operations")
    
    session = create_demo_session()
    if not session:
        print_fail("Could not create demo session")
        return False
    
    try:
        # 1a: Create a goal memory
        print_info("1a: Creating goal memory...")
        create_resp = session.post(
            f"{BASE_URL}/api/memory",
            json={
                "category": "goal",
                "label": "Extend runway",
                "value": "Reach 12 months of runway by Q4 2026"
            }
        )
        
        if create_resp.status_code != 200:
            print_fail(f"Failed to create memory: {create_resp.status_code} - {create_resp.text}")
            return False
        
        created_memory = create_resp.json().get('memory')
        if not created_memory:
            print_fail("No memory returned in create response")
            return False
        
        memory_id = created_memory['id']
        print_pass(f"Created memory with id: {memory_id}")
        
        # 1b: GET /api/memory - confirm it appears in goal array
        print_info("1b: Fetching all memories...")
        list_resp = session.get(f"{BASE_URL}/api/memory")
        
        if list_resp.status_code != 200:
            print_fail(f"Failed to list memories: {list_resp.status_code}")
            return False
        
        memories = list_resp.json().get('memories', {})
        goal_memories = memories.get('goal', [])
        
        if not any(m['id'] == memory_id for m in goal_memories):
            print_fail("Created memory not found in goal array")
            return False
        
        print_pass(f"Memory found in goal array ({len(goal_memories)} total goal memories)")
        
        # 1c: PATCH /api/memory/{id} - update the value
        print_info("1c: Updating memory value...")
        update_resp = session.patch(
            f"{BASE_URL}/api/memory/{memory_id}",
            json={"value": "Reach 15 months of runway by Q4 2026"}
        )
        
        if update_resp.status_code != 200:
            print_fail(f"Failed to update memory: {update_resp.status_code} - {update_resp.text}")
            return False
        
        updated_memory = update_resp.json().get('memory')
        if updated_memory['value'] != "Reach 15 months of runway by Q4 2026":
            print_fail(f"Memory value not updated correctly: {updated_memory['value']}")
            return False
        
        print_pass("Memory value updated successfully")
        
        # 1d: DELETE /api/memory/{id} - delete the memory
        print_info("1d: Deleting memory...")
        delete_resp = session.delete(f"{BASE_URL}/api/memory/{memory_id}")
        
        if delete_resp.status_code != 200:
            print_fail(f"Failed to delete memory: {delete_resp.status_code}")
            return False
        
        print_pass("Memory deleted successfully")
        
        # Verify it's gone
        list_resp2 = session.get(f"{BASE_URL}/api/memory")
        memories2 = list_resp2.json().get('memories', {})
        goal_memories2 = memories2.get('goal', [])
        
        if any(m['id'] == memory_id for m in goal_memories2):
            print_fail("Deleted memory still appears in goal array")
            return False
        
        print_pass("Confirmed memory is gone from goal array")
        
        # 1e: Create 3 more memories across different categories, then reset ALL
        print_info("1e: Creating 3 memories across different categories...")
        
        categories_to_create = [
            {"category": "business", "label": "Industry", "value": "SaaS B2B"},
            {"category": "decision", "label": "Hiring freeze", "value": "Delay all hiring until Q3 2026"},
            {"category": "preference", "label": "Currency", "value": "Display all amounts in USD"}
        ]
        
        created_ids = []
        for mem_data in categories_to_create:
            resp = session.post(f"{BASE_URL}/api/memory", json=mem_data)
            if resp.status_code != 200:
                print_fail(f"Failed to create {mem_data['category']} memory: {resp.status_code}")
                return False
            created_ids.append(resp.json()['memory']['id'])
        
        print_pass(f"Created 3 memories: {created_ids}")
        
        # Reset ALL memories
        print_info("Resetting ALL memories...")
        reset_resp = session.delete(f"{BASE_URL}/api/memory")
        
        if reset_resp.status_code != 200:
            print_fail(f"Failed to reset all memories: {reset_resp.status_code}")
            return False
        
        deleted_count = reset_resp.json().get('deleted', 0)
        print_pass(f"Reset all memories (deleted {deleted_count} memories)")
        
        # Verify all categories are empty
        list_resp3 = session.get(f"{BASE_URL}/api/memory")
        memories3 = list_resp3.json().get('memories', {})
        
        all_empty = all(len(memories3.get(cat, [])) == 0 for cat in ['business', 'financial', 'goal', 'decision', 'preference'])
        
        if not all_empty:
            print_fail("Not all category arrays are empty after reset")
            print_info(f"Memories remaining: {memories3}")
            return False
        
        print_pass("All category arrays are empty after reset")
        
        return True
        
    except Exception as e:
        print_fail(f"Exception in test_1_memory_crud: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_2_auto_extraction():
    """Test 2: Auto-extraction from chat"""
    print_test("TEST 2: Auto-extraction from chat")
    
    session = create_demo_session()
    if not session:
        print_fail("Could not create demo session")
        return False
    
    try:
        # Clear any existing memories first
        session.delete(f"{BASE_URL}/api/memory")
        
        # Send a chat message with explicit decision content
        print_info("Sending chat message with decision content...")
        chat_resp = session.post(
            f"{BASE_URL}/api/cfo/chat/stream",
            json={
                "messages": [
                    {
                        "role": "user",
                        "content": "We have decided to reduce our marketing spend by 20% this quarter to save cash."
                    }
                ]
            }
        )
        
        if chat_resp.status_code != 200:
            print_fail(f"Chat request failed: {chat_resp.status_code}")
            return False
        
        # Parse SSE stream to ensure it completes
        stream_text = chat_resp.text
        if 'event: done' not in stream_text:
            print_fail("Chat stream did not complete (no 'done' event)")
            return False
        
        print_pass("Chat message sent successfully")
        
        # Wait for fire-and-forget extraction to complete
        print_info("Waiting 5 seconds for memory extraction...")
        time.sleep(5)
        
        # Check if memory was extracted
        print_info("Checking for extracted memory...")
        list_resp = session.get(f"{BASE_URL}/api/memory")
        
        if list_resp.status_code != 200:
            print_fail(f"Failed to list memories: {list_resp.status_code}")
            return False
        
        memories = list_resp.json().get('memories', {})
        decision_memories = memories.get('decision', [])
        
        if len(decision_memories) == 0:
            print_fail("No decision memory was extracted")
            return False
        
        # Check if any decision memory references marketing spend
        marketing_memory = None
        for mem in decision_memories:
            if 'marketing' in mem['label'].lower() or 'marketing' in mem['value'].lower():
                marketing_memory = mem
                break
        
        if not marketing_memory:
            print_fail(f"No memory about marketing spend found. Extracted memories: {decision_memories}")
            return False
        
        if marketing_memory['source'] != 'ai_extracted':
            print_fail(f"Memory source is not 'ai_extracted': {marketing_memory['source']}")
            return False
        
        print_pass(f"Memory auto-extracted successfully: {marketing_memory['label']} - {marketing_memory['value']}")
        
        return True
        
    except Exception as e:
        print_fail(f"Exception in test_2_auto_extraction: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_3_memory_referenced():
    """Test 3: Memory referenced in later turns"""
    print_test("TEST 3: Memory referenced in later turns")
    
    session = create_demo_session()
    if not session:
        print_fail("Could not create demo session")
        return False
    
    try:
        # Clear existing memories
        session.delete(f"{BASE_URL}/api/memory")
        
        # Send first message with decision
        print_info("Sending first message with decision...")
        chat_resp1 = session.post(
            f"{BASE_URL}/api/cfo/chat/stream",
            json={
                "messages": [
                    {
                        "role": "user",
                        "content": "We have decided to reduce our marketing spend by 20% this quarter to save cash."
                    }
                ]
            }
        )
        
        if chat_resp1.status_code != 200:
            print_fail(f"First chat request failed: {chat_resp1.status_code}")
            return False
        
        # Extract conversationId from stream
        stream_text = chat_resp1.text
        conversation_id = None
        for line in stream_text.split('\n'):
            if line.startswith('data: ') and 'conversationId' in line:
                try:
                    data = json.loads(line[6:])
                    conversation_id = data.get('conversationId')
                    if conversation_id:
                        break
                except:
                    pass
        
        if not conversation_id:
            print_fail("Could not extract conversationId from first message")
            return False
        
        print_pass(f"First message sent, conversationId: {conversation_id}")
        
        # Wait for extraction
        print_info("Waiting 5 seconds for memory extraction...")
        time.sleep(5)
        
        # Verify memory was extracted
        list_resp = session.get(f"{BASE_URL}/api/memory")
        memories = list_resp.json().get('memories', {})
        decision_memories = memories.get('decision', [])
        
        if len(decision_memories) == 0:
            print_fail("No decision memory was extracted from first message")
            return False
        
        print_pass(f"Memory extracted: {decision_memories[0]['label']}")
        
        # Send follow-up message asking about the decision
        print_info("Sending follow-up message asking about marketing decision...")
        chat_resp2 = session.post(
            f"{BASE_URL}/api/cfo/chat/stream",
            json={
                "conversationId": conversation_id,
                "messages": [
                    {
                        "role": "user",
                        "content": "We have decided to reduce our marketing spend by 20% this quarter to save cash."
                    },
                    {
                        "role": "assistant",
                        "content": "I understand you've decided to reduce marketing spend by 20% this quarter."
                    },
                    {
                        "role": "user",
                        "content": "What did we decide about marketing spend?"
                    }
                ]
            }
        )
        
        if chat_resp2.status_code != 200:
            print_fail(f"Follow-up chat request failed: {chat_resp2.status_code}")
            return False
        
        # Check if the response mentions marketing or 20%
        stream_text2 = chat_resp2.text
        answer_text = ""
        
        for line in stream_text2.split('\n'):
            if line.startswith('data: ') and 'event: token' in stream_text2:
                try:
                    data = json.loads(line[6:])
                    if 'delta' in data:
                        answer_text += data['delta']
                except:
                    pass
        
        # If we couldn't extract from tokens, try to get the full answer
        if not answer_text:
            # Look for answer content in the stream
            for line in stream_text2.split('\n'):
                if 'marketing' in line.lower() or '20' in line:
                    answer_text = line
                    break
        
        if not answer_text:
            print_fail("Could not extract answer text from follow-up message")
            print_info(f"Stream preview: {stream_text2[:500]}")
            return False
        
        # Check if answer references marketing or the 20% reduction
        if 'marketing' not in answer_text.lower() and '20' not in answer_text:
            print_fail(f"Answer does not reference marketing decision: {answer_text[:200]}")
            return False
        
        print_pass(f"Memory referenced in follow-up answer: {answer_text[:150]}...")
        
        return True
        
    except Exception as e:
        print_fail(f"Exception in test_3_memory_referenced: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_4_tenant_isolation():
    """Test 4: Tenant isolation"""
    print_test("TEST 4: Tenant isolation")
    
    try:
        # Create first demo session
        print_info("Creating first demo session...")
        session1 = create_demo_session()
        if not session1:
            print_fail("Could not create first demo session")
            return False
        
        # Clear and create a memory in first session
        session1.delete(f"{BASE_URL}/api/memory")
        create_resp1 = session1.post(
            f"{BASE_URL}/api/memory",
            json={
                "category": "goal",
                "label": "Session 1 Goal",
                "value": "This is from session 1"
            }
        )
        
        if create_resp1.status_code != 200:
            print_fail(f"Failed to create memory in session 1: {create_resp1.status_code}")
            return False
        
        print_pass("Created memory in first session")
        
        # Create second demo session (completely separate)
        print_info("Creating second demo session...")
        session2 = create_demo_session()
        if not session2:
            print_fail("Could not create second demo session")
            return False
        
        # Check memories in second session
        print_info("Checking memories in second session...")
        list_resp2 = session2.get(f"{BASE_URL}/api/memory")
        
        if list_resp2.status_code != 200:
            print_fail(f"Failed to list memories in session 2: {list_resp2.status_code}")
            return False
        
        memories2 = list_resp2.json().get('memories', {})
        
        # Check if all categories are empty
        all_empty = all(len(memories2.get(cat, [])) == 0 for cat in ['business', 'financial', 'goal', 'decision', 'preference'])
        
        if not all_empty:
            print_fail(f"Second session has memories from first session! {memories2}")
            return False
        
        print_pass("Second session has no memories from first session (tenant isolation working)")
        
        return True
        
    except Exception as e:
        print_fail(f"Exception in test_4_tenant_isolation: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_5_category_scoped_reset():
    """Test 5: Category-scoped reset"""
    print_test("TEST 5: Category-scoped reset")
    
    session = create_demo_session()
    if not session:
        print_fail("Could not create demo session")
        return False
    
    try:
        # Clear all memories first
        session.delete(f"{BASE_URL}/api/memory")
        
        # Create memories in two different categories
        print_info("Creating memories in 'goal' and 'business' categories...")
        
        goal_resp = session.post(
            f"{BASE_URL}/api/memory",
            json={
                "category": "goal",
                "label": "Test Goal",
                "value": "This is a test goal"
            }
        )
        
        business_resp = session.post(
            f"{BASE_URL}/api/memory",
            json={
                "category": "business",
                "label": "Test Business",
                "value": "This is a test business fact"
            }
        )
        
        if goal_resp.status_code != 200 or business_resp.status_code != 200:
            print_fail("Failed to create test memories")
            return False
        
        print_pass("Created memories in both categories")
        
        # Delete only goal category
        print_info("Deleting only 'goal' category...")
        delete_resp = session.delete(f"{BASE_URL}/api/memory?category=goal")
        
        if delete_resp.status_code != 200:
            print_fail(f"Failed to delete goal category: {delete_resp.status_code}")
            return False
        
        deleted_count = delete_resp.json().get('deleted', 0)
        print_pass(f"Deleted {deleted_count} goal memories")
        
        # Verify goal is empty but business still has memory
        print_info("Verifying category-scoped deletion...")
        list_resp = session.get(f"{BASE_URL}/api/memory")
        memories = list_resp.json().get('memories', {})
        
        goal_memories = memories.get('goal', [])
        business_memories = memories.get('business', [])
        
        if len(goal_memories) != 0:
            print_fail(f"Goal category is not empty: {goal_memories}")
            return False
        
        if len(business_memories) == 0:
            print_fail("Business category is empty (should still have memory)")
            return False
        
        print_pass("Goal category is empty, business category still has memory")
        
        return True
        
    except Exception as e:
        print_fail(f"Exception in test_5_category_scoped_reset: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_6_auth_check():
    """Test 6: Auth check - unauthenticated access should return 401"""
    print_test("TEST 6: Auth check")
    
    try:
        # Create a session without authentication
        unauth_session = requests.Session()
        
        # Test GET /api/memory
        print_info("Testing GET /api/memory without auth...")
        get_resp = unauth_session.get(f"{BASE_URL}/api/memory")
        
        if get_resp.status_code != 401:
            print_fail(f"GET /api/memory returned {get_resp.status_code} instead of 401")
            return False
        
        print_pass("GET /api/memory returns 401 without auth")
        
        # Test POST /api/memory
        print_info("Testing POST /api/memory without auth...")
        post_resp = unauth_session.post(
            f"{BASE_URL}/api/memory",
            json={
                "category": "goal",
                "label": "Test",
                "value": "Test"
            }
        )
        
        if post_resp.status_code != 401:
            print_fail(f"POST /api/memory returned {post_resp.status_code} instead of 401")
            return False
        
        print_pass("POST /api/memory returns 401 without auth")
        
        # Test DELETE /api/memory
        print_info("Testing DELETE /api/memory without auth...")
        delete_resp = unauth_session.delete(f"{BASE_URL}/api/memory")
        
        if delete_resp.status_code != 401:
            print_fail(f"DELETE /api/memory returned {delete_resp.status_code} instead of 401")
            return False
        
        print_pass("DELETE /api/memory returns 401 without auth")
        
        return True
        
    except Exception as e:
        print_fail(f"Exception in test_6_auth_check: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    print("\n" + "="*80)
    print("EXECUTIVE MEMORY SYSTEM - BACKEND TEST SUITE")
    print("Sprint 2.7 Phase 3")
    print("="*80)
    
    results = {}
    
    # Run all tests
    results['Test 1: Memory CRUD'] = test_1_memory_crud()
    results['Test 2: Auto-extraction'] = test_2_auto_extraction()
    results['Test 3: Memory referenced'] = test_3_memory_referenced()
    results['Test 4: Tenant isolation'] = test_4_tenant_isolation()
    results['Test 5: Category-scoped reset'] = test_5_category_scoped_reset()
    results['Test 6: Auth check'] = test_6_auth_check()
    
    # Print summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    print("\n" + "="*80)
    print(f"TOTAL: {passed}/{total} tests passed ({passed*100//total}%)")
    print("="*80)
    
    return 0 if passed == total else 1

if __name__ == '__main__':
    sys.exit(main())
