#!/usr/bin/env bash
set -e
BASE="http://localhost:8000"

echo "== login as admin =="
TOKEN=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"admin@rancodental.com","password":"admin123"}' | python -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
AUTH="Authorization: Bearer $TOKEN"
echo "token acquired"

echo "== list staff (get doctor id) =="
DOCTOR_ID=$(curl -s "$BASE/staff" -H "$AUTH" | python -c "import sys,json; d=json.load(sys.stdin); print([s['id'] for s in d if s['email']=='drkapoor@rancodental.com'][0])")
echo "doctor id: $DOCTOR_ID"

echo "== list services (get service id) =="
SERVICE_ID=$(curl -s "$BASE/services" -H "$AUTH" | python -c "import sys,json; d=json.load(sys.stdin); print([s['id'] for s in d if s['name']=='Root Canal Treatment'][0])")
echo "service id: $SERVICE_ID"

echo "== create patient =="
PATIENT=$(curl -s -X POST "$BASE/patients" -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"name":"Test Patient","phone":"9999900000","address":"Test Address","dob":"1995-01-01"}')
echo "$PATIENT"
PATIENT_ID=$(echo "$PATIENT" | python -c "import sys,json; print(json.load(sys.stdin)['id'])")

echo "== create consultation =="
CONSULT=$(curl -s -X POST "$BASE/patients/$PATIENT_ID/consultations" -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"doctor_id\":\"$DOCTOR_ID\",\"consult_date\":\"2026-08-04\",\"fee\":500,\"findings\":\"Test findings\",\"payment_status\":\"paid\",\"payment_mode\":\"cash\",\"recommended_service_ids\":[\"$SERVICE_ID\"]}")
echo "$CONSULT"
CONSULT_ID=$(echo "$CONSULT" | python -c "import sys,json; print(json.load(sys.stdin)['id'])")

echo "== start treatment =="
TREATMENT=$(curl -s -X POST "$BASE/consultations/$CONSULT_ID/treatments" -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"consultation_id\":\"$CONSULT_ID\",\"service_id\":\"$SERVICE_ID\",\"doctor_id\":\"$DOCTOR_ID\",\"started_at\":\"2026-08-04\"}")
echo "$TREATMENT"
TREATMENT_ID=$(echo "$TREATMENT" | python -c "import sys,json; print(json.load(sys.stdin)['id'])")

echo "== log an unpaid visit =="
VISIT=$(curl -s -X POST "$BASE/treatments/$TREATMENT_ID/visits" -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"visit_date":"2026-08-04","listed_price":1500,"payment_status":"unpaid"}')
echo "$VISIT"

echo "== generate invoice (should settle the unpaid visit) =="
INVOICE=$(curl -s -X POST "$BASE/treatments/$TREATMENT_ID/generate-invoice" -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"payment_mode":"upi"}')
echo "$INVOICE"

echo "== confirm visit is now paid =="
curl -s "$BASE/treatments/$TREATMENT_ID/visits" -H "$AUTH"
echo

echo "== confirm treatment is now finished =="
curl -s "$BASE/patients/$PATIENT_ID/treatments" -H "$AUTH"
echo

echo "== add a prescription on the consultation, then edit it =="
PRESCRIPTION=$(curl -s -X POST "$BASE/prescriptions" -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"patient_id\":\"$PATIENT_ID\",\"consultation_id\":\"$CONSULT_ID\",\"notes\":\"Ibuprofen 400mg\"}")
echo "$PRESCRIPTION"
PRESCRIPTION_ID=$(echo "$PRESCRIPTION" | python -c "import sys,json; print(json.load(sys.stdin)['id'])")

curl -s -X PATCH "$BASE/prescriptions/$PRESCRIPTION_ID" -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"notes":"Ibuprofen 400mg, twice daily after food"}'
echo

echo "== all smoke tests passed =="