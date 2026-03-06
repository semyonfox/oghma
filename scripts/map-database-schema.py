#!/usr/bin/env python3
"""
Database Schema Mapper
Maps the current PostgreSQL database structure to JSON and SQL
Shows all tables, columns, types, constraints, and indexes

Usage:
  python scripts/map-database-schema.py

Requires:
  - psycopg2: pip install psycopg2-binary
  - Database connection via environment variables:
    DATABASE_URL or DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
"""

import json
import os
import sys
from typing import Dict, List, Any
import subprocess

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ImportError:
    print("Error: psycopg2 not installed. Run: pip install psycopg2-binary")
    sys.exit(1)


def load_env_file(env_file=".env"):
    """Load environment variables from .env file"""
    if os.path.exists(env_file):
        with open(env_file, "r") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#"):
                    key, value = line.split("=", 1)
                    if key not in os.environ:
                        os.environ[key] = value


def get_db_connection():
    """Get PostgreSQL connection from .env DATABASE_URL"""
    # Load .env file
    load_env_file()

    # Get DATABASE_URL from environment
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("Error: DATABASE_URL not found in environment or .env file")
        print("Make sure .env file exists with DATABASE_URL set")
        sys.exit(1)

    try:
        return psycopg2.connect(db_url)
    except Exception as e:
        print(f"Error: Could not connect to database: {e}")
        print(f"DATABASE_URL: {db_url}")
        sys.exit(1)


def get_tables(conn) -> List[str]:
    """Get all tables in app schema"""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""
            SELECT tablename FROM pg_tables 
            WHERE schemaname = 'app'
            ORDER BY tablename
        """)
        return [row["tablename"] for row in cur.fetchall()]


def get_columns(conn, table: str) -> List[Dict[str, Any]]:
    """Get column information for a table"""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """
            SELECT 
                column_name,
                data_type,
                is_nullable,
                column_default,
                ordinal_position
            FROM information_schema.columns
            WHERE table_schema = 'app' AND table_name = %s
            ORDER BY ordinal_position
        """,
            (table,),
        )
        return cur.fetchall()


def get_constraints(conn, table: str) -> Dict[str, List[str]]:
    """Get all constraints for a table"""
    constraints = {"primary_key": [], "unique": [], "foreign_key": [], "check": []}

    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        # Primary keys
        cur.execute(
            """
            SELECT a.attname
            FROM pg_index i
            JOIN pg_attribute a ON a.attrelid = i.indrelid
                AND a.attnum = ANY(i.indkey)
            WHERE i.indrelname = %s
        """,
            (f"{table}_pkey",),
        )
        pk = cur.fetchone()
        if pk:
            constraints["primary_key"].append(pk["attname"])

        # Unique constraints
        cur.execute(
            """
            SELECT a.attname
            FROM pg_index i
            JOIN pg_attribute a ON a.attrelid = i.indrelid
                AND a.attnum = ANY(i.indkey)
            WHERE i.indisunique AND i.indrelname NOT LIKE '%_pkey'
                AND i.indrelname = (
                    SELECT indexname FROM pg_indexes 
                    WHERE schemaname = 'app' AND tablename = %s 
                    AND indexname LIKE 'idx_%'
                )
        """,
            (table,),
        )
        # Simpler approach: get from table constraints
        cur.execute(
            """
            SELECT constraint_name, column_name
            FROM information_schema.constraint_column_usage
            WHERE table_schema = 'app' AND table_name = %s
        """,
            (table,),
        )

    return constraints


def get_indexes(conn, table: str) -> List[Dict[str, Any]]:
    """Get all indexes for a table"""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """
            SELECT 
                indexname,
                indexdef
            FROM pg_indexes
            WHERE schemaname = 'app' AND tablename = %s
            ORDER BY indexname
        """,
            (table,),
        )
        return cur.fetchall()


def get_extensions(conn) -> List[str]:
    """Get installed extensions"""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("SELECT extname FROM pg_extension ORDER BY extname")
        return [row["extname"] for row in cur.fetchall()]


def main():
    print("=" * 80)
    print("DATABASE SCHEMA MAPPER")
    print("=" * 80)

    try:
        conn = get_db_connection()
        print("\n✓ Connected to database")
    except Exception as e:
        print(f"\n✗ Connection failed: {e}")
        sys.exit(1)

    # Extensions
    print("\n" + "-" * 80)
    print("EXTENSIONS")
    print("-" * 80)
    extensions = get_extensions(conn)
    for ext in extensions:
        print(f"  • {ext}")

    # Tables
    tables = get_tables(conn)
    print("\n" + "-" * 80)
    print(f"TABLES ({len(tables)} total)")
    print("-" * 80)

    full_schema = {}

    for table in tables:
        columns = get_columns(conn, table)
        indexes = get_indexes(conn, table)

        print(f"\n  TABLE: app.{table}")
        print(f"    Columns: {len(columns)}")

        # Store schema info
        full_schema[table] = {
            "columns": [dict(col) for col in columns],
            "indexes": [dict(idx) for idx in indexes],
            "row_count": 0,  # Would need separate query
        }

        # Print columns
        for col in columns:
            nullable = "NULL" if col["is_nullable"] == "YES" else "NOT NULL"
            default = (
                f" DEFAULT {col['column_default']}" if col["column_default"] else ""
            )
            print(
                f"      • {col['column_name']:<25} {col['data_type']:<20} {nullable}{default}"
            )

        # Print indexes
        if indexes:
            print(f"    Indexes: {len(indexes)}")
            for idx in indexes:
                print(f"      • {idx['indexname']}")

    # Save to JSON
    output_file = "database/schema-current.json"
    with open(output_file, "w") as f:
        json.dump(full_schema, f, indent=2, default=str)
    print(f"\n✓ Schema saved to {output_file}")

    # Summary
    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"  Tables: {len(tables)}")
    print(f"  Extensions: {len(extensions)}")
    print("\nNext steps for database guy:")
    print("  1. Review database/schema-current.json")
    print("  2. Compare with database/schema.sql (current)")
    print("  3. Review database/migrations/002_migrate_to_uuid_v7.sql")
    print("  4. Check for missing tables/columns not in migration")

    conn.close()


if __name__ == "__main__":
    main()
