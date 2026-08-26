#!/usr/bin/env python3
"""Debug coexistence test - check if business org is created during registration"""

import requests
import json
import os
import random
import string
from pymongo import MongoClient

BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://financial-health-hub-17.preview.emergentagent.com')
API_URL = f"{BASE_URL}/api"
MONGO_URL = os.getenv('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.getenv('DB_NAME', 'nexusai')

# MongoDB connection
mongo_client = MongoClient(MONGO_URL)
db = mongo_client[DB_NAME]

# Register a new user
random_suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
test_email = f"coexist_test_{random_suffix}@nexusai.com"
test_password = "TestPassword123"

print(f"Registering user: {test_email}")

session = requests.Session()

# Register
reg_resp = session.post(
    f"{API_URL}/register",
    json={'email': test_email, 'password': test_password, 'name': 'Coexist Test'},
    timeout=10
)

print(f"Registration status: {reg_resp.status_code}")
if reg_resp.status_code == 200:
    reg_data = reg_resp.json()
    user_id = reg_data.get('user', {}).get('id')
    print(f"User ID: {user_id}")
    
    # Check memberships immediately after registration
    memberships = list(db['memberships'].find({'userId': user_id}))
    print(f"\nMemberships after registration: {len(memberships)}")
    
    for m in memberships:
        org = db['organizations'].find_one({'id': m['organizationId']})
        print(f"  - Org: {org.get('name')}, Kind: {org.get('kind', 'absent')}, Role: {m['role']}")
    
    # Login
    csrf_resp = session.get(f"{API_URL}/auth/csrf", timeout=10)
    csrf_token = csrf_resp.json().get('csrfToken')
    
    login_resp = session.post(
        f"{API_URL}/auth/callback/credentials",
        data={
            'csrfToken': csrf_token,
            'email': test_email,
            'password': test_password,
            'redirect': 'false'
        },
        allow_redirects=False,
        timeout=10
    )
    
    print(f"\nLogin status: {login_resp.status_code}")
    
    # Check session
    session_resp = session.get(f"{API_URL}/auth/session", timeout=10)
    session_data = session_resp.json()
    print(f"Session activeOrgId: {session_data.get('user', {}).get('activeOrgId')}")
    print(f"Session workspaceKind: {session_data.get('user', {}).get('workspaceKind')}")
    
    # Create personal workspace
    print("\nCreating personal workspace...")
    personal_resp = session.post(f"{API_URL}/personal/workspace", json={}, timeout=10)
    print(f"Personal workspace status: {personal_resp.status_code}")
    
    if personal_resp.status_code == 200:
        personal_data = personal_resp.json()
        print(f"Personal workspace created: {personal_data.get('created')}")
        print(f"Personal workspace ID: {personal_data.get('workspace', {}).get('id')}")
    
    # Check memberships after creating personal workspace
    import time
    time.sleep(1)
    memberships = list(db['memberships'].find({'userId': user_id}))
    print(f"\nMemberships after personal workspace creation: {len(memberships)}")
    
    for m in memberships:
        org = db['organizations'].find_one({'id': m['organizationId']})
        print(f"  - Org: {org.get('name')}, Kind: {org.get('kind', 'absent')}, Role: {m['role']}")
    
    # Check all orgs for this user via API
    orgs_resp = session.get(f"{API_URL}/organizations", timeout=10)
    if orgs_resp.status_code == 200:
        orgs_data = orgs_resp.json()
        print(f"\nOrganizations via API: {len(orgs_data.get('organizations', []))}")
        for org in orgs_data.get('organizations', []):
            print(f"  - {org.get('name')}, Kind: {org.get('kind', 'absent')}")
