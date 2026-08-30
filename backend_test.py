#!/usr/bin/env python3
"""
Sprint P5 FINAL PRE-LAUNCH GATE — Live verification of Ask Nexus Personal
VERIFICATION-ONLY RUN. DO NOT MODIFY PRODUCT CODE.
Classify each item: PASS / NEEDS FIX / NOT IMPLEMENTED
"""

import requests
import json
import time
import re
from typing import Dict, List, Any, Optional

# Configuration
BASE_URL = "https://financial-health-hub-17.preview.emergentagent.com"
API_URL = f"{BASE_URL}/api"

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    END = '\033[0m'

class TestResult:
    def __init__(self):
        self.results = []
        self.passed = 0
        self.failed = 0
        self.not_implemented = 0
    
    def add(self, test_num: int, name: str, status: str, details: str = "", observed: str = ""):
        self.results.append({
            "num": test_num,
            "name": name,
            "status": status,
            "details": details,
            "observed": observed
        })
        if status == "PASS":
            self.passed += 1
        elif status == "NEEDS FIX":
            self.failed += 1
        elif status == "NOT IMPLEMENTED":
            self.not_implemented += 1
    
    def print_summary(self):
        print("\n" + "="*80)
        print("FINAL PRE-LAUNCH GATE — TEST RESULTS")
        print("="*80)
        for r in self.results:
            status_color = Colors.GREEN if r["status"] == "PASS" else (Colors.RED if r["status"] == "NEEDS FIX" else Colors.YELLOW)
            print(f"\n{r['num']}. {r['name']}")
            print(f"   Status: {status_color}{r['status']}{Colors.END}")
            if r["details"]:
                print(f"   Details: {r['details']}")
            if r["observed"]:
                print(f"   Observed: {r['observed']}")
        
        print("\n" + "="*80)
        print(f"TOTAL: {self.passed} PASS / {self.failed} NEEDS FIX / {self.not_implemented} NOT IMPLEMENTED")
        print("="*80)

def parse_sse_stream(response) -> Dict[str, Any]:
    """Parse SSE stream and return structured data"""
    events = []
    tool_calls = []
    tokens = []
    error = None
    
    for line in response.iter_lines(decode_unicode=True):
        if not line or line.startswith(':'):
            continue
        
        if line.startswith('event: '):
            event_type = line[7:].strip()
        elif line.startswith('data: '):
            try:
                data = json.loads(line[6:])
                events.append({"type": event_type, "data": data})
                
                if event_type == "tool_start":
                    tool_calls.append(data.get("name"))
                elif event_type == "token":
                    tokens.append(data.get("delta", ""))
                elif event_type == "error":
                    error = data
            except json.JSONDecodeError:
                pass
    
    full_answer = "".join(tokens)
    return {
        "events": events,
        "tool_calls": tool_calls,
        "answer": full_answer,
        "error": error
    }

def get_personal_demo_session() -> Optional[Dict[str, Any]]:
    """Create a personal demo session and return session cookies"""
    print(f"{Colors.BLUE}Creating personal demo session...{Colors.END}")
    
    # Get CSRF token
    csrf_resp = requests.get(f"{API_URL}/auth/csrf")
    if csrf_resp.status_code != 200:
        print(f"{Colors.RED}Failed to get CSRF token: {csrf_resp.status_code}{Colors.END}")
        return None
    
    csrf_token = csrf_resp.json().get("csrfToken")
    cookies = csrf_resp.cookies
    
    # Create demo session with product=personal
    demo_resp = requests.post(
        f"{API_URL}/auth/callback/demo",
        data={
            "csrfToken": csrf_token,
            "product": "personal",
            "json": "true"
        },
        cookies=cookies,
        allow_redirects=False
    )
    
    if demo_resp.status_code not in [200, 302]:
        print(f"{Colors.RED}Failed to create demo session: {demo_resp.status_code}{Colors.END}")
        return None
    
    # Merge cookies
    for cookie in demo_resp.cookies:
        cookies.set_cookie(cookie)
    
    # Verify session
    session_resp = requests.get(f"{API_URL}/auth/session", cookies=cookies)
    if session_resp.status_code != 200:
        print(f"{Colors.RED}Failed to verify session: {session_resp.status_code}{Colors.END}")
        return None
    
    session_data = session_resp.json()
    print(f"{Colors.GREEN}Personal demo session created successfully{Colors.END}")
    print(f"   User: {session_data.get('user', {}).get('email')}")
    print(f"   Workspace kind: {session_data.get('user', {}).get('workspaceKind')}")
    
    return {"cookies": cookies, "session": session_data}

def get_business_demo_session() -> Optional[Dict[str, Any]]:
    """Create a business demo session for enterprise regression test"""
    print(f"{Colors.BLUE}Creating business demo session...{Colors.END}")
    
    # Get CSRF token
    csrf_resp = requests.get(f"{API_URL}/auth/csrf")
    if csrf_resp.status_code != 200:
        return None
    
    csrf_token = csrf_resp.json().get("csrfToken")
    cookies = csrf_resp.cookies
    
    # Create demo session without product parameter (defaults to business)
    demo_resp = requests.post(
        f"{API_URL}/auth/callback/demo",
        data={
            "csrfToken": csrf_token,
            "json": "true"
        },
        cookies=cookies,
        allow_redirects=False
    )
    
    if demo_resp.status_code not in [200, 302]:
        return None
    
    for cookie in demo_resp.cookies:
        cookies.set_cookie(cookie)
    
    print(f"{Colors.GREEN}Business demo session created successfully{Colors.END}")
    return {"cookies": cookies}

def test_personal_chat(cookies, messages: List[Dict], description: str = "") -> Dict[str, Any]:
    """Send a chat message and parse the SSE response"""
    if description:
        print(f"   Testing: {description}")
    
    response = requests.post(
        f"{API_URL}/personal/chat",
        json={"messages": messages},
        cookies=cookies,
        stream=True,
        timeout=90
    )
    
    if response.status_code != 200:
        return {"status_code": response.status_code, "error": response.text}
    
    return {"status_code": 200, **parse_sse_stream(response)}

def main():
    results = TestResult()
    
    print(f"\n{Colors.BLUE}{'='*80}{Colors.END}")
    print(f"{Colors.BLUE}Sprint P5 FINAL PRE-LAUNCH GATE — Ask Nexus Personal{Colors.END}")
    print(f"{Colors.BLUE}{'='*80}{Colors.END}\n")
    
    # ========================================================================
    # TEST 1: Unauthenticated access
    # ========================================================================
    print(f"\n{Colors.BLUE}[TEST 1] Unauthenticated POST /api/personal/chat → 401{Colors.END}")
    try:
        resp = requests.post(
            f"{API_URL}/personal/chat",
            json={"messages": [{"role": "user", "content": "test"}]},
            timeout=10
        )
        if resp.status_code == 401:
            results.add(1, "Unauthenticated access", "PASS", "Returns 401 as expected")
        else:
            results.add(1, "Unauthenticated access", "NEEDS FIX", f"Expected 401, got {resp.status_code}")
    except Exception as e:
        results.add(1, "Unauthenticated access", "NEEDS FIX", f"Exception: {str(e)}")
    
    # ========================================================================
    # Create personal demo session for remaining tests
    # ========================================================================
    demo = get_personal_demo_session()
    if not demo:
        print(f"{Colors.RED}Failed to create demo session. Cannot continue.{Colors.END}")
        results.print_summary()
        return
    
    cookies = demo["cookies"]
    
    # Add small delay to avoid rate limiting
    time.sleep(2)
    
    # ========================================================================
    # TEST 2: Current-state question
    # ========================================================================
    print(f"\n{Colors.BLUE}[TEST 2] Current-state: 'How am I doing financially?'{Colors.END}")
    try:
        result = test_personal_chat(cookies, [{"role": "user", "content": "How am I doing financially?"}])
        
        if result.get("status_code") == 200:
            tools = result.get("tool_calls", [])
            answer = result.get("answer", "")
            
            has_state_or_health = "get_financial_state" in tools or "get_financial_health" in tools
            has_inr = "₹" in answer
            
            if has_state_or_health and has_inr:
                results.add(2, "Current-state question", "PASS", 
                           f"Tools fired: {', '.join(tools)}", 
                           f"Answer contains INR amounts: {answer[:200]}...")
            else:
                results.add(2, "Current-state question", "NEEDS FIX", 
                           f"Missing: state/health tool={has_state_or_health}, INR={has_inr}",
                           f"Tools: {tools}, Answer preview: {answer[:100]}")
        else:
            results.add(2, "Current-state question", "NEEDS FIX", f"Status: {result.get('status_code')}")
    except Exception as e:
        results.add(2, "Current-state question", "NEEDS FIX", f"Exception: {str(e)}")
    
    time.sleep(2)
    
    # ========================================================================
    # TEST 3: Financial health score
    # ========================================================================
    print(f"\n{Colors.BLUE}[TEST 3] Financial-health: 'What's my financial health score?'{Colors.END}")
    try:
        result = test_personal_chat(cookies, [{"role": "user", "content": "What's my financial health score?"}])
        
        if result.get("status_code") == 200:
            tools = result.get("tool_calls", [])
            answer = result.get("answer", "")
            
            has_health_tool = "get_financial_health" in tools
            has_score = re.search(r'\d+/100', answer) is not None
            
            if has_health_tool and has_score:
                score_match = re.search(r'(\d+)/100', answer)
                results.add(3, "Financial health score", "PASS", 
                           f"Tool fired: get_financial_health", 
                           f"Score found: {score_match.group(0) if score_match else 'N/A'}")
            else:
                results.add(3, "Financial health score", "NEEDS FIX", 
                           f"Missing: health_tool={has_health_tool}, score={has_score}",
                           f"Tools: {tools}, Answer: {answer[:100]}")
        else:
            results.add(3, "Financial health score", "NEEDS FIX", f"Status: {result.get('status_code')}")
    except Exception as e:
        results.add(3, "Financial health score", "NEEDS FIX", f"Exception: {str(e)}")
    
    time.sleep(2)
    
    # ========================================================================
    # TEST 4: Resilience
    # ========================================================================
    print(f"\n{Colors.BLUE}[TEST 4] Resilience: 'How many months could I survive if my income stopped?'{Colors.END}")
    try:
        result = test_personal_chat(cookies, [{"role": "user", "content": "How many months could I survive if my income stopped?"}])
        
        if result.get("status_code") == 200:
            tools = result.get("tool_calls", [])
            answer = result.get("answer", "")
            
            has_resilience_tool = "get_financial_resilience" in tools
            has_months = re.search(r'\d+\.?\d*\s*months?', answer, re.IGNORECASE) is not None
            
            if has_resilience_tool and has_months:
                months_match = re.search(r'(\d+\.?\d*)\s*months?', answer, re.IGNORECASE)
                results.add(4, "Resilience question", "PASS", 
                           f"Tool fired: get_financial_resilience", 
                           f"Months found: {months_match.group(1) if months_match else 'N/A'}")
            else:
                results.add(4, "Resilience question", "NEEDS FIX", 
                           f"Missing: resilience_tool={has_resilience_tool}, months={has_months}",
                           f"Tools: {tools}, Answer: {answer[:100]}")
        else:
            results.add(4, "Resilience question", "NEEDS FIX", f"Status: {result.get('status_code')}")
    except Exception as e:
        results.add(4, "Resilience question", "NEEDS FIX", f"Exception: {str(e)}")
    
    time.sleep(2)
    
    # ========================================================================
    # TEST 5: Forecast
    # ========================================================================
    print(f"\n{Colors.BLUE}[TEST 5] Forecast: 'What will my cash look like in 90 days?'{Colors.END}")
    try:
        result = test_personal_chat(cookies, [{"role": "user", "content": "What will my cash look like in 90 days?"}])
        
        if result.get("status_code") == 200:
            tools = result.get("tool_calls", [])
            
            has_forecast_tool = "get_cash_forecast" in tools
            
            if has_forecast_tool:
                results.add(5, "Forecast question", "PASS", 
                           f"Tool fired: get_cash_forecast")
            else:
                results.add(5, "Forecast question", "NEEDS FIX", 
                           f"get_cash_forecast not called",
                           f"Tools: {tools}")
        else:
            results.add(5, "Forecast question", "NEEDS FIX", f"Status: {result.get('status_code')}")
    except Exception as e:
        results.add(5, "Forecast question", "NEEDS FIX", f"Exception: {str(e)}")
    
    time.sleep(2)
    
    # ========================================================================
    # TEST 6: Spending breakdown
    # ========================================================================
    print(f"\n{Colors.BLUE}[TEST 6] Spending: 'Where am I spending the most?'{Colors.END}")
    try:
        result = test_personal_chat(cookies, [{"role": "user", "content": "Where am I spending the most?"}])
        
        if result.get("status_code") == 200:
            tools = result.get("tool_calls", [])
            
            has_spending_tool = "get_spending_breakdown" in tools
            
            if has_spending_tool:
                results.add(6, "Spending breakdown", "PASS", 
                           f"Tool fired: get_spending_breakdown")
            else:
                results.add(6, "Spending breakdown", "NEEDS FIX", 
                           f"get_spending_breakdown not called",
                           f"Tools: {tools}")
        else:
            results.add(6, "Spending breakdown", "NEEDS FIX", f"Status: {result.get('status_code')}")
    except Exception as e:
        results.add(6, "Spending breakdown", "NEEDS FIX", f"Exception: {str(e)}")
    
    time.sleep(2)
    
    # ========================================================================
    # TEST 7: Alerts
    # ========================================================================
    print(f"\n{Colors.BLUE}[TEST 7] Alerts: 'What should I pay attention to?'{Colors.END}")
    try:
        result = test_personal_chat(cookies, [{"role": "user", "content": "What should I pay attention to?"}])
        
        if result.get("status_code") == 200:
            tools = result.get("tool_calls", [])
            
            has_alerts_tool = "get_financial_alerts" in tools
            
            if has_alerts_tool:
                results.add(7, "Alerts question", "PASS", 
                           f"Tool fired: get_financial_alerts")
            else:
                results.add(7, "Alerts question", "NEEDS FIX", 
                           f"get_financial_alerts not called",
                           f"Tools: {tools}")
        else:
            results.add(7, "Alerts question", "NEEDS FIX", f"Status: {result.get('status_code')}")
    except Exception as e:
        results.add(7, "Alerts question", "NEEDS FIX", f"Exception: {str(e)}")
    
    time.sleep(2)
    
    # ========================================================================
    # TEST 8: Scenario question
    # ========================================================================
    print(f"\n{Colors.BLUE}[TEST 8] Scenario: 'Can I afford a ₹2 lakh laptop?'{Colors.END}")
    try:
        result = test_personal_chat(cookies, [{"role": "user", "content": "Can I afford a ₹2 lakh laptop?"}])
        
        if result.get("status_code") == 200:
            tools = result.get("tool_calls", [])
            answer = result.get("answer", "")
            
            has_scenario_tool = "evaluate_scenario" in tools
            
            if has_scenario_tool:
                results.add(8, "Scenario question", "PASS", 
                           f"Tool fired: evaluate_scenario",
                           f"Answer preview: {answer[:200]}...")
                # Store for test 9
                scenario_answer = answer
                scenario_events = result.get("events", [])
            else:
                results.add(8, "Scenario question", "NEEDS FIX", 
                           f"evaluate_scenario not called",
                           f"Tools: {tools}")
                scenario_answer = None
                scenario_events = []
        else:
            results.add(8, "Scenario question", "NEEDS FIX", f"Status: {result.get('status_code')}")
            scenario_answer = None
            scenario_events = []
    except Exception as e:
        results.add(8, "Scenario question", "NEEDS FIX", f"Exception: {str(e)}")
        scenario_answer = None
        scenario_events = []
    
    time.sleep(2)
    
    # ========================================================================
    # TEST 9: GROUNDING / ADVERSARIAL (CRITICAL)
    # ========================================================================
    print(f"\n{Colors.BLUE}[TEST 9] GROUNDING: Compare chat answer with deterministic engine{Colors.END}")
    try:
        # Call deterministic endpoint
        det_resp = requests.post(
            f"{API_URL}/personal/scenarios/evaluate",
            json={"levers": {"oneTimePurchase": {"amount": 200000}}},
            cookies=cookies,
            timeout=30
        )
        
        if det_resp.status_code == 200 and scenario_answer:
            det_data = det_resp.json()
            
            # Extract key numbers from deterministic response
            det_verdict = det_data.get("verdict", {}).get("level", "")
            det_resilience = det_data.get("scenario", {}).get("resilienceMonths", 0)
            det_health = det_data.get("scenario", {}).get("healthScore", 0)
            det_cash = det_data.get("scenario", {}).get("projected90dCash", 0)
            
            print(f"   Deterministic engine output:")
            print(f"      Verdict: {det_verdict}")
            print(f"      Resilience: {det_resilience} months")
            print(f"      Health: {det_health}/100")
            print(f"      Projected 90d cash: ₹{det_cash:,.0f}")
            
            # Extract numbers from chat answer
            # Look for resilience months
            resilience_match = re.search(r'(\d+\.?\d*)\s*months?', scenario_answer, re.IGNORECASE)
            chat_resilience = float(resilience_match.group(1)) if resilience_match else None
            
            # Look for health score
            health_match = re.search(r'(\d+)/100', scenario_answer)
            chat_health = int(health_match.group(1)) if health_match else None
            
            # Look for cash amounts (₹ followed by numbers)
            cash_matches = re.findall(r'₹[\d,]+', scenario_answer)
            
            print(f"\n   Chat answer extracted:")
            print(f"      Resilience: {chat_resilience} months")
            print(f"      Health: {chat_health}/100")
            print(f"      Cash amounts found: {cash_matches}")
            
            # Check if numbers match (with tolerance for rounding)
            resilience_match_ok = chat_resilience and abs(chat_resilience - det_resilience) < 0.5
            health_match_ok = chat_health and abs(chat_health - det_health) <= 2
            
            # Check verdict direction
            verdict_in_answer = det_verdict.lower() in scenario_answer.lower()
            
            if resilience_match_ok and health_match_ok:
                results.add(9, "GROUNDING check", "PASS", 
                           "Chat numbers MATCH deterministic engine",
                           f"Det: {det_verdict}, {det_resilience}mo, {det_health}/100 | Chat: {chat_resilience}mo, {chat_health}/100")
            else:
                results.add(9, "GROUNDING check", "NEEDS FIX", 
                           "Chat numbers DO NOT MATCH deterministic engine",
                           f"Det: {det_verdict}, {det_resilience}mo, {det_health}/100 | Chat: {chat_resilience}mo, {chat_health}/100")
        elif not scenario_answer:
            results.add(9, "GROUNDING check", "NEEDS FIX", "No scenario answer from test 8")
        else:
            results.add(9, "GROUNDING check", "NEEDS FIX", f"Deterministic endpoint failed: {det_resp.status_code}")
    except Exception as e:
        results.add(9, "GROUNDING check", "NEEDS FIX", f"Exception: {str(e)}")
    
    time.sleep(2)
    
    # ========================================================================
    # TEST 10: Missing value clarification
    # ========================================================================
    print(f"\n{Colors.BLUE}[TEST 10] Missing-value: 'Can I afford a car?' (no price){Colors.END}")
    try:
        result = test_personal_chat(cookies, [{"role": "user", "content": "Can I afford a car?"}])
        
        if result.get("status_code") == 200:
            tools = result.get("tool_calls", [])
            answer = result.get("answer", "")
            
            has_scenario_tool = "evaluate_scenario" in tools
            asks_for_price = any(word in answer.lower() for word in ["how much", "what price", "cost", "budget", "amount"])
            
            if not has_scenario_tool and asks_for_price:
                results.add(10, "Missing-value clarification", "PASS", 
                           "Assistant asks for price, does NOT call evaluate_scenario",
                           f"Answer: {answer[:150]}...")
            else:
                results.add(10, "Missing-value clarification", "NEEDS FIX", 
                           f"Should ask for price. evaluate_scenario called: {has_scenario_tool}, asks_for_price: {asks_for_price}",
                           f"Tools: {tools}, Answer: {answer[:100]}")
        else:
            results.add(10, "Missing-value clarification", "NEEDS FIX", f"Status: {result.get('status_code')}")
    except Exception as e:
        results.add(10, "Missing-value clarification", "NEEDS FIX", f"Exception: {str(e)}")
    
    time.sleep(2)
    
    # ========================================================================
    # TEST 11: Follow-up context
    # ========================================================================
    print(f"\n{Colors.BLUE}[TEST 11] Follow-up context: 'What if I wait two months?'{Colors.END}")
    try:
        # First message
        messages = [{"role": "user", "content": "Can I afford a ₹2 lakh laptop?"}]
        result1 = test_personal_chat(cookies, messages)
        
        if result1.get("status_code") == 200:
            # Append assistant response and follow-up
            messages.append({"role": "assistant", "content": result1.get("answer", "")})
            messages.append({"role": "user", "content": "What if I wait two months?"})
            
            time.sleep(2)
            result2 = test_personal_chat(cookies, messages)
            
            if result2.get("status_code") == 200:
                answer2 = result2.get("answer", "")
                
                # Check if it understands context (mentions laptop or purchase, doesn't ask "what purchase?")
                understands_context = any(word in answer2.lower() for word in ["laptop", "purchase", "₹2", "lakh"])
                asks_what_purchase = "what purchase" in answer2.lower() or "which purchase" in answer2.lower()
                
                if understands_context and not asks_what_purchase:
                    results.add(11, "Follow-up context", "PASS", 
                               "Understands same purchase context",
                               f"Answer: {answer2[:150]}...")
                else:
                    results.add(11, "Follow-up context", "NEEDS FIX", 
                               f"Context lost. understands={understands_context}, asks_what={asks_what_purchase}",
                               f"Answer: {answer2[:100]}")
            else:
                results.add(11, "Follow-up context", "NEEDS FIX", f"Follow-up failed: {result2.get('status_code')}")
        else:
            results.add(11, "Follow-up context", "NEEDS FIX", f"Initial message failed: {result1.get('status_code')}")
    except Exception as e:
        results.add(11, "Follow-up context", "NEEDS FIX", f"Exception: {str(e)}")
    
    time.sleep(2)
    
    # ========================================================================
    # TEST 12: No internal leakage
    # ========================================================================
    print(f"\n{Colors.BLUE}[TEST 12] No internal leakage in answers{Colors.END}")
    try:
        # Collect all answers from previous tests
        all_answers = []
        test_questions = [
            "How am I doing financially?",
            "What's my financial health score?",
            "Where am I spending the most?"
        ]
        
        for q in test_questions:
            result = test_personal_chat(cookies, [{"role": "user", "content": q}])
            if result.get("status_code") == 200:
                all_answers.append(result.get("answer", ""))
            time.sleep(2)
        
        # Check for leakage
        leakage_patterns = [
            r'get_financial_\w+',
            r'evaluate_scenario',
            r'system prompt',
            r'claude',
            r'gpt-',
            r'gemini',
            r'anthropic',
            r'openai'
        ]
        
        leakage_found = []
        for answer in all_answers:
            for pattern in leakage_patterns:
                if re.search(pattern, answer, re.IGNORECASE):
                    leakage_found.append(f"Pattern '{pattern}' in answer")
        
        if not leakage_found:
            results.add(12, "No internal leakage", "PASS", 
                       "No tool names, system prompts, or model names in answers")
        else:
            results.add(12, "No internal leakage", "NEEDS FIX", 
                       f"Leakage detected: {', '.join(leakage_found)}")
    except Exception as e:
        results.add(12, "No internal leakage", "NEEDS FIX", f"Exception: {str(e)}")
    
    # ========================================================================
    # TEST 13: Enterprise regression
    # ========================================================================
    print(f"\n{Colors.BLUE}[TEST 13] Enterprise regression: POST /api/cfo/chat/stream{Colors.END}")
    try:
        biz_demo = get_business_demo_session()
        if biz_demo:
            time.sleep(2)
            resp = requests.post(
                f"{API_URL}/cfo/chat/stream",
                json={"messages": [{"role": "user", "content": "What is my cash position?"}]},
                cookies=biz_demo["cookies"],
                stream=True,
                timeout=90
            )
            
            if resp.status_code == 200:
                parsed = parse_sse_stream(resp)
                has_events = len(parsed.get("events", [])) > 0
                has_dollar = "$" in parsed.get("answer", "")
                
                if has_events and has_dollar:
                    results.add(13, "Enterprise regression", "PASS", 
                               "CFO chat still streams correctly with $ amounts",
                               f"Events: {len(parsed['events'])}, Tools: {parsed.get('tool_calls', [])}")
                else:
                    results.add(13, "Enterprise regression", "NEEDS FIX", 
                               f"Missing: events={has_events}, dollar={has_dollar}")
            else:
                results.add(13, "Enterprise regression", "NEEDS FIX", f"Status: {resp.status_code}")
        else:
            results.add(13, "Enterprise regression", "NEEDS FIX", "Failed to create business demo")
    except Exception as e:
        results.add(13, "Enterprise regression", "NEEDS FIX", f"Exception: {str(e)}")
    
    time.sleep(2)
    
    # ========================================================================
    # TEST 14: P3/P4 regression
    # ========================================================================
    print(f"\n{Colors.BLUE}[TEST 14] P3/P4 regression: GET /api/personal/forecast and /alerts{Colors.END}")
    try:
        # Test forecast
        forecast_resp = requests.get(f"{API_URL}/personal/forecast", cookies=cookies, timeout=30)
        forecast_ok = False
        if forecast_resp.status_code == 200:
            forecast_data = forecast_resp.json()
            required_keys = ["forecast", "resilience"]
            forecast_keys = ["series", "startingCash", "endingCash", "lowestDay", "narrative"]
            
            has_required = all(k in forecast_data for k in required_keys)
            has_forecast_keys = all(k in forecast_data.get("forecast", {}) for k in forecast_keys)
            forecast_ok = has_required and has_forecast_keys
        
        # Test alerts
        alerts_resp = requests.get(f"{API_URL}/personal/alerts", cookies=cookies, timeout=30)
        alerts_ok = False
        if alerts_resp.status_code == 200:
            alerts_data = alerts_resp.json()
            required_keys = ["alerts", "summary"]
            summary_keys = ["critical", "warning", "info", "total"]
            
            has_required = all(k in alerts_data for k in required_keys)
            has_summary_keys = all(k in alerts_data.get("summary", {}) for k in summary_keys)
            alerts_ok = has_required and has_summary_keys
        
        if forecast_ok and alerts_ok:
            results.add(14, "P3/P4 regression", "PASS", 
                       "Both forecast and alerts return correct structure")
        else:
            results.add(14, "P3/P4 regression", "NEEDS FIX", 
                       f"forecast_ok={forecast_ok}, alerts_ok={alerts_ok}")
    except Exception as e:
        results.add(14, "P3/P4 regression", "NEEDS FIX", f"Exception: {str(e)}")
    
    # ========================================================================
    # TEST 15: AI-failure handling (code inspection)
    # ========================================================================
    print(f"\n{Colors.BLUE}[TEST 15] AI-failure handling (code inspection){Colors.END}")
    try:
        # Read the chat route code
        with open("/app/app/api/personal/chat/route.ts", "r") as f:
            code = f.read()
        
        # Check for error handling
        has_llm_unavailable = "LLMUnavailableError" in code
        has_error_event = 'event: error' in code or "send('error'" in code
        has_ai_unavailable_code = 'ai_unavailable' in code
        has_graceful_message = 'temporarily unavailable' in code.lower() or 'try again' in code.lower()
        
        if has_llm_unavailable and has_error_event and has_ai_unavailable_code and has_graceful_message:
            results.add(15, "AI-failure handling", "PASS", 
                       "Code has proper LLMUnavailableError handling with SSE error event")
        else:
            results.add(15, "AI-failure handling", "NEEDS FIX", 
                       f"Missing: llm_unavailable={has_llm_unavailable}, error_event={has_error_event}, ai_unavailable_code={has_ai_unavailable_code}, graceful_msg={has_graceful_message}")
    except Exception as e:
        results.add(15, "AI-failure handling", "NEEDS FIX", f"Exception: {str(e)}")
    
    # ========================================================================
    # TEST 16: Privacy analytics (code inspection)
    # ========================================================================
    print(f"\n{Colors.BLUE}[TEST 16] Privacy analytics (code inspection){Colors.END}")
    try:
        # Read chat and scenario routes
        with open("/app/app/api/personal/chat/route.ts", "r") as f:
            chat_code = f.read()
        with open("/app/app/api/personal/scenarios/evaluate/route.ts", "r") as f:
            scenario_code = f.read()
        
        # Find all trackServer calls
        track_calls = re.findall(r"trackServer\([^)]+\)", chat_code + scenario_code, re.DOTALL)
        
        # Check that no financial amounts are in track calls
        has_amount_leak = any(re.search(r'(amount|cash|income|spend|surplus|balance|value)', call, re.IGNORECASE) 
                             for call in track_calls 
                             if 'meta' not in call or re.search(r'meta.*amount', call, re.IGNORECASE))
        
        # Check for proper meta usage
        has_meta_feature = any('meta' in call and 'feature' in call for call in track_calls)
        
        if not has_amount_leak and has_meta_feature:
            results.add(16, "Privacy analytics", "PASS", 
                       "No financial amounts in trackServer calls, only event names and meta.feature")
        else:
            results.add(16, "Privacy analytics", "NEEDS FIX", 
                       f"amount_leak={has_amount_leak}, has_meta_feature={has_meta_feature}")
    except Exception as e:
        results.add(16, "Privacy analytics", "NEEDS FIX", f"Exception: {str(e)}")
    
    # ========================================================================
    # Print final summary
    # ========================================================================
    results.print_summary()
    
    # Update test_result.md
    print(f"\n{Colors.BLUE}Test execution complete. Results ready for test_result.md update.{Colors.END}")

if __name__ == "__main__":
    main()
