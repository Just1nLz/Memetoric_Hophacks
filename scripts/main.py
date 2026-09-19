from pathlib import Path
import duckdb

con = duckdb.connect()
con.execute("SET memory_limit = '2GB'")

# Assumes this script is inside scripts/
root = Path(__file__).resolve().parent.parent
files = str(root / "twitter-firehose" / "tweets-*.parquet")

rows = con.execute("""
    SELECT id, created_at, body
    FROM read_parquet(?)
    WHERE body ILIKE '%aura farming%'
       OR body ILIKE '%rickroll%'
       OR body ILIKE '%rick roll%'
    LIMIT 20
""", [files]).fetchall()

for tweet_id, created_at, body in rows:
    print(f"\nTweet ID: {tweet_id}")
    print(f"Posted: {created_at}")
    print(body)
    print("-" * 70)