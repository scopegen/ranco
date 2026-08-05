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

SERVICES = [
    ("Root Canal Treatment", 8000),
    ("Cleaning", 800),
    ("Filling", 1500),
    ("Extraction", 1200),
    ("Crown", 6000),
    ("Scaling", 1000),
]


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

        for name, price in SERVICES:
            if db.query(Service).filter(Service.name == name).first() is None:
                db.add(Service(name=name, listed_price=price, active=True))

        db.commit()
        print("Seed complete.")
    finally:
        db.close()


if __name__ == "__main__":
    seed()