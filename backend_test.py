#!/usr/bin/env python3
"""
NexusAI Sprint 1.5 - Comprehensive Backend Hardening Tests
Tests authentication, authorization, RBAC, cross-tenant isolation, privilege escalation,
validation, invitation flow, audit logging, and security edge cases.
"""

import requests
import json
import time
from typing import Dict, Any, Optional
from pymongo import MongoClient

# Configuration
BASE_URL = "https://nexus-enterprise-ai-2.preview.emergentagent.com"
MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "nexusai"

# Test results tracking
test_results = []
bugs_found = []

# Unique test run ID to avoid conflicts
TEST_RUN_ID = str(int(time.time()))

def log_test(name: str, passed: bool, details: str = ""):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"{status}: {name}")
    if details:
        print(f"   Details: {details}")
    test_results.append({"name": name, "passed": passed, "details": details})
    if not passed:
        bugs_found.append({"test": name, "details": details})

def get_csrf_token(session: requests.Session) -> str:
    """Get CSRF token for NextAuth"""
    resp = session.get(f"{BASE_URL}/api/auth/csrf")
    return resp.json()["csrfToken"]

def register_user(session: requests.Session, name: str, email: str, password: str) -> Dict[str, Any]:
    """Register a new user"""
    resp = session.post(f"{BASE_URL}/api/register", json={
        "name": name,
        "email": email,
        "password": password
    })
    return {"status": resp.status_code, "data": resp.json() if resp.text else {}}

def login_user(session: requests.Session, email: str, password: str) -> Dict[str, Any]:
    """Login user via NextAuth credentials"""
    csrf = get_csrf_token(session)
    resp = session.post(
        f"{BASE_URL}/api/auth/callback/credentials",
        data={
            "csrfToken": csrf,
            "email": email,
            "password": password,
            "redirect": "false"
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        allow_redirects=False
    )
    return {"status": resp.status_code, "headers": dict(resp.headers), "cookies": dict(session.cookies)}

def get_session(session: requests.Session) -> Dict[str, Any]:
    """Get current session"""
    resp = session.get(f"{BASE_URL}/api/auth/session")
    return {"status": resp.status_code, "data": resp.json() if resp.text else {}}

def create_org(session: requests.Session, name: str, slug: str) -> Dict[str, Any]:
    """Create organization"""
    resp = session.post(f"{BASE_URL}/api/organizations", json={"name": name, "slug": slug})
    return {"status": resp.status_code, "data": resp.json() if resp.text else {}}

def list_orgs(session: requests.Session) -> Dict[str, Any]:
    """List organizations"""
    resp = session.get(f"{BASE_URL}/api/organizations")
    return {"status": resp.status_code, "data": resp.json() if resp.text else {}}

def list_members(session: requests.Session, org_id: str) -> Dict[str, Any]:
    """List organization members"""
    resp = session.get(f"{BASE_URL}/api/organizations/{org_id}/members")
    try:
        data = resp.json() if resp.text else {}
    except:
        data = {}
    return {"status": resp.status_code, "data": data}

def create_invitation(session: requests.Session, org_id: str, email: str, role: str) -> Dict[str, Any]:
    """Create invitation"""
    resp = session.post(f"{BASE_URL}/api/organizations/{org_id}/invitations", json={"email": email, "role": role})
    return {"status": resp.status_code, "data": resp.json() if resp.text else {}}

def accept_invitation(session: requests.Session, token: str) -> Dict[str, Any]:
    """Accept invitation"""
    resp = session.post(f"{BASE_URL}/api/invitations/{token}/accept")
    return {"status": resp.status_code, "data": resp.json() if resp.text else {}}

def update_member_role(session: requests.Session, org_id: str, member_id: str, role: str) -> Dict[str, Any]:
    """Update member role"""
    resp = session.patch(f"{BASE_URL}/api/organizations/{org_id}/members/{member_id}", json={"role": role})
    return {"status": resp.status_code, "data": resp.json() if resp.text else {}}

def remove_member(session: requests.Session, org_id: str, member_id: str) -> Dict[str, Any]:
    """Remove member"""
    resp = session.delete(f"{BASE_URL}/api/organizations/{org_id}/members/{member_id}")
    return {"status": resp.status_code, "data": resp.json() if resp.text else {}}

def get_profile(session: requests.Session) -> Dict[str, Any]:
    """Get user profile"""
    resp = session.get(f"{BASE_URL}/api/user/profile")
    return {"status": resp.status_code, "data": resp.json() if resp.text else {}}

def update_profile(session: requests.Session, data: Dict[str, Any]) -> Dict[str, Any]:
    """Update user profile"""
    resp = session.patch(f"{BASE_URL}/api/user/profile", json=data)
    return {"status": resp.status_code, "data": resp.json() if resp.text else {}}

def check_health() -> Dict[str, Any]:
    """Check health endpoint"""
    resp = requests.get(f"{BASE_URL}/api/health")
    return {"status": resp.status_code, "data": resp.json() if resp.text else {}}

def check_audit_logs(action: str) -> bool:
    """Check if audit log exists for action"""
    try:
        client = MongoClient(MONGO_URL)
        db = client[DB_NAME]
        count = db.audit_logs.count_documents({"action": action})
        client.close()
        return count > 0
    except Exception as e:
        print(f"   MongoDB check failed: {e}")
        return False

# ============================================================================
# TEST SUITE
# ============================================================================

def test_health():
    """Test 1: Health endpoint"""
    print("\n=== Test 1: Health Endpoint ===")
    result = check_health()
    passed = result["status"] == 200 and result["data"].get("status") == "ok"
    log_test("Health endpoint returns 200 with status:ok", passed, 
             f"Status: {result['status']}, Data: {result['data']}")

def test_registration_validation():
    """Test 2: Registration validation"""
    print("\n=== Test 2: Registration Validation ===")
    
    # Test 2a: Short password
    session = requests.Session()
    result = register_user(session, "John Doe", "john@example.com", "short")
    passed = result["status"] == 400
    log_test("Registration with short password (<8 chars) returns 400", passed,
             f"Status: {result['status']}, Response: {result['data']}")
    
    # Test 2b: Invalid email
    session = requests.Session()
    result = register_user(session, "Jane Doe", "invalid-email", "password123")
    passed = result["status"] == 400
    log_test("Registration with invalid email returns 400", passed,
             f"Status: {result['status']}, Response: {result['data']}")
    
    # Test 2c: Missing name
    session = requests.Session()
    resp = session.post(f"{BASE_URL}/api/register", json={
        "email": "test@example.com",
        "password": "password123"
    })
    passed = resp.status_code == 400
    log_test("Registration with missing name returns 400", passed,
             f"Status: {resp.status_code}, Response: {resp.json() if resp.text else {}}")
    
    # Test 2d: Valid registration
    session = requests.Session()
    result = register_user(session, "Alice Smith", f"alice.smith.{TEST_RUN_ID}@nexusai.test", "password123")
    passed = result["status"] == 200 and "id" in result["data"]
    log_test("Valid registration returns 200 with user id", passed,
             f"Status: {result['status']}, Response: {result['data']}")
    
    # Test 2e: Duplicate email
    session = requests.Session()
    result = register_user(session, "Alice Duplicate", f"alice.smith.{TEST_RUN_ID}@nexusai.test", "password123")
    passed = result["status"] == 400
    log_test("Registration with duplicate email returns 400", passed,
             f"Status: {result['status']}, Response: {result['data']}")

def test_login_flow():
    """Test 3: Login flow"""
    print("\n=== Test 3: Login Flow ===")
    
    # Register a test user
    session = requests.Session()
    register_user(session, "Bob Johnson", f"bob.johnson.{TEST_RUN_ID}@nexusai.test", "password123")
    
    # Test 3a: Valid login
    session = requests.Session()
    result = login_user(session, f"bob.johnson.{TEST_RUN_ID}@nexusai.test", "password123")
    session_data = get_session(session)
    passed = session_data["status"] == 200 and session_data["data"].get("user") is not None
    log_test("Valid login creates session", passed,
             f"Login status: {result['status']}, Session: {session_data['data']}")
    
    # Test 3b: Wrong password
    session = requests.Session()
    result = login_user(session, f"bob.johnson.{TEST_RUN_ID}@nexusai.test", "wrongpassword")
    session_data = get_session(session)
    passed = session_data.get("data") is None or session_data["data"].get("user") is None
    log_test("Login with wrong password fails (no session)", passed,
             f"Login status: {result['status']}, Session: {session_data.get('data')}")
    
    # Test 3c: Unknown email
    session = requests.Session()
    result = login_user(session, f"unknown.{TEST_RUN_ID}@nexusai.test", "password123")
    session_data = get_session(session)
    passed = session_data.get("data") is None or session_data["data"].get("user") is None
    log_test("Login with unknown email fails (no session)", passed,
             f"Login status: {result['status']}, Session: {session_data.get('data')}")

def test_unauthenticated_access():
    """Test 4: Unauthenticated access to protected APIs"""
    print("\n=== Test 4: Unauthenticated Access ===")
    
    session = requests.Session()
    
    # Test 4a: GET /api/organizations
    result = list_orgs(session)
    passed = result["status"] == 401
    log_test("Unauthenticated GET /api/organizations returns 401", passed,
             f"Status: {result['status']}, Response: {result['data']}")
    
    # Test 4b: POST /api/organizations
    result = create_org(session, "Test Org", "test-org")
    passed = result["status"] == 401
    log_test("Unauthenticated POST /api/organizations returns 401", passed,
             f"Status: {result['status']}, Response: {result['data']}")
    
    # Test 4c: GET /api/user/profile
    result = get_profile(session)
    passed = result["status"] == 401
    log_test("Unauthenticated GET /api/user/profile returns 401", passed,
             f"Status: {result['status']}, Response: {result['data']}")

def test_org_creation_validation():
    """Test 5: Organization creation validation"""
    print("\n=== Test 5: Organization Creation Validation ===")
    
    # Setup authenticated user
    session = requests.Session()
    register_user(session, "Charlie Brown", f"charlie.brown.{TEST_RUN_ID}@nexusai.test", "password123")
    login_user(session, f"charlie.brown.{TEST_RUN_ID}@nexusai.test", "password123")
    
    # Test 5a: Invalid slug - uppercase
    result = create_org(session, "Test Org", "UPPERCASE")
    passed = result["status"] == 400
    log_test("Org creation with uppercase slug returns 400", passed,
             f"Status: {result['status']}, Response: {result['data']}")
    
    # Test 5b: Invalid slug - spaces
    result = create_org(session, "Test Org", "with space")
    passed = result["status"] == 400
    log_test("Org creation with spaces in slug returns 400", passed,
             f"Status: {result['status']}, Response: {result['data']}")
    
    # Test 5c: Invalid slug - special chars
    result = create_org(session, "Test Org", "special!@#")
    passed = result["status"] == 400
    log_test("Org creation with special chars in slug returns 400", passed,
             f"Status: {result['status']}, Response: {result['data']}")
    
    # Test 5d: Valid org creation
    result = create_org(session, "Charlie's Org", f"charlie-org-{TEST_RUN_ID}")
    passed = result["status"] == 200 and "organization" in result["data"]
    org_id = result["data"].get("organization", {}).get("id")
    log_test("Valid org creation returns 200 with org data", passed,
             f"Status: {result['status']}, Org ID: {org_id}")
    
    # Test 5e: Duplicate slug
    result = create_org(session, "Another Org", f"charlie-org-{TEST_RUN_ID}")
    passed = result["status"] == 400 and "slug" in result["data"].get("error", "").lower()
    log_test("Org creation with duplicate slug returns 400", passed,
             f"Status: {result['status']}, Response: {result['data']}")
    
    # Test 5f: Verify creator gets OWNER membership
    if org_id:
        result = list_members(session, org_id)
        passed = (result["status"] == 200 and 
                 len(result["data"].get("members", [])) == 1 and
                 result["data"]["members"][0].get("role") == "OWNER")
        log_test("Org creator gets OWNER membership", passed,
                 f"Status: {result['status']}, Members: {result['data']}")

def test_cross_tenant_isolation():
    """Test 6: Cross-tenant isolation"""
    print("\n=== Test 6: Cross-Tenant Isolation ===")
    
    # Setup User A with Org A
    session_a = requests.Session()
    register_user(session_a, "User A", f"usera.{TEST_RUN_ID}@nexusai.test", "password123")
    login_user(session_a, f"usera.{TEST_RUN_ID}@nexusai.test", "password123")
    org_a_result = create_org(session_a, "Org A", f"org-a-{TEST_RUN_ID}")
    org_a_id = org_a_result["data"].get("organization", {}).get("id")
    
    # Setup User B with Org B
    session_b = requests.Session()
    register_user(session_b, "User B", f"userb.{TEST_RUN_ID}@nexusai.test", "password123")
    login_user(session_b, f"userb.{TEST_RUN_ID}@nexusai.test", "password123")
    create_org(session_b, "Org B", f"org-b-{TEST_RUN_ID}")
    
    # Test 6a: User B tries to list members of Org A
    result = list_members(session_b, org_a_id)
    passed = result["status"] == 403
    log_test("User B cannot list members of User A's org (403)", passed,
             f"Status: {result['status']}, Response: {result['data']}")
    
    # Test 6b: User B tries to create invitation in Org A
    result = create_invitation(session_b, org_a_id, f"invite.{TEST_RUN_ID}@test.com", "MEMBER")
    passed = result["status"] == 403
    log_test("User B cannot create invitation in User A's org (403)", passed,
             f"Status: {result['status']}, Response: {result['data']}")

def test_privilege_escalation():
    """Test 7: Privilege escalation prevention"""
    print("\n=== Test 7: Privilege Escalation Prevention ===")
    
    # Setup Owner
    session_owner = requests.Session()
    register_user(session_owner, "Owner User", f"owner.{TEST_RUN_ID}@nexusai.test", "password123")
    login_user(session_owner, f"owner.{TEST_RUN_ID}@nexusai.test", "password123")
    org_result = create_org(session_owner, "Test Org", f"test-org-priv-{TEST_RUN_ID}")
    org_id = org_result["data"].get("organization", {}).get("id")
    
    # Setup Member User
    session_member = requests.Session()
    register_user(session_member, "Member User", f"member.{TEST_RUN_ID}@nexusai.test", "password123")
    login_user(session_member, f"member.{TEST_RUN_ID}@nexusai.test", "password123")
    
    # Owner invites Member
    inv_result = create_invitation(session_owner, org_id, f"member.{TEST_RUN_ID}@nexusai.test", "MEMBER")
    token = inv_result["data"].get("invitation", {}).get("token")
    
    # Member accepts invitation
    accept_invitation(session_member, token)
    
    # Get member's membership ID
    members_result = list_members(session_owner, org_id)
    # API returns flat structure with email, name directly on member object
    member_membership = next((m for m in members_result["data"]["members"] if m.get("email") == f"member.{TEST_RUN_ID}@nexusai.test"), None)
    member_id = member_membership.get("membershipId") if member_membership else None
    
    # Test 7a: Member tries to invite another user
    result = create_invitation(session_member, org_id, f"another.{TEST_RUN_ID}@test.com", "MEMBER")
    passed = result["status"] == 403
    log_test("MEMBER cannot invite users (403)", passed,
             f"Status: {result['status']}, Response: {result['data']}")
    
    # Test 7b: Member tries to remove a member
    if member_id:
        result = remove_member(session_member, org_id, member_id)
        passed = result["status"] == 403
        log_test("MEMBER cannot remove members (403)", passed,
                 f"Status: {result['status']}, Response: {result['data']}")
    
    # Test 7c: Member tries to update a role
    if member_id:
        result = update_member_role(session_member, org_id, member_id, "ADMIN")
        passed = result["status"] == 403
        log_test("MEMBER cannot update roles (403)", passed,
                 f"Status: {result['status']}, Response: {result['data']}")

def test_invitation_flow():
    """Test 8: Invitation flow"""
    print("\n=== Test 8: Invitation Flow ===")
    
    # Setup Owner
    session_owner = requests.Session()
    register_user(session_owner, "Invite Owner", f"invowner.{TEST_RUN_ID}@nexusai.test", "password123")
    login_user(session_owner, f"invowner.{TEST_RUN_ID}@nexusai.test", "password123")
    org_result = create_org(session_owner, "Invite Org", f"invite-org-{TEST_RUN_ID}")
    org_id = org_result["data"].get("organization", {}).get("id")
    
    # Test 8a: Create invitation as OWNER
    result = create_invitation(session_owner, org_id, f"invitee.{TEST_RUN_ID}@test.com", "MEMBER")
    passed = result["status"] == 200 and "token" in result["data"].get("invitation", {})
    token = result["data"].get("invitation", {}).get("token")
    log_test("OWNER can create invitation (200 with token)", passed,
             f"Status: {result['status']}, Token present: {bool(token)}")
    
    # Test 8b: Try to create invitation with role=OWNER (should fail)
    result = create_invitation(session_owner, org_id, f"owner-invite.{TEST_RUN_ID}@test.com", "OWNER")
    passed = result["status"] == 400
    log_test("Cannot create invitation with role=OWNER (400)", passed,
             f"Status: {result['status']}, Response: {result['data']}")
    
    # Test 8c: Accept invitation with invalid token
    session_invitee = requests.Session()
    register_user(session_invitee, "Invitee", f"invitee.{TEST_RUN_ID}@test.com", "password123")
    login_user(session_invitee, f"invitee.{TEST_RUN_ID}@test.com", "password123")
    result = accept_invitation(session_invitee, "invalid-token-12345")
    passed = result["status"] == 400
    log_test("Accept invitation with invalid token returns 400", passed,
             f"Status: {result['status']}, Response: {result['data']}")
    
    # Test 8d: Accept valid invitation
    if token:
        result = accept_invitation(session_invitee, token)
        passed = result["status"] == 200 and result["data"].get("ok") == True
        log_test("Accept valid invitation returns 200", passed,
                 f"Status: {result['status']}, Response: {result['data']}")
        
        # Test 8e: Try to accept same invitation again
        result = accept_invitation(session_invitee, token)
        passed = result["status"] == 400
        log_test("Accept same invitation twice returns 400", passed,
                 f"Status: {result['status']}, Response: {result['data']}")

def test_profile_operations():
    """Test 9: Profile operations"""
    print("\n=== Test 9: Profile Operations ===")
    
    # Setup user
    session = requests.Session()
    register_user(session, "Profile User", f"profile.{TEST_RUN_ID}@nexusai.test", "password123")
    login_user(session, f"profile.{TEST_RUN_ID}@nexusai.test", "password123")
    
    # Test 9a: GET profile
    result = get_profile(session)
    passed = result["status"] == 200 and "user" in result["data"]
    log_test("GET profile returns 200 with user data", passed,
             f"Status: {result['status']}, User: {result['data'].get('user', {}).get('email')}")
    
    # Test 9b: PATCH with invalid image (non-URL)
    result = update_profile(session, {"image": "not-a-url"})
    passed = result["status"] == 400
    log_test("PATCH profile with invalid image URL returns 400", passed,
             f"Status: {result['status']}, Response: {result['data']}")
    
    # Test 9c: PATCH with empty body (no-op)
    result = update_profile(session, {})
    passed = result["status"] == 200
    log_test("PATCH profile with empty body returns 200 (no-op)", passed,
             f"Status: {result['status']}, Response: {result['data']}")
    
    # Test 9d: PATCH with valid name change
    result = update_profile(session, {"name": "Updated Name"})
    passed = result["status"] == 200
    log_test("PATCH profile with valid name returns 200", passed,
             f"Status: {result['status']}, Response: {result['data']}")
    
    # Test 9e: Verify name change
    result = get_profile(session)
    passed = result["status"] == 200 and result["data"].get("user", {}).get("name") == "Updated Name"
    log_test("GET profile reflects name change", passed,
             f"Status: {result['status']}, Name: {result['data'].get('user', {}).get('name')}")

def test_member_management():
    """Test 10: Member management by OWNER"""
    print("\n=== Test 10: Member Management by OWNER ===")
    
    # Setup Owner
    session_owner = requests.Session()
    register_user(session_owner, "Mgmt Owner", f"mgmtowner.{TEST_RUN_ID}@nexusai.test", "password123")
    login_user(session_owner, f"mgmtowner.{TEST_RUN_ID}@nexusai.test", "password123")
    org_result = create_org(session_owner, "Mgmt Org", f"mgmt-org-{TEST_RUN_ID}")
    org_id = org_result["data"].get("organization", {}).get("id")
    
    # Setup Member
    session_member = requests.Session()
    register_user(session_member, "Mgmt Member", f"mgmtmember.{TEST_RUN_ID}@nexusai.test", "password123")
    login_user(session_member, f"mgmtmember.{TEST_RUN_ID}@nexusai.test", "password123")
    
    # Invite and accept
    inv_result = create_invitation(session_owner, org_id, f"mgmtmember.{TEST_RUN_ID}@nexusai.test", "MEMBER")
    token = inv_result["data"].get("invitation", {}).get("token")
    accept_invitation(session_member, token)
    
    # Get member ID
    members_result = list_members(session_owner, org_id)
    member_membership = next((m for m in members_result["data"]["members"] if m.get("email") == f"mgmtmember.{TEST_RUN_ID}@nexusai.test"), None)
    member_id = member_membership.get("membershipId") if member_membership else None
    
    # Test 10a: OWNER updates MEMBER role to ADMIN
    if member_id:
        result = update_member_role(session_owner, org_id, member_id, "ADMIN")
        passed = result["status"] == 200
        log_test("OWNER can update MEMBER role to ADMIN (200)", passed,
                 f"Status: {result['status']}, Response: {result['data']}")
        
        # Verify role change
        members_result = list_members(session_owner, org_id)
        member_membership = next((m for m in members_result["data"]["members"] if m.get("email") == f"mgmtmember.{TEST_RUN_ID}@nexusai.test"), None)
        passed = member_membership and member_membership.get("role") == "ADMIN"
        log_test("Member list reflects role change to ADMIN", passed,
                 f"Role: {member_membership.get('role') if member_membership else 'N/A'}")
        
        # Test 10b: OWNER removes member
        result = remove_member(session_owner, org_id, member_id)
        passed = result["status"] == 200
        log_test("OWNER can remove member (200)", passed,
                 f"Status: {result['status']}, Response: {result['data']}")
        
        # Verify member removed
        members_result = list_members(session_owner, org_id)
        member_exists = any(m.get("email") == f"mgmtmember.{TEST_RUN_ID}@nexusai.test" for m in members_result["data"]["members"])
        passed = not member_exists
        log_test("Member list reflects member removal", passed,
                 f"Member still exists: {member_exists}")

def test_audit_logs():
    """Test 11: Audit logs"""
    print("\n=== Test 11: Audit Logs ===")
    
    # Check for various audit log actions
    actions = [
        "user.register",
        "org.create",
        "team.invite",
        "team.invitation.accepted",
        "team.member.removed",
        "team.member.role_updated"
    ]
    
    for action in actions:
        exists = check_audit_logs(action)
        log_test(f"Audit log exists for action: {action}", exists,
                 f"Found in MongoDB: {exists}")

def test_middleware_redirects():
    """Test 12: Middleware redirects"""
    print("\n=== Test 12: Middleware Redirects ===")
    
    # Test 12a: Public page (/) returns 200
    session = requests.Session()
    resp = session.get(BASE_URL, allow_redirects=False)
    passed = resp.status_code == 200
    log_test("GET / (public) returns 200", passed,
             f"Status: {resp.status_code}")
    
    # Test 12b: Protected page without auth redirects to /login
    session = requests.Session()
    resp = session.get(f"{BASE_URL}/dashboard", allow_redirects=False)
    passed = resp.status_code in [302, 307] and "/login" in resp.headers.get("Location", "")
    log_test("GET /dashboard without auth redirects to /login", passed,
             f"Status: {resp.status_code}, Location: {resp.headers.get('Location')}")
    
    # Test 12c: /login while logged in redirects to /dashboard
    session = requests.Session()
    register_user(session, "Redirect User", f"redirect.{TEST_RUN_ID}@nexusai.test", "password123")
    login_user(session, f"redirect.{TEST_RUN_ID}@nexusai.test", "password123")
    resp = session.get(f"{BASE_URL}/login", allow_redirects=False)
    passed = resp.status_code in [302, 307] and "/dashboard" in resp.headers.get("Location", "")
    log_test("GET /login while logged in redirects to /dashboard", passed,
             f"Status: {resp.status_code}, Location: {resp.headers.get('Location')}")

# ============================================================================
# MAIN EXECUTION
# ============================================================================

def main():
    print("=" * 80)
    print("NexusAI Sprint 1.5 - Backend Hardening Test Suite")
    print("=" * 80)
    
    try:
        test_health()
        test_registration_validation()
        test_login_flow()
        test_unauthenticated_access()
        test_org_creation_validation()
        test_cross_tenant_isolation()
        test_privilege_escalation()
        test_invitation_flow()
        test_profile_operations()
        test_member_management()
        test_audit_logs()
        test_middleware_redirects()
        
    except Exception as e:
        print(f"\n❌ CRITICAL ERROR: {e}")
        import traceback
        traceback.print_exc()
    
    # Summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    
    total = len(test_results)
    passed = sum(1 for t in test_results if t["passed"])
    failed = total - passed
    pass_rate = (passed / total * 100) if total > 0 else 0
    
    print(f"Total Tests: {total}")
    print(f"Passed: {passed}")
    print(f"Failed: {failed}")
    print(f"Pass Rate: {pass_rate:.1f}%")
    
    if bugs_found:
        print(f"\n🐛 BUGS FOUND: {len(bugs_found)}")
        for i, bug in enumerate(bugs_found, 1):
            print(f"\n{i}. {bug['test']}")
            print(f"   {bug['details']}")
    else:
        print("\n✅ No bugs found - all tests passed!")
    
    print("\n" + "=" * 80)

if __name__ == "__main__":
    main()
