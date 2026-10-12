"""Safely copy an existing Cloux SQLite database to an initialized PostgreSQL instance.

USAGE:
  1. Stop writes to the old Cloux server and back up its cloux.db.
  2. Start the NEW Cloux backend once against PostgreSQL to create tables.
  3. Run:
     python scripts/migrate_sqlite_to_postgres.py /secure/backup/cloux.db
  4. Verify account/message counts before switching production traffic.

Requires DATABASE_URL in the environment. Never execute on an untrusted database
and never publish the SQLite source, .env or dump to a public repository.
"""
import argparse
import os
import sqlite3
from collections import defaultdict
from pathlib import Path

import psycopg
from psycopg import sql
from psycopg.rows import dict_row


def dependencies(source, names):
    dag={}
    for table in names:
        rows=source.execute(f'PRAGMA foreign_key_list("{table}")').fetchall()
        dag[table]={row["table"] for row in rows if row["table"] in names and row["table"]!=table}
    ordered=[]
    while dag:
        free=sorted(name for name, deps in dag.items() if not deps)
        if not free:
            raise RuntimeError("Circular FK dependency; migration requires manual review: "+", ".join(dag))
        for name in free:
            ordered.append(name)
            dag.pop(name)
        for deps in dag.values():
            deps.difference_update(free)
    return ordered


def migrate(db_path, target_url, dry_run):
    source=sqlite3.connect(f"file:{Path(db_path).resolve()}?mode=ro",uri=True)
    source.row_factory=sqlite3.Row
    with psycopg.connect(target_url,row_factory=dict_row) as dest:
        tables={r["table_name"] for r in dest.execute("""
            SELECT table_name FROM information_schema.tables
            WHERE table_schema='public' AND table_type='BASE TABLE'
        """)}
        present={r["name"] for r in source.execute("""
            SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'
        """)}
        common=tables&present
        order=dependencies(source,common)
        totals=defaultdict(int)
        try:
            for table in order:
                columns=[x["name"] for x in source.execute(f'PRAGMA table_info("{table}")')]
                target_columns={x["column_name"] for x in dest.execute("""
                    SELECT column_name FROM information_schema.columns
                    WHERE table_schema='public' AND table_name=%s
                """,(table,))}
                matched=[c for c in columns if c in target_columns]
                if not matched:
                    continue
                primary=[c["name"] for c in source.execute(f'PRAGMA table_info("{table}")') if c["pk"]]
                # Mirror SQLite unique integer rows with UPDATE on conflicts instead of losing chats.
                table_name=sql.Identifier(table)
                cols=sql.SQL(',').join(sql.Identifier(x) for x in matched)
                vals=sql.SQL(',').join(sql.Placeholder() for _ in matched)
                if primary and all(pk in matched for pk in primary):
                    keys=sql.SQL(',').join(sql.Identifier(x) for x in primary)
                    nonkey=[x for x in matched if x not in primary]
                    update=sql.SQL(',').join(
                        sql.SQL("{} = EXCLUDED.{}").format(sql.Identifier(c),sql.Identifier(c))
                        for c in nonkey
                    )
                    conflict=sql.SQL(" ON CONFLICT ({}) DO UPDATE SET {}").format(keys,update) if nonkey else sql.SQL(" ON CONFLICT DO NOTHING")
                else:
                    conflict=sql.SQL(" ON CONFLICT DO NOTHING")
                insert=sql.SQL("INSERT INTO {} ({}) VALUES ({}){}").format(
                    table_name,cols,vals,conflict)
                batch=source.execute(f'SELECT * FROM "{table}"')
                while True:
                    rows=batch.fetchmany(250)
                    if not rows:
                        break
                    if not dry_run:
                        with dest.cursor() as cur:
                            cur.executemany(insert,[tuple(row[c] for c in matched) for row in rows])
                    totals[table]+=len(rows)
                if not dry_run:
                    serial=dest.execute("SELECT pg_get_serial_sequence(%s, 'id') AS seq",(table,)).fetchone()["seq"]
                    if serial and "id" in matched:
                        dest.execute(sql.SQL("SELECT setval(%s, COALESCE((SELECT MAX(id) FROM {}),1),true)").format(table_name),(serial,))
                print(f"{table}: {totals[table]} records")
            if dry_run:
                dest.rollback()
                print("DRY RUN: nothing written")
            else:
                dest.commit()
                print("Migration committed; verify every table count and test login.")
        except BaseException:
            dest.rollback()
            raise
    source.close()
    return dict(totals)


if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("sqlite_backup",help="path to original backed-up cloux.db")
    parser.add_argument("--dry-run",action="store_true")
    args=parser.parse_args()
    if not Path(args.sqlite_backup).is_file():
        parser.error("Backup file not found")
    url=os.getenv("DATABASE_URL")
    if not url:
        parser.error("Set DATABASE_URL to an initialized PostgreSQL server")
    migrate(args.sqlite_backup,url,args.dry_run)
