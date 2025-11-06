#!/usr/bin/env python3
"""
Migration runner script
"""
import os
import pymysql

db_config = {
    "host": os.getenv("DB_HOST"),
    "port": int(os.getenv("DB_PORT")),
    "user": os.getenv("DB_USER"),
    "password": os.getenv("DB_PASSWORD"),
    "database": os.getenv("DB_NAME"),
}

def run_migration(sql_file):
    """Run a migration SQL file"""
    print(f"Running migration: {sql_file}")

    with open(sql_file, 'r') as f:
        sql = f.read()

    # Split by semicolon to handle multiple statements
    statements = [s.strip() for s in sql.split(';') if s.strip()]

    conn = pymysql.connect(**db_config)
    try:
        with conn.cursor() as cursor:
            for statement in statements:
                if statement:
                    print(f"Executing: {statement[:80]}...")
                    cursor.execute(statement)
        conn.commit()
        print(f"✓ Migration completed successfully: {sql_file}")
    except Exception as e:
        print(f"✗ Migration failed: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python run_migration.py <migration_file.sql>")
        sys.exit(1)

    migration_file = sys.argv[1]
    run_migration(migration_file)
