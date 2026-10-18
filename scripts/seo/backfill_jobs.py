"""Import exported saved sources into the local SEO queue. No network or model calls.
JSON shape: {today: [reports], morning: [reports], digests: [digests]}.
Explicitly set SEO_CONTENT_DB to the intended writable content database.
"""
import argparse
import json
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'backend'))
from app.features.seo.generation import enqueue_report,enqueue_digest

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--input',required=True,type=Path);args=parser.parse_args()
    data=json.loads(args.input.read_text())
    for kind in ('today','morning'):
        for row in data.get(kind,[]):enqueue_report(kind,row)
    for row in data.get('digests',[]):enqueue_digest(row)
if __name__=='__main__':main()
