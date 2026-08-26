#!/usr/bin/env python3
"""
Sprint 2.7 Phase 2 - TEST 3: CSV Import Hardening
"""
import requests
import io

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

def create_test_csv(rows):
    csv_content = "date,description,vendor,amount\n"
    for row in rows:
        csv_content += f"{row['date']},{row['description']},{row['vendor']},{row['amount']}\n"
    return io.BytesIO(csv_content.encode('utf-8'))

print("=" * 80)
print("TEST 3: CSV IMPORT HARDENING")
print("=" * 80)

session = create_demo_session()

# TEST 3a: CSV with invalid rows
print("\n[TEST 3a] Upload CSV with 5 rows (2 invalid: missing date/amount)")
try:
    csv_rows = [
        {"date": "2024-01-15", "description": "Valid row 1", "vendor": "Vendor A", "amount": "100.00"},
        {"date": "", "description": "Invalid - no date", "vendor": "Vendor B", "amount": "200.00"},
        {"date": "2024-01-17", "description": "Valid row 2", "vendor": "Vendor C", "amount": "300.00"},
        {"date": "2024-01-18", "description": "Invalid - no amount", "vendor": "Vendor D", "amount": ""},
        {"date": "2024-01-19", "description": "Valid row 3", "vendor": "Vendor E", "amount": "500.00"},
    ]
    csv_file = create_test_csv(csv_rows)
    resp = session.post(
        f"{BASE_URL}/api/cfo/transactions",
        files={"file": ("test.csv", csv_file, "text/csv")},
        timeout=60
    )
    
    if resp.status_code == 200:
        data = resp.json()
        imported = data.get("imported", 0)
        skipped = data.get("skipped", 0)
        duplicates = data.get("duplicates", 0)
        total = data.get("totalRows", 0)
        
        print(f"  ✓ Import succeeded (200)")
        print(f"  Response: imported={imported}, skipped={skipped}, duplicates={duplicates}, total={total}")
        
        test3a_pass = imported >= 2 and skipped >= 1
        if test3a_pass:
            print(f"  ✓ PASS: Validation correct (imported ~3, skipped ~2)")
        else:
            print(f"  ✗ FAIL: Expected imported>=2 and skipped>=1")
    else:
        print(f"  ✗ FAIL: Expected 200, got {resp.status_code}")
        test3a_pass = False
except Exception as e:
    print(f"  ✗ FAIL: {e}")
    test3a_pass = False

# TEST 3b: Re-upload same CSV (duplicate detection)
print("\n[TEST 3b] Re-upload SAME CSV (duplicate detection)")
try:
    csv_rows_dup = [
        {"date": "2024-01-15", "description": "Valid row 1", "vendor": "Vendor A", "amount": "100.00"},
        {"date": "2024-01-17", "description": "Valid row 2", "vendor": "Vendor C", "amount": "300.00"},
        {"date": "2024-01-19", "description": "Valid row 3", "vendor": "Vendor E", "amount": "500.00"},
    ]
    csv_file_dup = create_test_csv(csv_rows_dup)
    resp = session.post(
        f"{BASE_URL}/api/cfo/transactions",
        files={"file": ("test_dup.csv", csv_file_dup, "text/csv")},
        timeout=60
    )
    
    if resp.status_code == 200:
        data = resp.json()
        imported = data.get("imported", 0)
        duplicates = data.get("duplicates", 0)
        
        print(f"  ✓ Import succeeded (200)")
        print(f"  Response: imported={imported}, duplicates={duplicates}")
        
        test3b_pass = duplicates > 0
        if test3b_pass:
            print(f"  ✓ PASS: Duplicates detected ({duplicates} > 0)")
        else:
            print(f"  ✗ FAIL: Expected duplicates > 0, got {duplicates}")
    else:
        print(f"  ✗ FAIL: Expected 200, got {resp.status_code}")
        test3b_pass = False
except Exception as e:
    print(f"  ✗ FAIL: {e}")
    test3b_pass = False

test3_pass = test3a_pass and test3b_pass
print(f"\n{'=' * 80}")
print(f"RESULT: {'✓ PASS' if test3_pass else '✗ FAIL'} - CSV import hardening")
print(f"{'=' * 80}")
