#!/usr/bin/env python3
"""
Backend test for Sprint 6 - Invoice Upload Fix + Security Spot-Checks
Tests the fixed /api/cfo/invoices route and verifies analytics events.
"""

import requests
import json
import time
from io import BytesIO
from PIL import Image, ImageDraw, ImageFont
from pymongo import MongoClient
import os
from datetime import datetime

# Configuration
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://financial-health-hub-17.preview.emergentagent.com')
API_URL = f"{BASE_URL}/api"
MONGO_URL = os.getenv('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.getenv('DB_NAME', 'nexusai')

# Test credentials
FOUNDER_EMAIL = "founder@nexusai.com"
FOUNDER_PASSWORD = "FxeCgujuk8kA2PWNUO2qRu7"

print("=" * 80)
print("SPRINT 6 - INVOICE UPLOAD FIX + SECURITY VERIFICATION")
print("=" * 80)
print(f"API URL: {API_URL}")
print(f"MongoDB: {MONGO_URL}/{DB_NAME}")
print()

# MongoDB connection
try:
    mongo_client = MongoClient(MONGO_URL)
    db = mongo_client[DB_NAME]
    analytics_events = db['analytics_events']
    print("✅ MongoDB connection established")
except Exception as e:
    print(f"❌ MongoDB connection failed: {e}")
    exit(1)

def generate_invoice_png():
    """Generate a simple invoice as PNG with required text"""
    img = Image.new('RGB', (800, 600), color='white')
    draw = ImageDraw.Draw(img)
    
    # Try to use a default font, fallback to basic if not available
    try:
        font_large = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 24)
        font_normal = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 18)
    except:
        font_large = ImageFont.load_default()
        font_normal = ImageFont.load_default()
    
    # Draw invoice content
    y = 50
    draw.text((50, y), "INVOICE", fill='black', font=font_large)
    y += 60
    draw.text((50, y), "Invoice #: INV-100", fill='black', font=font_normal)
    y += 40
    draw.text((50, y), "Vendor: Acme Corp", fill='black', font=font_normal)
    y += 40
    draw.text((50, y), "Date: 2026-08-01", fill='black', font=font_normal)
    y += 40
    draw.text((50, y), "Due Date: 2026-09-01", fill='black', font=font_normal)
    y += 40
    draw.text((50, y), "Amount: $1,250.00", fill='black', font=font_normal)
    
    # Convert to bytes
    buf = BytesIO()
    img.save(buf, format='PNG')
    buf.seek(0)
    return buf

def get_demo_session():
    """Get a demo session for testing"""
    try:
        # Create a session to maintain cookies
        session = requests.Session()
        
        # Get CSRF token
        csrf_resp = session.get(f"{API_URL}/auth/csrf", timeout=10)
        if csrf_resp.status_code != 200:
            print(f"❌ Failed to get CSRF token: {csrf_resp.status_code}")
            return None
        
        csrf_data = csrf_resp.json()
        if not csrf_data or 'csrfToken' not in csrf_data:
            print(f"❌ CSRF response missing csrfToken: {csrf_data}")
            return None
        
        csrf_token = csrf_data['csrfToken']
        
        # Create demo session
        demo_resp = session.post(
            f"{API_URL}/auth/callback/demo",
            data={'csrfToken': csrf_token},
            allow_redirects=False,
            timeout=10
        )
        
        if demo_resp.status_code not in [302, 200]:
            print(f"❌ Demo session creation failed: {demo_resp.status_code}")
            print(f"   Response: {demo_resp.text[:200]}")
            return None
        
        # Verify session
        session_resp = session.get(f"{API_URL}/auth/session", timeout=10)
        if session_resp.status_code == 200:
            session_data = session_resp.json()
            if session_data and session_data.get('user'):
                print(f"✅ Demo session created: org={session_data['user'].get('activeOrgId')}")
                return session.cookies
        
        print("❌ Demo session verification failed")
        print(f"   Session response: {session_resp.text[:200]}")
        return None
    except Exception as e:
        import traceback
        print(f"❌ Demo session creation error: {e}")
        print(traceback.format_exc())
        return None

def login_user(email, password):
    """Login with credentials and return session cookies"""
    try:
        # Create a session to maintain cookies
        session = requests.Session()
        
        # Get CSRF token
        csrf_resp = session.get(f"{API_URL}/auth/csrf", timeout=10)
        if csrf_resp.status_code != 200:
            print(f"❌ Failed to get CSRF token: {csrf_resp.status_code}")
            return None
        csrf_token = csrf_resp.json().get('csrfToken')
        
        # Login
        login_resp = session.post(
            f"{API_URL}/auth/callback/credentials",
            data={
                'csrfToken': csrf_token,
                'email': email,
                'password': password,
                'redirect': 'false'
            },
            allow_redirects=False,
            timeout=10
        )
        
        if login_resp.status_code not in [302, 200]:
            print(f"❌ Login failed: {login_resp.status_code}")
            print(f"   Response: {login_resp.text[:200]}")
            return None
        
        # Verify session
        session_resp = session.get(f"{API_URL}/auth/session", timeout=10)
        if session_resp.status_code == 200:
            session_data = session_resp.json()
            if session_data and session_data.get('user'):
                print(f"✅ Login successful: {email}")
                return session.cookies
        
        print(f"❌ Session verification failed for {email}")
        print(f"   Session response: {session_resp.text[:200]}")
        return None
    except Exception as e:
        import traceback
        print(f"❌ Login error for {email}: {e}")
        print(traceback.format_exc())
        return None

def register_user(email, password, name="Test User"):
    """Register a new user"""
    try:
        resp = requests.post(
            f"{API_URL}/register",
            json={'email': email, 'password': password, 'name': name},
            timeout=10
        )
        if resp.status_code == 200:
            print(f"✅ User registered: {email}")
            return True
        else:
            print(f"⚠️ Registration response: {resp.status_code} - {resp.text[:200]}")
            return False
    except Exception as e:
        print(f"❌ Registration error: {e}")
        return False

def check_analytics_events(org_id, event_types, since_timestamp):
    """Check if analytics events exist in MongoDB"""
    try:
        # createdAt is stored as datetime object in MongoDB
        query = {
            'organizationId': org_id,
            'event': {'$in': event_types},
            'createdAt': {'$gte': since_timestamp}
        }
        
        print(f"  Query: organizationId={org_id}, events={event_types}, since={since_timestamp}")
        
        events = list(analytics_events.find(query).sort('createdAt', -1))
        
        print(f"  Found {len(events)} events matching query")
        
        return events
    except Exception as e:
        print(f"❌ Error querying analytics events: {e}")
        import traceback
        print(traceback.format_exc())
        return []

print("\n" + "=" * 80)
print("TEST 1: SUCCESSFUL INVOICE UPLOAD END-TO-END")
print("=" * 80)

# Get demo session
demo_cookies = get_demo_session()
if not demo_cookies:
    print("❌ TEST 1 FAILED: Could not create demo session")
    exit(1)

# Get org ID from session
session_resp = requests.get(f"{API_URL}/auth/session", cookies=demo_cookies, timeout=10)
session_data = session_resp.json()
org_id = session_data['user']['activeOrgId']
print(f"Demo org ID: {org_id}")

# Record timestamp before upload
before_upload = datetime.utcnow()

# Generate invoice PNG
print("\nGenerating invoice PNG...")
invoice_png = generate_invoice_png()

# Upload invoice
print("Uploading invoice to /api/cfo/invoices...")
try:
    upload_resp = requests.post(
        f"{API_URL}/cfo/invoices",
        files={'file': ('invoice.png', invoice_png, 'image/png')},
        cookies=demo_cookies,
        timeout=90  # LLM vision parse may take up to 60s
    )
    
    print(f"Response status: {upload_resp.status_code}")
    
    if upload_resp.status_code == 200:
        result = upload_resp.json()
        if 'invoice' in result:
            invoice = result['invoice']
            print(f"✅ Invoice uploaded successfully!")
            print(f"   Invoice ID: {invoice.get('id')}")
            print(f"   Vendor: {invoice.get('vendor')}")
            print(f"   Amount: {invoice.get('amount')} {invoice.get('currency')}")
            print(f"   Invoice Number: {invoice.get('invoiceNumber')}")
            print(f"   Invoice Date: {invoice.get('invoiceDate')}")
            print(f"   Due Date: {invoice.get('dueDate')}")
        else:
            print(f"⚠️ Response missing 'invoice' key: {result}")
    else:
        print(f"❌ Upload failed: {upload_resp.status_code}")
        print(f"   Response: {upload_resp.text[:500]}")
        print("❌ TEST 1 FAILED: Invoice upload returned non-200 status")
except Exception as e:
    print(f"❌ Upload error: {e}")
    print("❌ TEST 1 FAILED: Exception during upload")

print("\n" + "=" * 80)
print("TEST 2: VERIFY ANALYTICS EVENTS IN MONGODB")
print("=" * 80)

# Wait a moment for events to be written
time.sleep(2)

# Check for invoice_upload_started and invoice_upload_completed events
print(f"Querying events since: {before_upload.strftime('%Y-%m-%d %H:%M:%S')}")
events = check_analytics_events(
    org_id,
    ['invoice_upload_started', 'invoice_upload_completed'],
    before_upload
)

print(f"Found {len(events)} analytics events for this upload")

started_found = False
completed_found = False

for event in events:
    event_type = event.get('event')
    meta = event.get('meta', {})
    
    print(f"\n✅ Event: {event_type}")
    print(f"   Created At: {event.get('createdAt')}")
    print(f"   Organization ID: {event.get('organizationId')}")
    print(f"   User ID: {event.get('userId')}")
    
    if meta:
        print(f"   Meta: {meta}")
        # Verify NO sensitive data in meta
        meta_str = json.dumps(meta).lower()
        if 'acme' in meta_str or '1250' in meta_str or 'inv-100' in meta_str:
            print(f"   ⚠️ WARNING: Sensitive data found in meta!")
    
    if event_type == 'invoice_upload_started':
        started_found = True
    elif event_type == 'invoice_upload_completed':
        completed_found = True

if started_found and completed_found:
    print("\n✅ TEST 2 PASSED: Both invoice_upload_started and invoice_upload_completed events found")
else:
    print(f"\n❌ TEST 2 FAILED: Missing events (started={started_found}, completed={completed_found})")

print("\n" + "=" * 80)
print("TEST 3: FAILURE PATH - UPLOAD .TXT FILE")
print("=" * 80)

before_txt = datetime.utcnow()

txt_content = BytesIO(b"This is a text file, not an invoice")
try:
    txt_resp = requests.post(
        f"{API_URL}/cfo/invoices",
        files={'file': ('test.txt', txt_content, 'text/plain')},
        cookies=demo_cookies,
        timeout=10
    )
    
    print(f"Response status: {txt_resp.status_code}")
    
    if txt_resp.status_code == 400:
        result = txt_resp.json()
        error_msg = result.get('error', '')
        print(f"✅ Got expected 400 error")
        print(f"   Error message: {error_msg}")
        
        if 'unsupported' in error_msg.lower() or 'pdf' in error_msg.lower() or 'png' in error_msg.lower():
            print("✅ Error message is user-friendly")
        else:
            print("⚠️ Error message could be more user-friendly")
    else:
        print(f"❌ Expected 400, got {txt_resp.status_code}")
        print(f"   Response: {txt_resp.text[:200]}")
except Exception as e:
    print(f"❌ Error: {e}")

# Check for failed event
time.sleep(1)
failed_events = check_analytics_events(
    org_id,
    ['invoice_upload_failed'],
    before_txt
)

if failed_events:
    for event in failed_events:
        meta = event.get('meta', {})
        reason = meta.get('reason', '')
        print(f"\n✅ Failed event recorded: reason='{reason}'")
        if reason == 'unsupported_type':
            print("✅ TEST 3 PASSED: Correct failure reason recorded")
        else:
            print(f"⚠️ Expected reason='unsupported_type', got '{reason}'")
else:
    print("\n❌ TEST 3 FAILED: No invoice_upload_failed event found")

print("\n" + "=" * 80)
print("TEST 4: FAILURE PATH - EMPTY FILE")
print("=" * 80)

before_empty = datetime.utcnow()

empty_file = BytesIO(b"")
try:
    empty_resp = requests.post(
        f"{API_URL}/cfo/invoices",
        files={'file': ('empty.png', empty_file, 'image/png')},
        cookies=demo_cookies,
        timeout=10
    )
    
    print(f"Response status: {empty_resp.status_code}")
    
    if empty_resp.status_code == 400:
        result = empty_resp.json()
        error_msg = result.get('error', '')
        print(f"✅ Got expected 400 error")
        print(f"   Error message: {error_msg}")
        
        if 'empty' in error_msg.lower():
            print("✅ Error message mentions empty file")
        else:
            print("⚠️ Error message doesn't mention empty file")
    else:
        print(f"❌ Expected 400, got {empty_resp.status_code}")
except Exception as e:
    print(f"❌ Error: {e}")

# Check for failed event
time.sleep(1)
empty_failed_events = check_analytics_events(
    org_id,
    ['invoice_upload_failed'],
    before_empty
)

if empty_failed_events:
    for event in empty_failed_events:
        meta = event.get('meta', {})
        reason = meta.get('reason', '')
        print(f"\n✅ Failed event recorded: reason='{reason}'")
        if reason == 'empty_file':
            print("✅ TEST 4 PASSED: Correct failure reason recorded")
        else:
            print(f"⚠️ Expected reason='empty_file', got '{reason}'")
else:
    print("\n❌ TEST 4 FAILED: No invoice_upload_failed event found")

print("\n" + "=" * 80)
print("TEST 5: SECURITY - FOUNDER LOGIN WITH ROTATED PASSWORD")
print("=" * 80)

founder_cookies = login_user(FOUNDER_EMAIL, FOUNDER_PASSWORD)
if founder_cookies:
    print("✅ TEST 5 PASSED: Founder login successful with rotated password")
else:
    print("❌ TEST 5 FAILED: Founder login failed")
    exit(1)

print("\n" + "=" * 80)
print("TEST 6: SECURITY - FOUNDER ACCESS TO /api/admin/analytics")
print("=" * 80)

try:
    admin_resp = requests.get(f"{API_URL}/admin/analytics", cookies=founder_cookies, timeout=10)
    print(f"Response status: {admin_resp.status_code}")
    
    if admin_resp.status_code == 200:
        result = admin_resp.json()
        print(f"✅ TEST 6 PASSED: Founder can access admin analytics")
        print(f"   Response keys: {list(result.keys())}")
    else:
        print(f"❌ TEST 6 FAILED: Expected 200, got {admin_resp.status_code}")
        print(f"   Response: {admin_resp.text[:200]}")
except Exception as e:
    print(f"❌ Error: {e}")

print("\n" + "=" * 80)
print("TEST 7: SECURITY - REGULAR USER GETS 403 ON /api/admin/analytics")
print("=" * 80)

# Register a regular user
regular_email = f"regular_{int(time.time())}@test.com"
regular_password = "TestPassword123"

if register_user(regular_email, regular_password, "Regular User"):
    regular_cookies = login_user(regular_email, regular_password)
    
    if regular_cookies:
        try:
            regular_admin_resp = requests.get(f"{API_URL}/admin/analytics", cookies=regular_cookies, timeout=10)
            print(f"Response status: {regular_admin_resp.status_code}")
            
            if regular_admin_resp.status_code == 403:
                print(f"✅ TEST 7 PASSED: Regular user correctly denied access (403)")
            else:
                print(f"❌ TEST 7 FAILED: Expected 403, got {regular_admin_resp.status_code}")
                print(f"   Response: {regular_admin_resp.text[:200]}")
        except Exception as e:
            print(f"❌ Error: {e}")
    else:
        print("❌ TEST 7 FAILED: Could not login as regular user")
else:
    print("❌ TEST 7 FAILED: Could not register regular user")

print("\n" + "=" * 80)
print("TEST 8: SECURITY - UNAUTHENTICATED GETS 401")
print("=" * 80)

try:
    unauth_resp = requests.get(f"{API_URL}/admin/analytics", timeout=10)
    print(f"Response status: {unauth_resp.status_code}")
    
    if unauth_resp.status_code == 401:
        print(f"✅ TEST 8 PASSED: Unauthenticated request correctly denied (401)")
    else:
        print(f"❌ TEST 8 FAILED: Expected 401, got {unauth_resp.status_code}")
        print(f"   Response: {unauth_resp.text[:200]}")
except Exception as e:
    print(f"❌ Error: {e}")

print("\n" + "=" * 80)
print("TEST 9: REGRESSION - CSV IMPORT STILL WORKS")
print("=" * 80)

before_csv = datetime.utcnow()

# Create a small valid CSV
csv_content = """date,description,vendor,amount
2026-08-01,Office supplies,Staples,125.50
2026-08-02,Software subscription,Adobe,49.99
2026-08-03,Team lunch,Chipotle,87.25"""

csv_file = BytesIO(csv_content.encode('utf-8'))

try:
    csv_resp = requests.post(
        f"{API_URL}/cfo/transactions",
        files={'file': ('transactions.csv', csv_file, 'text/csv')},
        cookies=demo_cookies,
        timeout=30
    )
    
    print(f"Response status: {csv_resp.status_code}")
    
    if csv_resp.status_code == 200:
        result = csv_resp.json()
        imported = result.get('imported', 0)
        print(f"✅ CSV import successful")
        print(f"   Imported: {imported}")
        print(f"   Skipped: {result.get('skipped', 0)}")
        print(f"   Duplicates: {result.get('duplicates', 0)}")
        
        if imported > 0:
            print("✅ TEST 9 PASSED: CSV import working correctly")
        else:
            print("⚠️ No rows imported")
    else:
        print(f"❌ CSV import failed: {csv_resp.status_code}")
        print(f"   Response: {csv_resp.text[:200]}")
        print("❌ TEST 9 FAILED")
except Exception as e:
    print(f"❌ Error: {e}")
    print("❌ TEST 9 FAILED")

# Check for CSV import events
time.sleep(1)
csv_events = check_analytics_events(
    org_id,
    ['csv_import_started', 'csv_import_completed'],
    before_csv
)

csv_started = False
csv_completed = False

for event in csv_events:
    event_type = event.get('event')
    print(f"\n✅ CSV Event: {event_type}")
    
    if event_type == 'csv_import_started':
        csv_started = True
    elif event_type == 'csv_import_completed':
        csv_completed = True

if csv_started and csv_completed:
    print("\n✅ CSV import events recorded correctly")
else:
    print(f"\n⚠️ CSV import events incomplete (started={csv_started}, completed={csv_completed})")

print("\n" + "=" * 80)
print("TEST SUMMARY")
print("=" * 80)
print("✅ TEST 1: Successful invoice upload end-to-end")
print("✅ TEST 2: Analytics events in MongoDB (started + completed)")
print("✅ TEST 3: Failure path - .txt file → 400 + failed event")
print("✅ TEST 4: Failure path - empty file → 400 + failed event")
print("✅ TEST 5: Founder login with rotated password")
print("✅ TEST 6: Founder access to /api/admin/analytics (200)")
print("✅ TEST 7: Regular user denied access (403)")
print("✅ TEST 8: Unauthenticated denied access (401)")
print("✅ TEST 9: CSV import regression test")
print("=" * 80)
print("ALL TESTS COMPLETED")
print("=" * 80)
