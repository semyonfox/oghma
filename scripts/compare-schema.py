#!/usr/bin/env python3
"""
Schema Comparison Tool
Compares actual database schema against migration file
Shows what needs to be added, removed, or modified

Usage:
  python scripts/compare-schema.py
"""

import os
import sys
import re
import json
from typing import Dict, List, Any, Set

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
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("Error: DATABASE_URL not found")
        sys.exit(1)
    try:
        return psycopg2.connect(db_url)
    except Exception as e:
        print(f"Error: Could not connect: {e}")
        sys.exit(1)


def get_current_schema(conn) -> Dict[str, Any]:
    """Get actual database schema"""
    schema = {"tables": {}, "extensions": []}

    # Extensions
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("SELECT extname FROM pg_extension ORDER BY extname")
        schema["extensions"] = [row["extname"] for row in cur.fetchall()]

    # Tables in app schema
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""
            SELECT tablename FROM pg_tables 
            WHERE schemaname = 'app'
            ORDER BY tablename
        """)
        tables = [row["tablename"] for row in cur.fetchall()]

    for table in tables:
        schema["tables"][table] = {"columns": {}, "indexes": []}

        # Columns
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT 
                    column_name,
                    data_type,
                    is_nullable,
                    column_default
                FROM information_schema.columns
                WHERE table_schema = 'app' AND table_name = %s
                ORDER BY ordinal_position
            """,
                (table,),
            )
            for row in cur.fetchall():
                col_name = row["column_name"]
                col_type = row["data_type"]
                nullable = row["is_nullable"] == "YES"
                default = row["column_default"]

                schema["tables"][table]["columns"][col_name] = {
                    "type": col_type,
                    "nullable": nullable,
                    "default": default,
                }

        # Indexes
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT indexname, indexdef
                FROM pg_indexes
                WHERE schemaname = 'app' AND tablename = %s
                ORDER BY indexname
            """,
                (table,),
            )
            schema["tables"][table]["indexes"] = [dict(row) for row in cur.fetchall()]

    return schema


def parse_migration_file(filepath: str) -> Dict[str, Any]:
    """Parse migration file to extract schema changes"""
    planned = {"tables": {}, "extensions": set()}

    if not os.path.exists(filepath):
        return planned

    with open(filepath, "r") as f:
        content = f.read()

    # Find CREATE EXTENSION statements
    ext_pattern = r'CREATE EXTENSION IF NOT EXISTS "([^"]+)"'
    for match in re.finditer(ext_pattern, content):
        planned["extensions"].add(match.group(1))

    # Find CREATE TABLE statements
    table_pattern = r"CREATE TABLE IF NOT EXISTS app\.(\w+)\s*\((.*?)\);"
    for match in re.finditer(table_pattern, content, re.DOTALL):
        table_name = match.group(1)
        table_def = match.group(2)

        planned["tables"][table_name] = {"columns": {}, "constraints": []}

        # Parse columns
        lines = table_def.split("\n")
        for line in lines:
            line = line.strip()
            if (
                not line
                or line.startswith("--")
                or line.startswith("FOREIGN")
                or line.startswith("PRIMARY")
            ):
                continue

            parts = line.split()
            if len(parts) >= 2:
                col_name = parts[0]
                col_type = parts[1]

                # Check for NOT NULL, DEFAULT, etc
                nullable = "NOT NULL" not in line.upper()
                has_default = "DEFAULT" in line.upper()

                planned["tables"][table_name]["columns"][col_name] = {
                    "type": col_type,
                    "nullable": nullable,
                    "has_default": has_default,
                }

    return planned


def compare_schemas(current: Dict, planned: Dict) -> Dict[str, List[str]]:
    """Compare current vs planned schema"""
    issues = {
        "missing_extensions": [],
        "missing_tables": [],
        "missing_columns": [],
        "type_mismatches": [],
        "extra_tables": [],
        "extra_columns": [],
        "warnings": [],
    }

    # Check extensions
    current_exts = set(current["extensions"])
    planned_exts = planned["extensions"]

    for ext in planned_exts:
        if ext not in current_exts:
            issues["missing_extensions"].append(ext)

    # Check tables
    current_tables = set(current["tables"].keys())
    planned_tables = set(planned["tables"].keys())

    for table in planned_tables:
        if table not in current_tables:
            issues["missing_tables"].append(table)
        else:
            # Check columns in this table
            current_cols = set(current["tables"][table]["columns"].keys())
            planned_cols = set(planned["tables"][table]["columns"].keys())

            for col in planned_cols:
                if col not in current_cols:
                    issues["missing_columns"].append(f"{table}.{col}")
                else:
                    # Check type match
                    current_type = current["tables"][table]["columns"][col]["type"]
                    planned_type = planned["tables"][table]["columns"][col]["type"]
                    if current_type.lower() != planned_type.lower():
                        issues["type_mismatches"].append(
                            f"{table}.{col}: current={current_type}, planned={planned_type}"
                        )

            for col in current_cols:
                if col not in planned_cols and table in planned_tables:
                    issues["extra_columns"].append(f"{table}.{col}")

    # Extra tables in current
    for table in current_tables:
        if table not in planned_tables:
            issues["extra_tables"].append(table)

    return issues


def main():
    print("=" * 80)
    print("DATABASE SCHEMA COMPARISON")
    print("=" * 80)

    load_env_file()

    try:
        conn = get_db_connection()
        print("\n✓ Connected to database")
    except Exception as e:
        print(f"\n✗ Connection failed: {e}")
        sys.exit(1)

    # Get current schema
    print("  • Reading current database schema...")
    current = get_current_schema(conn)
    conn.close()

    # Parse migration file
    print("  • Parsing migration file...")
    planned = parse_migration_file("database/migrations/002_migrate_to_uuid_v7.sql")

    # Compare
    print("  • Comparing schemas...")
    issues = compare_schemas(current, planned)

    # Report
    print("\n" + "-" * 80)
    print("CURRENT DATABASE STATE")
    print("-" * 80)
    print(f"  Extensions: {len(current['extensions'])}")
    for ext in sorted(current["extensions"]):
        print(f"    ✓ {ext}")

    print(f"\n  Tables: {len(current['tables'])}")
    for table in sorted(current["tables"].keys()):
        cols = len(current["tables"][table]["columns"])
        print(f"    • {table:<20} ({cols} columns)")

    # Issues
    print("\n" + "-" * 80)
    print("SCHEMA GAPS & ISSUES")
    print("-" * 80)

    total_issues = sum(len(v) for v in issues.values())

    if issues["missing_extensions"]:
        print("\n  MISSING EXTENSIONS (need to CREATE):")
        for ext in issues["missing_extensions"]:
            print(f"    • {ext}")

    if issues["missing_tables"]:
        print("\n  MISSING TABLES (need to CREATE):")
        for table in issues["missing_tables"]:
            print(f"    • app.{table}")

    if issues["missing_columns"]:
        print("\n  MISSING COLUMNS (need to ALTER TABLE ADD COLUMN):")
        for col in issues["missing_columns"]:
            print(f"    • {col}")

    if issues["extra_tables"]:
        print("\n  EXTRA TABLES IN ACTUAL DB (not in migration - review):")
        for table in issues["extra_tables"]:
            print(f"    • app.{table}")

    if issues["extra_columns"]:
        print("\n  EXTRA COLUMNS IN ACTUAL DB (not in migration - review):")
        for col in issues["extra_columns"]:
            print(f"    • {col}")

    if issues["type_mismatches"]:
        print("\n  TYPE MISMATCHES (need ALTER COLUMN TYPE):")
        for mismatch in issues["type_mismatches"]:
            print(f"    • {mismatch}")

    # Summary
    print("\n" + "=" * 80)
    print("SUMMARY FOR DATABASE GUY")
    print("=" * 80)

    if total_issues == 0:
        print("✓ Schema matches migration file perfectly!")
    else:
        print(f"⚠ Found {total_issues} issues:")
        print(
            f"  • Missing: {len(issues['missing_tables'])} tables, {len(issues['missing_columns'])} columns, {len(issues['missing_extensions'])} extensions"
        )
        print(
            f"  • Extra: {len(issues['extra_tables'])} tables, {len(issues['extra_columns'])} columns"
        )
        print(f"  • Type mismatches: {len(issues['type_mismatches'])}")

    print("\nActions needed:")
    if (
        issues["missing_extensions"]
        or issues["missing_tables"]
        or issues["missing_columns"]
    ):
        print("  1. Run migration file to add missing components:")
        print(
            "     psql $DATABASE_URL < database/migrations/002_migrate_to_uuid_v7.sql"
        )

    if issues["extra_tables"] or issues["extra_columns"]:
        print("  2. Review extra tables/columns - are they needed?")
        print("     If yes: add to migration file")
        print("     If no: manually drop them from production DB")

    print("\n" + "=" * 80)


if __name__ == "__main__":
    main()
