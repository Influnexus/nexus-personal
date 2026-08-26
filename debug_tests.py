#!/usr/bin/env python3
"""Debug failing tests"""

import requests
import json
import os

BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://financial-health-hub-17.preview.emergentagent.com')
API_URL = f"{BASE_URL}/api"

# Get demo session
session = requests.Session()
csrf_resp = session.get(f"{API_URL}/auth/csrf", timeout=10)
csrf_token = csrf_resp.json().get('csrfToken')

demo_resp = session.post(
    f"{API_URL}/auth/callback/demo",
    data={'csrfToken': csrf_token},
    allow_redirects=False,
    timeout=10
)

print(f"Demo callback status: {demo_resp.status_code}")

# Check session
session_resp = session.get(f"{API_URL}/auth/session", timeout=10)
session_data = session_resp.json()
print(f"\nSession data:")
print(json.dumps(session_data, indent=2))

# Check briefing keys
print("\n" + "="*80)
print("Checking briefing keys...")
briefing_resp = session.get(f"{API_URL}/cfo/briefing", timeout=15)
if briefing_resp.status_code == 200:
    data = briefing_resp.json()
    print(f"Briefing keys: {list(data.keys())}")
else:
    print(f"Briefing failed: {briefing_resp.status_code}")

# Check chat streaming format
print("\n" + "="*80)
print("Checking chat streaming format...")
chat_resp = session.post(
    f"{API_URL}/cfo/chat/stream",
    json={'messages': [{'role': 'user', 'content': 'Hi'}]},
    stream=True,
    timeout=60
)

print(f"Chat status: {chat_resp.status_code}")
print(f"Content-Type: {chat_resp.headers.get('content-type')}")

if chat_resp.status_code == 200:
    print("\nFirst 10 lines:")
    for i, line in enumerate(chat_resp.iter_lines()):
        if i >= 10:
            break
        if line:
            print(f"  {line.decode('utf-8')[:100]}")
