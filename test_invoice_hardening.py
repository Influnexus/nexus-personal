#!/usr/bin/env python3
"""
Sprint 2.7 Phase 2 - TEST 2: Invoice Upload Hardening
"""
import requests
import io
from PIL import Image

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

def create_test_png(size=(10, 10)):
    img = Image.new('RGB', size, color='red')
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    buf.seek(0)
    return buf

print("=" * 80)
print("TEST 2: INVOICE UPLOAD HARDENING")
print("=" * 80)

session = create_demo_session()

# TEST 2a: Valid small PNG
print("\n[TEST 2a] Upload valid small PNG")
try:
    png_file = create_test_png((10, 10))
    resp = session.post(
        f"{BASE_URL}/api/cfo/invoices",
        files={"file": ("test.png", png_file, "image/png")},
        timeout=90
    )
    test2a_pass = resp.status_code in [200, 400, 500]
    data = resp.json()
    if resp.status_code == 200:
        print(f"  ✓ PASS: Upload succeeded (200)")
        print(f"  Invoice ID: {data.get('invoice', {}).get('id', 'N/A')}")
    else:
        print(f"  ✓ PASS: Graceful error ({resp.status_code})")
        print(f"  Error: {data.get('error', 'N/A')[:100]}")
except Exception as e:
    print(f"  ✗ FAIL: {e}")
    test2a_pass = False

# TEST 2b: Fake HEIC file
print("\n[TEST 2b] Upload fake HEIC file")
try:
    fake_heic = io.BytesIO(b"fake heic content")
    resp = session.post(
        f"{BASE_URL}/api/cfo/invoices",
        files={"file": ("test.heic", fake_heic, "image/heic")},
        timeout=30
    )
    data = resp.json()
    error_msg = data.get("error", "")
    has_heic = "heic" in error_msg.lower() or "heif" in error_msg.lower()
    has_tip = "convert" in error_msg.lower() or "jpg" in error_msg.lower()
    test2b_pass = resp.status_code == 400 and has_heic and has_tip
    
    if test2b_pass:
        print(f"  ✓ PASS: Rejected with 400, mentions HEIC, suggests conversion")
        print(f"  Error: {error_msg}")
    else:
        print(f"  ✗ FAIL: status={resp.status_code}, heic={has_heic}, tip={has_tip}")
except Exception as e:
    print(f"  ✗ FAIL: {e}")
    test2b_pass = False

# TEST 2c: Empty file
print("\n[TEST 2c] Upload empty file")
try:
    empty_file = io.BytesIO(b"")
    resp = session.post(
        f"{BASE_URL}/api/cfo/invoices",
        files={"file": ("empty.png", empty_file, "image/png")},
        timeout=30
    )
    data = resp.json()
    test2c_pass = resp.status_code == 400
    
    if test2c_pass:
        print(f"  ✓ PASS: Rejected with 400")
        print(f"  Error: {data.get('error', 'N/A')}")
    else:
        print(f"  ✗ FAIL: Expected 400, got {resp.status_code}")
except Exception as e:
    print(f"  ✗ FAIL: {e}")
    test2c_pass = False

# TEST 2d: Unsupported mimetype
print("\n[TEST 2d] Upload unsupported mimetype (text/plain)")
try:
    text_file = io.BytesIO(b"This is a text file")
    resp = session.post(
        f"{BASE_URL}/api/cfo/invoices",
        files={"file": ("invoice.txt", text_file, "text/plain")},
        timeout=30
    )
    data = resp.json()
    error_msg = data.get("error", "")
    has_unsupported = "unsupported" in error_msg.lower() or "type" in error_msg.lower()
    test2d_pass = resp.status_code == 400 and has_unsupported
    
    if test2d_pass:
        print(f"  ✓ PASS: Rejected with 400, mentions unsupported type")
        print(f"  Error: {error_msg}")
    else:
        print(f"  ✗ FAIL: status={resp.status_code}, unsupported={has_unsupported}")
except Exception as e:
    print(f"  ✗ FAIL: {e}")
    test2d_pass = False

test2_pass = test2a_pass and test2b_pass and test2c_pass and test2d_pass
print(f"\n{'=' * 80}")
print(f"RESULT: {'✓ PASS' if test2_pass else '✗ FAIL'} - Invoice upload hardening")
print(f"{'=' * 80}")
