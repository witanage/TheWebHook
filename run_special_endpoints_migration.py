#!/usr/bin/env python3
"""
Migration runner for special_endpoints table
"""
import sys
sys.path.insert(0, '/home/user/TheWebHook')

from app import get_db_connection

def run_migration():
    """Run the special_endpoints table migration"""
    print("Running migration: create_http_mocker_special_endpoints.sql")

    with open('migrations/create_http_mocker_special_endpoints.sql', 'r') as f:
        sql = f.read()

    # Split by semicolon to handle multiple statements
    statements = [s.strip() for s in sql.split(';') if s.strip()]

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            for statement in statements:
                if statement:
                    print(f"Executing: {statement[:80]}...")
                    cursor.execute(statement)
        conn.commit()
        print("✓ Migration completed successfully!")
    except Exception as e:
        print(f"✗ Migration failed: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    run_migration()
