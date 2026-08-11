"""Seed the dev database with an admin account, sample doctors, and the
service catalog. Safe to re-run — skips anything that already exists.

Usage: venv/Scripts/python -m app.seed
"""

from app.auth.security import hash_password
from app.database import SessionLocal
from app.models import Service, Staff, StaffRole

DOCTORS = [
    ("Dr. Kapoor", "General Dentistry"),
    ("Dr. Mehta", "Endodontist"),
    ("Dr. Rao", "Orthodontist"),
]

# (name, category, price) — category is just a display grouping, no
# relational meaning. Prices are estimates (mid-range private clinic,
# 2026) — adjust to the clinic's actual rates whenever known; easiest done
# from the Services page itself once live, no need to touch this file.
SERVICES = [
    ("Cleaning", None, 800),
    ("Filling", None, 1500),
    ("Extraction", None, 1200),
    ("Crown", None, 6000),
    ("Scaling", None, 1000),
    # Root Canal Treatment — split from the old single flat entry into
    # tooth-type/technique variants.
    ("Front Tooth RCT", "Root Canal Treatment", 4500),
    ("Premolar RCT", "Root Canal Treatment", 5500),
    ("Molar RCT", "Root Canal Treatment", 7500),
    ("Single-Visit RCT", "Root Canal Treatment", 8000),
    ("Re-RCT", "Root Canal Treatment", 9000),
    # Dental Bridges — priced as a standard 3-unit bridge (two abutment
    # crowns + one pontic), the usual way clinics quote a bridge as a whole.
    ("PFM Bridge", "Dental Bridges", 9000),
    ("Ceramic Bridge", "Dental Bridges", 15000),
    ("Zirconia Bridge", "Dental Bridges", 18000),
    ("Maryland Bridge", "Dental Bridges", 6000),
]

# Superseded by the categorized variants above — deactivated (not deleted,
# since existing treatments may still reference it by foreign key) so it
# stops showing up as an option for new treatments.
LEGACY_SERVICES_TO_RETIRE = ["Root Canal Treatment"]


def seed() -> None:
    db = SessionLocal()
    try:
        if db.query(Staff).filter(Staff.email == "admin@rancodental.com").first() is None:
            db.add(
                Staff(
                    name="Clinic Admin",
                    role=StaffRole.admin,
                    email="admin@rancodental.com",
                    hashed_password=hash_password("admin123"),
                )
            )
            print("Created admin@rancodental.com / admin123")

        for name, specialty in DOCTORS:
            email = name.lower().replace(" ", "").replace(".", "") + "@rancodental.com"
            if db.query(Staff).filter(Staff.email == email).first() is None:
                db.add(
                    Staff(
                        name=name,
                        role=StaffRole.doctor,
                        specialty=specialty,
                        email=email,
                        hashed_password=hash_password("doctor123"),
                    )
                )
                print(f"Created {email} / doctor123")

        for name, category, price in SERVICES:
            if db.query(Service).filter(Service.name == name).first() is None:
                db.add(Service(name=name, category=category, listed_price=price, active=True))
                print(f"Added service: {name} ({category or 'uncategorized'}) - Rs.{price}")

        for name in LEGACY_SERVICES_TO_RETIRE:
            legacy = db.query(Service).filter(Service.name == name).first()
            if legacy and legacy.active:
                legacy.active = False
                print(f"Deactivated superseded service: {name}")

        db.commit()
        print("Seed complete.")
    finally:
        db.close()


if __name__ == "__main__":
    seed()