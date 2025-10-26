import pymysql
import os
from dotenv import load_dotenv

load_dotenv()

db_config = {
    "host": os.getenv("DB_HOST"),
    "port": int(os.getenv("DB_PORT")),
    "user": os.getenv("DB_USER"),
    "password": os.getenv("DB_PASSWORD"),
    "database": os.getenv("DB_NAME"),
}

try:
    conn = pymysql.connect(**db_config)
    cursor = conn.cursor()
    
    # Check if user_menu_items table exists
    cursor.execute("SHOW TABLES LIKE 'user_menu_items'")
    result = cursor.fetchone()
    
    if result:
        print("✅ user_menu_items table EXISTS")
        
        # Check if there are any assignments
        cursor.execute("SELECT COUNT(*) FROM user_menu_items")
        count = cursor.fetchone()[0]
        print(f"📊 Total assignments: {count}")
        
        if count > 0:
            cursor.execute("""
                SELECT umi.id, umi.user_id, u.username, umi.menu_item_id, m.title
                FROM user_menu_items umi
                JOIN users u ON umi.user_id = u.id
                JOIN menu_items m ON umi.menu_item_id = m.id
            """)
            assignments = cursor.fetchall()
            print("\n📋 Current assignments:")
            for assignment in assignments:
                print(f"  - User {assignment[2]} (ID: {assignment[1]}) → {assignment[4]} (Menu ID: {assignment[3]})")
    else:
        print("❌ user_menu_items table DOES NOT EXIST")
        print("⚠️  You need to run the migration: user_menu_assignments.sql")
    
    cursor.close()
    conn.close()
    
except Exception as e:
    print(f"❌ Error: {e}")
